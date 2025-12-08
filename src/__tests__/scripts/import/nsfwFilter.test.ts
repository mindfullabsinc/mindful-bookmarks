import { basicNsfwFilter } from "@/scripts/import/nsfwFilter";
import type { RawItem } from "@shared/types/llmGrouping";

describe("basicNsfwFilter", () => {
  const makeItem = (overrides: Partial<RawItem>): RawItem => ({
    id: "1",
    name: "Some site",
    url: "https://example.com",
    source: "bookmarks",
    ...overrides,
  });

  it("returns true for a clearly safe item", async () => {
    const item: RawItem = makeItem({
      name: "TypeScript docs",
      url: "https://www.typescriptlang.org/",
    });

    const result = await basicNsfwFilter.isSafe(item);
    expect(result).toBe(true);
  });

  it("blocks items whose URL contains a blocked domain", async () => {
    const item: RawItem = makeItem({
      url: "https://www.pornhub.com/video/12345",
      name: "Some video",
    });

    const result = await basicNsfwFilter.isSafe(item);
    expect(result).toBe(false);
  });

  it("blocks items whose URL contains a blocked keyword", async () => {
    const item: RawItem = makeItem({
      url: "https://example.com/nsfw-gallery",
      name: "Totally normal",
    });

    const result = await basicNsfwFilter.isSafe(item);
    expect(result).toBe(false);
  });

  it("blocks items whose name contains a blocked keyword", async () => {
    const item: RawItem = makeItem({
      url: "https://example.com/something-innocent",
      name: "My secret XXX collection",
    });

    const result = await basicNsfwFilter.isSafe(item);
    expect(result).toBe(false);
  });

  it("treats matching as case-insensitive for both URL and name", async () => {
    const urlItem: RawItem = makeItem({
      url: "https://OnlyFans.com/creator",
      name: "Some creator",
    });

    const nameItem: RawItem = makeItem({
      url: "https://example.com/profile",
      name: "NSFW Profile",
    });

    await expect(basicNsfwFilter.isSafe(urlItem)).resolves.toBe(false);
    await expect(basicNsfwFilter.isSafe(nameItem)).resolves.toBe(false);
  });
});