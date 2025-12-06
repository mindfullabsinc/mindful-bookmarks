/* -------------------- Imports -------------------- */
/* Types */
import type {
  GroupingLLM,
  GroupingInput,
  GroupingLLMResponse,
  CategorizedGroup,
} from "@shared/types/llmGrouping";
import type { PurposeId } from "@shared/types/purposeId";
/* ---------------------------------------------------------- */

/**
 * Simple helper to return a capitalized version of a purpose id.
 *
 * @param purpose Purpose identifier to convert.
 * @returns Capitalized label.
 */
function capitalize(purpose: PurposeId): string {
  if (purpose === "work") return "Work";
  if (purpose === "school") return "School";
  if (purpose === "personal") return "Personal";
  return purpose;
}

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

    // No items or no purposes → nothing to group
    if (!items.length || !purposes.length) {
      return { groups: [] };
    }

    // Single purpose → one group
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

    // Multiple purposes → one group per purpose (same items in each)
    const now = Date.now();
    const groups: CategorizedGroup[] = purposes.map((purpose, idx) => ({
      id: `grp_${now}_${idx}`,
      name: `Imported – ${capitalize(purpose)}`,
      description: "All imported links",
      purpose,
      items,
    }));

    return { groups };
  },
};
