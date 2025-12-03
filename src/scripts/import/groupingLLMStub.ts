// src/scripts/import/groupingLLMStub.ts
import type {
  GroupingLLM,
  RawItem,
  CategorizedGroup,
} from "@/scripts/import/smartImport";
import type { PurposeId } from "@/core/types/purposeId";

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
  async groupItemsIntoCategories(
    items: RawItem[],
    purposes: PurposeId[]
  ): Promise<CategorizedGroup[]> {
    if (!items.length || !purposes.length) return [];

    // Single purpose → one group
    if (purposes.length === 1) {
      const purpose = purposes[0];
      return [
        {
          id: `grp_${Date.now()}`,
          name: "Imported",
          description: "All imported links",
          purpose,
          items,
        },
      ];
    }

    // Multiple purposes → one group per purpose (same items)
    const now = Date.now();
    return purposes.map((purpose, idx) => ({
      id: `grp_${now}_${idx}`,
      name: `Imported – ${capitalize(purpose)}`,
      description: "All imported links",
      purpose,
      items,
    }));
  },
};
