import {
  GroupingLLM,
  RawItem,
  CategorizedGroup,
} from "@/scripts/import/smartImport";
import type { PurposeId } from "@/core/types/purposeId";

type GroupingResponse = {
  groups: {
    id?: string;
    name: string;
    description?: string;
    purpose: PurposeId;
    itemIds: string[];
  }[];
};

export const remoteGroupingLLM: GroupingLLM = {
  async groupItemsIntoCategories(
    items: RawItem[],
    purposes: PurposeId[]
  ): Promise<CategorizedGroup[]> {
    const payload = {
      purposes,
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        url: i.url,
        source: i.source,
        lastVisitedAt: i.lastVisitedAt,
      })),
    };

    const res = await fetch(
      "https://api.mindfulbookmarks.com/smart-import/group",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // auth header if needed
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      throw new Error("Grouping LLM call failed");
    }

    const data: GroupingResponse = await res.json();

    const byId = new Map(items.map((i) => [i.id, i]));

    return data.groups.map((g) => ({
      id: g.id ?? `grp_${crypto.randomUUID()}`,
      name: g.name,
      description: g.description,
      purpose: g.purpose,
      items: g.itemIds
        .map((id) => byId.get(id))
        .filter((i): i is RawItem => Boolean(i)),
    }));
  },
};
