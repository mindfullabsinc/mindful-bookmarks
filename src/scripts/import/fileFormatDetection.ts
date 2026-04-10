export type FilePreview =
  | { format: 'mindful'; workspaces: number; groups: number; tabs: number }
  | { format: 'tabme';   workspaces: number; groups: number; tabs: number }
  | { format: 'chrome';  folders: number; bookmarks: number }
  | { format: 'toby';    workspaces: number; lists: number; cards: number }
  | { format: 'unknown' };

export function detectFileFormat(fileName: string, text: string): FilePreview {
  if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
    const folders   = (text.match(/<DT><H3/gi) ?? []).length;
    const bookmarks = (text.match(/<DT><A /gi) ?? []).length;
    return { format: 'chrome', folders, bookmarks };
  }

  let obj: any;
  try { obj = JSON.parse(text); } catch { return { format: 'unknown' }; }

  if (obj?.isTabme) {
    const isMindful = obj.source === 'mindful' || Array.isArray(obj.workspaces);
    const spaces: any[] = Array.isArray(obj.workspaces) ? obj.workspaces : (obj.spaces ?? []);
    let groups = 0, tabs = 0;
    for (const space of spaces) {
      const folders: any[] = space.groups ?? space.folders ?? [];
      for (const folder of folders) {
        if (folder.objectType === 'group') {
          const subs: any[] = folder.groups ?? folder.folders ?? [];
          groups += subs.length;
          for (const sub of subs) {
            tabs += (sub.items ?? []).filter((it: any) => it.objectType !== 'group').length;
          }
        } else {
          groups++;
          tabs += (folder.items ?? []).filter((it: any) => it.objectType !== 'group').length;
        }
      }
    }
    return { format: isMindful ? 'mindful' : 'tabme', workspaces: spaces.length, groups, tabs };
  }

  // Toby v4: { version, groups: [{ name, lists: [{title, cards}] }] }
  if (Array.isArray(obj?.groups) && (obj.groups as any[]).every((g: any) => Array.isArray(g.lists))) {
    const groups = (obj.groups as any[]);
    const lists = groups.reduce((n: number, g: any) => n + (g.lists?.length ?? 0), 0);
    const cards = groups.reduce((n: number, g: any) =>
      n + (g.lists ?? []).reduce((m: number, l: any) => m + (l.cards?.length ?? 0), 0), 0);
    return { format: 'toby', workspaces: groups.length, lists, cards };
  }

  // Toby legacy: { lists: [{title, cards}] }
  if (Array.isArray(obj?.lists) && (obj.lists as any[]).every((l: any) => 'cards' in l)) {
    const cards = (obj.lists as any[]).reduce((n: number, l: any) => n + (l.cards?.length ?? 0), 0);
    return { format: 'toby', workspaces: 1, lists: obj.lists.length, cards };
  }

  // Toby legacy: top-level array [{title, cards}]
  if (Array.isArray(obj) && obj.length > 0 && 'cards' in obj[0]) {
    const cards = (obj as any[]).reduce((n: number, l: any) => n + (l.cards?.length ?? 0), 0);
    return { format: 'toby', workspaces: 1, lists: obj.length, cards };
  }

  return { format: 'unknown' };
}

export function formatFilePreviewText(preview: FilePreview): { label: string; summary: string } {
  const p = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;
  switch (preview.format) {
    case 'mindful':
      return {
        label: 'Mindful export detected',
        summary: `We found ${p(preview.tabs, 'bookmark')} across ${p(preview.groups, 'group')} and ${p(preview.workspaces, 'workspace')}.`,
      };
    case 'tabme':
      return {
        label: 'TabMe export detected',
        summary: `We found ${p(preview.tabs, 'tab')} across ${p(preview.groups, 'group')} and ${p(preview.workspaces, 'workspace')}.`,
      };
    case 'chrome':
      return {
        label: 'Chrome bookmarks detected',
        summary: `We found ${p(preview.bookmarks, 'bookmark')} across ${p(preview.folders, 'folder')}.`,
      };
    case 'toby':
      return {
        label: 'Toby export detected',
        summary: `We found ${p(preview.cards, 'bookmark')} across ${p(preview.lists, 'list')} and ${p(preview.workspaces, 'workspace')}.`,
      };
    default:
      return {
        label: 'File ready to import',
        summary: 'Format not recognized — will attempt import anyway.',
      };
  }
}
