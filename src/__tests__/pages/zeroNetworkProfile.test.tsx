// ---------------- Test: zeroNetworkProfile.test.tsx ----------------
// Proves: fresh anonymous profile can EDIT bookmarks with ZERO network calls
// Strategy: render the useBookmarkManager hook inside a minimal AppContext wrapper,
//           call addNamedBookmark(), assert state changes & no network.

// --- Inert mocks (must be BEFORE any imports that reference them) ---
jest.mock("aws-amplify", () => ({
  Amplify: { configure: jest.fn() },
}));
jest.mock("aws-amplify/auth", () => ({
  fetchAuthSession: jest.fn(async () => ({})),
  signOut: jest.fn(),
}));
jest.mock("@aws-amplify/ui-react", () => {
  const React = require("react");
  return {
    Authenticator: ({ children }: any) =>
      typeof children === "function"
        ? React.createElement(
            "div",
            { "data-testid": "Authenticator" },
            children({ signOut: jest.fn(), user: undefined })
          )
        : React.createElement("div", { "data-testid": "Authenticator" }, children),
    ThemeProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
    useAuthenticator: () => ({ signOut: jest.fn(), user: undefined }),
  };
});

// PostHog: virtual mock (repo may not have the package installed)
jest.mock(
  "posthog-js",
  () => ({
    init: () => {
      throw new Error("posthog must not init");
    },
    capture: () => {
      throw new Error("posthog must not capture");
    },
    identify: () => {
      throw new Error("posthog must not identify");
    },
    reset: () => {},
    default: {
      init: () => {
        throw new Error("posthog must not init");
      },
    },
  }),
  { virtual: true }
);

// Deterministic IDs for snapshots & bookmarks
jest.mock("uuid", () => ({ v4: () => "uuid-1" }));

// helpers at top of test
function mockGet(initial = {}) {
  return jest.fn().mockImplementation((keys?: any, cb?: (res: any) => void) => {
    const res = initial;
    if (typeof cb === "function") { cb(res); return; } // callback overload → void
    return Promise.resolve(res);                       // promise overload
  });
}
function mockSet() {
  return jest.fn().mockImplementation((items: any, cb?: () => void) => {
    if (typeof cb === "function") { cb(); return; }
    return Promise.resolve();                          // Promise<void>
  });
}
function mockRemove() {
  return jest.fn().mockImplementation((keys: any, cb?: () => void) => {
    if (typeof cb === "function") { cb(); return; }
    return Promise.resolve();                          // Promise<void>
  });
}
function mockEvent() {
  return {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    hasListener: jest.fn(),
    hasListeners: jest.fn(),
    addRules: jest.fn(),
    removeRules: jest.fn(),
    getRules: jest.fn(),
  };
}

// --- Imports (only after mocks) ---
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { AppContext } from "@/scripts/AppContextProvider";
import { AuthMode } from "@/core/constants/authMode";
import { useBookmarkManager } from "@/hooks/useBookmarkManager";

// --- Global stubs: network + chrome.storage ---
beforeEach(() => {
  // Block ALL fetch calls: any attempt = test failure
  globalThis.fetch = jest.fn(() => {
    throw new Error("fetch must not be called");
  });

  // Minimal chrome API surface used by persistence utilities
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: mockGet({}),
        set: mockSet(),
        remove: mockRemove(),
        // minimal extras often referenced by types
        QUOTA_BYTES: 5_242_880,
        getBytesInUse: jest.fn().mockImplementation((keys?: any, cb?: (n: number) => void) => {
          if (typeof cb === "function") { cb(0); return; }
          return Promise.resolve(0);
        }),
        clear: jest.fn().mockImplementation((cb?: () => void) => {
          if (typeof cb === "function") { cb(); return; }
          return Promise.resolve();
        }),
        setAccessLevel: jest.fn(),  // harmless no-op
        onChanged: mockEvent(),
      },
      session: {
        get: mockGet({}),
        set: mockSet(),
        remove: mockRemove(),
        QUOTA_BYTES: 5_242_880,
        getBytesInUse: jest.fn().mockImplementation((keys?: any, cb?: (n: number) => void) => {
          if (typeof cb === "function") { cb(0); return; }
          return Promise.resolve(0);
        }),
        clear: jest.fn().mockImplementation((cb?: () => void) => {
          if (typeof cb === "function") { cb(); return; }
          return Promise.resolve();
        }),
        setAccessLevel: jest.fn(),
        onChanged: mockEvent(),
      },
    },
    runtime: {
      onMessage: mockEvent(),
    },
    tabs: {
      query: jest.fn().mockResolvedValue([]),
    },
  }; 
});

// --- Minimal AppContext wrapper with real state so we can assert results ---
function makeWrapper(initialGroups: any[] = []) {
  const groupsRef = { current: initialGroups };
  const groupsIndexRef = { current: [] as any[] };

  const Wrapper: React.FC<React.PropsWithChildren> = ({ children }) => {
    const [bookmarkGroups, setBookmarkGroupsState] = React.useState(initialGroups);
    const [groupsIndex, setGroupsIndexState] = React.useState<any[]>([]);

    const setBookmarkGroups = (updater: any) =>
      setBookmarkGroupsState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        groupsRef.current = next;
        return next;
      });

    const setGroupsIndex = (updater: any) =>
      setGroupsIndexState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        groupsIndexRef.current = next;
        return next;
      });

    const ctx: any = {
      authMode: AuthMode.ANON,
      workspaces: [{ id: "local-default", name: "Local", mode: "local" }],
      activeWorkspaceId: "local-default",
      setActiveWorkspaceId: () => {},

      // names the hook expects
      bookmarkGroups,
      setBookmarkGroups,

      // aliases (in case other code paths read these)
      groups: bookmarkGroups,
      setGroups: setBookmarkGroups,

      groupsIndex,
      setGroupsIndex,

      userId: "anon-local-default",
      userEmail: undefined,

      // misc
      isLoading: false,
      hasHydrated: true,
      storageMode: "local",
      user: undefined,
      setUser: () => {},
    };

    return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>;
  };

  return {
    Wrapper,
    getGroups: () => groupsRef.current,
    getGroupsIndex: () => groupsIndexRef.current,
  };
}


// ---------------------- TESTS ----------------------

test("Anonymous fresh profile: editing (add bookmark) does not do any network calls", async () => {
  const { Wrapper, getGroups } = makeWrapper(/* start empty */);

  const { result } = renderHook(() => useBookmarkManager(), { wrapper: Wrapper });

  await act(async () => {
    await result.current.addNamedBookmark("Foo", "https://e.com", "Work");
  });

  // State assertions
  const groups = getGroups();
  expect(groups).toHaveLength(1);
  expect(groups[0].groupName).toBe("Work");
  expect(groups[0].bookmarks).toHaveLength(1);
  expect(groups[0].bookmarks[0]).toMatchObject({
    id: "uuid-1",
    name: "Foo",
    url: "https://e.com",
  });

  // Network assertions
  expect(global.fetch).not.toHaveBeenCalled(); // zero network

  // Persistence: local/session storage writes are OK (they're local-only APIs)
  expect(globalThis.chrome.storage.local.set).toHaveBeenCalled();
  // If your hook writes session caches too, you can assert:
  // expect(globalThis.chrome.storage.session.set).toHaveBeenCalled();
});

test("Anonymous fresh profile: adding to an existing group appends the bookmark", async () => {
  const initialGroups = [{ id: "g-1", groupName: "Work", bookmarks: [] }];
  const { Wrapper, getGroups } = makeWrapper(initialGroups);

  const { result } = renderHook(() => useBookmarkManager(), { wrapper: Wrapper });

  await act(async () => {
    await result.current.addNamedBookmark("Bar", "https://b.com", "Work");
  });

  const groups = getGroups();
  expect(groups).toHaveLength(1);
  expect(groups[0].groupName).toBe("Work");
  expect(groups[0].bookmarks).toHaveLength(1);
  expect(groups[0].bookmarks[0]).toMatchObject({
    id: "uuid-1",
    name: "Bar",
    url: "https://b.com",
  });

  // Still zero network
  expect(global.fetch).not.toHaveBeenCalled();
});
