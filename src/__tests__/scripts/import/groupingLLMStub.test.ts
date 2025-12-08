// src/__tests__/scripts/import/stubGroupingLLM.test.ts

import { stubGroupingLLM } from "@/scripts/import/groupingLLMStub";
import type { GroupingInput } from "@shared/types/llmGrouping";
import type { PurposeId } from "@shared/types/purposeId";

const makeItem = (id: string, overrides: Partial<GroupingInput["items"][number]> = {}) => ({
  id,
  name: `Item ${id}`,
  url: `https://example.com/${id}`,
  source: "bookmarks" as const,
  lastVisitedAt: 1_700_000_000_000,
  ...overrides,
});

describe("stubGroupingLLM", () => {
  it("returns no groups when there are no items", async () => {
    const input: GroupingInput = {
      items: [],
      purposes: ["work" as PurposeId],
    };

    const result = await stubGroupingLLM.group(input);

    expect(result).toEqual({ groups: [] });
  });

  it("returns no groups when there are no purposes", async () => {
    const input: GroupingInput = {
      items: [makeItem("1")],
      purposes: [],
    };

    const result = await stubGroupingLLM.group(input);

    expect(result).toEqual({ groups: [] });
  });

  it('creates a single "Imported" group when there is exactly one purpose', async () => {
    const items = [makeItem("1"), makeItem("2")];
    const input: GroupingInput = {
      items,
      purposes: ["work" as PurposeId],
    };

    const result = await stubGroupingLLM.group(input);

    expect(result.groups).toHaveLength(1);
    const group = result.groups[0];

    // id is based on Date.now; just assert it follows the expected pattern
    expect(group.id).toMatch(/^grp_\d+$/);
    expect(group.name).toBe("Imported");
    expect(group.description).toBe("All imported links");
    expect(group.purpose).toBe("work");
    // all items should be included as-is
    expect(group.items).toBe(items);
  });

  it("creates one group per purpose and duplicates all items when there are multiple purposes", async () => {
    const items = [makeItem("1"), makeItem("2")];
    const purposes: PurposeId[] = [
      "work",
      "school",
      "personal",
      "side-project" as PurposeId, // example of a non-special purpose id
    ];

    const input: GroupingInput = {
      items,
      purposes,
    };

    const result = await stubGroupingLLM.group(input);

    expect(result.groups).toHaveLength(purposes.length);

    result.groups.forEach((group, idx) => {
      // ids use "grp_<timestamp>_<idx>"
      expect(group.id).toMatch(/^grp_\d+_\d+$/);
      expect(group.description).toBe("All imported links");
      expect(group.purpose).toBe(purposes[idx]);
      // same items array for each group
      expect(group.items).toBe(items);
    });

    // Name capitalization behavior:
    expect(result.groups[0].name).toBe("Imported – Work");
    expect(result.groups[1].name).toBe("Imported – School");
    expect(result.groups[2].name).toBe("Imported – Personal");
    // Non-special purposes should be left as-is
    expect(result.groups[3].name).toBe("Imported – side-project");
  });
});
