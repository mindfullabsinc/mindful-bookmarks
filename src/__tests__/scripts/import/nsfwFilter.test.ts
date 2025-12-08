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

  it("returns true when both url and name are empty (no signal)", async () => {
    const item: RawItem = makeItem({
      url: "",
      name: "",
    });

    const result = await basicNsfwFilter.isSafe(item);
    expect(result).toBe(true);
  });

  it("handles malformed URLs gracefully and still treats safe ones as safe", async () => {
    const item: RawItem = makeItem({
      url: "not-a-real-url",
      name: "Just a note",
    });

    const result = await basicNsfwFilter.isSafe(item);
    expect(result).toBe(true);
  });

  it("blocks items whose URL contains a blocked domain fragment (e.g. pornhub)", async () => {
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

  it("blocks domains with leetspeak that should match blocked fragments (e.g. pr0nhub)", async () => {
    const item: RawItem = makeItem({
      url: "https://pr0nhub.com/watch/abc",
      name: "Some video",
    });

    const result = await basicNsfwFilter.isSafe(item);
    expect(result).toBe(false);
  });

  it("blocks URLs on blocked TLDs such as .xxx", async () => {
    const item: RawItem = makeItem({
      url: "https://example.xxx/some-path",
      name: "Example XXX site",
    });

    const result = await basicNsfwFilter.isSafe(item);
    expect(result).toBe(false);
  });

  it("blocks leetspeak keywords in the title (e.g. pr0n)", async () => {
    const item: RawItem = makeItem({
      url: "https://example.com/some-article",
      name: "Best pr0n collection",
    });

    const result = await basicNsfwFilter.isSafe(item);
    expect(result).toBe(false);
  });
});