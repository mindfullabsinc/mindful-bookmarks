/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";

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

  const [workspaceRefs, setWorkspaceRefs] = useState<{ id: string; purpose: PurposeIdType }[]>([]);
  const primaryWorkspace = workspaceRefs[0] ?? null;
  const primaryWorkspaceId = primaryWorkspace?.id ?? null;

  const hasAnySelection =
    !!selection.jsonFile ||
    !!selection.importBookmarks ||
    !!selection.tabScope;
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  const insertIntoPrimaryWorkspace = useCallback(
    async (groups: any[]) => {
      if (!primaryWorkspace) {
        throw new Error("Workspace not ready yet.");
      }
      const categorized = mapImportedGroupsToCategorized(groups, primaryWorkspace.purpose);
      await workspaceService.appendGroupsToWorkspace(primaryWorkspace.id, categorized);
      bumpWorkspacesVersion();
    },
    [primaryWorkspace, workspaceService, bumpWorkspacesVersion]
  );

  const handleCommit = useCallback(async () => {
    if (!primaryWorkspace) return;

    // JSON
    if (selection.jsonFile) {
      const raw = JSON.parse(await selection.jsonFile.text());
      await insertIntoPrimaryWorkspace(raw);
    }

    // Chrome bookmarks
    if (selection.importBookmarks) {
      await importChromeBookmarksAsSingleGroup(insertIntoPrimaryWorkspace);
    }

    // Tabs
    if (selection.tabScope) {
      await importOpenTabsAsSingleGroup(
        insertIntoPrimaryWorkspace,
        { scope: selection.tabScope }
      );
    }

    setWizardDone(true);
  }, [selection, insertIntoPrimaryWorkspace]);
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!purposes || purposes.length === 0) return;

      try {
        const refs = [];
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
    setPrimaryDisabled?.(!hasAnySelection && !wizardDone);
  }, [hasAnySelection, wizardDone, setPrimaryDisabled]);

  useEffect(() => {
    if (!wizardDone || !primaryWorkspaceId) return;
    onDone(primaryWorkspaceId);
  }, [wizardDone, primaryWorkspaceId, onDone]);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component rendering-------------------- */
  // Optional: block UI until workspace exists so imports can’t race
  if (!primaryWorkspaceId) {
    return <div className="m_import-container">Preparing your workspaces…</div>;
  }
  return (
    <div className="m_import-container">
      <ImportBookmarksEmbedded
        onSelectionChange={setSelection}
        onComplete={handleCommit} 
      />
    </div>
  );
  /* ---------------------------------------------------------- */
};
/* ---------------------------------------------------------- */