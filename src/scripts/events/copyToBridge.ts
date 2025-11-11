import type { WorkspaceIdType } from "@/core/constants/workspaces";

export type CopyPayload =
  | { kind: "group"; fromWorkspaceId: WorkspaceIdType; groupId: string }
  | { kind: "bookmark"; fromWorkspaceId: WorkspaceIdType; bookmarkIds: string[] }
  | { kind: "workspace"; fromWorkspaceId: WorkspaceIdType }; // copy entire workspace

/**
 * Emit a window-level event that asks the UI to open the copy-to modal.
 *
 * @param payload Copy request describing the origin workspace and entities to duplicate.
 */
export function openCopyTo(payload: CopyPayload) {
  window.dispatchEvent(new CustomEvent<CopyPayload>("mindful:copyto:open", { detail: payload }));
}
