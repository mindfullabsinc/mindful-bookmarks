import { NsfwFilter, RawItem } from "./smartImport";

const BLOCKED_KEYWORDS = [
  "porn",
  "xxx",
  "onlyfans",
  "nsfw",
  // add more terms
];

const BLOCKED_DOMAINS = [
  "pornhub.com",
  "xvideos.com",
  // …
];

/**
 * Basic NSFW filter that blocks obvious keywords and domains before grouping/import.
 */
export const basicNsfwFilter: NsfwFilter = {
  /**
   * Inspect a raw item for NSFW keywords/domains.
   *
   * @param item Candidate bookmark/tab/history entry.
   * @returns False when a blocked term/domain is detected, true otherwise.
   */
  async isSafe(item: RawItem): Promise<boolean> {
    const url = item.url.toLowerCase();
    const name = (item.name ?? "").toLowerCase();

    if (BLOCKED_DOMAINS.some((d) => url.includes(d))) return false;
    if (
      BLOCKED_KEYWORDS.some(
        (kw) => url.includes(kw) || name.includes(kw)
      )
    )
      return false;

    return true;
  },
};
