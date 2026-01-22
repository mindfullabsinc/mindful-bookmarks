import { ImportPostProcessMode, ImportSource } from "@/core/constants/import";

jest.mock("@/scripts/import/importers", () => ({
  importChromeBookmarksAsSingleGroup: jest.fn(),
  importChromeBookmarksPreserveStructure: jest.fn(),
  importOpenTabsAsSingleGroup: jest.fn(),
  importOpenTabsPreserveStructure: jest.fn(),
}));

jest.mock("@/scripts/import/groupingLLMRemote", () => ({
  remoteGroupingLLM: {
    group: jest.fn(),
  },
}));

jest.mock("@/core/utils/ids", () => ({
  createUniqueID: jest.fn(),
}));

// IMPORTANT: import mocked modules *after* jest.mock declarations
import {
  importChromeBookmarksAsSingleGroup,
  importChromeBookmarksPreserveStructure,
  importOpenTabsAsSingleGroup,
  importOpenTabsPreserveStructure,
} from "@/scripts/import/importers";
import { remoteGroupingLLM } from "@/scripts/import/groupingLLMRemote";
import { createUniqueID } from "@/core/utils/ids";

type AnyGroup = {
  id?: string;
  groupName?: string;
  description?: string;
  bookmarks?: Array<{
    id?: string;
    name?: string;
    url: string;
    lastVisitedAt?: number;
  }>;
};

describe("commitManualImportIntoWorkspace", () => {
  const appendGroupsToWorkspace = jest.fn<Promise<void>, [string, any[]]>();
  const workspaceService = { appendGroupsToWorkspace };
  const onProgress = jest.fn<void, [string]>();

  // We require() the SUT after mocks are defined.
  // This avoids “mock not applied” issues in some Jest+TS/ESM setups.
  const getSut = () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("@/scripts/import/commitManualImportIntoWorkspace");
    return mod.commitManualImportIntoWorkspace as (args: any) => Promise<void>;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (createUniqueID as unknown as jest.Mock).mockReturnValue("uid-1");

    // Best-effort mock for randomUUID. Some environments make crypto non-writable,
    // so we’ll only spy if it exists; otherwise we won’t assert exact UUIDs anyway.
    if (globalThis.crypto && "randomUUID" in globalThis.crypto) {
      jest.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
        () => "00000000-0000-0000-0000-000000000000"
      );
    }
  });

  afterEach(() => {
    // Restore randomUUID spy if we created it
    const spy = (globalThis.crypto?.randomUUID as any)?.mockRestore;
    if (typeof spy === "function") {
      (globalThis.crypto.randomUUID as any).mockRestore();
    }
  });

  it("returns early (does not save) when nothing is selected", async () => {
    const commitManualImportIntoWorkspace = getSut();

    await commitManualImportIntoWorkspace({
      selection: {} as any,
      purposes: ["p1"] as any,
      workspaceId: "w1",
      purpose: "p1" as any,
      workspaceService,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith("Importing ...");
    expect(appendGroupsToWorkspace).not.toHaveBeenCalled();
    expect(remoteGroupingLLM.group).not.toHaveBeenCalled();
  });

  it("imports JSON and saves mapped categorized groups (PreserveStructure default)", async () => {
    const commitManualImportIntoWorkspace = getSut();

    const jsonGroups: AnyGroup[] = [
      {
        groupName: "Group A",
        description: "desc",
        bookmarks: [
          { url: "https://a.com", name: "A", lastVisitedAt: 123 },
          { url: "https://b.com" },
        ],
      },
    ];

    await commitManualImportIntoWorkspace({
      selection: { jsonData: JSON.stringify(jsonGroups) } as any,
      purposes: ["p1"] as any,
      workspaceId: "w1",
      purpose: "p1" as any,
      workspaceService,
      onProgress,
    });

    expect(onProgress).toHaveBeenNthCalledWith(1, "Importing ...");
    expect(onProgress).toHaveBeenNthCalledWith(2, "Saving ...");

    expect(appendGroupsToWorkspace).toHaveBeenCalledTimes(1);
    const [workspaceId, groups] = appendGroupsToWorkspace.mock.calls[0];

    expect(workspaceId).toBe("w1");
    expect(groups).toHaveLength(1);

    const g0 = groups[0];
    expect(g0).toEqual(
      expect.objectContaining({
        id: "uid-1",
        name: "Group A",
        purpose: "p1",
        description: "desc",
        items: expect.any(Array),
      })
    );

    expect(g0.items).toHaveLength(2);

    expect(g0.items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: "A",
        url: "https://a.com",
        source: ImportSource.Json,
        lastVisitedAt: 123,
      })
    );

    expect(g0.items[1]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: "https://b.com", // name falls back to url
        url: "https://b.com",
        source: ImportSource.Json,
        lastVisitedAt: undefined,
      })
    );

    expect(createUniqueID).toHaveBeenCalledTimes(1);
  });

  it("throws a friendly error for invalid JSON", async () => {
    const commitManualImportIntoWorkspace = getSut();

    await expect(
      commitManualImportIntoWorkspace({
        selection: { jsonData: "{not-valid-json" } as any,
        purposes: ["p1"] as any,
        workspaceId: "w1",
        purpose: "p1" as any,
        workspaceService,
      })
    ).rejects.toThrow("That JSON file doesn’t look valid. Please re-export and try again.");
  });

  it("uses the correct Chrome bookmarks importer based on mode", async () => {
    const commitManualImportIntoWorkspace = getSut();

    // PreserveStructure path
    (importChromeBookmarksPreserveStructure as unknown as jest.Mock).mockImplementation(
      async (collector: (groups: AnyGroup[]) => Promise<void>) => {
        await collector([
          { id: "g1", groupName: "Bookmarks", bookmarks: [{ id: "b1", url: "https://x.com" }] },
        ]);
      }
    );

    await commitManualImportIntoWorkspace({
      selection: {
        importBookmarks: true,
        importPostProcessMode: ImportPostProcessMode.PreserveStructure,
      } as any,
      purposes: ["p1"] as any,
      workspaceId: "w1",
      purpose: "p1" as any,
      workspaceService,
    });

    expect(importChromeBookmarksPreserveStructure).toHaveBeenCalledTimes(1);
    expect(importChromeBookmarksAsSingleGroup).not.toHaveBeenCalled();

    // Non-PreserveStructure path (anything else should go “single group”)
    jest.clearAllMocks();

    (importChromeBookmarksAsSingleGroup as unknown as jest.Mock).mockImplementation(
      async (collector: (groups: AnyGroup[]) => Promise<void>) => {
        await collector([{ id: "g2", groupName: "All Bookmarks", bookmarks: [{ url: "https://y.com" }] }]);
      }
    );

    await commitManualImportIntoWorkspace({
      selection: {
        importBookmarks: true,
        // Use a value that is *not* PreserveStructure and *not* SemanticGrouping
        // so it hits the “single group” branch no matter what your enum looks like.
        importPostProcessMode: "single" as any,
      } as any,
      purposes: ["p1"] as any,
      workspaceId: "w1",
      purpose: "p1" as any,
      workspaceService,
    });

    expect(importChromeBookmarksAsSingleGroup).toHaveBeenCalledTimes(1);
    expect(importChromeBookmarksPreserveStructure).not.toHaveBeenCalled();
  });

  it("imports tabs when tabScope is provided and uses the correct tab importer based on mode", async () => {
    const commitManualImportIntoWorkspace = getSut();

    (importOpenTabsPreserveStructure as unknown as jest.Mock).mockImplementation(
      async (collector: (groups: AnyGroup[]) => Promise<void>) => {
        await collector([{ id: "tg1", groupName: "Tabs", bookmarks: [{ url: "https://t.com" }] }]);
      }
    );

    await commitManualImportIntoWorkspace({
      selection: {
        tabScope: "CURRENT_WINDOW",
        importPostProcessMode: ImportPostProcessMode.PreserveStructure,
      } as any,
      purposes: ["p1"] as any,
      workspaceId: "w1",
      purpose: "p1" as any,
      workspaceService,
    });

    expect(importOpenTabsPreserveStructure).toHaveBeenCalledTimes(1);
    expect(importOpenTabsAsSingleGroup).not.toHaveBeenCalled();

    jest.clearAllMocks();

    (importOpenTabsAsSingleGroup as unknown as jest.Mock).mockImplementation(
      async (collector: (groups: AnyGroup[]) => Promise<void>) => {
        await collector([{ id: "tg2", groupName: "All Tabs", bookmarks: [{ url: "https://t2.com" }] }]);
      }
    );

    await commitManualImportIntoWorkspace({
      selection: {
        tabScope: "ALL_WINDOWS",
        importPostProcessMode: "single" as any,
      } as any,
      purposes: ["p1"] as any,
      workspaceId: "w1",
      purpose: "p1" as any,
      workspaceService,
    });

    expect(importOpenTabsAsSingleGroup).toHaveBeenCalledTimes(1);
    expect(importOpenTabsPreserveStructure).not.toHaveBeenCalled();
  });

  it("SemanticGrouping: requires purposes[], calls LLM, normalizes IDs/purpose, and saves regrouped result", async () => {
    const commitManualImportIntoWorkspace = getSut();

    const jsonGroups: AnyGroup[] = [
      {
        groupName: "Imported",
        bookmarks: [{ url: "https://a.com" }, { url: "https://b.com" }],
      },
    ];

    (remoteGroupingLLM.group as unknown as jest.Mock).mockResolvedValue({
      groups: [
        {
          name: "Regrouped",
          // missing id -> createUniqueID
          items: [
            { name: "A", url: "https://a.com", source: ImportSource.Json },
            { id: "it-2", name: "B", url: "https://b.com", source: ImportSource.Json },
          ],
        },
      ],
    });

    await commitManualImportIntoWorkspace({
      selection: {
        jsonData: JSON.stringify(jsonGroups),
        importPostProcessMode: ImportPostProcessMode.SemanticGrouping,
      } as any,
      purposes: ["p1", "p2"] as any,
      workspaceId: "w1",
      purpose: "p1" as any,
      workspaceService,
      onProgress,
    });

    expect(onProgress).toHaveBeenNthCalledWith(1, "Importing ...");
    expect(onProgress).toHaveBeenNthCalledWith(2, "Organizing with AI ...");
    expect(onProgress).toHaveBeenNthCalledWith(3, "Saving groups ...");

    expect(remoteGroupingLLM.group).toHaveBeenCalledTimes(1);
    const llmArg = (remoteGroupingLLM.group as unknown as jest.Mock).mock.calls[0][0];
    expect(llmArg.purposes).toEqual(["p1", "p2"]);
    expect(llmArg.items.map((it: any) => it.url)).toEqual(["https://a.com", "https://b.com"]);

    expect(appendGroupsToWorkspace).toHaveBeenCalledTimes(1);
    const [, savedGroups] = appendGroupsToWorkspace.mock.calls[0];

    expect(savedGroups).toHaveLength(1);
    const sg0 = savedGroups[0];

    expect(sg0).toEqual(
      expect.objectContaining({
        id: "uid-1",
        name: "Regrouped",
        purpose: "p1",
        items: expect.any(Array),
      })
    );

    expect(sg0.items).toHaveLength(2);

    // We don't assert exact uuid — just that it is a string and has the right url/name/source
    expect(sg0.items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: "A",
        source: ImportSource.Json,
        url: "https://a.com",
      })
    );

    expect(sg0.items[1]).toEqual(
      expect.objectContaining({
        id: "it-2",
        name: "B",
        source: ImportSource.Json,
        url: "https://b.com",
      })
    );
  });

  it("SemanticGrouping: throws if purposes[] missing/empty", async () => {
    const commitManualImportIntoWorkspace = getSut();

    await expect(
      commitManualImportIntoWorkspace({
        selection: {
          jsonData: JSON.stringify([{ groupName: "X", bookmarks: [{ url: "https://x.com" }] }]),
          importPostProcessMode: ImportPostProcessMode.SemanticGrouping,
        } as any,
        purposes: [] as any,
        workspaceId: "w1",
        purpose: "p1" as any,
        workspaceService,
      })
    ).rejects.toThrow("Missing purposes[] (client) — cannot run semantic grouping.");
  });
});