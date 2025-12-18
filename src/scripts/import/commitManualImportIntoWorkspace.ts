import type { ManualImportSelectionType, ImportSourceType } from "@/core/types/import";
import type { PurposeIdType } from "@shared/types/purposeId";
import type { CategorizedGroup, RawItem } from "@shared/types/llmGrouping";

import { ImportPostProcessMode, ImportSource } from "@/core/constants/import";
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

  // JSON
  if (selection.jsonData) {
    const rawGroups = parseJsonImport(selection.jsonData);
    allCategorized.push(
      ...mapImportedGroupsToCategorized(rawGroups, purpose, ImportSource.Json)
    );
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

    allCategorized.push(
      ...mapImportedGroupsToCategorized(chromeGroups, purpose, ImportSource.Bookmarks)
    );
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

    allCategorized.push(
      ...mapImportedGroupsToCategorized(tabGroups, purpose, ImportSource.Tabs)
    );
  }

  // Skip: nothing selected
  if (allCategorized.length === 0) return;

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
  } else {
    onProgress?.("Saving ...");
    await workspaceService.appendGroupsToWorkspace(workspaceId, allCategorized);
  }
}