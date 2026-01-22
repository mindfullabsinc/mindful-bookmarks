/* -------------------- Imports -------------------- */
/* Types */
import type { ImportPhase } from "@/core/types/importPhase";
import type { WorkspaceRef, WorkspaceService } from "@/core/types/workspaces";
import type { PurposeIdType } from "@shared/types/purposeId";
import type {
  GroupingLLM,
  GroupingInput,
  GroupingLLMResponse,
  CategorizedGroup,
  RawItem,
} from "@shared/types/llmGrouping";
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
export type SmartImportProgress = {
  phase: ImportPhase;
  message?: string;
  // optionally, per-phase counts
  totalItems?: number;
  processedItems?: number;
};

export type SmartImportResult = {
  primaryWorkspaceId: string | null;
}

export type SmartImportOptions = {
  purposes: PurposeIdType[];
  workspaceService: WorkspaceService;
  browserSourceService: BrowserSourceService;
  nsfwFilter: NsfwFilter;
  llm: GroupingLLM;
  /** Called on every phase transition / progress update */
  onProgress?: (progress: SmartImportProgress) => void;
};

export interface BrowserSourceService {
  collectBookmarks(): Promise<RawItem[]>;
  collectTabs(): Promise<RawItem[]>;
  collectHistory(limit?: number): Promise<RawItem[]>;
}

export interface NsfwFilter {
  /** Returns TRUE if the URL is safe to import */
  isSafe(item: RawItem): Promise<boolean>;
}
/* ---------------------------------------------------------- */

/* -------------------- Helper functions -------------------- */
/**
 * Emit a progress update to the supplied onProgress handler when provided.
 *
 * @param opts Full smart import options including the optional onProgress callback.
 * @param progress Progress payload describing current phase and counts.
 */
const emit = (
  opts: SmartImportOptions,
  progress: SmartImportProgress
): void => {
  opts.onProgress?.(progress);
};

/**
 * Deduplicate raw items by URL to avoid redundant grouping and network usage.
 *
 * @param items Incoming raw items from bookmarks/tabs/history.
 * @returns Array of unique items by URL.
 */
const uniqueByUrl = (items: RawItem[]): RawItem[] => {
  const seen = new Set<string>();
  const result: RawItem[] = [];
  for (const item of items) {
    const key = item.url.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};
/* ---------------------------------------------------------- */

/* -------------------- Main entrypoint -------------------- */
/**
 * Run the multi-phase smart import process, emitting progress updates throughout.
 *
 * @param options Configuration/options required to orchestrate the import pipeline.
 */
export async function runSmartImport(
  options: SmartImportOptions
): Promise<SmartImportResult> {
  const {
    purposes,
    workspaceService,
    browserSourceService,
    nsfwFilter,
    llm,
  } = options;

  if (!purposes.length) {
    // Nothing to do, but consider this a "success"
    emit(options, {
      phase: "done",
      message: "No purposes selected – skipping Smart Import.",
    });
    return { primaryWorkspaceId: null };
  }

  /* 1) Initialize */
  emit(options, {
    phase: "initializing",
    message: "Starting Smart Import ...",
  });

  /* 2) Create workspaces per purpose */
  const workspaceMap = new Map<PurposeIdType, WorkspaceRef>();
  let primaryWorkspaceId: string | null = null;
  for (const purpose of purposes) {
    const workspace = await workspaceService.createWorkspaceForPurpose(purpose);
    workspaceMap.set(purpose, workspace);
    if (!primaryWorkspaceId) {
      primaryWorkspaceId = workspace.id;
    }
  }

  /* 3) Collect raw items from sources */
  emit(options, {
    phase: "collecting",
    message: "Collecting bookmarks, tabs, and history…",
  });

  // TODO: Incorporate history
  const [bookmarkItems, tabItems /*, historyItems*/] = await Promise.all([
    browserSourceService.collectBookmarks(),
    browserSourceService.collectTabs(),
    //browserSourceService.collectHistory(300), // tune this
  ]);

  let allItems = uniqueByUrl([
    ...bookmarkItems,
    ...tabItems,
    //...historyItems,
  ]);

  /* 4) Filter NSFW */
  emit(options, {
    phase: "filtering",
    message: "Filtering out sensitive or NSFW sites…",
    totalItems: allItems.length,
    processedItems: 0,
  });

  const safeItems: RawItem[] = [];
  let processed = 0;

  for (const item of allItems) {
    const safe = await nsfwFilter.isSafe(item);
    processed += 1;
    emit(options, {
      phase: "filtering",
      message: "Filtering out sensitive or NSFW sites…",
      totalItems: allItems.length,
      processedItems: processed,
    });
    if (safe) safeItems.push(item);
  }

  /* 5) Categorize via LLM */
  emit(options, {
    phase: "categorizing",
    message: "Organizing everything neatly…",
    totalItems: safeItems.length,
  });

  const groupingInput: GroupingInput = {
    items: safeItems,
    purposes,
  };
  const { groups }: GroupingLLMResponse = await llm.group(groupingInput);

  /* 6) Persist to workspaces */
  emit(options, {
    phase: "persisting",
    message: "Saving your new workspace…",
  });

  // Group by workspace/purpose
  const groupsByWorkspace = new Map<string, CategorizedGroup[]>();
  for (const group of groups) {
    const workspaceRef = workspaceMap.get(group.purpose);
    if (!workspaceRef) continue;
    const list = groupsByWorkspace.get(workspaceRef.id) ?? [];
    list.push(group);
    groupsByWorkspace.set(workspaceRef.id, list);
  }

  for (const [workspaceId, wsGroups] of groupsByWorkspace.entries()) {
    await workspaceService.saveGroupsToWorkspace(workspaceId, wsGroups);
  }

  /* 7) Done */
  emit(options, {
    phase: "done",
    message: "Your workspace is ready.",
  });

  return { primaryWorkspaceId };
}
/* ---------------------------------------------------------- */
