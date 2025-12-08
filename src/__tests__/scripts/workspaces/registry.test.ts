
import {
  initializeLocalWorkspaceRegistry,
  ensureDefaultWorkspace,
  createLocalWorkspace,
  listLocalWorkspaces,
  renameWorkspace,
  archiveWorkspace,
  getActiveWorkspace,
  getActiveWorkspaceId,
  loadRegistry,
  saveRegistry,
} from "@/scripts/workspaces/registry"; 

import {
  DEFAULT_LOCAL_WORKSPACE_ID,
  WORKSPACE_REGISTRY_KEY,
  type WorkspaceRegistryType,
  type WorkspaceType,
  type WorkspaceIdType,
} from "@/core/constants/workspaces";
import { StorageMode } from "@/core/constants/storageMode";

// Make createUniqueID deterministic
jest.mock("@/core/utils/ids", () => ({
  createUniqueID: jest.fn(() => "test-uuid-123"),
}));

const LEGACY_WORKSPACES_KEY = "mindful_workspaces_v1";
const LEGACY_ACTIVE_KEY = "mindful_active_workspace_v1";

const MOCK_NOW = 1_700_000_000_000;

let store: Record<string, any>;
let getMock: jest.Mock;
let setMock: jest.Mock;
let removeMock: jest.Mock;

beforeEach(() => {
  store = {};

  getMock = jest.fn((key: any) => {
    if (key == null) {
      // readAllLocal()
      return Promise.resolve({ ...store });
    }
    if (typeof key === "string") {
      if (Object.prototype.hasOwnProperty.call(store, key)) {
        return Promise.resolve({ [key]: store[key] });
      }
      return Promise.resolve({});
    }
    return Promise.resolve({});
  });

  setMock = jest.fn((items: Record<string, any>) => {
    Object.assign(store, items);
    return Promise.resolve();
  });

  removeMock = jest.fn((keys: any) => {
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const k of arr) {
      delete store[k];
    }
    return Promise.resolve();
  });

  (globalThis as any).chrome = {
    storage: {
      local: {
        get: getMock,
        set: setMock,
        remove: removeMock,
      },
    },
  };

  jest.spyOn(Date, "now").mockReturnValue(MOCK_NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

function makeWorkspace(
  id: WorkspaceIdType,
  overrides: Partial<WorkspaceType> = {}
): WorkspaceType {
  return {
    id,
    name: `Workspace ${id}`,
    storageMode: StorageMode.LOCAL,
    createdAt: MOCK_NOW,
    updatedAt: MOCK_NOW,
    ...overrides,
  };
}

describe("localWorkspaceRegistry", () => {
  test("saveRegistry and loadRegistry round-trip the registry", async () => {
    const wsId = DEFAULT_LOCAL_WORKSPACE_ID;
    const ws = makeWorkspace(wsId);

    const registry: WorkspaceRegistryType = {
      version: 1,
      activeId: wsId,
      items: { [wsId]: ws },
      migratedLegacyLocal: true,
    };

    await saveRegistry(registry);
    expect(store[WORKSPACE_REGISTRY_KEY]).toEqual(registry);

    const loaded = await loadRegistry();
    expect(loaded).toEqual(registry);
    expect(getMock).toHaveBeenCalledWith(WORKSPACE_REGISTRY_KEY);
  });

  test("initializeLocalWorkspaceRegistry seeds default registry when none exists", async () => {
    expect(store[WORKSPACE_REGISTRY_KEY]).toBeUndefined();

    await initializeLocalWorkspaceRegistry();

    const reg = store[WORKSPACE_REGISTRY_KEY] as WorkspaceRegistryType;
    expect(reg).toBeDefined();
    expect(reg.version).toBe(1);
    expect(reg.migratedLegacyLocal).toBe(true);

    const ws = reg.items[DEFAULT_LOCAL_WORKSPACE_ID];
    expect(ws).toBeDefined();
    expect(ws.id).toBe(DEFAULT_LOCAL_WORKSPACE_ID);
    expect(ws.name).toBe("My Bookmarks");
    expect(ws.storageMode).toBe(StorageMode.LOCAL);
    expect(ws.createdAt).toBe(MOCK_NOW);
    expect(ws.updatedAt).toBe(MOCK_NOW);
    expect(reg.activeId).toBe(DEFAULT_LOCAL_WORKSPACE_ID);
  });

  test("initializeLocalWorkspaceRegistry migrates from legacy items + active id", async () => {
    const legacyWs1 = makeWorkspace("ws-1" as WorkspaceIdType);
    const legacyWs2 = makeWorkspace("ws-2" as WorkspaceIdType);

    store[LEGACY_WORKSPACES_KEY] = {
      [legacyWs1.id]: legacyWs1,
      [legacyWs2.id]: legacyWs2,
    };
    store[LEGACY_ACTIVE_KEY] = legacyWs2.id;

    await initializeLocalWorkspaceRegistry();

    const reg = store[WORKSPACE_REGISTRY_KEY] as WorkspaceRegistryType;
    expect(reg).toBeDefined();
    expect(reg.version).toBe(1);
    expect(reg.activeId).toBe(legacyWs2.id);
    expect(reg.items).toEqual({
      [legacyWs1.id]: legacyWs1,
      [legacyWs2.id]: legacyWs2,
    });
    expect(reg.migratedLegacyLocal).toBe(true);

    // Legacy keys should be removed
    expect(store[LEGACY_WORKSPACES_KEY]).toBeUndefined();
    expect(store[LEGACY_ACTIVE_KEY]).toBeUndefined();
  });

  test("ensureDefaultWorkspace creates default when registry has no items", async () => {
    const emptyReg: WorkspaceRegistryType = {
      version: 1,
      activeId: "some-id" as WorkspaceIdType,
      items: {},
      migratedLegacyLocal: true,
    };
    store[WORKSPACE_REGISTRY_KEY] = emptyReg;

    await ensureDefaultWorkspace();

    const reg = store[WORKSPACE_REGISTRY_KEY] as WorkspaceRegistryType;
    const ws = reg.items[DEFAULT_LOCAL_WORKSPACE_ID];

    expect(Object.keys(reg.items)).toHaveLength(1);
    expect(ws.id).toBe(DEFAULT_LOCAL_WORKSPACE_ID);
    expect(reg.activeId).toBe(DEFAULT_LOCAL_WORKSPACE_ID);
  });

  test("createLocalWorkspace adds a new workspace and activates it", async () => {
    // Seed with default registry
    await initializeLocalWorkspaceRegistry();

    const newWs = await createLocalWorkspace("Second Workspace");

    expect(newWs.id).toBe("local-test-uuid-123");
    expect(newWs.name).toBe("Second Workspace");
    expect(newWs.storageMode).toBe(StorageMode.LOCAL);
    expect(newWs.createdAt).toBe(MOCK_NOW);
    expect(newWs.updatedAt).toBe(MOCK_NOW);

    const reg = store[WORKSPACE_REGISTRY_KEY] as WorkspaceRegistryType;
    expect(reg.items[newWs.id]).toEqual(newWs);
    expect(reg.activeId).toBe(newWs.id);
  });

  test("renameWorkspace updates name and trims whitespace", async () => {
    const wsId = "ws-rename" as WorkspaceIdType;
    const ws = makeWorkspace(wsId, { name: "Old Name" });
    const reg: WorkspaceRegistryType = {
      version: 1,
      activeId: wsId,
      items: { [wsId]: ws },
      migratedLegacyLocal: true,
    };
    store[WORKSPACE_REGISTRY_KEY] = reg;

    await renameWorkspace(wsId, "  New Name  ");

    const updatedReg = store[WORKSPACE_REGISTRY_KEY] as WorkspaceRegistryType;
    const updated = updatedReg.items[wsId];

    expect(updated.name).toBe("New Name");
    expect(updated.updatedAt).toBe(MOCK_NOW);
  });

  test("archiveWorkspace does nothing when archiving the only live workspace", async () => {
    const wsId = "only" as WorkspaceIdType;
    const ws = makeWorkspace(wsId);
    const reg: WorkspaceRegistryType = {
      version: 1,
      activeId: wsId,
      items: { [wsId]: ws },
      migratedLegacyLocal: true,
    };
    store[WORKSPACE_REGISTRY_KEY] = reg;

    await archiveWorkspace(wsId);

    const updatedReg = store[WORKSPACE_REGISTRY_KEY] as WorkspaceRegistryType;
    expect(updatedReg.items[wsId].archived).toBeUndefined();
    expect(updatedReg.activeId).toBe(wsId);
  });

  test("archiveWorkspace archives a workspace and reassigns active to default when possible", async () => {
    const defaultWs = makeWorkspace(DEFAULT_LOCAL_WORKSPACE_ID);
    const otherId = "other" as WorkspaceIdType;
    const otherWs = makeWorkspace(otherId);
    const reg: WorkspaceRegistryType = {
      version: 1,
      activeId: otherId,
      items: {
        [DEFAULT_LOCAL_WORKSPACE_ID]: defaultWs,
        [otherId]: otherWs,
      },
      migratedLegacyLocal: true,
    };
    store[WORKSPACE_REGISTRY_KEY] = reg;

    await archiveWorkspace(otherId);

    const updatedReg = store[WORKSPACE_REGISTRY_KEY] as WorkspaceRegistryType;
    expect(updatedReg.items[otherId].archived).toBe(true);
    expect(updatedReg.activeId).toBe(DEFAULT_LOCAL_WORKSPACE_ID);
    expect(updatedReg.items[DEFAULT_LOCAL_WORKSPACE_ID].updatedAt).toBe(MOCK_NOW);
  });

  test("listLocalWorkspaces returns non-archived by default, sorted by createdAt", async () => {
    const ws1 = makeWorkspace("a" as WorkspaceIdType, { createdAt: MOCK_NOW - 200 });
    const ws2 = makeWorkspace("b" as WorkspaceIdType, { createdAt: MOCK_NOW - 100 });
    const ws3 = makeWorkspace("c" as WorkspaceIdType, {
      createdAt: MOCK_NOW - 150,
      archived: true,
    });

    const reg: WorkspaceRegistryType = {
      version: 1,
      activeId: ws2.id,
      items: {
        [ws1.id]: ws1,
        [ws2.id]: ws2,
        [ws3.id]: ws3,
      },
      migratedLegacyLocal: true,
    };
    store[WORKSPACE_REGISTRY_KEY] = reg;

    const live = await listLocalWorkspaces();
    expect(live.map(w => w.id)).toEqual([ws1.id, ws2.id]); // sorted ascending by createdAt

    const all = await listLocalWorkspaces({ includeArchived: true });
    expect(all.map(w => w.id)).toEqual([ws1.id, ws3.id, ws2.id]);
  });

  test("getActiveWorkspace and getActiveWorkspaceId return active data", async () => {
    const ws1 = makeWorkspace(DEFAULT_LOCAL_WORKSPACE_ID);
    const reg: WorkspaceRegistryType = {
      version: 1,
      activeId: ws1.id,
      items: { [ws1.id]: ws1 },
      migratedLegacyLocal: true,
    };
    store[WORKSPACE_REGISTRY_KEY] = reg;

    const id = await getActiveWorkspaceId();
    expect(id).toBe(ws1.id);

    const ws = await getActiveWorkspace();
    expect(ws).toEqual(ws1);
  });
});
