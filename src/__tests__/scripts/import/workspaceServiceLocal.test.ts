/* Scripts */
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";

/* Constants */
import { PurposeId } from "@shared/constants/purposeId";
import { ImportSource } from "@/core/constants/import";

/* Types */
import type { CategorizedGroup } from "@shared/types/llmGrouping";
import type { PurposeIdType } from "@shared/types/purposeId";

/* ---- Mocks ---- */
const mockCreateLocalWorkspace = jest.fn();

jest.mock("@/scripts/workspaces/registry", () => ({
  createLocalWorkspace: (...args: unknown[]) =>
    mockCreateLocalWorkspace(...(args as [string])),
}));

const mockGetGroupsStorageKey = jest.fn();
jest.mock("@/core/utils/storageKeys", () => ({
  getGroupsStorageKey: (...args: unknown[]) =>
    mockGetGroupsStorageKey(...(args as [string])),
}));

const mockWsKey = jest.fn();
jest.mock("@/core/constants/workspaces", () => ({
  wsKey: (...args: unknown[]) => mockWsKey(...(args as [string, string])),
}));

const mockWriteAllGroups = jest.fn();
const mockPersistCachesIfNonEmpty = jest.fn();
jest.mock("@/scripts/storageAdapters/local", () => ({
  LocalAdapter: {
    writeAllGroups: (...args: unknown[]) =>
      mockWriteAllGroups(...(args as [string, string, unknown[]])),
    persistCachesIfNonEmpty: (...args: unknown[]) =>
      mockPersistCachesIfNonEmpty(...(args as [string, unknown[]])),
  },
}));

describe("createWorkspaceServiceLocal", () => {
  const fixedNow = 1_700_000_000_000;

  beforeAll(() => {
    jest.spyOn(Date, "now").mockReturnValue(fixedNow);
  });

  afterAll(() => {
    (Date.now as jest.Mock).mockRestore?.();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createWorkspaceForPurpose", () => {
    it.each<
      [PurposeIdType, string]
    >([
      [PurposeId.Work, "Work"],
      [PurposeId.School, "School"],
      [PurposeId.Personal, "Personal"],
    ])(
      "creates a Local workspace with a friendly name for purpose '%s'",
      async (purpose, expectedName) => {
        mockCreateLocalWorkspace.mockResolvedValueOnce({
          id: "mock-ws-id",
          name: expectedName,
        });

        const service = createWorkspaceServiceLocal("user-123");

        const result = await service.createWorkspaceForPurpose(purpose);

        expect(mockCreateLocalWorkspace).toHaveBeenCalledTimes(1);
        expect(mockCreateLocalWorkspace).toHaveBeenCalledWith(expectedName);

        expect(result).toEqual({
          id: "mock-ws-id",
          purpose,
        });
      }
    );
  });

  describe("saveGroupsToWorkspace", () => {
    it("maps CategorizedGroup items to BookmarkGroupType and writes via LocalAdapter", async () => {
      const userId = "user-abc";
      const workspaceId = "ws-abc";

      const groups: CategorizedGroup[] = [
        {
          id: "group-1",
          name: "Reading list",
          purpose: PurposeId.Work,
          description: "Some description",
          items: [
            {
              id: "item-1",
              name: "Example site",
              url: "https://example.com",
              source: ImportSource.Bookmarks,
              lastVisitedAt: 1234567890,
            },
            {
              id: "item-2",
              // No name: should fall back to url
              name: "",
              url: "https://no-name.com",
              source: ImportSource.History,
              // No lastVisitedAt: should fall back to Date.now()
            },
          ],
        },
      ];

      mockGetGroupsStorageKey.mockReturnValueOnce("groups-key:user-abc");
      mockWsKey.mockImplementation(
        (wsId: string, key: string) => `ws:${wsId}:${key}`
      );
      mockWriteAllGroups.mockResolvedValue(undefined);
      mockPersistCachesIfNonEmpty.mockResolvedValue(undefined);

      const service = createWorkspaceServiceLocal(userId);

      await service.saveGroupsToWorkspace(workspaceId, groups);

      // Verify key-building helpers
      expect(mockGetGroupsStorageKey).toHaveBeenCalledWith(userId);
      expect(mockWsKey).toHaveBeenCalledWith(
        workspaceId,
        "groups-key:user-abc"
      );

      const expectedBookmarkGroups = [
        {
          id: "group-1",
          groupName: "Reading list",
          bookmarks: [
            {
              id: "item-1",
              name: "Example site",
              url: "https://example.com",
              createdAt: 1234567890,
            },
            {
              id: "item-2",
              name: "https://no-name.com",
              url: "https://no-name.com",
              createdAt: fixedNow,
            },
          ],
        },
      ];

      expect(mockWriteAllGroups).toHaveBeenCalledTimes(1);
      expect(mockWriteAllGroups).toHaveBeenCalledWith(
        workspaceId,
        "ws:ws-abc:groups-key:user-abc",
        expectedBookmarkGroups
      );

      expect(mockPersistCachesIfNonEmpty).toHaveBeenCalledTimes(1);
      expect(mockPersistCachesIfNonEmpty).toHaveBeenCalledWith(
        workspaceId,
        expectedBookmarkGroups
      );
    });

    it("early-returns and does not touch LocalAdapter when groups is empty", async () => {
      const service = createWorkspaceServiceLocal("user-empty");

      await service.saveGroupsToWorkspace("ws-empty", []);

      expect(mockGetGroupsStorageKey).not.toHaveBeenCalled();
      expect(mockWsKey).not.toHaveBeenCalled();
      expect(mockWriteAllGroups).not.toHaveBeenCalled();
      expect(mockPersistCachesIfNonEmpty).not.toHaveBeenCalled();
    });
  });
});
