import type { WorkspaceIdType } from "@/core/constants/workspaces";

export type CopyPayload =
  | { kind: "group"; fromWorkspaceId: WorkspaceIdType; groupId: string }
  | { kind: "bookmark"; fromWorkspaceId: WorkspaceIdType; bookmarkIds: string[] }
  | { kind: "workspace"; fromWorkspaceId: WorkspaceIdType }; // copy entire workspace

export function openCopyTo(payload: CopyPayload) {
  window.dispatchEvent(new CustomEvent<CopyPayload>("mindful:copyto:open", { detail: payload }));
}