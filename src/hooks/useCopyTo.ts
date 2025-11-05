import { useState, useCallback, useRef } from "react";

/* Types and interfaces */
import type { WorkspaceIdType } from "@/core/constants/workspaces";
import { StorageMode } from "@/core/constants/storageMode";
import type { BookmarkGroupType, BookmarkType } from "@/core/types/bookmarks";
import type { StorageAdapter } from "@/core/types/storageAdapter";

/* Scripts */ 
import { copyItems, moveItems, type CopyResult } from "@/scripts/copyBookmarks";
import { getAdapter } from "@/scripts/storageAdapters";

/* -------------------- Local types -------------------- */
type UseCopyToArgs = {
  currentWorkspaceId: WorkspaceIdType;
  toast: (msg: string) => void; // your existing toast/banner helper
};
/* ---------------------------------------------------------- */

/* -------------------- Helper functions -------------------- */
// --- type guard to narrow optional methods ---
function hasGroupRW(
  a: StorageAdapter | null | undefined
): a is StorageAdapter & {
  readAllGroups: (wid: WorkspaceIdType) => Promise<BookmarkGroupType[]>;
  writeAllGroups: (wid: WorkspaceIdType, groups: BookmarkGroupType[]) => Promise<void>;
} {
  return !!a && typeof a.readAllGroups === "function" && typeof a.writeAllGroups === "function";
}

/** Create or find an "Imported" group in destination. */
async function ensureImportedGroup(workspaceId: WorkspaceIdType): Promise<string> {
  const adapter = getAdapter(StorageMode.LOCAL);
  if (!hasGroupRW(adapter)) {
    throw new Error("Local adapter unavailable or missing read/write methods");
  }

  const groups = await adapter.readAllGroups(workspaceId);

  let g = groups.find(
    (x: BookmarkGroupType) => x.groupName?.toLowerCase?.() === "imported"
  );

  if (!g) {
    const id =
      globalThis.crypto?.randomUUID?.() ??
      `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    g = { id, groupName: "Imported", bookmarks: [] as BookmarkType[] };
    groups.push(g);
    await adapter.writeAllGroups(workspaceId, groups);
  }

  return g.id;
}
/* ---------------------------------------------------------- */

/* -------------------- Public functions -------------------- */
export function useCopyTo({ currentWorkspaceId, toast }: UseCopyToArgs) {
  const [open, setOpen] = useState(false);
  const pendingAction = useRef<null | {
    // stash what we’re copying until user picks destination
    kind: "group" | "bookmark";
    groupId?: string;
    bookmarkIds?: string[];
  }>(null);

  const beginCopyGroup = useCallback((groupId: string) => {
    pendingAction.current = { kind: "group", groupId };
    setOpen(true);
  }, []);

  const beginCopyBookmarks = useCallback((bookmarkIds: string[]) => {
    pendingAction.current = { kind: "bookmark", bookmarkIds };
    setOpen(true);
  }, []);

  const onConfirm = useCallback(async (destWorkspaceId: WorkspaceIdType, move: boolean) => {
    setOpen(false);
    const action = pendingAction.current;
    pendingAction.current = null;
    if (!action) return;

    let res: CopyResult = { added: 0, skipped: 0 };
    try {
      if (action.kind === "group") {
        const fn = move ? moveItems : copyItems;
        res = await fn({
          fromWorkspaceId: currentWorkspaceId,
          toWorkspaceId: destWorkspaceId,
          target: { kind: "group", groupId: action.groupId! },
          dedupeByUrl: true,
          chunkSize: 150,
        } as any);
      } else {
        // For bookmark → we need a destination group to drop into.
        // MVP: create/find a default "Imported" group in destination?
        // Simpler: ask caller to pass the dest group id; but for this hook,
        // we'll create/use "Imported".
        const intoGroupId = await ensureImportedGroup(destWorkspaceId);
        const fn = move ? moveItems : copyItems;
        res = await fn({
          fromWorkspaceId: currentWorkspaceId,
          toWorkspaceId: destWorkspaceId,
          target: { kind: "bookmark", bookmarkIds: action.bookmarkIds!, intoGroupId },
          dedupeByUrl: true,
          chunkSize: 200,
        } as any);
      }
      toast(`${res.added} added • ${res.skipped} skipped`);
    } catch (err: any) {
      toast(`Copy failed: ${err?.message ?? String(err)}`);
    }
  }, [currentWorkspaceId, toast]);

  return { open, setOpen, beginCopyGroup, beginCopyBookmarks, onConfirm };
}
/* ---------------------------------------------------------- */