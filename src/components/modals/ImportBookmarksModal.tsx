/* -------------------- Imports -------------------- */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
import {
  type FilePreview,
  detectFileFormat,
  formatFilePreviewText,
} from "@/scripts/import/fileFormatDetection";
/* ---------------------------------------------------------- */

type View = 'select' | 'json' | 'chrome' | 'tabs';

type ImportBookmarksModalProps = {
  isOpen: boolean;
  onClose: () => void;
};
/* ---------------------------------------------------------- */

export default function ImportBookmarksModal({ isOpen, onClose }: ImportBookmarksModalProps): React.ReactElement | null {
  /* -------------------- Context -------------------- */
  const { userId, activeWorkspaceId, workspaces, bookmarkGroups, bumpWorkspacesVersion, bumpPostImport } = useContext(AppContext);
  const workspaceIdsBeforeImport = useRef<string[]>([]);
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

  // JSON drag-and-drop
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // JSON file preview
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);

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
    setIsDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFilePreview(null);
    setJsonImportMode(JsonImportMode.Add);
    setChromeImportMode(JsonImportMode.Add);
    setTabScope(OpenTabsScope.All);
    setTabsImportMode(JsonImportMode.Add);
    setBusy(false);
    setBusyMessage(undefined);
    setErrorMessage(undefined);
    setSuccess(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('import-modal-open');
    }
    return () => { document.body.classList.remove('import-modal-open'); };
  }, [isOpen]);

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
    const wasSuccess = success;
    resetFlowState();
    setView('select');
    onClose();
    if (wasSuccess) bumpPostImport(workspaceIdsBeforeImport.current);
  };

  async function processFile(file: File) {
    const isJson = file.name.endsWith('.json') || file.type === 'application/json';
    const isHtml = file.name.endsWith('.html') || file.name.endsWith('.htm') || file.type === 'text/html';
    if (!isJson && !isHtml) {
      setErrorMessage("Please choose a .json or .html file.");
      return;
    }
    try {
      const text = await file.text();
      if (isJson) JSON.parse(text); // throws if invalid JSON
      setJsonFileName(file.name);
      setJsonData(text);
      setFilePreview(detectFileFormat(file.name, text));
      setErrorMessage(undefined);
    } catch {
      setErrorMessage("Invalid file. Please choose a valid .json or .html file.");
    }
  }

  async function handleJsonFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) { setJsonFileName(null); setJsonData(null); return; }
    await processFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (!file) return;
    await processFile(file);
  }

  async function runImport(selection: ManualImportSelectionType) {
    if (!activeWorkspace) { setErrorMessage("No active workspace."); return; }
    workspaceIdsBeforeImport.current = Object.keys(workspaces ?? {});
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
        <h3 className="import-method">How should this be imported?</h3>
        <div className="tabs-windows-container file-preview-mode-options">
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
            <div className="import-option-card-title">Import File</div>
          </div>
          <div className="import-option-card-subtitle">
            Import bookmarks from .json or .html export files.
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

    // ── Success ──────────────────────────────────────────────
    if (success) {
      return (
        <div className="import-styles">
          <div className="body-container">
            <p className="step-title">Import complete!</p>
          </div>
          {renderFlowFooter(() => {}, true)}
        </div>
      );
    }

    // ── File selected: preview + mode picker ─────────────────
    if (jsonData && filePreview) {
      const { label, summary } = formatFilePreviewText(filePreview);
      const clearFile = () => {
        setJsonFileName(null);
        setJsonData(null);
        setFilePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
      return (
        <div className="import-styles">
          <div className="body-container">
            <div className="file-preview-card">
              <p className="file-preview-label">{label}</p>
              <p className="file-preview-summary">{summary}</p>

              {hasExistingData && (
                <>
                  <div className="file-preview-divider" />
                  <p className="import-method">How should this be imported?</p>
                  <div className="tabs-windows-container file-preview-mode-options">
                    {modeOptions.map(({ value, label: optLabel }) => {
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
                          <span className="tabs-radio-button-text">{optLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                  {jsonImportMode === JsonImportMode.Replace && (
                    <p className="json-import-replace-warning">
                      ⚠ This will permanently delete all your existing workspaces and bookmarks.
                    </p>
                  )}
                </>
              )}
            </div>

            {errorMessage && <div className="error-message">{errorMessage}</div>}
          </div>
          <div className="footer-container">
            <span className="busy-message">{busyMessage}</span>
            <div className="flex items-center gap-2">
              <button type="button" className="import-button back-button" onClick={handleBack} disabled={busy}>
                Back
              </button>
              <button type="button" className="import-button back-button" onClick={clearFile} disabled={busy}>
                Choose a different file
              </button>
              {success ? (
                <button type="button" className="import-button next-button" onClick={handleClose}>
                  Done
                </button>
              ) : (
                <button
                  type="button"
                  className="import-button next-button"
                  onClick={() => runImport({ jsonFileName, jsonData, jsonImportMode, importBookmarks: false, workspaceName: jsonFileName?.match(/\.html?$/i) ? "HTML Backup" : "JSON Backup" })}
                  disabled={busy}
                >
                  {busy ? "Importing…" : "Import"}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── No file yet: drop zone ────────────────────────────────
    return (
      <div className="import-styles">
        <div className="body-container">
          <p className="json-format-hint">Supported formats: Chrome (.html), Toby (.json), TabMe (.json), Mindful (.json)</p>
          <div
            className={`json-drop-zone${isDragOver ? ' json-drop-zone--active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <span className="json-drop-zone-label">Drag &amp; drop a file here, or</span>
            <button
              type="button"
              className="json-drop-zone-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              Choose File
            </button>
            <span className="json-drop-zone-hint">.json or .html</span>
            <input
              ref={fileInputRef}
              id="json-file-input"
              type="file"
              accept="application/json,.json,text/html,.html,.htm"
              onChange={handleJsonFileChange}
              className="json-input-hidden"
              disabled={busy}
            />
          </div>
          {errorMessage && <div className="error-message">{errorMessage}</div>}
        </div>
        {renderFlowFooter(
          () => runImport({ jsonFileName, jsonData, jsonImportMode, importBookmarks: false, workspaceName: jsonFileName?.match(/\.html?$/i) ? "HTML Backup" : "JSON Backup" }),
          true,
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
        {renderFlowFooter(() => runImport({ importBookmarks: true, chromeImportMode, workspaceName: "Chrome Bookmarks" }))}
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
                <h3 className="import-method">Which tabs?</h3>
                <div className="tabs-windows-container file-preview-mode-options">
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
        {renderFlowFooter(() => runImport({ tabScope, tabsImportMode, workspaceName: "Open Tabs" }))}
      </div>
    );
  }
  /* ---------------------------------------------------------- */

  /* -------------------- Main render -------------------- */
  if (!isOpen) return null;

  const titleMap: Record<View, string> = {
    select: 'Import bookmarks',
    json: 'Import File',
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
