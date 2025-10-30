// src/scripts/storageAdapters/index.ts
import { 
  StorageMode, 
  type StorageModeType 
} from "@/core/constants/storageMode";
import type { StorageAdapter } from "@/core/types/storageAdapter";
import { LocalAdapter } from "@/scripts/storageAdapters/local";

export function getAdapter(mode: StorageModeType | undefined): StorageAdapter | null {
  if (mode === StorageMode.LOCAL) return LocalAdapter;
  return null; // Remote adapter to be added later
}
