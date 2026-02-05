import React from "react";
import { renderHook, act } from "@testing-library/react";
import { useCopyTo, ensureImportedGroup } from "@/hooks/useCopyTo";
import type { WorkspaceIdType } from "@/core/constants/workspaces";

// Mock storageAdapters so we can control getAdapter
jest.mock("@/scripts/storageAdapters", () => ({
  getAdapter: jest.fn(),
}));

import { getAdapter } from "@/scripts/storageAdapters";

describe("useCopyTo hook", () => {
  const workspaceId = "ws-1" as WorkspaceIdType;

  const setup = () =>
    renderHook(() =>
      useCopyTo({
        currentWorkspaceId: workspaceId,
        toast: jest.fn(),
      })
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("starts with modal closed", () => {
    const { result } = setup();

    expect(result.current.open).toBe(false);
    expect(typeof result.current.setOpen).toBe("function");
    expect(typeof result.current.beginCopyGroup).toBe("function");
    expect(typeof result.current.beginCopyBookmarks).toBe("function");
  });

  it("opens modal when beginCopyGroup is called", () => {
    const { result } = setup();

    act(() => {
      result.current.beginCopyGroup("group-123");
    });

    expect(result.current.open).toBe(true);
  });

  it("opens modal when beginCopyBookmarks is called", () => {
    const { result } = setup();

    act(() => {
      result.current.beginCopyBookmarks(["b1", "b2"]);
    });

    expect(result.current.open).toBe(true);
  });

  it("allows manually closing the modal via setOpen", () => {
    const { result } = setup();

    act(() => {
      result.current.setOpen(true);
    });
    expect(result.current.open).toBe(true);

    act(() => {
      result.current.setOpen(false);
    });
    expect(result.current.open).toBe(false);
  });
});

describe("ensureImportedGroup", () => {
  const workspaceId = "ws-1" as WorkspaceIdType;
  const storageKey = "WS_ws-1__groups";

  const getAdapterMock = getAdapter as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws when adapter is missing or lacks group read/write methods", async () => {
    expect.assertions(1);
    // Case 1: null adapter
    getAdapterMock.mockReturnValueOnce(null);

    await expect(ensureImportedGroup(workspaceId, storageKey)).rejects.toThrow(
      "Local adapter unavailable or missing read/write methods"
    );
  });

  it('returns existing "Imported" group id without writing groups', async () => {
    expect.assertions(3);

    const groups = [
      {
        id: "g-1",
        groupName: "Imported",
        bookmarks: [],
      },
      {
        id: "g-2",
        groupName: "Other",
        bookmarks: [],
      },
    ];

    const readAllGroups = jest.fn().mockResolvedValue(groups);
    const writeAllGroups = jest.fn().mockResolvedValue(undefined);

    // Adapter shape only needs readAllGroups / writeAllGroups functions
    getAdapterMock.mockReturnValue({
      readAllGroups,
      writeAllGroups,
    });

    const id = await ensureImportedGroup(workspaceId, storageKey);

    expect(id).toBe("g-1");
    expect(readAllGroups).toHaveBeenCalledWith(storageKey);
    // Should NOT write if the group already exists
    expect(writeAllGroups).not.toHaveBeenCalled();
  });

  it('creates and returns a new "Imported" group when none exists', async () => {
    expect.assertions(6);

    const groups: any[] = [
      { id: "g-1", groupName: "Work", bookmarks: [] },
      { id: "g-2", groupName: "Personal", bookmarks: [] },
    ];

    const readAllGroups = jest.fn().mockResolvedValue(groups);
    const writeAllGroups = jest
      .fn<Promise<void>, any[]>()
      .mockResolvedValue(undefined);

    getAdapterMock.mockReturnValue({
      readAllGroups,
      writeAllGroups,
    });

    const id = await ensureImportedGroup(workspaceId, storageKey);

    expect(readAllGroups).toHaveBeenCalledWith(storageKey);
    expect(writeAllGroups).toHaveBeenCalledTimes(1);
    expect(writeAllGroups.mock.calls[0][0]).toBe(workspaceId);
    expect(writeAllGroups.mock.calls[0][1]).toBe(storageKey);

    const updatedGroups = writeAllGroups.mock.calls[0][2] as any[];
    const importedGroup = updatedGroups.find(
      (g) => g.groupName === "Imported"
    );

    // Check structure and consistency rather than an exact UUID
    expect(importedGroup).toMatchObject({
      groupName: "Imported",
      bookmarks: [],
    });
    expect(importedGroup.id).toBe(id);
  });
});
