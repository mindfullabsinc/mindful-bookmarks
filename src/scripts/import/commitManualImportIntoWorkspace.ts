import type { ManualImportSelectionType, ImportSourceType } from "@/core/types/import";
import type { PurposeIdType } from "@shared/types/purposeId";
import type { CategorizedGroup, RawItem } from "@shared/types/llmGrouping";

import { ImportPostProcessMode, ImportSource, JsonImportMode } from "@/core/constants/import";
import { PurposeId } from "@shared/constants/purposeId";
import { remoteGroupingLLM } from "@/scripts/import/groupingLLMRemote";

import {
  importChromeBookmarksAsSingleGroup,
  importChromeBookmarksPreserveStructure,
  importOpenTabsAsSingleGroup,
  importOpenTabsPreserveStructure,
} from "@/scripts/import/importers";

import { createUniqueID } from "@/core/utils/ids";
import { pruneNewWorkspacePlaceholders } from "@/scripts/workspaces/registry";

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
  });
}

/**
 * Parse a Netscape HTML bookmarks file (Chrome export) into flat bookmark groups.
 * Each folder becomes a group; bookmarks sitting directly in the root are skipped.
 */
/**
 * Parse a Netscape HTML bookmarks file via regex token scanning.
 * Avoids DOMParser quirks with Chrome's malformed <DL><p> structure.
 *
 * Token order in Chrome exports:
 *   <H3>Folder Name</H3>   ← names the NEXT <DL> that opens
 *   <DL>                   ← opens that folder; consumes pending name
 *     <A HREF="...">Title</A>
 *   </DL>
 */
function parseChromeHtmlBookmarks(html: string): any[] {
  const result: any[] = [];
  const stack: Array<{ name: string; bookmarks: any[] }> = [];
  let pendingName: string | null = null;

  const re = /<\/dl>|<dl[^>]*>|<h3[^>]*>([\s\S]*?)<\/h3>|<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const token = m[0];
    if (/^<\/dl/i.test(token)) {
      const folder = stack.pop();
      if (folder?.bookmarks.length) {
        result.push({ groupName: folder.name, bookmarks: folder.bookmarks });
      }
    } else if (/^<dl/i.test(token)) {
      stack.push({ name: pendingName ?? 'Imported', bookmarks: [] });
      pendingName = null;
    } else if (m[1] !== undefined) {
      // <H3> — name for the next DL
      pendingName = m[1].trim();
    } else if (m[2]) {
      // <A HREF> — bookmark link
      const url = m[2].trim();
      if (url && !url.startsWith('javascript:') && !url.startsWith('place:') && stack.length > 0) {
        stack[stack.length - 1].bookmarks.push({ name: m[3]?.trim() || url, url });
      }
    }
  }

  return result;
}

/**
 * Toby v4: { version, groups: [{ name, lists: [{title, cards: [{title,url}]}] }] }
 * Each Toby group becomes a workspace; each list becomes a bookmark group.
 * Returns null if the object doesn't match Toby v4 structure.
 */
function parseTobyMultiWorkspace(obj: Record<string, unknown>): WorkspaceImport[] | null {
  if (!Array.isArray(obj.groups)) return null;
  const groups = obj.groups as any[];
  if (!groups.every((g: any) => Array.isArray(g.lists))) return null;

  return groups
    .map((group: any) => {
      const bookmarkGroups = (group.lists as any[])
        .map((list: any) => ({
          groupName: list.title ?? "Imported",
          bookmarks: ((list.cards ?? []) as any[]).map((c: any) => ({
            name: c.customTitle || c.title || c.url,
            url: c.url,
            faviconUrl: c.favIconUrl,
          })).filter((b: any) => b.url),
        }))
      return { name: group.name ?? "Imported", groups: bookmarkGroups };
    });
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

/**
 * Parse a JSON or HTML file export into a flat list of RawItems suitable for
 * smart import. Handles Chrome HTML exports, Tabme, Toby, and generic JSON
 * group arrays. Returns an empty array if the file cannot be parsed.
 */
export function parseFileToRawItems(text: string, fileName: string): RawItem[] {
  const isHtml = /\.html?$/i.test(fileName);

  let groups: Array<{ groupName?: string; bookmarks?: Array<{ name?: string; url?: string }> }>;

  if (isHtml) {
    groups = parseChromeHtmlBookmarks(text);
  } else {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return []; }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const multiWs = parseTabmeMultiWorkspace(obj) ?? parseTobyMultiWorkspace(obj);
      if (multiWs) {
        groups = multiWs.flatMap((ws) => ws.groups);
      } else {
        try { groups = parseJsonImport(text); } catch { return []; }
      }
    } else {
      try { groups = parseJsonImport(text); } catch { return []; }
    }
  }

  const items: RawItem[] = [];
  for (const group of groups) {
    for (const b of group.bookmarks ?? []) {
      if (!b.url) continue;
      items.push({
        id: crypto.randomUUID(),
        name: b.name ?? b.url,
        url: b.url,
        source: ImportSource.Json,
      });
    }
  }
  return items;
}

export type CommitManualImportArgs = {
  selection: ManualImportSelectionType;
  purposes?: PurposeIdType[];          // used only for LLM grouping
  workspaceId: string;               // the target workspace (active OR new)
  purpose: PurposeIdType;            // the workspace purpose (active OR new)
  /** When true, collapse all file content into workspaceId instead of creating per-workspace entries */
  singleWorkspace?: boolean;

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
  singleWorkspace,
  workspaceService,
  onProgress,
}: CommitManualImportArgs): Promise<void> {
  onProgress?.("Importing ...");

  const mode =
    selection.importPostProcessMode ?? ImportPostProcessMode.PreserveStructure;

  const allCategorized: CategorizedGroup[] = [];

  // HTML — Chrome Netscape bookmark export
  const isHtmlFile = selection.jsonFileName?.match(/\.html?$/i);
  if (selection.jsonData && isHtmlFile) {
    const htmlGroups = parseChromeHtmlBookmarks(selection.jsonData);
    const mapped = mapImportedGroupsToCategorized(htmlGroups, purpose, ImportSource.Json);
    if (singleWorkspace) {
      // Collapse into the single target workspace; fall through to save at the end
      allCategorized.push(...mapped);
    } else {
      if (selection.jsonImportMode === JsonImportMode.Replace) {
        await workspaceService.deleteAllWorkspaces();
      }
      const { id } = await workspaceService.createWorkspaceWithName(
        selection.workspaceName ?? "Chrome Bookmarks", { setActive: true }
      );
      await workspaceService.saveGroupsToWorkspace(id, mapped);
      await pruneNewWorkspacePlaceholders();
      return;
    }
  }

  // JSON — multi-workspace Tabme format creates a workspace per entry
  if (selection.jsonData) {
    let parsedJson: unknown;
    try { parsedJson = JSON.parse(selection.jsonData); } catch {
      throw new Error("That JSON file doesn't look valid. Please re-export and try again.");
    }

    const parsedObj = parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)
      ? parsedJson as Record<string, unknown>
      : null;

    const multiWs = parsedObj
      ? (parseTabmeMultiWorkspace(parsedObj) ?? parseTobyMultiWorkspace(parsedObj))
      : null;

    if (multiWs && multiWs.length > 0) {
      if (singleWorkspace) {
        // Collapse all workspaces from the file into the single target workspace
        for (const { groups } of multiWs) {
          allCategorized.push(...mapImportedGroupsToCategorized(groups, purpose, ImportSource.Json));
        }
      } else {
        if (selection.jsonImportMode === JsonImportMode.Replace) {
          await workspaceService.deleteAllWorkspaces();
        }
        // Create a separate workspace for each space; set the first one active on Replace
        let firstCreated = false;
        for (const { name, groups } of multiWs) {
          const mapped = mapImportedGroupsToCategorized(groups, purpose, ImportSource.Json);
          const setActive = !firstCreated;
          const { id } = await workspaceService.createWorkspaceWithName(name, { setActive });
          await workspaceService.saveGroupsToWorkspace(id, mapped);
          firstCreated = true;
        }
        // Multi-workspace import is handled; skip the active-workspace path below
      }
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

  // Clean up any "New Workspace" placeholder left over from archiving the last workspace.
  if (selection.workspaceName) {
    await pruneNewWorkspacePlaceholders();
    return;
  }

  // Skip: nothing selected
  if (allCategorized.length === 0) return;

  const shouldReplace =
    (selection.importBookmarks && selection.chromeImportMode === JsonImportMode.Replace) ||
    (selection.tabScope !== undefined && selection.tabsImportMode === JsonImportMode.Replace);

  if (mode === ImportPostProcessMode.SemanticGrouping) {
    onProgress?.("Organizing with AI ...");
    const items = flattenCategorizedGroups(allCategorized);

    const res = await remoteGroupingLLM.group({
      items,
      purposes: (Array.isArray(purposes) && purposes.length) ? purposes : [PurposeId.Personal],
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