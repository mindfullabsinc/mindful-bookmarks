import type { ManualImportSelectionType, ImportSourceType } from "@/core/types/import";
import type { PurposeIdType } from "@shared/types/purposeId";
import type { CategorizedGroup, RawItem } from "@shared/types/llmGrouping";

import { ImportPostProcessMode, ImportSource, JsonImportMode } from "@/core/constants/import";
import { remoteGroupingLLM } from "@/scripts/import/groupingLLMRemote";

import {
  importChromeBookmarksAsSingleGroup,
  importChromeBookmarksPreserveStructure,
  importOpenTabsAsSingleGroup,
  importOpenTabsPreserveStructure,
} from "@/scripts/import/importers";

import { createUniqueID } from "@/core/utils/ids";

// If you want, you can move these helpers too; I’m keeping them here for clarity.

function mapImportedGroupsToCategorized(
  groups: any[],
  purpose: PurposeIdType,
  source: ImportSourceType
): CategorizedGroup[] {
  return (groups || []).map((g) => ({
    id: String(g.id ?? createUniqueID()),
    name: String(g.groupName ?? "Imported"),
    purpose,
    description: g.description ? String(g.description) : undefined,
    items: (g.bookmarks || []).map((b: any) => ({
      id: String(b.id ?? crypto.randomUUID()),
      name: b.name ?? b.url,
      url: b.url,
      source,
      lastVisitedAt: b.lastVisitedAt,
    })),
  }));
}

type WorkspaceImport = { name: string; groups: any[] };

/**
 * Parse a Tabme multi-workspace JSON object into per-workspace group arrays.
 * Returns null when the object is not a valid multi-workspace Tabme format.
 */
function parseTabmeMultiWorkspace(obj: Record<string, unknown>): WorkspaceImport[] | null {
  if (!obj.isTabme) return null;
  const spaces = Array.isArray(obj.workspaces) ? obj.workspaces
    : Array.isArray(obj.spaces) ? obj.spaces : null;
  if (!spaces) return null;

  return (spaces as any[]).map((space: any) => {
    const folders: any[] = Array.isArray(space.groups) ? space.groups
      : Array.isArray(space.folders) ? space.folders : [];
    const groups: any[] = [];
    for (const folder of folders) {
      if (folder.objectType === "group") {
        for (const sub of (folder.groups ?? folder.folders ?? [])) {
          groups.push({
            groupName: sub.title ?? "Imported",
            bookmarks: (sub.items ?? [])
              .filter((it: any) => it.objectType !== "group")
              .map((it: any) => ({ name: it.title ?? it.url, url: it.url })),
          });
        }
      } else {
        groups.push({
          groupName: folder.title ?? "Imported",
          bookmarks: (folder.items ?? [])
            .filter((it: any) => it.objectType !== "group")
            .map((it: any) => ({ name: it.title ?? it.url, url: it.url })),
        });
      }
    }
    return { name: (space.title as string) || "Imported", groups };
  }).filter((ws: WorkspaceImport) => ws.groups.length > 0);
}

function parseJsonImport(jsonText: string): any[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("That JSON file doesn’t look valid. Please re-export and try again.");
  }

  if (Array.isArray(parsed)) return parsed;

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    // Tabme multi-workspace format — flatten for fallback (single-workspace callers)
    if (obj.isTabme && (Array.isArray(obj.workspaces) || Array.isArray(obj.spaces))) {
      const wsImports = parseTabmeMultiWorkspace(obj) ?? [];
      return wsImports.flatMap(ws => ws.groups);
    }

    const candidate = (obj.groups as unknown) ?? (obj.items as unknown) ?? (obj.data as unknown);
    if (Array.isArray(candidate)) return candidate;
  }

  throw new Error("JSON format not recognized. Expected an array of groups.");
}

function flattenCategorizedGroups(groups: CategorizedGroup[]): RawItem[] {
  const items: RawItem[] = [];
  for (const g of groups) items.push(...(g.items ?? []));
  return items;
}

async function collectGroupsFromImporter(
  run: (collector: (groups: any[]) => Promise<void>) => Promise<void>
): Promise<any[]> {
  let captured: any[] = [];
  await run(async (groups) => {
    captured = groups ?? [];
  });
  return captured;
}

function normalizeLLMGroups(groups: CategorizedGroup[], purpose: PurposeIdType): CategorizedGroup[] {
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

export type CommitManualImportArgs = {
  selection: ManualImportSelectionType;
  purposes: PurposeIdType[];          // used only for LLM grouping
  workspaceId: string;               // the target workspace (active OR new)
  purpose: PurposeIdType;            // the workspace purpose (active OR new)

  workspaceService: {
    appendGroupsToWorkspace: (workspaceId: string, groups: CategorizedGroup[]) => Promise<void>;
    saveGroupsToWorkspace: (workspaceId: string, groups: CategorizedGroup[]) => Promise<void>;
    createWorkspaceWithName: (name: string, opts?: { setActive?: boolean }) => Promise<{ id: string }>;
    deleteAllWorkspaces: () => Promise<void>;
  };

  // optional UI callbacks
  onProgress?: (msg: string) => void;
};

export async function commitManualImportIntoWorkspace({
  selection,
  purposes,
  workspaceId,
  purpose,
  workspaceService,
  onProgress,
}: CommitManualImportArgs): Promise<void> {
  onProgress?.("Importing ...");

  const mode =
    selection.importPostProcessMode ?? ImportPostProcessMode.PreserveStructure;

  const allCategorized: CategorizedGroup[] = [];

  // JSON — multi-workspace Tabme format creates a workspace per entry
  if (selection.jsonData) {
    let parsedJson: unknown;
    try { parsedJson = JSON.parse(selection.jsonData); } catch {
      throw new Error("That JSON file doesn't look valid. Please re-export and try again.");
    }

    const multiWs =
      parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)
        ? parseTabmeMultiWorkspace(parsedJson as Record<string, unknown>)
        : null;

    if (multiWs && multiWs.length > 0) {
      if (selection.jsonImportMode === JsonImportMode.Replace) {
        await workspaceService.deleteAllWorkspaces();
      }
      // Create a separate workspace for each space; set the first one active on Replace
      let firstCreated = false;
      for (const { name, groups } of multiWs) {
        const mapped = mapImportedGroupsToCategorized(groups, purpose, ImportSource.Json);
        if (!mapped.length) continue;
        const setActive = !firstCreated;
        const { id } = await workspaceService.createWorkspaceWithName(name, { setActive });
        await workspaceService.saveGroupsToWorkspace(id, mapped);
        firstCreated = true;
      }
      // Multi-workspace import is handled; skip the active-workspace path below
    } else {
      const rawGroups = parseJsonImport(selection.jsonData);
      const mapped = mapImportedGroupsToCategorized(rawGroups, purpose, ImportSource.Json);
      if (selection.workspaceName) {
        if (selection.jsonImportMode === JsonImportMode.Replace) {
          await workspaceService.deleteAllWorkspaces();
        }
        const { id } = await workspaceService.createWorkspaceWithName(selection.workspaceName, { setActive: true });
        await workspaceService.saveGroupsToWorkspace(id, mapped);
      } else if (selection.jsonImportMode === JsonImportMode.Replace) {
        await workspaceService.saveGroupsToWorkspace(workspaceId, mapped);
      } else {
        allCategorized.push(...mapped);
      }
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

    const mapped = mapImportedGroupsToCategorized(chromeGroups, purpose, ImportSource.Bookmarks);
    if (selection.workspaceName && mapped.length > 0) {
      if (selection.chromeImportMode === JsonImportMode.Replace) {
        await workspaceService.deleteAllWorkspaces();
      }
      const { id } = await workspaceService.createWorkspaceWithName(selection.workspaceName, { setActive: true });
      await workspaceService.saveGroupsToWorkspace(id, mapped);
    } else {
      allCategorized.push(...mapped);
    }
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

    const mapped = mapImportedGroupsToCategorized(tabGroups, purpose, ImportSource.Tabs);
    if (selection.workspaceName && mapped.length > 0) {
      if (selection.tabsImportMode === JsonImportMode.Replace) {
        await workspaceService.deleteAllWorkspaces();
      }
      const { id } = await workspaceService.createWorkspaceWithName(selection.workspaceName, { setActive: true });
      await workspaceService.saveGroupsToWorkspace(id, mapped);
    } else {
      allCategorized.push(...mapped);
    }
  }

  // Skip: nothing selected
  if (allCategorized.length === 0) return;

  const shouldReplace =
    (selection.importBookmarks && selection.chromeImportMode === JsonImportMode.Replace) ||
    (selection.tabScope !== undefined && selection.tabsImportMode === JsonImportMode.Replace);

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
    if (shouldReplace) {
      await workspaceService.saveGroupsToWorkspace(workspaceId, regrouped);
    } else {
      await workspaceService.appendGroupsToWorkspace(workspaceId, regrouped);
    }
  } else {
    onProgress?.("Saving ...");
    if (shouldReplace) {
      await workspaceService.saveGroupsToWorkspace(workspaceId, allCategorized);
    } else {
      await workspaceService.appendGroupsToWorkspace(workspaceId, allCategorized);
    }
  }
}