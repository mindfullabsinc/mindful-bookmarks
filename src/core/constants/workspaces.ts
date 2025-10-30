export type WorkspaceId = string;

export type Workspace = {
  id: WorkspaceId;
  name: string;
  mode: 'LOCAL';           // reserve 'REMOTE' for later
  createdAt: number;
  updatedAt: number;
};

export const DEFAULT_LOCAL_WORKSPACE_ID = 'local-default';
export const WORKSPACES_KEY = 'mindful_workspaces_v1';
export const ACTIVE_WORKSPACE_KEY = 'mindful_active_workspace_v1';

// Small helper: single default local workspace.
export function makeDefaultLocalWorkspace(): Workspace {
  const now = Date.now();
  return {
    id: DEFAULT_LOCAL_WORKSPACE_ID,
    name: 'My Workspace',
    mode: 'LOCAL',
    createdAt: now,
    updatedAt: now,
  };
}
