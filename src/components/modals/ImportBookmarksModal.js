import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/* -------------------- Imports -------------------- */
import { useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
/* Constants */
import { JsonImportMode, OpenTabsScope } from "@/core/constants/import";
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
export default function ImportBookmarksModal({ isOpen, onClose }) {
    /* -------------------- Context -------------------- */
    const { userId, activeWorkspaceId, workspaces, bookmarkGroups, bumpWorkspacesVersion } = useContext(AppContext);
    const activeWorkspace = activeWorkspaceId && workspaces ? workspaces[activeWorkspaceId] : null;
    const hasExistingData = (bookmarkGroups ?? []).some((g) => g.id !== "EMPTY_GROUP_IDENTIFIER" && g.groupName !== "EMPTY_GROUP_IDENTIFIER" && g.bookmarks?.length > 0);
    /* ---------------------------------------------------------- */
    /* -------------------- Services -------------------- */
    const workspaceService = useMemo(() => createWorkspaceServiceLocal(userId), [userId]);
    /* ---------------------------------------------------------- */
    /* -------------------- State -------------------- */
    const [view, setView] = useState('select');
    // JSON flow
    const [jsonFileName, setJsonFileName] = useState(null);
    const [jsonData, setJsonData] = useState(null);
    const [jsonImportMode, setJsonImportMode] = useState(JsonImportMode.Add);
    // Chrome flow
    const [chromeImportMode, setChromeImportMode] = useState(JsonImportMode.Add);
    // Tabs flow
    const [tabScope, setTabScope] = useState(OpenTabsScope.All);
    const [tabsImportMode, setTabsImportMode] = useState(JsonImportMode.Add);
    // Shared
    const [busy, setBusy] = useState(false);
    const [busyMessage, setBusyMessage] = useState(undefined);
    const [errorMessage, setErrorMessage] = useState(undefined);
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
    const handleSelectView = (v) => {
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
    async function handleJsonFileChange(e) {
        const file = e.target.files?.[0] ?? null;
        if (!file) { setJsonFileName(null); setJsonData(null); return; }
        try {
            const text = await file.text();
            JSON.parse(text); // throws if invalid
            setJsonFileName(file.name);
            setJsonData(text);
            setErrorMessage(undefined);
        }
        catch {
            setErrorMessage("Invalid JSON file. Please choose a valid .json file.");
        }
    }
    async function runImport(selection) {
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
        }
        catch (e) {
            setErrorMessage(e?.message ?? "Import failed.");
        }
        finally {
            setBusy(false);
            setBusyMessage(undefined);
        }
    }
    /* ---------------------------------------------------------- */
    /* -------------------- Render helpers -------------------- */
    function renderModePicker(mode, setMode) {
        const options = [
            { value: JsonImportMode.Add, label: "Add to existing bookmarks" },
            { value: JsonImportMode.Replace, label: "Replace all existing bookmarks" },
        ];
        return _jsx("div", { className: "json-import-mode", children: _jsxs("div", { className: "tabs-container", children: [
            _jsx("h3", { className: "tabs-header", children: "How should this be imported?" }),
            _jsx("div", { className: "tabs-windows-container", children: options.map(({ value, label }) => {
                const selected = mode === value;
                return _jsxs("button", {
                    type: "button",
                    onClick: () => setMode(value),
                    disabled: busy,
                    className: `tabs-radio-button-row ${selected ? "tabs-radio-button-row--selected" : "tabs-radio-button-row--unselected"}`,
                    children: [
                        _jsx("div", { className: `tabs-radio-button-outer-circle ${selected ? "tabs-radio-button-outer-circle--selected" : "tabs-radio-button-outer-circle--unselected"}`, children: selected && _jsx("div", { className: "tabs-radio-button-inner-circle" }) }),
                        _jsx("span", { className: "tabs-radio-button-text", children: label })
                    ]
                }, value);
            }) }),
            mode === JsonImportMode.Replace && _jsx("p", { className: "json-import-replace-warning", children: "\u26A0 This will permanently delete all your existing bookmarks in this workspace." })
        ] }) });
    }
    function renderFlowFooter(onImport, importDisabled = false) {
        return _jsxs("div", { className: "footer-container", children: [
            _jsx("span", { className: "busy-message", children: busyMessage }),
            _jsxs("div", { className: "flex items-center gap-2", children: [
                _jsx("button", { type: "button", className: "import-button back-button", onClick: handleBack, disabled: busy, children: "Back" }),
                success
                    ? _jsx("button", { type: "button", className: "import-button next-button", onClick: handleClose, children: "Done" })
                    : _jsx("button", { type: "button", className: "import-button next-button", onClick: onImport, disabled: busy || importDisabled, children: busy ? "Importing\u2026" : "Import" })
            ] })
        ] });
    }
    function renderSelectView() {
        return _jsxs("div", { className: "import-options-row", children: [
            _jsxs("button", { type: "button", className: "import-option-card", onClick: () => handleSelectView('chrome'), children: [
                _jsxs("div", { className: "import-option-card-header", children: [
                    _jsx("div", { className: "import-option-card-icon", children: _jsx("img", { src: "/assets/browsers/chrome.png", alt: "Chrome", width: 20, height: 20 }) }),
                    _jsx("div", { className: "import-option-card-title", children: "Chrome Bookmarks" })
                ] }),
                _jsx("div", { className: "import-option-card-subtitle", children: "Import your saved Chrome bookmarks." })
            ] }),
            _jsxs("button", { type: "button", className: "import-option-card", onClick: () => handleSelectView('tabs'), children: [
                _jsxs("div", { className: "import-option-card-header", children: [
                    _jsx("div", { className: "import-option-card-icon import-option-card-icon--tabs", children: _jsx(Globe, { size: 18, strokeWidth: 1.5 }) }),
                    _jsx("div", { className: "import-option-card-title", children: "Open Tabs" })
                ] }),
                _jsx("div", { className: "import-option-card-subtitle", children: "Import all the tabs you currently have open." })
            ] }),
            _jsxs("button", { type: "button", className: "import-option-card", onClick: () => handleSelectView('json'), children: [
                _jsxs("div", { className: "import-option-card-header", children: [
                    _jsx("div", { className: "import-option-card-icon import-option-card-icon--json", children: _jsx(FileJson, { size: 18, strokeWidth: 1.5 }) }),
                    _jsx("div", { className: "import-option-card-title", children: "JSON File" })
                ] }),
                _jsx("div", { className: "import-option-card-subtitle", children: "Import from a previously exported bookmarks JSON file." })
            ] })
        ] });
    }
    function renderJsonFlow() {
        const modeOptions = [
            { value: JsonImportMode.Add, label: "Add to existing bookmarks" },
            { value: JsonImportMode.Replace, label: "Replace all existing bookmarks" },
        ];
        return _jsxs("div", { className: "import-styles", children: [
            _jsx("div", { className: "body-container", children: success
                ? _jsx("p", { className: "step-title", children: "Import complete!" })
                : _jsxs(_Fragment, { children: [
                    jsonData
                        ? _jsxs("div", { className: "json-selected-file-container", children: [
                            "Selected:", " ",
                            _jsx("span", { className: "json-file-name", children: jsonFileName ?? "file" }),
                            _jsx("button", { type: "button", className: "json-file-remove", onClick: () => { setJsonFileName(null); setJsonData(null); }, disabled: busy, children: "Remove" })
                        ] })
                        : _jsx("input", { id: "json-file-input", type: "file", accept: "application/json,.json", onChange: handleJsonFileChange, className: "json-input", disabled: busy }),
                    jsonData && hasExistingData && _jsx("div", { className: "json-import-mode", children: _jsxs("div", { className: "tabs-container", children: [
                        _jsx("h3", { className: "tabs-header", children: "How should this be imported?" }),
                        _jsx("div", { className: "tabs-windows-container", children: modeOptions.map(({ value, label }) => {
                            const selected = jsonImportMode === value;
                            return _jsxs("button", {
                                type: "button",
                                onClick: () => setJsonImportMode(value),
                                disabled: busy,
                                className: `tabs-radio-button-row ${selected ? "tabs-radio-button-row--selected" : "tabs-radio-button-row--unselected"}`,
                                children: [
                                    _jsx("div", { className: `tabs-radio-button-outer-circle ${selected ? "tabs-radio-button-outer-circle--selected" : "tabs-radio-button-outer-circle--unselected"}`, children: selected && _jsx("div", { className: "tabs-radio-button-inner-circle" }) }),
                                    _jsx("span", { className: "tabs-radio-button-text", children: label })
                                ]
                            }, value);
                        }) }),
                        jsonImportMode === JsonImportMode.Replace && _jsx("p", { className: "json-import-replace-warning", children: "\u26A0 This will permanently delete all your existing workspaces and bookmarks." })
                    ] }) }),
                    errorMessage && _jsx("div", { className: "error-message", children: errorMessage })
                ] })
            }),
            renderFlowFooter(() => runImport({ jsonFileName, jsonData, jsonImportMode, importBookmarks: false, workspaceName: "JSON Backup" }), !jsonData)
        ] });
    }
    function renderChromeFlow() {
        return _jsxs("div", { className: "import-styles", children: [
            _jsx("div", { className: "body-container", children: success
                ? _jsx("p", { className: "step-title", children: "Import complete!" })
                : _jsxs(_Fragment, { children: [
                    hasExistingData && renderModePicker(chromeImportMode, setChromeImportMode),
                    errorMessage && _jsx("div", { className: "error-message", children: errorMessage })
                ] })
            }),
            renderFlowFooter(() => runImport({ importBookmarks: true, chromeImportMode, workspaceName: "Chrome Bookmarks" }))
        ] });
    }
    function renderTabsFlow() {
        const scopeOptions = [
            { value: OpenTabsScope.All, label: "All windows" },
            { value: OpenTabsScope.Current, label: "Current window" },
        ];
        return _jsxs("div", { className: "import-styles", children: [
            _jsx("div", { className: "body-container", children: success
                ? _jsx("p", { className: "step-title", children: "Import complete!" })
                : _jsxs(_Fragment, { children: [
                    hasExistingData && renderModePicker(tabsImportMode, setTabsImportMode),
                    _jsx("div", { className: "json-import-mode", children: _jsxs("div", { className: "tabs-container", children: [
                        _jsx("h3", { className: "tabs-header", children: "Which tabs?" }),
                        _jsx("div", { className: "tabs-windows-container", children: scopeOptions.map(({ value, label }) => {
                            const selected = tabScope === value;
                            return _jsxs("button", {
                                type: "button",
                                onClick: () => setTabScope(value),
                                disabled: busy,
                                className: `tabs-radio-button-row ${selected ? "tabs-radio-button-row--selected" : "tabs-radio-button-row--unselected"}`,
                                children: [
                                    _jsx("div", { className: `tabs-radio-button-outer-circle ${selected ? "tabs-radio-button-outer-circle--selected" : "tabs-radio-button-outer-circle--unselected"}`, children: selected && _jsx("div", { className: "tabs-radio-button-inner-circle" }) }),
                                    _jsx("span", { className: "tabs-radio-button-text", children: label })
                                ]
                            }, value);
                        }) })
                    ] }) }),
                    errorMessage && _jsx("div", { className: "error-message", children: errorMessage })
                ] })
            }),
            renderFlowFooter(() => runImport({ tabScope, tabsImportMode, workspaceName: "Open Tabs" }))
        ] });
    }
    /* ---------------------------------------------------------- */
    /* -------------------- Main render -------------------- */
    if (!isOpen) return null;
    const titleMap = {
        select: 'Import bookmarks',
        json: 'JSON File',
        chrome: 'Chrome Bookmarks',
        tabs: 'Open Tabs',
    };
    const modal = _jsx("div", { className: "modal-import-styles", children: _jsxs("div", { className: "modal-container", role: "dialog", "aria-modal": "true", children: [
        _jsx("div", { className: "modal-backdrop", onClick: handleClose }),
        _jsxs("div", { className: "modal-panel", onClick: (e) => e.stopPropagation(), children: [
            _jsxs("div", { className: "modal-header-container", children: [
                _jsx("h2", { className: "modal-title", children: titleMap[view] }),
                _jsx("button", { type: "button", onClick: handleClose, disabled: busy, className: "close-button", "aria-label": "Close", children: "\u2715" })
            ] }),
            view === 'select' && renderSelectView(),
            view === 'json' && renderJsonFlow(),
            view === 'chrome' && renderChromeFlow(),
            view === 'tabs' && renderTabsFlow()
        ] })
    ] }) });
    return createPortal(modal, document.body);
    /* ---------------------------------------------------------- */
}
