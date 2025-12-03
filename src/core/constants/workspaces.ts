// Core workspace types (Local-only foundation)

import { 
  StorageMode,
  type StorageModeType 
} from "@/core/constants/storageMode";
import { createUniqueID } from "@/core/utils/ids";

/* -------------------- Types -------------------- */
export type WorkspaceIdType = string;

export type WorkspaceType = {
  id: WorkspaceIdType;
  name: string;
  storageMode: StorageModeType; // "local" for PR3
  createdAt: number;
  updatedAt: number;
  archived?: boolean; // allow soft-hiding in switcher without data loss
}

// WorkspaceRegistryV1 keeps track of all workspaces and the active one
export interface WorkspaceRegistryV1 {
  version: 1;
  activeId: WorkspaceIdType;
  items: Record<WorkspaceIdType, WorkspaceType>;
  migratedLegacyLocal?: boolean; // marks whether legacy Local data has been moved under WS_<id>
}

export type WorkspaceRegistryType = WorkspaceRegistryV1;
/* ---------------------------------------------------------- */

/* -------------------- Keys and constants -------------------- */
export const WORKSPACE_REGISTRY_KEY = 'mindful.workspaces.registry.v1';
export const DEFAULT_LOCAL_WORKSPACE_ID = 'local-default';

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

/**
 * Create a local-only workspace id.
 * Kept simple & deterministic for tests; swap to nanoid later if desired.
 *
 * @returns New workspace identifier string.
 */
export const makeLocalWorkspaceId = (): WorkspaceIdType =>
  `local-${createUniqueID()}`;
/* ---------------------------------------------------------- */

/* -------------------- Helper functions -------------------- */
/**
 * Create the default local workspace descriptor used for initial bootstraps.
 *
 * @returns Workspace metadata for the built-in local workspace.
 */
export function makeDefaultLocalWorkspace(): WorkspaceType {
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
