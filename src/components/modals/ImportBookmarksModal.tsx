/* -------------------- Imports -------------------- */
import React, { useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

/* Constants */
import { JsonImportMode, OpenTabsScope } from "@/core/constants/import";

/* Types */
import type { JsonImportModeType, ManualImportSelectionType, OpenTabsScopeType } from "@/core/types/import";

/* Context */
import { AppContext } from "@/scripts/AppContextProvider";

/* Commit imports */
import { commitManualImportIntoWorkspace } from "@/scripts/import/commitManualImportIntoWorkspace";

/* Services */
import { createWorkspaceServiceLocal } from "@/scripts/import/workspaceServiceLocal";

/* Icons */
import { FileJson, Globe } from "lucide-react";

/* Styling */
import '@/styles/components/modals/ImportBookmarksModal.css';
import '@/styles/components/shared/ImportBookmarksContent.css';

import { PurposeId } from "@shared/constants/purposeId";
/* ---------------------------------------------------------- */

type View = 'select' | 'json' | 'chrome' | 'tabs';

type ImportBookmarksModalProps = {
  isOpen: boolean;
  onClose: () => void;
};
/* ---------------------------------------------------------- */

export default function ImportBookmarksModal({ isOpen, onClose }: ImportBookmarksModalProps): React.ReactElement | null {
  /* -------------------- Context -------------------- */
  const { userId, activeWorkspaceId, workspaces, bookmarkGroups, bumpWorkspacesVersion } = useContext(AppContext);
  const activeWorkspace = activeWorkspaceId && workspaces ? workspaces[activeWorkspaceId] : null;
  const hasExistingData = (bookmarkGroups ?? []).some(
    (g) => g.id !== "EMPTY_GROUP_IDENTIFIER" && g.groupName !== "EMPTY_GROUP_IDENTIFIER" && g.bookmarks?.length > 0
  );
  /* ---------------------------------------------------------- */

  /* -------------------- Services -------------------- */
  const workspaceService = useMemo(() => createWorkspaceServiceLocal(userId), [userId]);
  /* ---------------------------------------------------------- */

  /* -------------------- State -------------------- */
  const [view, setView] = useState<View>('select');

  // JSON flow
  const [jsonFileName, setJsonFileName] = useState<string | null>(null);
  const [jsonData, setJsonData] = useState<string | null>(null);
  const [jsonImportMode, setJsonImportMode] = useState<JsonImportModeType>(JsonImportMode.Add);

  // Chrome flow
  const [chromeImportMode, setChromeImportMode] = useState<JsonImportModeType>(JsonImportMode.Add);

  // Tabs flow
  const [tabScope, setTabScope] = useState<OpenTabsScopeType>(OpenTabsScope.All);
  const [tabsImportMode, setTabsImportMode] = useState<JsonImportModeType>(JsonImportMode.Add);

  // Shared
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);
  /* ---------------------------------------------------------- */

  /* -------------------- Helpers -------------------- */
  const resetFlowState = useCallback(() => {
    setJsonFileName(null);
    setJsonData(null);
    setJsonImportMode(JsonImportMode.Add);
    setChromeImportMode(JsonImportMode.Add);
    setTabScope(OpenTabsScope.All);
    setTabsImportMode(JsonImportMode.Add);
    setBusy(false);
    setBusyMessage(undefined);
    setErrorMessage(undefined);
    setSuccess(false);
  }, []);

  const handleSelectView = (v: View) => {
    resetFlowState();
    setView(v);
  };

  const handleBack = () => {
    resetFlowState();
    setView('select');
  };

  const handleClose = () => {
    if (busy) return;
    resetFlowState();
    setView('select');
    onClose();
  };

  async function handleJsonFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) { setJsonFileName(null); setJsonData(null); return; }
    try {
      const text = await file.text();
      JSON.parse(text); // throws if invalid
      setJsonFileName(file.name);
      setJsonData(text);
      setErrorMessage(undefined);
    } catch {
      setErrorMessage("Invalid JSON file. Please choose a valid .json file.");
    }
  }

  async function runImport(selection: ManualImportSelectionType) {
    if (!activeWorkspace) { setErrorMessage("No active workspace."); return; }
    setErrorMessage(undefined);
    setBusy(true);
    try {
      await commitManualImportIntoWorkspace({
        selection,
        purposes: [PurposeId.Personal],
        workspaceId: activeWorkspace.id,
        purpose: PurposeId.Personal,
        workspaceService,
        onProgress: setBusyMessage,
      });
      setSuccess(true);
      bumpWorkspacesVersion();
    } catch (e: any) {
      setErrorMessage(e?.message ?? "Import failed.");
    } finally {
      setBusy(false);
      setBusyMessage(undefined);
    }
  }
  /* ---------------------------------------------------------- */

  /* -------------------- Render helpers -------------------- */
  function renderModePicker(mode: JsonImportModeType, setMode: (v: JsonImportModeType) => void) {
    const options = [
      { value: JsonImportMode.Add, label: "Add to existing bookmarks" },
      { value: JsonImportMode.Replace, label: "Replace all existing bookmarks" },
    ] as const;
    return (
      <div className="json-import-mode"><div className="tabs-container">
        <h3 className="tabs-header">How should this be imported?</h3>
        <div className="tabs-windows-container">
          {options.map(({ value, label }) => {
            const selected = mode === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                disabled={busy}
                className={`tabs-radio-button-row ${selected ? "tabs-radio-button-row--selected" : "tabs-radio-button-row--unselected"}`}
              >
                <div className={`tabs-radio-button-outer-circle ${selected ? "tabs-radio-button-outer-circle--selected" : "tabs-radio-button-outer-circle--unselected"}`}>
                  {selected && <div className="tabs-radio-button-inner-circle" />}
                </div>
                <span className="tabs-radio-button-text">{label}</span>
              </button>
            );
          })}
        </div>
        {mode === JsonImportMode.Replace && (
          <p className="json-import-replace-warning">
            ⚠ This will permanently delete all your existing bookmarks in this workspace.
          </p>
        )}
      </div></div>
    );
  }

  function renderFlowFooter(onImport: () => void, importDisabled = false) {
    return (
      <div className="footer-container">
        <span className="busy-message">{busyMessage}</span>
        <div className="flex items-center gap-2">
          <button type="button" className="import-button back-button" onClick={handleBack} disabled={busy}>
            Back
          </button>
          {success ? (
            <button type="button" className="import-button next-button" onClick={handleClose}>
              Done
            </button>
          ) : (
            <button
              type="button"
              className="import-button next-button"
              onClick={onImport}
              disabled={busy || importDisabled}
            >
              {busy ? "Importing…" : "Import"}
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderSelectView() {
    return (
      <div className="import-options-row">
        <button type="button" className="import-option-card" onClick={() => handleSelectView('chrome')}>
          <div className="import-option-card-header">
            <div className="import-option-card-icon">
              <img src="/assets/browsers/chrome.png" alt="Chrome" width={20} height={20} />
            </div>
            <div className="import-option-card-title">Chrome Bookmarks</div>
          </div>
          <div className="import-option-card-subtitle">
            Import your saved Chrome bookmarks.
          </div>
        </button>
        <button type="button" className="import-option-card" onClick={() => handleSelectView('tabs')}>
          <div className="import-option-card-header">
            <div className="import-option-card-icon import-option-card-icon--tabs">
              <Globe size={18} strokeWidth={1.5} />
            </div>
            <div className="import-option-card-title">Open Tabs</div>
          </div>
          <div className="import-option-card-subtitle">
            Import all the tabs you currently have open.
          </div>
        </button>
        <button type="button" className="import-option-card" onClick={() => handleSelectView('json')}>
          <div className="import-option-card-header">
            <div className="import-option-card-icon import-option-card-icon--json">
              <FileJson size={18} strokeWidth={1.5} />
            </div>
            <div className="import-option-card-title">JSON File</div>
          </div>
          <div className="import-option-card-subtitle">
            Import from a previously exported bookmarks JSON file.
          </div>
        </button>
      </div>
    );
  }

  function renderJsonFlow() {
    const modeOptions = [
      { value: JsonImportMode.Add, label: "Add to existing bookmarks" },
      { value: JsonImportMode.Replace, label: "Replace all existing bookmarks" },
    ] as const;

    return (
      <div className="import-styles">
        <div className="body-container">
          {success ? (
            <p className="step-title">Import complete!</p>
          ) : (
            <>
              {jsonData ? (
                <div className="json-selected-file-container">
                  Selected:{" "}
                  <span className="json-file-name">{jsonFileName ?? "file"}</span>
                  <button
                    type="button"
                    className="json-file-remove"
                    onClick={() => { setJsonFileName(null); setJsonData(null); }}
                    disabled={busy}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <input
                  id="json-file-input"
                  type="file"
                  accept="application/json,.json"
                  onChange={handleJsonFileChange}
                  className="json-input"
                  disabled={busy}
                />
              )}

              {jsonData && hasExistingData && (
                <div className="json-import-mode"><div className="tabs-container">
                  <h3 className="tabs-header">How should this be imported?</h3>
                  <div className="tabs-windows-container">
                    {modeOptions.map(({ value, label }) => {
                      const selected = jsonImportMode === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setJsonImportMode(value)}
                          disabled={busy}
                          className={`tabs-radio-button-row ${selected ? "tabs-radio-button-row--selected" : "tabs-radio-button-row--unselected"}`}
                        >
                          <div className={`tabs-radio-button-outer-circle ${selected ? "tabs-radio-button-outer-circle--selected" : "tabs-radio-button-outer-circle--unselected"}`}>
                            {selected && <div className="tabs-radio-button-inner-circle" />}
                          </div>
                          <span className="tabs-radio-button-text">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {jsonImportMode === JsonImportMode.Replace && (
                    <p className="json-import-replace-warning">
                      ⚠ This will permanently delete all your existing workspaces and bookmarks.
                    </p>
                  )}
                </div></div>
              )}

              {errorMessage && <div className="error-message">{errorMessage}</div>}
            </>
          )}
        </div>
        {renderFlowFooter(
          () => runImport({ jsonFileName, jsonData, jsonImportMode, importBookmarks: false }),
          !jsonData,
        )}
      </div>
    );
  }

  function renderChromeFlow() {
    return (
      <div className="import-styles">
        <div className="body-container">
          {success ? (
            <p className="step-title">Import complete!</p>
          ) : (
            <>
              {hasExistingData && renderModePicker(chromeImportMode, setChromeImportMode)}
              {errorMessage && <div className="error-message">{errorMessage}</div>}
            </>
          )}
        </div>
        {renderFlowFooter(() => runImport({ importBookmarks: true, chromeImportMode }))}
      </div>
    );
  }

  function renderTabsFlow() {
    const scopeOptions = [
      { value: OpenTabsScope.All, label: "All windows" },
      { value: OpenTabsScope.Current, label: "Current window" },
    ] as const;

    return (
      <div className="import-styles">
        <div className="body-container">
          {success ? (
            <p className="step-title">Import complete!</p>
          ) : (
            <>
              {hasExistingData && renderModePicker(tabsImportMode, setTabsImportMode)}
              <div className="json-import-mode"><div className="tabs-container">
                <h3 className="tabs-header">Which tabs?</h3>
                <div className="tabs-windows-container">
                  {scopeOptions.map(({ value, label }) => {
                    const selected = tabScope === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTabScope(value)}
                        disabled={busy}
                        className={`tabs-radio-button-row ${selected ? "tabs-radio-button-row--selected" : "tabs-radio-button-row--unselected"}`}
                      >
                        <div className={`tabs-radio-button-outer-circle ${selected ? "tabs-radio-button-outer-circle--selected" : "tabs-radio-button-outer-circle--unselected"}`}>
                          {selected && <div className="tabs-radio-button-inner-circle" />}
                        </div>
                        <span className="tabs-radio-button-text">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div></div>
              {errorMessage && <div className="error-message">{errorMessage}</div>}
            </>
          )}
        </div>
        {renderFlowFooter(() => runImport({ tabScope, tabsImportMode }))}
      </div>
    );
  }
  /* ---------------------------------------------------------- */

  /* -------------------- Main render -------------------- */
  if (!isOpen) return null;

  const titleMap: Record<View, string> = {
    select: 'Import bookmarks',
    json: 'JSON File',
    chrome: 'Chrome Bookmarks',
    tabs: 'Open Tabs',
  };

  const modal = (
    <div className="modal-import-styles">
      <div className="modal-container" role="dialog" aria-modal="true">
        <div className="modal-backdrop" onClick={handleClose} />
        <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header-container">
            <h2 className="modal-title">{titleMap[view]}</h2>
            <button type="button" onClick={handleClose} disabled={busy} className="close-button" aria-label="Close">
              ✕
            </button>
          </div>

          {view === 'select' && renderSelectView()}
          {view === 'json' && renderJsonFlow()}
          {view === 'chrome' && renderChromeFlow()}
          {view === 'tabs' && renderTabsFlow()}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
  /* ---------------------------------------------------------- */
}
