// scripts/import/groupingLLMRemote.ts
import type {
  GroupingLLM,
  GroupingInput,
  GroupingLLMResponse,
} from "@/core/types/llmGrouping";

const API_BASE_URL =
  process.env.MINDFUL_API_BASE_URL ?? "https://api.mindfulbookmarks.com";

const MIN_ITEMS_FOR_LLM = 6; // below this, just make one group locally

export const remoteGroupingLLM: GroupingLLM = {
  async group(input: GroupingInput): Promise<GroupingLLMResponse> {
    if (!input.bookmarks.length) {
      return { groups: [] };
    }

    // Skip LLM for tiny imports to save money
    if (input.bookmarks.length < MIN_ITEMS_FOR_LLM) {
      return {
        groups: [
          {
            id: "imported",
            name: "Imported",
            description: "All imported bookmarks",
            bookmarkIds: input.bookmarks.map((b) => b.id),
          },
        ],
      };
    }

    const MAX_ITEMS = 100;
    const trimmedInput: GroupingInput = {
      ...input,
      bookmarks: input.bookmarks.slice(0, MAX_ITEMS),
    };

    const res = await fetch(`${API_BASE_URL}/groupBookmarks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(trimmedInput),
    });

    if (!res.ok) {
      console.error("remoteGroupingLLM error", res.status, await res.text());
      return {
        groups: [
          {
            id: "imported",
            name: "Imported",
            description: "All imported bookmarks",
            bookmarkIds: input.bookmarks.map((b) => b.id),
          },
        ],
      };
    }

    const data = (await res.json()) as GroupingLLMResponse;
    return data;
  },
};
