import {
  normalizeWsId,
  WS_PREFIX,
  fpGroupsIndexKey,
  fpGroupsBlobKey,
} from "@/scripts/caching/cacheKeys"; 

describe("first paint keys utilities", () => {
  describe("normalizeWsId", () => {
    it("returns the same string when already normalized", () => {
      expect(normalizeWsId("my-ws")).toBe("my-ws");
    });

    it("trims leading and trailing whitespace", () => {
      expect(normalizeWsId("   workspace-123   ")).toBe("workspace-123");
    });

    it("handles empty string", () => {
      expect(normalizeWsId("")).toBe("");
    });

    it("handles nullish values safely at runtime", () => {
      // cast to any to avoid TS complaining about non-string
      expect(normalizeWsId(undefined as any)).toBe("");
      expect(normalizeWsId(null as any)).toBe("");
    });
  });

  describe("WS_PREFIX", () => {
    it("prefixes with WS_ and normalizes whitespace", () => {
      expect(WS_PREFIX("abc")).toBe("WS_abc");
      expect(WS_PREFIX("   abc   ")).toBe("WS_abc");
    });

    it("handles empty ids", () => {
      expect(WS_PREFIX("")).toBe("WS_");
    });
  });

  describe("fpGroupsIndexKey", () => {
    it("builds the correct first-paint groups index key", () => {
      expect(fpGroupsIndexKey("my-ws")).toBe("WS_my-ws::groups_index_v1");
    });

    it("normalizes the workspace id before building the key", () => {
      expect(fpGroupsIndexKey("   my-ws   ")).toBe("WS_my-ws::groups_index_v1");
    });
  });

  describe("fpGroupsBlobKey", () => {
    it("builds the correct first-paint groups blob key", () => {
      expect(fpGroupsBlobKey("my-ws")).toBe("WS_my-ws::groups_blob_v1");
    });

    it("normalizes the workspace id before building the key", () => {
      expect(fpGroupsBlobKey("   my-ws   ")).toBe("WS_my-ws::groups_blob_v1");
    });
  });

  describe("consistency between index and blob keys", () => {
    it("uses the same normalized ws prefix for both keys", () => {
      const wsid = "   ws-123   ";
      const indexKey = fpGroupsIndexKey(wsid);
      const blobKey = fpGroupsBlobKey(wsid);

      expect(indexKey.startsWith("WS_ws-123::")).toBe(true);
      expect(blobKey.startsWith("WS_ws-123::")).toBe(true);
    });
  });
});