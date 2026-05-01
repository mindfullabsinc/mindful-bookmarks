/* -------------------- Imports -------------------- */
/* Constants */
import { PurposeId } from "@shared/constants/purposeId";

/* Types */
import type {
  GroupingLLM,
  GroupingInput,
  GroupingLLMResponse,
  CategorizedGroup,
  RawItem,
} from "@shared/types/llmGrouping";
import type { PurposeIdType } from "@shared/types/purposeId";

/* Privacy / minimization */
import { sanitizeUrlForAI, truncateForAI } from "@/scripts/import/sanitizeUrlForAI";
/* ---------------------------------------------------------- */

/* -------------------- Constants -------------------- */
const API_BASE_URL =
  process.env.MINDFUL_API_BASE_URL ?? "https://api.mindfulbookmarks.com";

const MIN_ITEMS_FOR_LLM = 6; // below this, just make one group locally
const MAX_ITEMS = 100;
const MAX_TITLE_LEN = 140;
/* ---------------------------------------------------------- */

/* -------------------- Helpers -------------------- */
function getHostname(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.startsWith("www.") ? h.slice(4) : h;
  } catch {
    return "";
  }
}

/**
 * Push uncovered items into the best-matching existing group.
 *
 * Handles two cases:
 *  1. Items the LLM omitted from its output (within the 100-item cap).
 *  2. Items beyond the 100-item cap that were never sent to the server.
 *
 * Strategy: hostname match first (same domain → same group), then fall back
 * to the largest group so nothing is silently dropped.
 */
function distributeUncovered(
  groups: CategorizedGroup[],
  uncovered: RawItem[]
): void {
  if (!groups.length || !uncovered.length) return;

  // Per-group hostname frequency maps for matching.
  const hostCounts = groups.map((g) => {
    const counts = new Map<string, number>();
    for (const item of g.items) {
      const h = getHostname(item.url);
      if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    return counts;
  });

  // Largest group is the fallback when hostname matching finds nothing.
  let largestIdx = 0;
  for (let i = 1; i < groups.length; i++) {
    if (groups[i].items.length > groups[largestIdx].items.length) largestIdx = i;
  }

  for (const item of uncovered) {
    const itemHost = getHostname(item.url);
    let bestIdx = -1;
    let bestScore = 0;

    if (itemHost) {
      for (let i = 0; i < groups.length; i++) {
        const score = hostCounts[i].get(itemHost) ?? 0;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
    }

    const targetIdx = bestIdx !== -1 ? bestIdx : largestIdx;
    groups[targetIdx].items.push(item);

    // Keep hostCounts in sync so later items in the same loop benefit.
    if (itemHost) {
      hostCounts[targetIdx].set(itemHost, (hostCounts[targetIdx].get(itemHost) ?? 0) + 1);
    }
  }
}
/* ---------------------------------------------------------- */

/**
 * GroupingLLM implementation that delegates grouping to a remote API backed by LLM logic.
 */
export const remoteGroupingLLM: GroupingLLM = {
  async group(input: GroupingInput): Promise<GroupingLLMResponse> {
    // No items? Nothing to group.
    if (!input.items.length) {
      return { groups: [] };
    }

    // Choose a default purpose for fallback / tiny imports
    const purposes: PurposeIdType[] = input.purposes?.length ? input.purposes : [PurposeId.Personal];
    const defaultPurpose: PurposeIdType = purposes[0];

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
      purposes,
    };

    // Data minimization: sanitize URLs and truncate titles before sending to remote API (OpenAI-backed)
    const minimizedInput: GroupingInput = {
      ...trimmedInput,
      items: trimmedInput.items.map((item: any) => {
        const next: any = { ...item };

        if (typeof next.title === "string") {
          next.title = truncateForAI(next.title, MAX_TITLE_LEN);
        }

        if (typeof next.url === "string") {
          next.url = sanitizeUrlForAI(next.url);
        }

        return next;
      }),
    };

    const res = await fetch(`${API_BASE_URL}/groupBookmarks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(minimizedInput),
    });

    if (!res.ok) {
      const isRateLimited = res.status === 429;
      console.error("remoteGroupingLLM error", res.status, await res.text());

      const fallbackGroup: CategorizedGroup = {
        id: "imported",
        name: "Imported",
        description: "All imported items",
        purpose: defaultPurpose,
        items: input.items,
      };

      return { groups: [fallbackGroup], rateLimited: isRateLimited };
    }

    const data = (await res.json()) as GroupingLLMResponse;

    // Distribute any items not covered by the LLM response — this includes
    // items the LLM omitted within the 100-item window AND items beyond the
    // cap that were never sent to the server.
    if (data.groups.length > 0) {
      const coveredIds = new Set(data.groups.flatMap((g) => g.items.map((i) => i.id)));
      const uncovered = input.items.filter((i) => !coveredIds.has(i.id));
      distributeUncovered(data.groups, uncovered);
    }

    return data;
  },
};
