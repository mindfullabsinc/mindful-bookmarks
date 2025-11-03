import { StorageMode } from "@/core/constants/storageMode";
import type { WorkspaceId, Workspace, WorkspaceRegistry } from "@/core/constants/workspaces";
import { createUniqueID } from "@/core/utils/Utilities";
import { 
  DEFAULT_LOCAL_WORKSPACE_ID, 
  WORKSPACE_REGISTRY_KEY 
} from "@/core/constants/workspaces";


/* -------------------- Storage helpers (Local-only for PR-3) -------------------- */
/**
 * Read the entire chrome.storage.local namespace as a plain object.
 *
 * @returns Promise resolving to the full local storage map.
 */
async function readAllLocal(): Promise<Record<string, unknown>> {
  // chrome.storage.local.get(null) returns the whole object
  // If your test shims differ, align accordingly.
  return await chrome.storage.local.get(null) as Record<string, unknown>;
}

/**
 * Read a single chrome.storage.local key and return its typed value when present.
 *
 * @param key Storage key to look up.
 * @returns Promise resolving to the stored value or undefined.
 */
async function readLocal<T = unknown>(key: string): Promise<T | undefined> {
  const obj = await chrome.storage.local.get(key);
  return obj?.[key] as T | undefined;
}

/**
 * Persist a value to chrome.storage.local under the provided key.
 *
 * @param key Storage key to update.
 * @param value Serializable value to store.
 * @returns Promise that resolves once the write completes.
 */
async function writeLocal(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/**
 * Remove a chrome.storage.local entry for the given key.
 *
 * @param key Storage key to delete.
 * @returns Promise that resolves once removal is complete.
 */
async function removeLocal(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}
/* ---------------------------------------------------------- */

/* -------------------- Registry public API -------------------- */
/**
 * Load the workspace registry from persistent storage, if available.
 *
 * @returns Promise resolving to the registry or undefined when not yet created.
 */
export async function loadRegistry(): Promise<WorkspaceRegistry | undefined> {
  return await readLocal<WorkspaceRegistry>(WORKSPACE_REGISTRY_KEY);
}

/**
 * Persist the workspace registry back to chrome.storage.local.
 *
 * @param registry Registry payload to store.
 * @returns Promise that resolves after saving.
 */
export async function saveRegistry(registry: WorkspaceRegistry): Promise<void> {
  await writeLocal(WORKSPACE_REGISTRY_KEY, registry);
}

/**
 * Resolve the currently active workspace, creating the registry if needed.
 *
 * @returns Promise resolving to the active workspace metadata.
 */
export async function getActiveWorkspace(): Promise<Workspace> {
  const reg = await ensureRegistry();
  return reg.items[reg.activeId];
}

/**
 * Mark a workspace as active and update its `updatedAt` timestamp.
 *
 * @param id Workspace identifier to activate.
 * @returns Promise that resolves once the registry is stored.
 */
export async function setActiveWorkspace(id: WorkspaceId): Promise<void> {
  const reg = await ensureRegistry();
  if (!reg.items[id]) throw new Error(`Workspace ${id} not found`);
  reg.activeId = id;
  reg.items[id].updatedAt = Date.now();
  await saveRegistry(reg);
}

/**
 * Create a default local workspace if none exists and migrate legacy storage once.
 *
 * @returns Promise that resolves after initialization/migration work completes.
 */
export async function initializeLocalWorkspaceRegistry(): Promise<void> {
  let reg = await loadRegistry();

  if (!reg) {
    const id = `local-${createUniqueID()}`;
    const now = Date.now();
    const ws: Workspace = {
      id,
      name: DEFAULT_LOCAL_WORKSPACE_ID,
      storageMode: StorageMode.LOCAL, // your enum/type from constants
      createdAt: now,
      updatedAt: now,
    };

    reg = {
      version: 1,
      activeId: id,
      items: { [id]: ws },
      migratedLegacyLocal: false,
    };

    await saveRegistry(reg);
  }

  // Run one-time legacy migration (non-namespaced → WS_<id>__)
  if (!reg.migratedLegacyLocal) {
    await migrateLegacyLocalData(reg.activeId);
    reg.migratedLegacyLocal = true;
    await saveRegistry(reg);
  }
}
/* ---------------------------------------------------------- */

/* -------------------- Internal helpers -------------------- */
/**
 * Ensure a registry exists by lazily creating the default entry when absent.
 *
 * @returns Promise resolving to the workspace registry.
 */
async function ensureRegistry(): Promise<WorkspaceRegistry> {
  let reg = await loadRegistry();
  if (!reg) {
    await initializeLocalWorkspaceRegistry();
    reg = (await loadRegistry())!;
  }
  return reg;
}

/**
 * Move any legacy (non-namespaced) local storage keys into the active workspace namespace.
 *
 * @param targetWsId Workspace identifier receiving the migrated data.
 * @returns Promise that resolves after migration completes.
 */
async function migrateLegacyLocalData(targetWsId: WorkspaceId): Promise<void> {
  const all = await readAllLocal();
  const entries = Object.entries(all);

  // Keys to leave alone:
  // - Registry itself
  // - Already namespaced keys (start with "WS_")
  // - Any other global/technical keys you know about
  const shouldKeepGlobal = (k: string) =>
    k === WORKSPACE_REGISTRY_KEY || k.startsWith("WS_");

  const legacyEntries = entries.filter(([k]) => !shouldKeepGlobal(k));

  if (legacyEntries.length === 0) return;

  // Copy to namespaced and remove legacy
  const puts: Record<string, unknown> = {};
  for (const [k, v] of legacyEntries) {
    const nk = `WS_${targetWsId}__${k}`;
    puts[nk] = v;
  }

  // Write all namespaced
  await chrome.storage.local.set(puts);

  // Remove legacy
  await chrome.storage.local.remove(legacyEntries.map(([k]) => k));
}
/* ---------------------------------------------------------- */
