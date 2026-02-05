/* -------------------- Imports -------------------- */
/* Utils */
import { capitalize } from "@/core/utils/stringUtils";

/* Types */
import type {
  GroupingLLM,
  GroupingInput,
  GroupingLLMResponse,
  CategorizedGroup,
} from "@shared/types/llmGrouping";
/* ---------------------------------------------------------- */

/**
 * Very simple stub:
 * - If one purpose: put ALL items into a single "Imported" group for that purpose
 * - If multiple purposes: duplicate ALL items into one group per purpose
 */
export const stubGroupingLLM: GroupingLLM = {
  /**
   * Produce deterministic fallback groupings when the remote LLM is unavailable.
   *
   * @param input Normalized grouping payload containing items and purposes.
   * @returns Stubbed grouping response with either one or many groups.
   */
  async group(input: GroupingInput): Promise<GroupingLLMResponse> {
    const { items, purposes } = input;

    if (!items.length || !purposes.length) {
      return { groups: [] };
    }

    if (purposes.length === 1) {
      const purpose = purposes[0];
      const groups: CategorizedGroup[] = [
        {
          id: `grp_${Date.now()}`,
          name: "Imported",
          description: "All imported links",
          purpose,
          items,
        },
      ];
      return { groups };
    }

    const now = Date.now();

    const specialPurposeNames = new Set(["work", "school", "personal"]);
    const formatPurposeForName = (purpose: string) =>
      specialPurposeNames.has(purpose.toLowerCase()) ? capitalize(purpose) : purpose;

    const groups: CategorizedGroup[] = purposes.map((purpose, idx) => ({
      id: `grp_${now}_${idx}`,
      name: `Imported – ${formatPurposeForName(purpose)}`,
      description: "All imported links",
      purpose,
      items,
    }));

    return { groups };
  }, 
};
