// Core workspace types (Local-only foundation)

import { 
  StorageMode,
  type StorageModeType 
} from "@/core/constants/storageMode";

/* -------------------- Types -------------------- */
export type WorkspaceIdType = string;

export type Workspace = {
  id: WorkspaceIdType;
  name: string;
  storageMode: StorageModeType; // "local" for PR3
  createdAt: number;
  updatedAt: number;
}

// WorkspaceRegistryV1 keeps track of all workspaces and the active one
export interface WorkspaceRegistryV1 {
  version: 1;
  activeId: WorkspaceIdType;
  items: Record<WorkspaceIdType, Workspace>;
  migratedLegacyLocal?: boolean; // marks whether legacy Local data has been moved under WS_<id>
}

export type WorkspaceRegistry = WorkspaceRegistryV1;
/* ---------------------------------------------------------- */

/* -------------------- Keys and constants -------------------- */
export const WORKSPACE_REGISTRY_KEY = 'mindful.workspaces.registry.v1';


/**
 * Construct a namespaced storage key for a workspace-scoped payload.
 *
 * @param workspaceId Workspace identifier used as the namespace prefix.
 * @param key Logical storage key (e.g., `groups_index_v1`).
 * @returns Namespaced storage key string.
 */
// Namespace format for Local adapter keys:
// e.g., WS_local-default__groups_index_v1
export const wsKey = (workspaceId: WorkspaceIdType, key: string) =>
  `WS_${workspaceId}__${key}`;

export const DEFAULT_LOCAL_WORKSPACE_ID = 'local-default';
/* ---------------------------------------------------------- */

/* -------------------- Helper functions -------------------- */
/**
 * Create the default local workspace descriptor used for initial bootstraps.
 *
 * @returns Workspace metadata for the built-in local workspace.
 */
export function makeDefaultLocalWorkspace(): Workspace {
  const now = Date.now();
  return {
    id: DEFAULT_LOCAL_WORKSPACE_ID,
    name: 'My Bookmarks',
    storageMode: StorageMode.LOCAL,
    createdAt: now,
    updatedAt: now,
  };
}
/* ---------------------------------------------------------- */
