// src/scripts/import/nsfwFilter.ts
import { NsfwFilter } from "./smartImport";
import type { RawItem } from "@shared/types/llmGrouping";

/**
 * Very small keyword/domain list on purpose:
 * - This is meant as a coarse pre-filter, not a perfect classifier.
 * - You can safely extend these lists over time.
 */
const BLOCKED_KEYWORDS = [
  "porn",
  "pr0n",      // leetspeak variant so "Best pr0n collection" gets caught
  "xxx",
  "onlyfans",
  "nsfw",
  "sex",
  "adult",
] as const;

const BLOCKED_DOMAIN_FRAGMENTS = [
  "pornhub.",
  "pr0nhub.",  // leetspeak variant so "https://pr0nhub.com" gets caught
  "xvideos.",
  "xhamster.",
  "redtube.",
  "xnxx.",
  "onlyfans.",
  "literotica.",
  "bellesa.",
  "brazzers.",
  "xnxx.",
  "spankbang.",
  "eporner.",
  "chaturbate.",
  "rule34.",
  "youporn.",
] as const;

const BLOCKED_TLDS = ["xxx"] as const;

/**
 * Normalize text for matching:
 * - lowercase
 * - map common leetspeak → normal letters (pr0n → porn, 0nlyf4ns → onlyfans, etc.)
 */
function normalizeForMatching(text: string): string {
  const lower = text.toLowerCase();
  const map: Record<string, string> = {
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "@": "a",
    "$": "s",
  };

  return lower.replace(/[013457@$]/g, (ch) => map[ch] ?? ch);
}

type ParsedUrl = {
  href: string;
  hostname: string;
  fullPath: string; // path + search + hash
};

/**
 * Safely parse a URL string. If URL ctor fails, fall back gracefully.
 */
function parseUrl(rawUrl: string): ParsedUrl {
  try {
    const u = new URL(rawUrl);
    const fullPath = `${u.pathname}${u.search}${u.hash}` || "/";
    return {
      href: u.href.toLowerCase(),
      hostname: u.hostname.toLowerCase(),
      fullPath: fullPath.toLowerCase(),
    };
  } catch {
    const lower = rawUrl.toLowerCase();
    return {
      href: lower,
      hostname: "",
      fullPath: lower,
    };
  }
}

function hostnameHasBlockedTld(hostname: string): boolean {
  if (!hostname) return false;
  return BLOCKED_TLDS.some((tld) => hostname.endsWith(`.${tld}`));
}

function hostnameHasBlockedFragment(hostname: string): boolean {
  if (!hostname) return false;

  // 🔑 This is what makes `pr0nhub.com` fail:
  const normalizedHost = normalizeForMatching(hostname);

  return BLOCKED_DOMAIN_FRAGMENTS.some((frag) =>
    normalizedHost.includes(normalizeForMatching(frag))
  );
}

function textHasBlockedKeyword(text: string): boolean {
  if (!text) return false;

  // 🔑 This is what makes `pr0n` in the title fail:
  const normalized = normalizeForMatching(text);

  return BLOCKED_KEYWORDS.some((kw) =>
    normalized.includes(normalizeForMatching(kw))
  );
}

/**
 * Basic NSFW filter that blocks obvious keywords/domains before grouping/import.
 * This is intentionally conservative: if in doubt, it returns false (unsafe).
 */
export const basicNsfwFilter: NsfwFilter = {
  /**
   * Inspect a raw item for NSFW keywords/domains.
   *
   * @param item Candidate bookmark/tab/history entry.
   * @returns False when a blocked term/domain is detected, true otherwise.
   */
  async isSafe(item: RawItem): Promise<boolean> {
    const rawUrl = (item.url ?? "").trim();
    const name = (item.name ?? "").trim();

    if (!rawUrl && !name) {
      // No signal at all – treat as safe and let later stages decide.
      return true;
    }

    const { href, hostname, fullPath } = parseUrl(rawUrl);

    // 1) Hard blocks on hostname (TLDs + known porn domains)
    if (hostnameHasBlockedTld(hostname)) return false;
    if (hostnameHasBlockedFragment(hostname)) return false;

    // 2) Keyword checks across URL + path + title (with leetspeak normalization)
    if (
      textHasBlockedKeyword(href) ||
      textHasBlockedKeyword(fullPath) ||
      textHasBlockedKeyword(name)
    ) {
      return false;
    }

    return true;
  },
};