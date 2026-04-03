import { ImportPostProcessMode, ImportSource } from "@/core/constants/import";
import { remoteGroupingLLM } from "@/scripts/import/groupingLLMRemote";
import { importChromeBookmarksAsSingleGroup, importChromeBookmarksPreserveStructure, importOpenTabsAsSingleGroup, importOpenTabsPreserveStructure, } from "@/scripts/import/importers";
import { createUniqueID } from "@/core/utils/ids";
// If you want, you can move these helpers too; I'm keeping them here for clarity.
function mapImportedGroupsToCategorized(groups, purpose, source) {
    return (groups || []).map((g) => ({
        id: String(g.id ?? createUniqueID()),
        name: String(g.groupName ?? "Imported"),
        purpose,
        description: g.description ? String(g.description) : undefined,
        items: (g.bookmarks || []).map((b) => ({
            id: String(b.id ?? crypto.randomUUID()),
            name: b.name ?? b.url,
            url: b.url,
            source,
            lastVisitedAt: b.lastVisitedAt,
        })),
    }));
}
/**
 * Parse a Tabme multi-workspace JSON object into per-workspace group arrays.
 * Returns null when the object is not a valid multi-workspace Tabme format.
 */
function parseTabmeMultiWorkspace(obj) {
    if (!obj.isTabme) return null;
    const spaces = Array.isArray(obj.workspaces) ? obj.workspaces
        : Array.isArray(obj.spaces) ? obj.spaces : null;
    if (!spaces) return null;

    return spaces.map((space) => {
        const folders = Array.isArray(space.groups) ? space.groups
            : Array.isArray(space.folders) ? space.folders : [];
        const groups = [];
        for (const folder of folders) {
            if (folder.objectType === "group") {
                for (const sub of (folder.groups ?? folder.folders ?? [])) {
                    groups.push({
                        groupName: sub.title ?? "Imported",
                        bookmarks: (sub.items ?? [])
                            .filter((it) => it.objectType !== "group")
                            .map((it) => ({ name: it.title ?? it.url, url: it.url })),
                    });
                }
            } else {
                groups.push({
                    groupName: folder.title ?? "Imported",
                    bookmarks: (folder.items ?? [])
                        .filter((it) => it.objectType !== "group")
                        .map((it) => ({ name: it.title ?? it.url, url: it.url })),
                });
            }
        }
        return { name: space.title || "Imported", groups };
    }).filter((ws) => ws.groups.length > 0);
}
function parseJsonImport(jsonText) {
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch {
        throw new Error("That JSON file doesn't look valid. Please re-export and try again.");
    }
    if (Array.isArray(parsed))
        return parsed;
    if (parsed && typeof parsed === "object") {
        const obj = parsed;
        // Tabme multi-workspace format — flatten for fallback (single-workspace callers)
        if (obj.isTabme && (Array.isArray(obj.workspaces) || Array.isArray(obj.spaces))) {
            const wsImports = parseTabmeMultiWorkspace(obj) ?? [];
            return wsImports.flatMap((ws) => ws.groups);
        }
        const candidate = obj.groups ?? obj.items ?? obj.data;
        if (Array.isArray(candidate))
            return candidate;
    }
    throw new Error("JSON format not recognized. Expected an array of groups.");
}
function flattenCategorizedGroups(groups) {
    const items = [];
    for (const g of groups)
        items.push(...(g.items ?? []));
    return items;
}
async function collectGroupsFromImporter(run) {
    let captured = [];
    await run(async (groups) => {
        captured = groups ?? [];
    });
    return captured;
}
function normalizeLLMGroups(groups, purpose) {
    return (groups || []).map((g) => ({
        ...g,
        id: String(g.id ?? createUniqueID()),
        purpose,
        items: (g.items || []).map((it) => ({
            ...it,
            id: String(it.id ?? crypto.randomUUID()),
        })),
    }));
}
export async function commitManualImportIntoWorkspace({ selection, purposes, workspaceId, purpose, workspaceService, onProgress, }) {
    onProgress?.("Importing ...");
    const mode = selection.importPostProcessMode ?? ImportPostProcessMode.PreserveStructure;
    const allCategorized = [];
    // JSON — multi-workspace Tabme format creates a workspace per entry
    if (selection.jsonData) {
        let parsedJson;
        try { parsedJson = JSON.parse(selection.jsonData); }
        catch { throw new Error("That JSON file doesn't look valid. Please re-export and try again."); }

        const multiWs = parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)
            ? parseTabmeMultiWorkspace(parsedJson)
            : null;

        if (multiWs && multiWs.length > 0) {
            // Create a separate workspace for each space in the JSON
            for (const { name, groups } of multiWs) {
                const mapped = mapImportedGroupsToCategorized(groups, purpose, ImportSource.Json);
                if (!mapped.length) continue;
                const { id } = await workspaceService.createWorkspaceWithName(name);
                await workspaceService.saveGroupsToWorkspace(id, mapped);
            }
            // Multi-workspace import is handled; skip the active-workspace path below
        } else {
            const rawGroups = parseJsonImport(selection.jsonData);
            allCategorized.push(...mapImportedGroupsToCategorized(rawGroups, purpose, ImportSource.Json));
        }
    }
    // Chrome bookmarks
    if (selection.importBookmarks) {
        const chromeGroups = await collectGroupsFromImporter((collector) => {
            return mode === ImportPostProcessMode.PreserveStructure
                ? importChromeBookmarksPreserveStructure(collector, {
                    onlyLeafFolders: true,
                    includeParentFolderBookmarks: true,
                    maxDepth: 8,
                    minItemsPerFolder: 1,
                    includeRootFolders: false,
                })
                : importChromeBookmarksAsSingleGroup(collector);
        });
        allCategorized.push(...mapImportedGroupsToCategorized(chromeGroups, purpose, ImportSource.Bookmarks));
    }
    // Open tabs
    if (selection.tabScope !== undefined) {
        const tabGroups = await collectGroupsFromImporter((collector) => {
            return mode === ImportPostProcessMode.PreserveStructure
                ? importOpenTabsPreserveStructure(collector, {
                    scope: selection.tabScope,
                    includePinned: true,
                    includeDiscarded: true,
                    includeUngrouped: true,
                })
                : importOpenTabsAsSingleGroup(collector, { scope: selection.tabScope });
        });
        allCategorized.push(...mapImportedGroupsToCategorized(tabGroups, purpose, ImportSource.Tabs));
    }
    // Skip: nothing selected
    if (allCategorized.length === 0)
        return;
    if (mode === ImportPostProcessMode.SemanticGrouping) {
        if (!Array.isArray(purposes) || purposes.length === 0) {
            throw new Error("Missing purposes[] (client) — cannot run semantic grouping.");
        }
        onProgress?.("Organizing with AI ...");
        const items = flattenCategorizedGroups(allCategorized);
        const res = await remoteGroupingLLM.group({
            items,
            purposes,
        });
        onProgress?.("Saving groups ...");
        const regrouped = normalizeLLMGroups(res.groups, purpose);
        await workspaceService.appendGroupsToWorkspace(workspaceId, regrouped);
    }
    else {
        onProgress?.("Saving ...");
        await workspaceService.appendGroupsToWorkspace(workspaceId, allCategorized);
    }
}
