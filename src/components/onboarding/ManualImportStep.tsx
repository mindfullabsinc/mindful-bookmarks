/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useMemo, useState, useCallback } from "react";

/* Types */
import type { ManualImportSelectionType } from "@/core/types/import";
import type { PurposeIdType } from "@shared/types/purposeId";
import type { CategorizedGroup } from "@shared/types/llmGrouping";

/* Components */
import { ImportBookmarksEmbedded } from "@/components/modals/ImportBookmarksEmbedded";

/* Context */
import { AppContext } from "@/scripts/AppContextProvider";

/* Workspace service */
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";

/* Importers */
import {
  importChromeBookmarksAsSingleGroup,
  importOpenTabsAsSingleGroup,
} from "@/scripts/importers";

/* Utils */
import { createUniqueID } from "@/core/utils/ids";
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
  purpose: PurposeIdType
): CategorizedGroup[] {
  return (groups || []).map((g) => ({
    id: String(g.id ?? createUniqueID()),
    name: String(g.groupName ?? "Imported"),
    purpose,
    items: (g.bookmarks || []).map((b: any) => ({
      id: String(b.id ?? crypto.randomUUID()),
      name: b.name ?? b.url,
      url: b.url,
      faviconUrl: b.faviconUrl,
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
  const insertIntoPrimaryWorkspace = useCallback(
    async (groups: any[]) => {
      if (!primaryWorkspace) {
        throw new Error("Workspace not ready yet.");
      }
      const categorized = mapImportedGroupsToCategorized(
        groups,
        primaryWorkspace.purpose
      );
      await workspaceService.appendGroupsToWorkspace(primaryWorkspace.id, categorized);
      bumpWorkspacesVersion();
    },
    [primaryWorkspace, workspaceService, bumpWorkspacesVersion]
  );

  const handleCommit = useCallback(async () => {
    if (!primaryWorkspace) return;

    // If they hit Finish but selected nothing, just complete.
    if (!hasAnySelection) {
      setWizardDone(true);
      return;
    }

    setCommitError(null);
    setIsCommitting(true);

    try {
      // JSON
      if (selection.jsonData) {
        const rawGroups = parseJsonImport(selection.jsonData);
        await insertIntoPrimaryWorkspace(rawGroups);
      }

      // Chrome bookmarks
      if (selection.importBookmarks) {
        await importChromeBookmarksAsSingleGroup(insertIntoPrimaryWorkspace);
      }

      // Tabs
      if (selection.tabScope !== undefined) {
        await importOpenTabsAsSingleGroup(insertIntoPrimaryWorkspace, {
          scope: selection.tabScope,
        });
      }

      setWizardDone(true);
    } catch (e) {
      console.error("[ManualImportStep] commit failed", e);
      setCommitError(e instanceof Error ? e.message : "Import failed. Please try again.");
    } finally {
      setIsCommitting(false);
    }
  }, [
    primaryWorkspace,
    hasAnySelection,
    selection.jsonData,
    selection.importBookmarks,
    selection.tabScope,
    insertIntoPrimaryWorkspace,
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
        onComplete={handleCommit}
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
