import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/* Constants */
import { ImportPostProcessMode, JsonImportMode, OpenTabsScope } from "@/core/constants/import";
/* Components */
import { AiDisclosure } from "@/components/privacy/AiDisclosure";
/* CSS */
import "@/styles/components/shared/ImportBookmarksContent.css";
/* ---------------------------------------------------------- */
/* -------------------- Constants -------------------- */
export const LAST_STEP = 4;
export const IMPORT_BOOKMARKS_STEP_COPY = {
    1: {
        title: "Do you have a JSON file to import?",
        subtitle: "If you exported from another bookmark manager (or from Mindful), you can bring that file in now. If you're not sure what this is, just skip.",
    },
    2: {
        title: "Do you want to import your Chrome bookmarks?",
    },
    3: {
        title: "Do you want to import your open tabs?",
    },
    4: {
        title: "Do you want Mindful to automatically organize everything you imported?",
    },
};
/* ---------------------------------------------------------- */
export function getImportBookmarksStepCopy(step) {
    return IMPORT_BOOKMARKS_STEP_COPY[step];
}
function YesCheckboxRow({ checked, onToggle, label, description }) {
    return (_jsxs("button", { type: "button", onClick: onToggle, className: "checkbox-row " + (checked ? "checkbox-row--checked" : "checkbox-row--unchecked"), children: [_jsx("span", { className: "checkbox-box " + (checked ? "checkbox-box--checked" : "checkbox-box--unchecked"), "aria-hidden": "true", children: "\u2713" }), _jsxs("span", { className: "checkbox-label-container", children: [_jsx("span", { className: "checkbox-label", children: label }), description && _jsx("span", { className: "checkbox-label-description", children: description })] })] }));
}
export function ImportBookmarksStepBody({ step, state, showInternalHeader = true, busy = false, hasExistingData = true, }) {
    async function handleJsonFileChange(e) {
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
        if (!showInternalHeader)
            return null;
        const { title, subtitle } = getImportBookmarksStepCopy(step);
        return (_jsxs(_Fragment, { children: [_jsx("div", { className: "step-progress", children: _jsxs("span", { children: ["Step ", step, " of ", LAST_STEP] }) }), _jsx("h3", { className: "step-title", children: title }), subtitle && _jsx("p", { className: "step-subtitle", children: subtitle })] }));
    }
    if (step === 1) {
        const importModeOptions = [
            { value: JsonImportMode.Add, label: "Add to existing bookmarks" },
            { value: JsonImportMode.Replace, label: "Replace all existing bookmarks" },
        ];
        return (_jsxs("div", { className: "body-container", children: [
            renderStepHeader(),
            _jsx(YesCheckboxRow, { checked: state.jsonYes, onToggle: () => {
                state.setJsonYes((prev) => {
                    const next = !prev;
                    if (!next) clearJsonSelection();
                    return next;
                });
            }, label: "Yes" }),
            state.jsonYes && (_jsxs("div", { className: "json-input-container", children: [
                state.jsonData
                    ? (_jsxs("div", { className: "json-selected-file-container", children: [
                        "Selected:", " ",
                        _jsx("span", { className: "json-file-name", children: state.jsonFileName ?? "file" }),
                        _jsx("button", { type: "button", className: "json-file-remove", onClick: clearJsonSelection, disabled: busy, children: "Remove" })
                    ] }))
                    : (_jsx("input", { id: "json-file-input", type: "file", accept: "application/json,.json", onChange: handleJsonFileChange, className: "json-input", disabled: busy })),
                state.jsonData && hasExistingData && (_jsx("div", { className: "json-import-mode", children: _jsxs("div", { className: "tabs-container", children: [
                    _jsx("h3", { className: "tabs-header", children: "How should this be imported?" }),
                    _jsx("div", { className: "tabs-windows-container", children:
                        importModeOptions.map(({ value, label }) => {
                            const selected = state.jsonImportMode === value;
                            return _jsxs("button", {
                                type: "button",
                                onClick: () => state.setJsonImportMode(value),
                                disabled: busy,
                                className: `tabs-radio-button-row ${selected ? "tabs-radio-button-row--selected" : "tabs-radio-button-row--unselected"}`,
                                children: [
                                    _jsx("div", { className: `tabs-radio-button-outer-circle ${selected ? "tabs-radio-button-outer-circle--selected" : "tabs-radio-button-outer-circle--unselected"}`, children: selected && _jsx("div", { className: "tabs-radio-button-inner-circle" }) }),
                                    _jsx("span", { className: "tabs-radio-button-text", children: label })
                                ]
                            }, value);
                        })
                    }),
                    state.jsonImportMode === JsonImportMode.Replace && _jsx("p", { className: "json-import-replace-warning", children: "\u26A0 This will permanently delete all your existing workspaces and bookmarks." })
                ] }) }))
            ] }))
        ] }));
    }
    if (step === 2) {
        return (_jsxs("div", { className: "body-container", children: [renderStepHeader(), _jsx(YesCheckboxRow, { checked: state.bookmarksYes, onToggle: () => state.setBookmarksYes((v) => !v), label: "Yes" })] }));
    }
    if (step === 3) {
        return (_jsxs("div", { className: "body-container", children: [renderStepHeader(), _jsx(YesCheckboxRow, { checked: state.tabsYes, onToggle: () => {
                        state.setTabsYes((prev) => {
                            const next = !prev;
                            if (!next)
                                state.setTabScope(OpenTabsScope.All);
                            return next;
                        });
                    }, label: "Yes" }), state.tabsYes && (_jsxs("div", { className: "tabs-container", children: [_jsx("h3", { className: "tabs-header", children: "Which tabs?" }), _jsxs("div", { className: "tabs-windows-container", children: [_jsxs("button", { type: "button", onClick: () => state.setTabScope(OpenTabsScope.All), disabled: busy, className: `tabs-radio-button-row ${state.tabScope === OpenTabsScope.All
                                        ? "tabs-radio-button-row--selected"
                                        : "tabs-radio-button-row--unselected"}`, children: [_jsx("div", { className: `tabs-radio-button-outer-circle ${state.tabScope === OpenTabsScope.All
                                                ? "tabs-radio-button-outer-circle--selected"
                                                : "tabs-radio-button-outer-circle--unselected"}`, children: state.tabScope === OpenTabsScope.All && (_jsx("div", { className: "tabs-radio-button-inner-circle" })) }), _jsx("span", { className: "tabs-radio-button-text", children: "All windows" })] }), _jsxs("button", { type: "button", onClick: () => state.setTabScope(OpenTabsScope.Current), disabled: busy, className: `tabs-radio-button-row ${state.tabScope === OpenTabsScope.Current
                                        ? "tabs-radio-button-row--selected"
                                        : "tabs-radio-button-row--unselected"}`, children: [_jsx("div", { className: `tabs-radio-button-outer-circle ${state.tabScope === OpenTabsScope.Current
                                                ? "tabs-radio-button-outer-circle--selected"
                                                : "tabs-radio-button-outer-circle--unselected"}`, children: state.tabScope === OpenTabsScope.Current && (_jsx("div", { className: "tabs-radio-button-inner-circle" })) }), _jsx("span", { className: "tabs-radio-button-text", children: "Current window" })] })] })] }))] }));
    }
    // step === 4
    const semanticYes = state.postProcessMode === ImportPostProcessMode.SemanticGrouping;
    return (_jsxs("div", { className: "body-container", children: [renderStepHeader(), _jsx("div", { className: "mb-3", children: _jsx(AiDisclosure, { variant: "inline", serviceName: "OpenAI" }) }), _jsx(YesCheckboxRow, { checked: semanticYes, onToggle: () => {
                    state.setPostProcessMode(semanticYes
                        ? ImportPostProcessMode.PreserveStructure
                        : ImportPostProcessMode.SemanticGrouping);
                }, label: "Yes" })] }));
}
