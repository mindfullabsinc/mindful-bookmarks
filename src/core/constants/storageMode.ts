export const StorageMode = {
  LOCAL: 'local',
  REMOTE: 'remote',
} as const;
export type StorageModeType = typeof StorageMode[keyof typeof StorageMode];

export const DEFAULT_STORAGE_MODE = StorageMode.LOCAL;

/** Mapping from storage type → human label, type-checked to cover all cases */
export const StorageLabel: Record<StorageModeType, string> = {
  [StorageMode.LOCAL]: 'Local-Only',
  [StorageMode.REMOTE]: 'Encrypted Sync',
};