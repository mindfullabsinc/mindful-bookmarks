/* -------------------- Imports -------------------- */
import React, { useRef, useState } from "react";

/* Constants */
import { ImportPostProcessMode, JsonImportMode, OpenTabsScope } from "@/core/constants/import";

/* Types */
import type { ImportPostProcessModeType, JsonImportModeType, OpenTabsScopeType } from "@/core/types/import";

/* Components */
import { AiDisclosure } from "@/components/privacy/AiDisclosure";

/* File format detection */
import {
  type FilePreview,
  detectFileFormat,
  formatFilePreviewText,
} from "@/scripts/import/fileFormatDetection";

/* CSS */
import "@/styles/components/shared/ImportBookmarksContent.css";
import "@/styles/components/modals/ImportBookmarksModal.css";
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
export type WizardStep = 1 | 2 | 3 | 4;

type YesCheckboxRowProps = {
  checked: boolean;
  onToggle: () => void;
  label: string;
  description?: string;
};

export type ImportBookmarksStepBodyState = {
  // step 1
  jsonYes: boolean;
  setJsonYes: (v: boolean | ((prev: boolean) => boolean)) => void;
  jsonFileName: string | null;
  setJsonFileName: (v: string | null) => void;
  jsonData: string | null;
  setJsonData: (v: string | null) => void;
  jsonImportMode: JsonImportModeType;
  setJsonImportMode: (v: JsonImportModeType) => void;

  // step 2
  bookmarksYes: boolean;
  setBookmarksYes: (v: boolean | ((prev: boolean) => boolean)) => void;

  // step 3
  tabsYes: boolean;
  setTabsYes: (v: boolean | ((prev: boolean) => boolean)) => void;
  tabScope: OpenTabsScopeType;
  setTabScope: (v: OpenTabsScopeType) => void;

  // step 4
  postProcessMode: ImportPostProcessModeType;
  setPostProcessMode: (v: ImportPostProcessModeType) => void;
};

export type ImportBookmarksStepBodyProps = {
  step: WizardStep;
  state: ImportBookmarksStepBodyState;

  /** Standalone wizard shows "Step X of 4" and question title/subtitle.
   *  Onboarding can hide these and provide its own header. */
  showInternalHeader?: boolean;

  /** Disable inputs while committing (onboarding commit step) */
  busy?: boolean;

  /** Hide the replace/add picker when the user has no existing data to replace.
   *  Defaults to true (show picker). */
  hasExistingData?: boolean;
};
/* ---------------------------------------------------------- */

/* -------------------- Constants -------------------- */
export const LAST_STEP: WizardStep = 4;

export const IMPORT_BOOKMARKS_STEP_COPY: Record<
  WizardStep,
  { title: string; subtitle?: string }
> = {
  1: {
    title: "Do you have a .json or .html file to import?",
    subtitle:
      "If you exported from another bookmark manager (or from Mindful), you can bring that file in now. If you're not sure what this is, just skip.",
  },
  2: {
    title: "Do you want to import your Chrome bookmarks?",
  },
  3: {
    title: "Do you want to import your open tabs?",
  },
  4: {
    title:
      "Do you want Mindful to automatically organize everything you imported?",
  },
};
/* ---------------------------------------------------------- */

export function getImportBookmarksStepCopy(step: WizardStep) {
  return IMPORT_BOOKMARKS_STEP_COPY[step];
}

function YesCheckboxRow({ checked, onToggle, label, description }: YesCheckboxRowProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={"checkbox-row " + (checked ? "checkbox-row--checked" : "checkbox-row--unchecked")}
    >
      <span
        className={"checkbox-box " + (checked ? "checkbox-box--checked" : "checkbox-box--unchecked")}
        aria-hidden="true"
      >
        ✓
      </span>

      <span className="checkbox-label-container">
        <span className="checkbox-label">{label}</span>
        {description && <span className="checkbox-label-description">{description}</span>}
      </span>
    </button>
  );
}

export function ImportBookmarksStepBody({
  step,
  state,
  showInternalHeader = true,
  busy = false,
  hasExistingData = true,
}: ImportBookmarksStepBodyProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();

  async function processFile(file: File) {
    const isJson = file.name.endsWith('.json') || file.type === 'application/json';
    const isHtml = file.name.endsWith('.html') || file.name.endsWith('.htm') || file.type === 'text/html';
    if (!isJson && !isHtml) {
      setFileError("Please choose a .json or .html file.");
      return;
    }
    try {
      const text = await file.text();
      if (isJson) JSON.parse(text); // throws if invalid JSON
      state.setJsonFileName(file.name);
      state.setJsonData(text);
      setFilePreview(detectFileFormat(file.name, text));
      setFileError(undefined);
    } catch {
      setFileError("Invalid file. Please choose a valid .json or .html file.");
    }
  }

  async function handleJsonFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      state.setJsonFileName(null);
      state.setJsonData(null);
      return;
    }
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

  function clearJsonSelection() {
    state.setJsonFileName(null);
    state.setJsonData(null);
    setFilePreview(null);
    setFileError(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function renderStepHeader() {
    if (!showInternalHeader) return null;

    const { title, subtitle } = getImportBookmarksStepCopy(step);

    return (
      <>
        <div className="step-progress">
          <span>
            Step {step} of {LAST_STEP}
          </span>
        </div>
        <h3 className="step-title">{title}</h3>
        {subtitle && <p className="step-subtitle">{subtitle}</p>}
      </>
    );
  }

  if (step === 1) {
    return (
      <div className="body-container">
        {renderStepHeader()}

        <YesCheckboxRow
          checked={state.jsonYes}
          onToggle={() => {
            state.setJsonYes((prev) => {
              const next = !prev;
              if (!next) clearJsonSelection();
              return next;
            });
          }}
          label="Yes"
        />

        {state.jsonYes && (
          <div className="json-input-container">
            {state.jsonData && filePreview ? (
              /* ── File selected: preview card + mode picker ── */
              <>
                <div className="file-preview-card">
                  <p className="file-preview-label">{formatFilePreviewText(filePreview).label}</p>
                  <p className="file-preview-summary">{formatFilePreviewText(filePreview).summary}</p>

                  {hasExistingData && (
                    <>
                      <div className="file-preview-divider" />
                      <p className="import-method">How should this be imported?</p>
                      <div className="tabs-windows-container file-preview-mode-options">
                        {([
                          { value: JsonImportMode.Add, label: "Add to existing bookmarks" },
                          { value: JsonImportMode.Replace, label: "Replace all existing bookmarks" },
                        ] as const).map(({ value, label }) => {
                          const selected = state.jsonImportMode === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => state.setJsonImportMode(value)}
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
                      {state.jsonImportMode === JsonImportMode.Replace && (
                        <p className="json-import-replace-warning">
                          ⚠ This will permanently delete all your existing workspaces and bookmarks.
                        </p>
                      )}
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className="json-file-remove"
                  onClick={clearJsonSelection}
                  disabled={busy}
                >
                  Choose a different file
                </button>
              </>
            ) : (
              /* ── No file yet: drop zone ── */
              <>
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
                {fileError && <div className="error-message">{fileError}</div>}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="body-container">
        {renderStepHeader()}
        <YesCheckboxRow
          checked={state.bookmarksYes}
          onToggle={() => state.setBookmarksYes((v) => !v)}
          label="Yes"
        />
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="body-container">
        {renderStepHeader()}
        <YesCheckboxRow
          checked={state.tabsYes}
          onToggle={() => {
            state.setTabsYes((prev) => {
              const next = !prev;
              if (!next) state.setTabScope(OpenTabsScope.All);
              return next;
            });
          }}
          label="Yes"
        />

        {state.tabsYes && (
          <div className="tabs-container">
            <h3 className="tabs-header">Which tabs?</h3>

            <div className="tabs-windows-container">
              <button
                type="button"
                onClick={() => state.setTabScope(OpenTabsScope.All)}
                disabled={busy}
                className={`tabs-radio-button-row ${
                  state.tabScope === OpenTabsScope.All
                    ? "tabs-radio-button-row--selected"
                    : "tabs-radio-button-row--unselected"
                }`}
              >
                <div
                  className={`tabs-radio-button-outer-circle ${
                    state.tabScope === OpenTabsScope.All
                      ? "tabs-radio-button-outer-circle--selected"
                      : "tabs-radio-button-outer-circle--unselected"
                  }`}
                >
                  {state.tabScope === OpenTabsScope.All && (
                    <div className="tabs-radio-button-inner-circle" />
                  )}
                </div>
                <span className="tabs-radio-button-text">All windows</span>
              </button>

              <button
                type="button"
                onClick={() => state.setTabScope(OpenTabsScope.Current)}
                disabled={busy}
                className={`tabs-radio-button-row ${
                  state.tabScope === OpenTabsScope.Current
                    ? "tabs-radio-button-row--selected"
                    : "tabs-radio-button-row--unselected"
                }`}
              >
                <div
                  className={`tabs-radio-button-outer-circle ${
                    state.tabScope === OpenTabsScope.Current
                      ? "tabs-radio-button-outer-circle--selected"
                      : "tabs-radio-button-outer-circle--unselected"
                  }`}
                >
                  {state.tabScope === OpenTabsScope.Current && (
                    <div className="tabs-radio-button-inner-circle" />
                  )}
                </div>
                <span className="tabs-radio-button-text">Current window</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // step === 4
  const semanticYes = state.postProcessMode === ImportPostProcessMode.SemanticGrouping;

  return (
    <div className="body-container">
      {renderStepHeader()}

      {/* Disclosure lives here so it appears in BOTH onboarding + modal manual import flows */}
      <div className="mb-3">
        <AiDisclosure variant="inline" serviceName="OpenAI" />
      </div>

      <YesCheckboxRow
        checked={semanticYes}
        onToggle={() => {
          state.setPostProcessMode(
            semanticYes
              ? ImportPostProcessMode.PreserveStructure
              : ImportPostProcessMode.SemanticGrouping
          );
        }}
        label="Yes"
      />
    </div>
  );
}
