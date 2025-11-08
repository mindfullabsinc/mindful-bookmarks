import { useState, useCallback, useRef } from "react";

/* Types and interfaces */
import type { WorkspaceIdType } from "@/core/constants/workspaces";
import { StorageMode } from "@/core/constants/storageMode";
import type { BookmarkGroupType, BookmarkType } from "@/core/types/bookmarks";
import type { StorageAdapter } from "@/core/types/storageAdapter";

/* Scripts */ 
import { getAdapter } from "@/scripts/storageAdapters";

/* -------------------- Local types -------------------- */
type UseCopyToArgs = {
  currentWorkspaceId: WorkspaceIdType;
  toast: (msg: string) => void; // your existing toast/banner helper
};

export type CopyPayload =
  | { kind: "workspace"; fromWorkspaceId: WorkspaceIdType }
  | { kind: "group"; fromWorkspaceId: WorkspaceIdType; groupId: string }
  | { kind: "bookmark"; fromWorkspaceId: WorkspaceIdType; bookmarkIds: string[] };
/* ---------------------------------------------------------- */

/* -------------------- Helper functions -------------------- */
/**
 * Assert that a storage adapter exposes group read/write helpers.
 *
 * @param a Storage adapter instance to inspect.
 * @returns True when the adapter supports reading and writing all bookmark groups.
 */
function hasGroupRW(
  a: StorageAdapter | null | undefined
): a is StorageAdapter & {
  readAllGroups: (wid: WorkspaceIdType) => Promise<BookmarkGroupType[]>;
  writeAllGroups: (wid: WorkspaceIdType, groups: BookmarkGroupType[]) => Promise<void>;
} {
  return !!a && typeof a.readAllGroups === "function" && typeof a.writeAllGroups === "function";
}
/* ---------------------------------------------------------- */

/* -------------------- Public functions -------------------- */
/**
 * Provide helpers for copying or moving bookmark groups or individual bookmarks to another workspace.
 *
 * @param options Hook options used to track the current workspace and surface toast feedback.
 * @param options.currentWorkspaceId Workspace identifier serving as the source for copy/move operations.
 * @param options.toast Callback for presenting user feedback messages.
 * @returns Object exposing modal state and copy handlers.
 */
export function useCopyTo({ currentWorkspaceId, toast }: UseCopyToArgs) {
  const [open, setOpen] = useState(false);
  const pendingAction = useRef<null | {
    // stash what we’re copying until user picks destination
    kind: "group" | "bookmark";
    groupId?: string;
    bookmarkIds?: string[];
  }>(null);

  /**
   * Stage a group copy/move request and open the modal.
   *
   * @param groupId Identifier of the group being copied.
   */
  const beginCopyGroup = useCallback((groupId: string) => {
    pendingAction.current = { kind: "group", groupId };
    setOpen(true);
  }, []);

  /**
   * Stage a bookmark copy/move request and open the modal.
   *
   * @param bookmarkIds List of bookmark ids selected for copying.
   */
  const beginCopyBookmarks = useCallback((bookmarkIds: string[]) => {
    pendingAction.current = { kind: "bookmark", bookmarkIds };
    setOpen(true);
  }, []);

  return { open, setOpen, beginCopyGroup, beginCopyBookmarks };
}

/**
 * Create or locate an "Imported" group in the destination workspace so ad-hoc bookmark copies have a landing spot.
 *
 * @param workspaceId Workspace identifier that should contain the imported group.
 * @param storageKey Fully qualified chrome.storage.local key (`WS_<id>__groups`) used by the adapter.
 * @returns Identifier of the ensured "Imported" group.
 * @throws When the local storage adapter lacks group read/write capabilities.
 */
export async function ensureImportedGroup(workspaceId: WorkspaceIdType, storageKey: string): Promise<string> {
  const adapter = getAdapter(StorageMode.LOCAL);
  if (!hasGroupRW(adapter)) {
    throw new Error("Local adapter unavailable or missing read/write methods");
  }

  const groups = await adapter.readAllGroups(storageKey);

  let g = groups.find(
    (x: BookmarkGroupType) => x.groupName?.toLowerCase?.() === "imported"
  );

  if (!g) {
    const id = 
      globalThis.crypto?.randomUUID?.() ??
      `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    g = { id, groupName: "Imported", bookmarks: [] as BookmarkType[] };
    groups.push(g);
    await adapter.writeAllGroups(workspaceId, storageKey, groups);
  }

  return g.id;
}
/* ---------------------------------------------------------- */
