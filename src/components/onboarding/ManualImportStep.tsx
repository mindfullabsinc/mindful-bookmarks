/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useMemo, useState, useCallback } from "react";

/* Types */
import type { ManualImportSelectionType, ImportSourceType } from "@/core/types/import";
import type { PurposeIdType } from "@shared/types/purposeId";
import type { CategorizedGroup, RawItem } from "@shared/types/llmGrouping";

/* Components */
import { ImportBookmarksEmbedded } from "@/components/modals/ImportBookmarksEmbedded";

/* Context */
import { AppContext } from "@/scripts/AppContextProvider";

/* Utils */
import { createUniqueID } from "@/core/utils/ids";

/* Workspace service */
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";

/* Importers */
import {
  importChromeBookmarksAsSingleGroup,
  importOpenTabsAsSingleGroup,
} from "@/scripts/importers";

/* LLM grouping */
import { remoteGroupingLLM } from "@/scripts/import/groupingLLMRemote";
import { ImportSource } from "@/core/constants/import";
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
type ManualImportStepProps = {
  setPrimaryDisabled?: (disabled: boolean) => void;
  purposes: PurposeIdType[];
  onDone: (primaryWorkspaceId: string) => void;
};
/* ---------------------------------------------------------- */

/* -------------------- Helper functions -------------------- */
/** Convert "flat" imported groups into CategorizedGroup[] for WorkspaceService. */
function mapImportedGroupsToCategorized(
  groups: any[],
  purpose: PurposeIdType,
  source: ImportSourceType
): CategorizedGroup[] {
  return (groups || []).map((g) => ({
    id: String(g.id ?? createUniqueID()),
    name: String(g.groupName ?? "Imported"),
    purpose,
    description: g.description ? String(g.description) : undefined,
    items: (g.bookmarks || []).map((b: any) => ({
      id: String(b.id ?? crypto.randomUUID()),
      name: b.name ?? b.url,
      url: b.url,
      source,
      lastVisitedAt: b.lastVisitedAt,
    })),
  }));
}

function parseJsonImport(jsonText: string): any[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("That JSON file doesn’t look valid. Please re-export and try again.");
  }

  // Be permissive: accept array OR object with a known array field.
  if (Array.isArray(parsed)) return parsed;

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const candidate =
      (obj.groups as unknown) ??
      (obj.items as unknown) ??
      (obj.data as unknown);

    if (Array.isArray(candidate)) return candidate;
  }

  throw new Error("JSON format not recognized. Expected an array of groups.");
}

function flattenCategorizedGroups(groups: CategorizedGroup[]): RawItem[] {
  const items: RawItem[] = [];
  for (const g of groups) items.push(...(g.items ?? []));
  return items;
}

function regroupIntoCategorized(
  grouped: { name: string; items: RawItem[] }[],
  purpose: PurposeIdType
): CategorizedGroup[] {
  return grouped.map((g) => ({
    id: createUniqueID(),
    name: g.name,
    purpose,
    items: g.items.map((it) => ({ ...it, id: it.id ?? createUniqueID() })),
  }));
}

async function collectGroupsFromImporter(
  run: (collector: (groups: any[]) => Promise<void>) => Promise<void>
): Promise<any[]> {
  let captured: any[] = [];
  await run(async (groups) => {
    captured = groups ?? [];
  });
  return captured;
}

function normalizeLLMGroups(
  groups: CategorizedGroup[],
  purpose: PurposeIdType
): CategorizedGroup[] {
  return (groups || []).map((g) => ({
    ...g,
    id: String(g.id ?? createUniqueID()),
    purpose,
    items: (g.items || []).map((it) => ({
      ...it,
      id: String(it.id ?? crypto.randomUUID()),
    })),
  }));
}
/* ---------------------------------------------------------- */

/* -------------------- Main component -------------------- */
export const ManualImportStep: React.FC<ManualImportStepProps> = ({
  setPrimaryDisabled,
  purposes,
  onDone,
}) => {
  /* -------------------- Context / state -------------------- */
  const { userId, bumpWorkspacesVersion } = useContext(AppContext);

  const workspaceService = useMemo(
    () => createWorkspaceServiceLocal(userId),
    [userId]
  );

  const [wizardDone, setWizardDone] = useState(false);
  const [selection, setSelection] = useState<ManualImportSelectionType>({});

  const [workspaceRefs, setWorkspaceRefs] = useState<
    { id: string; purpose: PurposeIdType }[]
  >([]);

  const primaryWorkspace = workspaceRefs[0] ?? null;
  const primaryWorkspaceId = primaryWorkspace?.id ?? null;

  const hasAnySelection =
    !!selection.jsonData ||
    !!selection.importBookmarks ||
    selection.tabScope !== undefined; // tabScope can be a stringy enum; check explicitly

  const [commitError, setCommitError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  const commitAllImports = useCallback(async () => {
    if (!primaryWorkspace) throw new Error("Workspace not ready yet.");

    const purpose = primaryWorkspace.purpose;

    // 1) Collect groups from each source (NO WRITES YET)
    const allCategorized: CategorizedGroup[] = [];

    // JSON
    if (selection.jsonData) {
      let raw: any;
      try {
        raw = JSON.parse(selection.jsonData);
      } catch (e) {
        console.error("[ManualImportStep] invalid JSON import", {
          fileName: selection.jsonFileName,
          error: e,
        });
        throw e;
      }

      allCategorized.push(
        ...mapImportedGroupsToCategorized(raw, purpose, ImportSource.Json)
      );
    }

    // Chrome bookmarks
    if (selection.importBookmarks) {
      const chromeGroups = await collectGroupsFromImporter((collector) =>
        importChromeBookmarksAsSingleGroup(collector)
      );
      allCategorized.push(
        ...mapImportedGroupsToCategorized(chromeGroups, purpose, ImportSource.Bookmarks)
      );
    }

    // Open tabs
    if (selection.tabScope) {
      const tabGroups = await collectGroupsFromImporter((collector) =>
        importOpenTabsAsSingleGroup(collector, { scope: selection.tabScope })
      );
      allCategorized.push(
        ...mapImportedGroupsToCategorized(tabGroups, purpose, ImportSource.Tabs)
      );
    }

    // 2) Decide post-processing mode
    const mode = selection.importPostProcessMode ?? "preserveStructure";

    if (mode === "semanticGrouping") {
      const items = flattenCategorizedGroups(allCategorized);

      const res = await remoteGroupingLLM.group({
        items,
        purposes, // <-- use the onboarding purposes you already have in ManualImportStep props
      });

      const regrouped = normalizeLLMGroups(res.groups, purpose);
      await workspaceService.appendGroupsToWorkspace(primaryWorkspace.id, regrouped);
    } else {
      // preserveStructure
      await workspaceService.appendGroupsToWorkspace(primaryWorkspace.id, allCategorized);
    }

    bumpWorkspacesVersion();
    setWizardDone(true);
  }, [
    primaryWorkspace,
    selection,
    purposes,
    workspaceService,
    bumpWorkspacesVersion,
  ]);
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!purposes || purposes.length === 0) return;

      try {
        const refs: { id: string; purpose: PurposeIdType }[] = [];
        for (const p of purposes) {
          refs.push(await workspaceService.createWorkspaceForPurpose(p));
        }
        if (!cancelled) {
          setWorkspaceRefs(refs);
          bumpWorkspacesVersion();
        }
      } catch (e) {
        console.error("[ManualImportStep] failed to create workspaces", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [purposes, workspaceService, bumpWorkspacesVersion]);

  useEffect(() => {
    // Disable primary button until:
    // - they’ve made a selection AND wizard is not done
    setPrimaryDisabled?.(!hasAnySelection && !wizardDone);
  }, [hasAnySelection, wizardDone, setPrimaryDisabled]);

  useEffect(() => {
    if (!wizardDone || !primaryWorkspaceId) return;
    onDone(primaryWorkspaceId);
  }, [wizardDone, primaryWorkspaceId, onDone]);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component rendering-------------------- */
  if (!primaryWorkspaceId) {
    return <div className="m_import-container">Preparing your workspaces…</div>;
  }

  return (
    <div className="m_import-container">
      {commitError && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {commitError}
        </div>
      )}

      <ImportBookmarksEmbedded
        onSelectionChange={setSelection}
        onComplete={commitAllImports}
      />

      {isCommitting && (
        <div className="mt-3 text-xs text-neutral-400">
          Importing…
        </div>
      )}
    </div>
  );
  /* ---------------------------------------------------------- */
};
/* ---------------------------------------------------------- */
