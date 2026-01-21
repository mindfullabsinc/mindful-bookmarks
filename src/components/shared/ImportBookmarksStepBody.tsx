/* -------------------- Imports -------------------- */
import React from "react";

/* Constants */
import { ImportPostProcessMode, OpenTabsScope } from "@/core/constants/import";

/* Types */
import type { ImportPostProcessModeType, OpenTabsScopeType } from "@/core/types/import";

/* Components */
import { AiDisclosure } from "@/components/privacy/AiDisclosure";

/* CSS */
import "@/styles/components/shared/ImportBookmarksContent.css";
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
};
/* ---------------------------------------------------------- */

/* -------------------- Constants -------------------- */
export const LAST_STEP: WizardStep = 4;

export const IMPORT_BOOKMARKS_STEP_COPY: Record<
  WizardStep,
  { title: string; subtitle?: string }
> = {
  1: {
    title: "Do you have a JSON file to import?",
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
}: ImportBookmarksStepBodyProps) {
  async function handleJsonFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      state.setJsonFileName(null);
      state.setJsonData(null);
      return;
    }

    const text = await file.text();
    JSON.parse(text); // throws if invalid
    state.setJsonFileName(file.name);
    state.setJsonData(text);
  }

  function clearJsonSelection() {
    state.setJsonFileName(null);
    state.setJsonData(null);
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
            {state.jsonData ? (
              <div className="json-selected-file-container">
                Selected:{" "}
                <span className="json-file-name">{state.jsonFileName ?? "file"}</span>
                <button
                  type="button"
                  className="json-file-remove"
                  onClick={clearJsonSelection}
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
