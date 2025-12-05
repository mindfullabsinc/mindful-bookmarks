/* -------------------- Imports -------------------- */
/* Types */
import type { SmartImportPhase } from "@/core/types/smartImportPhase";
import type { PurposeId } from "@/core/types/purposeId";
import type {
  GroupingLLM,
  GroupingInput,
  GroupingLLMResponse,
  CategorizedGroup,
  RawItem,
} from "@/core/types/llmGrouping";
/* ---------------------------------------------------------- */

/* -------------------- Types -------------------- */
export type WorkspaceRef = {
  id: string;
  purpose: PurposeId;
};

export type SmartImportProgress = {
  phase: SmartImportPhase;
  message?: string;
  // optionally, per-phase counts
  totalItems?: number;
  processedItems?: number;
};

/* -------------------- Abstractions -------------------- */

export interface WorkspaceService {
  createWorkspaceForPurpose(purpose: PurposeId): Promise<WorkspaceRef>;
  saveGroupsToWorkspace(
    workspaceId: string,
    groups: CategorizedGroup[]
  ): Promise<void>;
}

export interface BrowserSourceService {
  collectBookmarks(): Promise<RawItem[]>;
  collectTabs(): Promise<RawItem[]>;
  collectHistory(limit?: number): Promise<RawItem[]>;
}

export interface NsfwFilter {
  /** Returns TRUE if the URL is safe to import */
  isSafe(item: RawItem): Promise<boolean>;
}

export type SmartImportOptions = {
  purposes: PurposeId[];
  workspaceService: WorkspaceService;
  browserSourceService: BrowserSourceService;
  nsfwFilter: NsfwFilter;
  llm: GroupingLLM;
  /** Called on every phase transition / progress update */
  onProgress?: (progress: SmartImportProgress) => void;
};

/* -------------------- Helpers -------------------- */

const emit = (
  opts: SmartImportOptions,
  progress: SmartImportProgress
): void => {
  opts.onProgress?.(progress);
};

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

/* -------------------- Main entry point -------------------- */

export async function runSmartImport(
  options: SmartImportOptions
): Promise<void> {
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
    return;
  }

  /* 1) Initialize */
  emit(options, {
    phase: "initializing",
    message: "Starting Smart Import…",
  });

  /* 2) Create workspaces per purpose */
  const workspaceMap = new Map<PurposeId, WorkspaceRef>();
  for (const purpose of purposes) {
    const workspace = await workspaceService.createWorkspaceForPurpose(purpose);
    workspaceMap.set(purpose, workspace);
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
    const list =
      groupsByWorkspace.get(workspaceRef.id) ?? [];
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
}
