/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useMemo, useState, useCallback } from "react";

/* Types */
import type { ChromeImportOptions, OpenTabsOptions } from "@/core/types/import";
import type { PurposeId } from "@shared/types/purposeId";
import type { CategorizedGroup } from "@shared/types/llmGrouping";

/* Components */
import { ImportBookmarksEmbedded } from "@/components/modals/ImportBookmarksModal";

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
  purposes: PurposeId[];                     // NEW
  onDone: (primaryWorkspaceId: string) => void; // NEW
};
/* ---------------------------------------------------------- */

/* -------------------- Helper functions -------------------- */
/** Convert "flat" imported groups into CategorizedGroup[] for WorkspaceService. */
function mapImportedGroupsToCategorized(
  groups: any[],
  purpose: PurposeId
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

  const [hasImported, setHasImported] = useState(false);
  const [wizardDone, setWizardDone] = useState(false);

  const [workspaceRefs, setWorkspaceRefs] = useState<{ id: string; purpose: PurposeId }[]>([]);
  const primaryWorkspace = workspaceRefs[0] ?? null;
  const primaryWorkspaceId = primaryWorkspace?.id ?? null;
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  // Core: everything imports into the PRIMARY workspace (first purpose)
  const insertIntoPrimaryWorkspace = useCallback(
    async (groups: any[]) => {
      if (!primaryWorkspace) {
        throw new Error("Workspace not ready yet.");
      }
      const categorized = mapImportedGroupsToCategorized(groups, primaryWorkspace.purpose);
      await workspaceService.saveGroupsToWorkspace(primaryWorkspace.id, categorized);
      bumpWorkspacesVersion();
    },
    [primaryWorkspace, workspaceService, bumpWorkspacesVersion]
  );
  /* ---------------------------------------------------------- */

  /* -------------------- Handlers passed to ImportBookmarksEmbedded -------------------- */
  const handleUploadJson = useCallback(
    async (file: File) => {
      const raw = JSON.parse(await file.text());
      await insertIntoPrimaryWorkspace(raw);
      setHasImported(true);
    },
    [insertIntoPrimaryWorkspace]
  );

  const handleImportChrome = useCallback(
    async (_opts: ChromeImportOptions) => {
      await importChromeBookmarksAsSingleGroup(insertIntoPrimaryWorkspace);
      setHasImported(true);
    },
    [insertIntoPrimaryWorkspace]
  );

  const handleImportOpenTabs = useCallback(
    async (opts: OpenTabsOptions) => {
      await importOpenTabsAsSingleGroup(insertIntoPrimaryWorkspace, opts);
      setHasImported(true);
    },
    [insertIntoPrimaryWorkspace]
  );
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
    setPrimaryDisabled?.(!hasImported && !wizardDone);
  }, [hasImported, wizardDone, setPrimaryDisabled]);

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
        onUploadJson={handleUploadJson}
        onImportChrome={handleImportChrome}
        onImportOpenTabs={handleImportOpenTabs}
        onComplete={() => setWizardDone(true)}
      />
    </div>
  );
  /* ---------------------------------------------------------- */
};
/* ---------------------------------------------------------- */