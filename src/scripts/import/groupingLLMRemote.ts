import type {
  GroupingLLM,
  GroupingInput,
  GroupingLLMResponse,
  CategorizedGroup,
} from "@/core/types/llmGrouping";
import type { PurposeId } from "@/core/types/purposeId";


//const API_BASE_URL =
  //process.env.MINDFUL_API_BASE_URL ?? "https://api.mindfulbookmarks.com";
// TODO: Change this after deploying new groupBookmarks API
const API_BASE_URL = "https://eidotpc2fc.execute-api.us-west-1.amazonaws.com";
console.log("API_BASE_URL: ", API_BASE_URL);

const MIN_ITEMS_FOR_LLM = 6; // below this, just make one group locally
const MAX_ITEMS = 100;

export const remoteGroupingLLM: GroupingLLM = {
  async group(input: GroupingInput): Promise<GroupingLLMResponse> {
    // No items? Nothing to group.
    if (!input.items.length) {
      return { groups: [] };
    }

    // Choose a default purpose for fallback / tiny imports
    const defaultPurpose: PurposeId = input.purposes[0] ?? "personal";

    // Skip LLM for tiny imports to save costs 
    if (input.items.length < MIN_ITEMS_FOR_LLM) {
      const fallbackGroup: CategorizedGroup = {
        id: "imported",
        name: "Imported",
        description: "All imported items",
        purpose: defaultPurpose,
        items: input.items,
      };

      return { groups: [fallbackGroup] };
    }

    // Cap the number of items sent to the LLM to control cost
    const trimmedInput: GroupingInput = {
      ...input,
      items: input.items.slice(0, MAX_ITEMS),
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

      const fallbackGroup: CategorizedGroup = {
        id: "imported",
        name: "Imported",
        description: "All imported items",
        purpose: defaultPurpose,
        items: input.items,
      };

      return { groups: [fallbackGroup] };
    }

    const data = (await res.json()) as GroupingLLMResponse;
    return data;
  },
};
