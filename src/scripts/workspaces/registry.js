import { StorageMode } from "@/core/constants/storageMode";
import { createUniqueID } from "@/core/utils/ids";
import { DEFAULT_LOCAL_WORKSPACE_ID, WORKSPACE_REGISTRY_KEY } from "@/core/constants/workspaces";
/* -------------------- Legacy keys (pre-PR3) -------------------- */
const LEGACY_WORKSPACES_KEY = "mindful_workspaces_v1"; // items map
const LEGACY_ACTIVE_KEY = "mindful_active_workspace_v1"; // active id
/* ---------------------------------------------------------- */
/* -------------------- Storage helpers (Local-only for PR-3) -------------------- */
/**
 * Retrieve the entire chrome.storage.local map.
 *
 * @returns Promise resolving to every key/value pair stored locally.
 */
async function readAllLocal() {
    return await chrome.storage.local.get(null);
}
/**
 * Read a specific key from chrome.storage.local, returning a typed value.
 *
 * @param key Storage key to read.
 * @returns Stored value or undefined when absent.
 */
async function readLocal(key) {
    const obj = await chrome.storage.local.get(key);
    return obj?.[key];
}
/**
 * Persist a value to chrome.storage.local under the given key.
 *
 * @param key Storage key to write.
 * @param value Serializable value to store.
 */
async function writeLocal(key, value) {
    await chrome.storage.local.set({ [key]: value });
}
/**
 * Remove one or more keys from chrome.storage.local.
 *
 * @param keys Storage keys to delete.
 */
async function removeLocal(...keys) {
    if (keys.length)
        await chrome.storage.local.remove(keys);
}
/* ---------------------------------------------------------- */
/* -------------------- Type guards & helpers -------------------- */
/**
 * Type guard that verifies a value conforms to the Workspace shape.
 *
 * @param x Candidate value to inspect.
 * @returns True when the object looks like a workspace.
 */
function isWorkspace(x) {
    return x && typeof x === "object" && typeof x.id === "string" && typeof x.name === "string";
    // archived is optional; no strict check needed
}
/**
 * Check whether a value appears to be a workspace items map.
 *
 * @param x Candidate value to inspect.
 * @returns True when the object contains at least one workspace-like entry.
 */
function looksLikeItemsMap(x) {
    if (!x || typeof x !== "object")
        return false;
    return Object.values(x).some(isWorkspace);
}
/**
 * Validate that a value resembles a WorkspaceRegistry object.
 *
 * @param x Candidate value to inspect.
 * @returns True when the object matches the registry shape/version.
 */
function isRegistryObject(x) {
    return (x &&
        typeof x === "object" &&
        x.version === 1 &&
        x.items &&
        typeof x.items === "object" &&
        typeof x.activeId === "string");
}
/**
 * Build a default Local workspace object, using PR-3 schema.
 *
 * @param id Optional workspace identifier override (auto-generated when omitted).
 * @returns Workspace payload with sensible defaults.
 */
function makeDefaultLocalWorkspace(id) {
    const now = Date.now();
    return {
        id: id ?? `local-${createUniqueID()}`,
        name: "My Bookmarks", // default display name for PR-3
        storageMode: StorageMode.LOCAL,
        createdAt: now,
        updatedAt: now,
    };
}
/**
 * Coerce any legacy shapes into a v1 registry object and persist it.
 * Handles:
 *  A) separate legacy keys: items map + active id
 *  B) WORKSPACE_REGISTRY_KEY accidentally stored as a string (activeId)
 *  C) WORKSPACE_REGISTRY_KEY stored as a raw items map (no wrapper)
 *
 * @returns Promise resolving to a normalized registry or undefined when nothing was migrated.
 */
async function coerceRegistryFromLegacy() {
    const legacyItems = await readLocal(LEGACY_WORKSPACES_KEY);
    const legacyActive = await readLocal(LEGACY_ACTIVE_KEY);
    const rawReg = await readLocal(WORKSPACE_REGISTRY_KEY);
    // A) Separate legacy keys present
    if (legacyItems && looksLikeItemsMap(legacyItems)) {
        const activeId = (legacyActive && legacyItems[legacyActive]) ? legacyActive
            : Object.keys(legacyItems)[0] || DEFAULT_LOCAL_WORKSPACE_ID;
        const reg = {
            version: 1,
            activeId,
            items: legacyItems,
            migratedLegacyLocal: false,
        };
        await writeLocal(WORKSPACE_REGISTRY_KEY, reg);
        await removeLocal(LEGACY_WORKSPACES_KEY, LEGACY_ACTIVE_KEY);
        return reg;
    }
    // B) Registry key contains just a string (activeId)
    if (typeof rawReg === "string") {
        const id = rawReg;
        let items = undefined;
        if (legacyItems && looksLikeItemsMap(legacyItems)) {
            items = legacyItems;
        }
        else {
            const ws = makeDefaultLocalWorkspace(id);
            items = { [ws.id]: ws };
        }
        const reg = {
            version: 1,
            activeId: id,
            items,
            migratedLegacyLocal: false,
        };
        await writeLocal(WORKSPACE_REGISTRY_KEY, reg);
        await removeLocal(LEGACY_WORKSPACES_KEY, LEGACY_ACTIVE_KEY);
        return reg;
    }
    // C) Registry key contains a raw items map (no version wrapper)
    if (rawReg && looksLikeItemsMap(rawReg)) {
        const first = Object.keys(rawReg)[0] || DEFAULT_LOCAL_WORKSPACE_ID;
        const reg = {
            version: 1,
            activeId: first,
            items: rawReg,
            migratedLegacyLocal: false,
        };
        await writeLocal(WORKSPACE_REGISTRY_KEY, reg);
        await removeLocal(LEGACY_WORKSPACES_KEY, LEGACY_ACTIVE_KEY);
        return reg;
    }
    // Nothing to coerce
    return undefined;
}
/* ---------------------------------------------------------- */
/* -------------------- Registry public API -------------------- */
/**
 * Load the workspace registry object from chrome.storage.local.
 *
 * @returns Promise resolving to the registry or undefined when not found.
 */
export async function loadRegistry() {
    return await readLocal(WORKSPACE_REGISTRY_KEY);
}
/**
 * Persist the workspace registry object to chrome.storage.local.
 *
 * @param registry Registry payload to store.
 */
export async function saveRegistry(registry) {
    await writeLocal(WORKSPACE_REGISTRY_KEY, registry);
}
/**
 * Resolve the currently active workspace, creating a registry if necessary.
 *
 * @returns Promise resolving to the active workspace metadata.
 */
export async function getActiveWorkspace() {
    const reg = await ensureRegistry();
    return reg.items[reg.activeId];
}
/**
 * Switch the active workspace identifier and refresh its updatedAt timestamp.
 *
 * @param id Workspace identifier to activate.
 */
export async function setActiveWorkspace(id) {
    const reg = await ensureRegistry();
    if (!reg.items[id])
        throw new Error(`Workspace ${id} not found`);
    reg.activeId = id;
    reg.items[id].updatedAt = Date.now();
    await saveRegistry(reg);
}
/**
 * Create/upgrade registry and run one-time legacy data migration.
 *
 * @returns Promise that resolves once initialization work finishes.
 */
export async function initializeLocalWorkspaceRegistry() {
    // Try reading the new-format registry
    let reg = await loadRegistry();
    // If missing or malformed, try to upgrade any legacy shapes
    if (!reg || !isRegistryObject(reg)) {
        const upgraded = await coerceRegistryFromLegacy();
        if (upgraded) {
            reg = upgraded;
        }
    }
    // If still missing, create a brand-new default local registry
    if (!reg || !isRegistryObject(reg)) {
        const ws = makeDefaultLocalWorkspace(DEFAULT_LOCAL_WORKSPACE_ID);
        reg = {
            version: 1,
            activeId: ws.id,
            items: { [ws.id]: ws },
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
/* -------------------- PR-4: Workspace Switcher APIs (additive) -------------------- */
/**
 * Return local workspaces, optionally including archived ones.
 *
 * Sorted by createdAt ascending to keep default at the top.
 *
 * @param opts Optional filters that affect the result set.
 * @param opts.includeArchived When true, include archived workspaces in the result.
 * @returns Sorted array of workspaces.
 */
export async function listLocalWorkspaces(opts) {
    const reg = await ensureRegistry();
    const all = Object.values(reg.items).sort((a, b) => a.createdAt - b.createdAt);
    return opts?.includeArchived ? all : all.filter(w => !w.archived);
}
/**
 * Convenience: get just the active workspace id.
 *
 * @returns Promise resolving to the active workspace identifier.
 */
export async function getActiveWorkspaceId() {
    const reg = await ensureRegistry();
    return reg.activeId;
}
/**
 * Ensure there is at least one Local workspace and an active id set (for boot scenarios).
 *
 * @returns Promise that resolves once invariants are restored.
 */
export async function ensureDefaultWorkspace() {
    let reg = await loadRegistry();
    if (!reg || !isRegistryObject(reg)) {
        await initializeLocalWorkspaceRegistry();
        reg = (await loadRegistry());
    }
    // If registry exists but somehow has no items, seed one default.
    if (!Object.keys(reg.items ?? {}).length) {
        const ws = makeDefaultLocalWorkspace(DEFAULT_LOCAL_WORKSPACE_ID);
        reg.items = { [ws.id]: ws };
        reg.activeId = ws.id;
        await saveRegistry(reg);
    }
}
/**
 * Create a new Local workspace with an empty dataset (adapter will hydrate later).
 * Switches active workspace by default; can be disabled with { setActive: false }.
 *
 * @param name Display name to use for the new workspace.
 * @returns Newly created workspace metadata.
 */
/**
 * Delete all local workspace data and reset the registry to empty.
 * After calling this, at least one workspace must be created before the app is usable.
 */
export async function deleteAllLocalWorkspaces() {
    const all = await readAllLocal();
    const wsDataKeys = Object.keys(all).filter(k => k.startsWith("WS_"));
    if (wsDataKeys.length)
        await removeLocal(...wsDataKeys);
    const emptyReg = {
        version: 1,
        activeId: DEFAULT_LOCAL_WORKSPACE_ID,
        items: {},
        migratedLegacyLocal: true,
    };
    await saveRegistry(emptyReg);
}
export async function createLocalWorkspace(name = "Local Workspace", opts) {
    const reg = await ensureRegistry();
    const id = `local-${createUniqueID()}`;
    const now = Date.now();
    const ws = {
        id,
        name,
        storageMode: StorageMode.LOCAL,
        createdAt: now,
        updatedAt: now,
    };
    reg.items[id] = ws;
    // Only switch active workspace if requested (default true to preserve existing behavior)
    if (opts?.setActive !== false) {
        reg.activeId = id;
    }
    await saveRegistry(reg);
    return ws;
}
/**
 * Rename a workspace (no-op if not found).
 *
 * @param id Workspace identifier to rename.
 * @param name New display name.
 */
export async function renameWorkspace(id, name) {
    const reg = await ensureRegistry();
    const ws = reg.items[id];
    if (!ws)
        return;
    reg.items[id] = { ...ws, name: name.trim(), updatedAt: Date.now() };
    await saveRegistry(reg);
}
/**
 * Soft-archive a workspace (hide in switcher but keep all data).
 * Guard: don’t allow archiving the last active non-archived workspace.
 * If archiving the active one, fall back to DEFAULT_LOCAL_WORKSPACE_ID when available,
 * otherwise pick the first non-archived workspace.
 *
 * @param id Workspace identifier to archive.
 */
export async function archiveWorkspace(id) {
    const reg = await ensureRegistry();
    const ws = reg.items[id];
    if (!ws)
        return;
    const live = Object.values(reg.items).filter(w => !w.archived);
    if (live.length <= 1) {
        // Don’t archive the only remaining live workspace
        return;
    }
    reg.items[id] = { ...ws, archived: true, updatedAt: Date.now() };
    if (reg.activeId === id) {
        const fallback = reg.items[DEFAULT_LOCAL_WORKSPACE_ID] && !reg.items[DEFAULT_LOCAL_WORKSPACE_ID].archived
            ? DEFAULT_LOCAL_WORKSPACE_ID
            : Object.values(reg.items).find(w => !w.archived && w.id !== id)?.id;
        if (fallback) {
            reg.activeId = fallback;
            reg.items[fallback].updatedAt = Date.now();
        }
    }
    await saveRegistry(reg);
}
/* ---------------------------------------------------------- */
/* -------------------- Internal helpers -------------------- */
/**
 * Guarantee a registry exists by lazily initializing it when absent.
 *
 * @returns Promise resolving to a valid workspace registry.
 */
async function ensureRegistry() {
    let reg = await loadRegistry();
    if (!reg || !isRegistryObject(reg)) {
        await initializeLocalWorkspaceRegistry();
        reg = (await loadRegistry());
    }
    return reg;
}
/**
 * Move any legacy (non-namespaced) local storage keys into the active workspace namespace.
 *
 * @param targetWsId Workspace identifier that should own the migrated entries.
 */
async function migrateLegacyLocalData(targetWsId) {
    const all = await readAllLocal();
    const entries = Object.entries(all);
    // Keep registry object and already namespaced keys
    const shouldKeepGlobal = (k) => k === WORKSPACE_REGISTRY_KEY || k.startsWith("WS_") ||
        k === LEGACY_WORKSPACES_KEY || k === LEGACY_ACTIVE_KEY;
    const legacyEntries = entries.filter(([k]) => !shouldKeepGlobal(k));
    if (legacyEntries.length === 0)
        return;
    const puts = {};
    for (const [k, v] of legacyEntries) {
        const nk = `WS_${targetWsId}__${k}`;
        puts[nk] = v;
    }
    await chrome.storage.local.set(puts);
    await chrome.storage.local.remove(legacyEntries.map(([k]) => k));
}
/* ---------------------------------------------------------- */
