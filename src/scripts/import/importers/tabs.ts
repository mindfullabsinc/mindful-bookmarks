/* -------------------- Imports -------------------- */
/* Types */
import type { OpenTabsScopeType } from "@/core/types/import"; 
import type { BookmarkType, BookmarkGroupType } from "@/core/types/bookmarks";

/* Utils */
import { normalizeUrl, isHttpUrl } from "@/core/utils/url";
import { createUniqueID } from "@/core/utils/ids";
/* ---------------------------------------------------------- */


/**
 * Collect open tabs and insert them as a single group via the provided callback.
 *
 * @param insertGroups Function that writes the resulting groups.
 * @param opts Tab collection options specifying scope and filters.
 */
export async function importOpenTabsAsSingleGroup(
  insertGroups: (groups: BookmarkGroupType[]) => Promise<void>,
  opts?: { scope?: OpenTabsScopeType; includePinned?: boolean; includeDiscarded?: boolean }
): Promise<void> {
  const { scope = "current", includePinned = true, includeDiscarded = true } = opts ?? {};

  const q: chrome.tabs.QueryInfo = scope === "current" ? { currentWindow: true } : {};
  const tabs = await chrome.tabs.query(q);

  const seen = new Set<string>();
  const bookmarks: BookmarkType[] = [];

  for (const t of tabs) {
    const u = t.url || "";
    if (!isHttpUrl(u)) continue;
    if (!includePinned && t.pinned) continue;
    // @ts-ignore
    if (!includeDiscarded && t.discarded) continue;

    const key = normalizeUrl(u);
    if (seen.has(key)) continue;
    seen.add(key);

    bookmarks.push({
      id: createUniqueID(),
      name: t.title || u,
      url: u,
      faviconUrl: t.favIconUrl || undefined,
    });
  }

  if (bookmarks.length === 0) return;

  const label = new Date().toLocaleString();
  await insertGroups([
    {
      id: createUniqueID(),
      groupName: `Imported from Open Tabs (${label})`,
      bookmarks,
    },
  ]);
}

/**
 * Preserve window + tab-group structure.
 *
 * Requires:
 * - "tabs" permission (you already have if you can query URLs)
 * - "tabGroups" permission if you want titles/colors reliably (optional; we degrade gracefully)
 */
/**
 * Import open tabs while preserving window and tab-group structure.
 *
 * @param insertGroups Callback invoked with the groups to save.
 * @param opts Options controlling scope, pinned/discarded filtering, and dedupe behavior.
 */
export async function importOpenTabsPreserveStructure(
  insertGroups: (groups: BookmarkGroupType[]) => Promise<void>,
  opts?: {
    scope?: OpenTabsScopeType;
    includePinned?: boolean;
    includeDiscarded?: boolean;
    includeUngrouped?: boolean;
    dedupeWithinGroup?: boolean;
  }
): Promise<void> {
  const {
    scope = "current",
    includePinned = true,
    includeDiscarded = true,
    includeUngrouped = true,
    dedupeWithinGroup = true,
  } = opts ?? {};

  const windows =
    scope === "current"
      ? [await chrome.windows.getCurrent({ populate: true })]
      : await chrome.windows.getAll({ populate: true });

  const groups: BookmarkGroupType[] = [];

  let wIndex = 0;
  for (const win of windows) {
    wIndex += 1;
    const tabs = (win.tabs ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    // groupId => tabs
    const byGroupId = new Map<number, chrome.tabs.Tab[]>();
    for (const t of tabs) {
      const u = t.url || "";
      if (!isHttpUrl(u)) continue;
      if (!includePinned && t.pinned) continue;
      // @ts-ignore
      if (!includeDiscarded && t.discarded) continue;

      const gid = (t.groupId ?? -1) as number;
      const arr = byGroupId.get(gid) ?? [];
      arr.push(t);
      byGroupId.set(gid, arr);
    }

    for (const [groupId, groupedTabs] of byGroupId.entries()) {
      if (groupId === -1 && !includeUngrouped) continue;

      let groupLabel = groupId === -1 ? "Ungrouped" : "Tab group";
      if (groupId !== -1) {
        try {
          const tg = await chrome.tabGroups.get(groupId);
          groupLabel = tg?.title?.trim() ? `“${tg.title.trim()}”` : "Unnamed group";
        } catch {
          // no tabGroups permission or group vanished; keep fallback
        }
      }

      const seen = new Set<string>();
      const bookmarks: BookmarkType[] = [];

      for (const t of groupedTabs) {
        const u = t.url!;
        const key = normalizeUrl(u);
        if (dedupeWithinGroup && seen.has(key)) continue;
        seen.add(key);

        bookmarks.push({
          id: createUniqueID(),
          name: t.title || u,
          url: u,
          faviconUrl: t.favIconUrl || undefined,
        });
      }

      if (bookmarks.length === 0) continue;

      groups.push({
        id: createUniqueID(),
        groupName: `Tabs / Window ${wIndex} / ${groupLabel}`,
        bookmarks,
      });
    }
  }

  await insertGroups(groups);
}
