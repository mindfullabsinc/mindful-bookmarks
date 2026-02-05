import { runSmartImport } from "@/scripts/import/smartImport";

/* Constants */
import { PurposeId } from "@shared/constants/purposeId";
import { ImportSource } from "@/core/constants/import";

/* Types */
import type {
  SmartImportOptions,
  BrowserSourceService,
  NsfwFilter,
} from "@/scripts/import/smartImport";
import type {
  GroupingLLM,
  RawItem,
  CategorizedGroup,
  GroupingInput,
} from "@shared/types/llmGrouping";
import type { PurposeIdType } from "@shared/types/purposeId";
import type { WorkspaceService, WorkspaceRef } from "@/core/types/workspaces";


describe("runSmartImport", () => {
  const purposePersonal = PurposeId.Personal as PurposeIdType;
  const purposeWork = PurposeId.Work as PurposeIdType;

  const createDefaultRawItems = (): { bookmarks: RawItem[]; tabs: RawItem[] } => {
    const bookmarks: RawItem[] = [
      {
        id: "b1",
        name: "Example",
        url: "https://example.com",
        source: ImportSource.Bookmarks,
        lastVisitedAt: 1000,
      },
      {
        id: "b2",
        name: "Duplicate A",
        url: "https://duplicate.com",
        source: ImportSource.Bookmarks,
        lastVisitedAt: 2000,
      },
    ];

    // This one shares a URL with b2 to test de-duplication
    const tabs: RawItem[] = [
      {
        id: "t1",
        name: "Duplicate B",
        url: "https://duplicate.com",
        source: ImportSource.Tabs,
        lastVisitedAt: 3000,
      },
    ];

    return { bookmarks, tabs };
  };

  const createMocks = () => {
    const { bookmarks, tabs } = createDefaultRawItems();

    // Workspace service mock
    const createWorkspaceForPurpose = jest.fn(
      async (purpose: PurposeIdType): Promise<WorkspaceRef> =>
        ({ id: `ws-${purpose}` } as unknown as WorkspaceRef)
    );

    const saveGroupsToWorkspace = jest.fn().mockResolvedValue(undefined);

    const workspaceService = {
      createWorkspaceForPurpose,
      saveGroupsToWorkspace,
    } as unknown as WorkspaceService;

    // Browser source service mock
    const browserSourceService: BrowserSourceService = {
      collectBookmarks: jest.fn().mockResolvedValue(bookmarks),
      collectTabs: jest.fn().mockResolvedValue(tabs),
      collectHistory: jest.fn().mockResolvedValue([]),
    };

    // NSFW filter mock – mark example.com safe, duplicate.com unsafe
    const nsfwFilter: NsfwFilter = {
      isSafe: jest
        .fn()
        .mockImplementation(async (item: RawItem) =>
          item.url === "https://example.com"
        ),
    };

    // LLM mock – will receive only safe items
    const groups: CategorizedGroup[] = [
      {
        id: "g1",
        name: "Example Group",
        purpose: purposePersonal,
        description: "Only safe example.com",
        items: [bookmarks[0]],
      },
    ];

    const llm: GroupingLLM = {
      group: jest.fn().mockResolvedValue({ groups }),
    };

    const onProgress = jest.fn();

    const baseOptions: SmartImportOptions = {
      purposes: [purposePersonal],
      workspaceService,
      browserSourceService,
      nsfwFilter,
      llm,
      onProgress,
    };

    return {
      baseOptions,
      bookmarks,
      tabs,
      workspaceService,
      browserSourceService,
      nsfwFilter,
      llm,
      onProgress,
      groups,
    };
  };

  it("returns early and emits a done message when no purposes are provided", async () => {
    const onProgress = jest.fn();

    const options: SmartImportOptions = {
      purposes: [],
      workspaceService: {} as unknown as WorkspaceService,
      browserSourceService: {
        collectBookmarks: jest.fn(),
        collectTabs: jest.fn(),
        collectHistory: jest.fn(),
      } as unknown as BrowserSourceService,
      nsfwFilter: { isSafe: jest.fn() } as unknown as NsfwFilter,
      llm: { group: jest.fn() } as unknown as GroupingLLM,
      onProgress,
    };

    const result = await runSmartImport(options);

    expect(result.primaryWorkspaceId).toBeNull();

    // Should emit exactly one progress update for the early return
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      phase: "done",
      message: "No purposes selected – skipping Smart Import.",
    });
  });

  it("runs the full pipeline and returns the primary workspace id", async () => {
    const {
      baseOptions,
      workspaceService,
      browserSourceService,
      nsfwFilter,
      llm,
      onProgress,
      groups,
    } = createMocks();

    const result = await runSmartImport(baseOptions);

    // Primary workspace id should be from the first created workspace
    expect(result.primaryWorkspaceId).toBe(`ws-${purposePersonal}`);

    // Workspaces created per purpose
    expect(workspaceService.createWorkspaceForPurpose).toHaveBeenCalledTimes(1);
    expect(workspaceService.createWorkspaceForPurpose).toHaveBeenCalledWith(
      purposePersonal
    );

    // Browser sources collected
    expect(browserSourceService.collectBookmarks).toHaveBeenCalledTimes(1);
    expect(browserSourceService.collectTabs).toHaveBeenCalledTimes(1);

    // NSFW filter should be called once per unique URL
    expect(nsfwFilter.isSafe).toHaveBeenCalledTimes(2); // example.com + duplicate.com

    // LLM should only receive safe items (example.com)
    expect(llm.group).toHaveBeenCalledTimes(1);
    const llmArg: GroupingInput = (llm.group as jest.Mock).mock.calls[0][0];
    expect(llmArg.purposes).toEqual([purposePersonal]);
    expect(llmArg.items).toHaveLength(1);
    expect(llmArg.items[0].url).toBe("https://example.com");

    // Persisting: should save groups to the correct workspace
    expect(workspaceService.saveGroupsToWorkspace).toHaveBeenCalledTimes(1);
    expect(workspaceService.saveGroupsToWorkspace).toHaveBeenCalledWith(
      `ws-${purposePersonal}`,
      groups
    );

    // Progress phases – we don't assert exact count, but we do expect key phases
    const phases = onProgress.mock.calls.map((call) => call[0].phase);

    expect(phases).toContain("initializing");
    expect(phases).toContain("collecting");
    expect(phases).toContain("filtering");
    expect(phases).toContain("categorizing");
    expect(phases).toContain("persisting");
    expect(phases).toContain("done");

    // Final progress event should be the "workspace is ready" message
    const lastProgress = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
    expect(lastProgress).toEqual({
      phase: "done",
      message: "Your workspace is ready.",
    });
  });

  it("creates a primary workspace from the first purpose when multiple purposes are given", async () => {
    const {
      baseOptions,
      workspaceService,
    } = createMocks();

    const optionsWithMultiplePurposes: SmartImportOptions = {
      ...baseOptions,
      purposes: [purposePersonal, purposeWork],
    };

    const result = await runSmartImport(optionsWithMultiplePurposes);

    // Primary workspace should match the first purpose in the list
    expect(result.primaryWorkspaceId).toBe(`ws-${purposePersonal}`);

    // Workspaces created for each purpose
    expect(workspaceService.createWorkspaceForPurpose).toHaveBeenCalledTimes(2);
    expect(workspaceService.createWorkspaceForPurpose).toHaveBeenNthCalledWith(
      1,
      purposePersonal
    );
    expect(workspaceService.createWorkspaceForPurpose).toHaveBeenNthCalledWith(
      2,
      purposeWork
    );
  });
});
