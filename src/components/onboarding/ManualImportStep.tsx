/* -------------------- Imports -------------------- */
import React, { useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";

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
  purposes: PurposeId[];                    
  onDone: (primaryWorkspaceId: string) => void; 
};

type ImportKind = "json" | "chrome" | "openTabs";
type ImportOnceState = Record<ImportKind, { done: boolean; inFlight: boolean }>;
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

  const importGuardRef = useRef<Record<ImportKind, { done: boolean; inFlight: boolean }>>({
    json: { done: false, inFlight: false },
    chrome: { done: false, inFlight: false },
    openTabs: { done: false, inFlight: false },
  });
  /* ---------------------------------------------------------- */

  /* -------------------- Helper functions -------------------- */
  const runImportOnce = useCallback(async (kind: ImportKind, fn: () => Promise<void>) => {
    const g = importGuardRef.current[kind];
    if (g.done || g.inFlight) return;

    g.inFlight = true;
    try {
      await fn();
      g.done = true;
      setHasImported(true);
    } finally {
      g.inFlight = false;
    }
  }, []);

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
  /* ---------------------------------------------------------- */

  /* -------------------- Handlers passed to ImportBookmarksEmbedded -------------------- */
  const handleUploadJson = useCallback(
    async (file: File) => {
      await runImportOnce("json", async () => {
        const raw = JSON.parse(await file.text());
        await insertIntoPrimaryWorkspace(raw);
        setHasImported(true);
      });
    },
    [runImportOnce, insertIntoPrimaryWorkspace]
  );

  const handleImportChrome = useCallback(
    async (_opts: ChromeImportOptions) => {
      await runImportOnce("chrome", async () => {
        await importChromeBookmarksAsSingleGroup(insertIntoPrimaryWorkspace);
        setHasImported(true);
      });
    },
    [runImportOnce, insertIntoPrimaryWorkspace]
  );

  const handleImportOpenTabs = useCallback(
    async (opts: OpenTabsOptions) => {
      await runImportOnce("openTabs", async () => {
        await importOpenTabsAsSingleGroup(insertIntoPrimaryWorkspace, opts);
        setHasImported(true);
      });
    },
    [runImportOnce, insertIntoPrimaryWorkspace]
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