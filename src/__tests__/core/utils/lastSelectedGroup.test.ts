/**
 * @jest-environment jsdom
 */

import {
  SELECT_NEW,
  lastGroupKey,
  writeLastSelectedGroup,
  readLastSelectedGroup,
  broadcastLastSelectedGroup,
} from "@/core/utils/lastSelectedGroup";

describe("lastSelectedGroup utils", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  /* ---------------- lastGroupKey ---------------- */

  describe("lastGroupKey", () => {
    it("generates a fully-scoped key when all params are provided", () => {
      const key = lastGroupKey("user123", "remote", "ws-1");
      expect(key).toBe("mindful:lastSelectedGroup:user123:remote:ws-1");
    });

    it("falls back to defaults when params are missing", () => {
      const key = lastGroupKey();
      expect(key).toBe("mindful:lastSelectedGroup:local:local:default");
    });

    it("handles null values correctly", () => {
      const key = lastGroupKey(null, null, null);
      expect(key).toBe("mindful:lastSelectedGroup:local:local:default");
    });
  });

  /* ---------------- writeLastSelectedGroup ---------------- */

  describe("writeLastSelectedGroup", () => {
    it("writes the group id to localStorage", () => {
      const key = "test-key";
      writeLastSelectedGroup(key, "group-1");

      expect(localStorage.getItem(key)).toBe("group-1");
    });

    it("writes empty string when groupId is falsy", () => {
      const key = "test-key";
      writeLastSelectedGroup(key, "");

      expect(localStorage.getItem(key)).toBe("");
    });

    it("fails silently if localStorage throws", () => {
      const spy = jest
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("quota exceeded");
        });

      expect(() => {
        writeLastSelectedGroup("key", "group");
      }).not.toThrow();

      spy.mockRestore();
    });
  });

  /* ---------------- readLastSelectedGroup ---------------- */

  describe("readLastSelectedGroup", () => {
    it("reads an existing value from localStorage", () => {
      localStorage.setItem("key", "group-1");

      expect(readLastSelectedGroup("key")).toBe("group-1");
    });

    it("returns empty string when key does not exist", () => {
      expect(readLastSelectedGroup("missing-key")).toBe("");
    });

    it("returns empty string if localStorage throws", () => {
      const spy = jest
        .spyOn(Storage.prototype, "getItem")
        .mockImplementation(() => {
          throw new Error("blocked");
        });

      expect(readLastSelectedGroup("key")).toBe("");

      spy.mockRestore();
    });
  });

  /* ---------------- broadcastLastSelectedGroup ---------------- */

  describe("broadcastLastSelectedGroup", () => {
    it("broadcasts via BroadcastChannel", () => {
      const postMessage = jest.fn();
      const close = jest.fn();

      (global as any).BroadcastChannel = jest.fn(() => ({
        postMessage,
        close,
      }));

      broadcastLastSelectedGroup({
        workspaceId: "ws-1",
        groupId: "group-1",
      });

      expect(postMessage).toHaveBeenCalledWith({
        type: "MINDFUL_LAST_GROUP_CHANGED",
        workspaceId: "ws-1",
        groupId: "group-1",
      });

      expect(close).toHaveBeenCalled();
    });

    it("sends message via chrome.runtime when available", () => {
      (global as any).chrome = {
        runtime: {
          id: "extension-id",
          sendMessage: jest.fn(),
        },
      };

      broadcastLastSelectedGroup({
        workspaceId: "ws-1",
        groupName: "Inbox",
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: "MINDFUL_LAST_GROUP_CHANGED",
        workspaceId: "ws-1",
        groupName: "Inbox",
      });
    });

    it("fails silently when BroadcastChannel is unavailable", () => {
      delete (global as any).BroadcastChannel;

      expect(() =>
        broadcastLastSelectedGroup({ workspaceId: "ws-1" })
      ).not.toThrow();
    });

    it("fails silently when chrome.runtime is unavailable", () => {
      delete (global as any).chrome;

      expect(() =>
        broadcastLastSelectedGroup({ workspaceId: "ws-1" })
      ).not.toThrow();
    });
  });
});