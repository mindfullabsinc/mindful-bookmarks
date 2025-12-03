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

export const basicNsfwFilter: NsfwFilter = {
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
