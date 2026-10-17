// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */

import { coreMethods } from "./methods/core";
import { groupsMethods } from "./methods/groups";
import { modelsMethods } from "./methods/models";
import { shellMethods } from "./methods/shell";
import { dashboardMethods } from "./methods/dashboard";
import { editorMethods } from "./methods/editor";
import { builderMethods } from "./methods/builder";
import { libraryMethods } from "./methods/library";
import { templatesMethods } from "./methods/templates";
import { patternsMethods } from "./methods/patterns";
import { compareMethods } from "./methods/compare";
import { chainsMethods } from "./methods/chains";
import { onboardingMethods } from "./methods/onboarding";
import { historyMethods } from "./methods/history";
import { analyticsMethods } from "./methods/analytics";
import { settingsMethods } from "./methods/settings";
import { editorToolsMethods } from "./methods/editorTools";
import { importExportMethods } from "./methods/importExport";
import { promptModalsMethods } from "./methods/promptModals";
import { actionsMethods } from "./methods/actions";

export class UIManager {
  constructor({ storage, promptEngine, suggestionEngine, versionManager, searchEngine, analyticsEngine }){
    this.storage = storage;
    this.pe = promptEngine;
    this.suggest = suggestionEngine;
    this.versions = versionManager;
    this.search = searchEngine;
    this.analytics = analyticsEngine;

    this.workspace = document.getElementById("workspace");
    this.toastStack = document.getElementById("toastStack");
    this.modalRoot = document.getElementById("modalRoot");
    this.paletteRoot = document.getElementById("paletteRoot");

    this.state = {
      view: "dashboard",
      theme: storage.getSetting("theme", "dark"),
      navCollapsed: storage.getSetting("navCollapsed", false),
      editor: { promptId: null, title: "", body: "", dirty: false, blocks: null, format: "text" },
      library: { query: "", category: "all", tag: null, group: null, sort: "updated", filterFav: false, filterArchived: false, compareMode: false, pageSize: 50, page: 0 },
      compare: { selectedIds: [], pickerQuery: "" },
      templates: { query: "", group: null, selectMode: false, selectedIds: [], pageSize: 50, page: 0 },
      patterns: { query: "", category: "all", tab: "all", group: null, selectMode: false, selectedIds: [], pageSize: 50, page: 0 },
      chains: { activeChainId: null, editingChain: null },
      builder: { blocks: [], expandedStructureGroups: new Set() },
      modelMgmt: { expandedGroups: new Set(), selectMode: false, selectedIds: [], hideBuiltins: false },
      history: { query: "", onlyWithVersions: false },
      shortcuts: { query: "", selectMode: false, selectedIds: [], pageSize: 50, page: 0 },
      settings: storage.getSetting("appSettings", {
        autoSaveDrafts: true, suggestionsEnabled: true, analyzerLive: true,
        editorFont: "jetbrains", editorZoom: 14, editorTabWidth: 2, editorLineHeight: "relaxed",
        defaultCategory: "custom", defaultOutputFormat: "none",
        autosaveInterval: "900", versionRetention: "25",
        wordCountWarning: 0, syntaxHighlighting: true, showGutter: true,
        selectedModel: "claude", scoringProfile: "default", focusMode: false,
        onboardingSeen: false,
        volumeCallsPerMonth: 1000,
        // Whole-app UI scale (not to be confused with editorZoom, which
        // only resizes the editor's own font). 100 = default; applied as a
        // CSS zoom on <html> in _applyUiScale() so every view, modal, and
        // dropdown scales together rather than just one panel.
        uiScale: 100
      }),
      challengeProgress: storage.getSetting("challengeProgress", {}),
      paletteOpen: false
    };

    this._suggestionPopup = { open: false, items: [], activeIndex: 0, kind: null };
    this._autoSaveTimer = null;
    this._toastId = 0;
    this._applyUiScale();

    // Model & Tokens: merge any custom models a prompt engineer added in
    // Settings into the live CONFIG.MODELS list, so every dropdown that
    // reads CONFIG.MODELS (editor side panel, Settings default-model picker,
    // "Copy as…", cost estimator) picks them up automatically with no
    // separate wiring per surface. Custom models always use the estimate
    // path — only the OpenAI cl100k_base vocab ships in this app.
    this._loadCustomModels();
  }
}

// The original class was a single 7,500-line body. It is split by feature into
// method groups (one file each) and mixed back in here — behaviour is identical.
export interface UIManager { [method: string]: any }
Object.assign(UIManager.prototype, coreMethods, groupsMethods, modelsMethods, shellMethods, dashboardMethods, editorMethods, builderMethods, libraryMethods, templatesMethods, patternsMethods, compareMethods, chainsMethods, onboardingMethods, historyMethods, analyticsMethods, settingsMethods, editorToolsMethods, importExportMethods, promptModalsMethods, actionsMethods);
