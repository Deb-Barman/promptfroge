// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { TemplateEngine } from "../../core/TemplateEngine";
import { Utils } from "../../core/Utils";
import { CONFIG } from "../../core/CONFIG";
import { TokenEstimator } from "../../core/TokenEstimator";

/** UIManager methods: actions. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const actionsMethods = {
  /* ---------------------------------------------------------------------- */
  /* DELEGATED EVENT HANDLING — every data-action="…" attribute in every    */
  /* view funnels through here, so views themselves stay pure render        */
  /* functions with no inline event wiring beyond a few local exceptions    */
  /* (drag/drop, suggestion popup, form inputs handled at mount time).      */
  /* ---------------------------------------------------------------------- */
  _delegatedClick(e){
    const stopEl = e.target.closest("[data-stop-propagation]");
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    if (stopEl && stopEl !== actionEl && !stopEl.contains(actionEl)) return;
    // If a menu button inside a clickable card was hit, don't also trigger
    // the card's own open action (menu buttons live inside data-stop-propagation wrappers).
    if (stopEl && actionEl !== stopEl && stopEl.contains(actionEl)){
      // proceed with the specific button's action, but prevent the card click too
    }
    e.stopPropagation();
    const action = actionEl.dataset.action;
    this._runAction(action);
  },

  async _runAction(action){
    const [cmd, ...rest] = action.split(":");
    const arg = rest.join(":");

    switch(cmd){
      case "new-prompt": this.openNewPromptModal(); break;
      case "new-template": this.openTemplateEditorModal(null); break;
      case "open-prompt": this.openPromptViewModal(arg); break;
      case "open-template": this.openTemplateFillModal(arg); break;
      case "edit-template": this.openTemplateEditorModal(arg); break;
      case "templates-filter-group": this.state.templates.group = (this.state.templates.group === arg ? null : arg); this.state.templates.page = 0; this.renderView(); break;
      case "templates-clear-group": this.state.templates.group = null; this.state.templates.page = 0; this.renderView(); break;
      case "templates-toggle-select-mode": this.state.templates.selectMode = !this.state.templates.selectMode; this.state.templates.selectedIds = []; this.renderView(); break;
      case "templates-page-prev": this.state.templates.page = Math.max(0, this.state.templates.page - 1); this.renderView(); break;
      case "templates-page-next": this.state.templates.page += 1; this.renderView(); break;
      case "templates-toggle-select": {
        const ids = this.state.templates.selectedIds;
        const i = ids.indexOf(arg);
        if (i === -1) ids.push(arg); else ids.splice(i, 1);
        this.renderView();
        break;
      }
      case "templates-clear-selection": this.state.templates.selectedIds = []; this.renderView(); break;
      case "templates-bulk-group": this.openGroupPickerModal("templates", this.state.templates.selectedIds); break;
      case "templates-bulk-delete": {
        const ids = this.state.templates.selectedIds;
        if (!ids.length) break;
        this.confirmDialog({ title: `Delete ${ids.length} template${ids.length===1?'':'s'}?`, message: "This can't be undone.", danger: true, confirmLabel: "Delete", onConfirm: async () => {
          for (const id of ids) await this.pe.deleteTemplate(id);
          await this.pe.removeManyFromAllGroups("templates", ids);
          this.state.templates.selectedIds = [];
          this.toast(`Deleted ${ids.length} template${ids.length===1?'':'s'}.`, "info");
          this.renderView();
        }});
        break;
      }
      case "patterns-filter-group": this.state.patterns.group = (this.state.patterns.group === arg ? null : arg); this.state.patterns.page = 0; this.renderView(); break;
      case "patterns-clear-group": this.state.patterns.group = null; this.state.patterns.page = 0; this.renderView(); break;
      case "patterns-toggle-select-mode": this.state.patterns.selectMode = !this.state.patterns.selectMode; this.state.patterns.selectedIds = []; this.renderView(); break;
      case "patterns-page-prev": this.state.patterns.page = Math.max(0, this.state.patterns.page - 1); this.renderView(); break;
      case "patterns-page-next": this.state.patterns.page += 1; this.renderView(); break;
      case "patterns-toggle-select": {
        const ids = this.state.patterns.selectedIds;
        const i = ids.indexOf(arg);
        if (i === -1) ids.push(arg); else ids.splice(i, 1);
        this.renderView();
        break;
      }
      case "patterns-clear-selection": this.state.patterns.selectedIds = []; this.renderView(); break;
      case "patterns-bulk-group": this.openGroupPickerModal("patterns", this.state.patterns.selectedIds); break;
      case "patterns-bulk-delete": {
        // Built-in patterns aren't deletable — silently skip any selected
        // built-ins rather than erroring, since "Select" mode lets someone
        // select across both built-in and custom patterns at once.
        const ids = this.state.patterns.selectedIds.filter(id => id.startsWith("cpat_"));
        if (!ids.length){ this.toast("Only your own patterns can be deleted — built-ins are read-only.", "info"); break; }
        this.confirmDialog({ title: `Delete ${ids.length} pattern${ids.length===1?'':'s'}?`, message: "This can't be undone.", danger: true, confirmLabel: "Delete", onConfirm: async () => {
          for (const id of ids) await this.pe.deleteCustomPattern(id);
          await this.pe.removeManyFromAllGroups("patterns", ids);
          this.state.patterns.selectedIds = [];
          this.toast(`Deleted ${ids.length} pattern${ids.length===1?'':'s'}.`, "info");
          this.renderView();
        }});
        break;
      }
      case "manage-groups": this.openManageGroupsModal(arg); break;
      case "delete-template":
        this.confirmDialog({ title: "Delete template?", message: "This can't be undone.", danger: true, confirmLabel: "Delete", onConfirm: async () => {
          await this.pe.deleteTemplate(arg); this.toast("Template deleted.", "info"); this.renderView();
        }});
        break;
      case "open-pattern": this.openPatternModal(arg); break;
      case "compare-toggle": this._toggleCompareSelection(arg); break;
      case "compare-clear": this.state.compare.selectedIds = []; this.renderCompare(); break;
      case "new-chain": this.openChainEditorModal(null); break;
      case "quick-capture": this.openQuickCaptureModal(); break;
      case "open-shortcuts": this.openShortcutsModal(); break;
      case "settings-replay-onboarding": this.openWelcomeModal(); break;
      case "nav": this.navigate(arg); break;
      case "open-chain": this.openChainEditorModal(arg); break;
      case "new-custom-pattern": this.openCustomPatternEditorModal(null); break;
      case "edit-custom-pattern": this.openCustomPatternEditorModal(arg); break;
      case "delete-custom-pattern": {
        const cp = this.pe.getCustomPattern(arg);
        this.confirmDialog({ title: "Delete pattern?", message: `Delete "${cp?.name || 'this pattern'}"? This can't be undone.`, danger: true, confirmLabel: "Delete", onConfirm: async () => {
          await this.pe.deleteCustomPattern(arg);
          this.toast("Pattern deleted.", "info");
          this.renderView();
        }});
        break;
      }
      case "pattern-tab": this.state.patterns.tab = arg; this.state.patterns.page = 0; this.renderView(); break;
      case "open-challenge": this.openChallengeModal(arg); break;

      case "toggle-fav": await this.pe.toggleFavorite(arg); this.renderView(); break;
      case "toggle-best-of": await this.pe.toggleBestOf(arg); this.renderView(); break;
      case "open-status-modal": this.openStatusModal(arg); break;
      case "toggle-pin": await this.pe.togglePin(arg); this.renderView(); break;
      case "archive-prompt": await this.pe.toggleArchive(arg); this.renderView(); break;
      case "copy-prompt-text": {
        const p = this.pe.getPrompt(arg);
        if (!p) break;
        const ok = await this._copyToClipboard(p.body || "");
        this.toast(ok ? "Prompt copied." : "Copy failed — clipboard unavailable.", ok ? "success" : "warn", 1800);
        break;
      }
      case "duplicate-prompt": {
        const copy = await this.pe.duplicatePrompt(arg);
        if (copy) this.toast("Prompt duplicated.", "success", 1800);
        this.renderView();
        break;
      }
      case "delete-prompt": {
        const p = this.pe.getPrompt(arg);
        this.confirmDialog({ title: "Delete prompt?", message: `Delete "${p?.title || 'this prompt'}"? This can't be undone.`, danger: true, confirmLabel: "Delete", onConfirm: async () => {
          await this.pe.deletePrompt(arg);
          this.toast("Prompt deleted.", "info");
          if (this.state.editor.promptId === arg) this._newEditorDraft();
          this.renderView();
        }});
        break;
      }

      case "lib-toggle-fav": this.state.library.filterFav = !this.state.library.filterFav; this.state.library.page = 0; this.renderView(); break;
      case "lib-toggle-archived": this.state.library.filterArchived = !this.state.library.filterArchived; this.state.library.page = 0; this.renderView(); break;
      case "lib-clear-tag": this.state.library.tag = null; this.state.library.page = 0; this.renderView(); break;
      case "lib-filter-tag": this.state.library.tag = arg; this.state.library.page = 0; this.renderView(); break;
      case "library-filter-group": this.state.library.group = (this.state.library.group === arg ? null : arg); this.state.library.page = 0; this.renderView(); break;
      case "lib-clear-group": this.state.library.group = null; this.state.library.page = 0; this.renderView(); break;
      case "lib-clear-filters": this.state.library.query = ""; this.state.library.category = "all"; this.state.library.tag = null; this.state.library.group = null; this.state.library.filterFav = false; this.state.library.page = 0; this.renderView(); break;
      case "lib-page-prev": this.state.library.page = Math.max(0, this.state.library.page - 1); this.renderView(); break;
      case "lib-page-next": this.state.library.page += 1; this.renderView(); break;
      case "lib-toggle-compare-mode": this.state.library.compareMode = !this.state.library.compareMode; this.renderView(); break;
      case "lib-external-diff": this.openExternalDiffModal(); break;
      case "lib-clear-compare-selection": this.state.compare.selectedIds = []; this.renderView(); break;
      case "lib-bulk-archive": {
        const ids = this.state.compare.selectedIds;
        await this.pe.bulkArchive(ids, true);
        this.state.compare.selectedIds = [];
        this.toast(`Archived ${ids.length} prompt${ids.length===1?'':'s'}.`, "success", 1800);
        this.renderView();
        break;
      }
      case "lib-bulk-delete": {
        const ids = this.state.compare.selectedIds;
        this.confirmDialog({
          title: `Delete ${ids.length} prompt${ids.length===1?'':'s'}?`,
          message: "This can't be undone. Their version history will be deleted too.",
          danger: true, confirmLabel: "Delete",
          onConfirm: async () => {
            await this.pe.bulkDelete(ids);
            this.state.compare.selectedIds = [];
            this.toast(`Deleted ${ids.length} prompt${ids.length===1?'':'s'}.`, "info", 1800);
            this.renderView();
          }
        });
        break;
      }
      case "lib-bulk-tag": this.openBulkTagModal(); break;
      case "lib-bulk-group": this.openGroupPickerModal("library", this.state.compare.selectedIds); break;
      case "lib-bulk-category": this.openBulkCategoryModal(); break;
      case "lib-go-compare": this.navigate("compare"); break;
      case "dupe-dismiss":
        if (!this._dismissedDuplicateClusters) this._dismissedDuplicateClusters = new Set();
        this._dismissedDuplicateClusters.add(arg);
        this.renderView();
        break;
      case "dupe-review":
        this.state.compare.selectedIds = arg.split(",");
        this.navigate("compare");
        break;
      case "lib-save-search": this.openSaveSearchModal(); break;
      case "lib-apply-search": {
        const s = this.pe.getSavedSearch(arg);
        if (s){
          this.state.library.query = s.query || "";
          this.state.library.category = s.category || "all";
          this.state.library.tag = s.tag || null;
          this.state.library.filterFav = !!s.filterFav;
          this.state.library.sort = s.sort || "updated";
          this.renderView();
        }
        break;
      }
      case "lib-delete-search": await this.pe.deleteSavedSearch(arg); this.renderView(); break;

      case "editor-save": await this._saveEditorPrompt(true); break;
      case "editor-download": this._openEditorDownloadMenu(document.getElementById("editorDownloadBtn")); break;
      case "editor-version": this.openVersionNoteModal(); break;
      case "editor-clean": this._runCleanerOnEditor(); break;
      case "editor-improve": this.openImproverModal(); break;
      case "editor-security": this.openSecurityModal(); break;
      case "editor-find": this._toggleFindReplace(); break;
      case "editor-insert-block": this._insertEditorBlockHeader(arg); break;
      case "editor-zoom-in": this._adjustEditorZoom(1); break;
      case "editor-zoom-out": this._adjustEditorZoom(-1); break;
      case "editor-copy-as": this.openCopyAsModal(); break;
      case "editor-wrap-xml": this._wrapEditorInXML(); break;
      case "editor-adapt-model": this.openAdaptModal(); break;
      case "editor-insert-constraint": this.openConstraintPicker(); break;
      case "editor-extract-variables": this.openExtractVariablesModal(); break;
      case "editor-few-shot-builder": this.openFewShotBuilder(); break;
      case "editor-edge-cases": this.openEdgeCaseChecklist(); break;
      case "editor-shorten": this._runShortenOnEditor(); break;
      case "editor-bulletify": this._runBulletifyOnEditor(); break;
      case "editor-add-cot": this._runAddCotOnEditor(); break;
      case "editor-more-tools": this.openMoreToolsMenu(); break;
      case "open-shortcuts-manager": this.navigate("shortcuts"); break;
      case "shortcuts-add-new": this.openSnippetEditorModal(null); break;
      case "shortcuts-edit": this.openSnippetEditorModal(arg); break;
      case "shortcuts-import": this.openShortcutsManagerModal("import-only"); break;
      case "shortcuts-toggle-select-mode": this.state.shortcuts.selectMode = !this.state.shortcuts.selectMode; this.state.shortcuts.selectedIds = []; this.renderView(); break;
      case "shortcuts-toggle-select":
        if (this.state.shortcuts.selectedIds.includes(arg)) this.state.shortcuts.selectedIds = this.state.shortcuts.selectedIds.filter(id => id !== arg);
        else this.state.shortcuts.selectedIds = [...this.state.shortcuts.selectedIds, arg];
        this.renderView();
        break;
      case "shortcuts-clear-selection": this.state.shortcuts.selectedIds = []; this.renderView(); break;
      case "shortcuts-page-prev": this.state.shortcuts.page = Math.max(0, this.state.shortcuts.page - 1); this.renderView(); break;
      case "shortcuts-page-next": this.state.shortcuts.page += 1; this.renderView(); break;
      case "shortcuts-delete": {
        const s = this.pe.getSnippet(arg);
        this.confirmDialog({ title: "Delete this shortcut?", message: `Delete "${s?.trigger || 'this shortcut'}"?`, danger: true, confirmLabel: "Delete", onConfirm: async () => {
          await this.pe.deleteSnippet(arg);
          this.toast("Shortcut deleted.", "info");
          this.renderView();
        }});
        break;
      }
      case "shortcuts-bulk-delete": {
        const ids = this.state.shortcuts.selectedIds;
        if (!ids.length) break;
        this.confirmDialog({ title: `Delete ${ids.length} shortcut${ids.length===1?'':'s'}?`, message: "This can't be undone.", danger: true, confirmLabel: "Delete", onConfirm: async () => {
          for (const id of ids) await this.pe.deleteSnippet(id);
          this.state.shortcuts.selectedIds = [];
          this.state.shortcuts.selectMode = false;
          this.toast(`${ids.length} shortcut${ids.length===1?'':'s'} deleted.`, "info");
          this.renderView();
        }});
        break;
      }
      case "open-date-search": this.openDateSearchModal(); break;
      case "open-graph-view": this.navigate("graph"); break;
      case "graph-refresh": this.renderGraphView(); break;
      case "close-graph-view": this.navigate("dashboard"); break;
      case "close-shortcuts": this.navigate("editor"); break;
      case "editor-tableify": this._runTableifyOnEditor(); break;
      case "editor-tone-shift": this.openToneShiftModal(); break;
      case "editor-insert-persona": this.openPersonaPickerModal(); break;
      case "editor-scan-ambiguity": this.openAmbiguityModal(); break;
      case "editor-scan-adversarial": this.openAdversarialScanModal(); break;
      case "editor-audience-framing": this.openAudienceFramingModal(); break;
      case "editor-find-redundancy": this.openRedundancyModal(); break;
      case "editor-undo": this._editorUndo(); break;
      case "editor-redo": this._editorRedo(); break;
      case "editor-toggle-focus": this._toggleFocusMode(); break;
      case "editor-new":
        if (this.state.editor.dirty) await this._saveEditorPrompt(false, true);
        this._newEditorDraft(); this.renderEditor();
        break;
      case "toggle-score-explain":
        if (!this._expandedScoreBars) this._expandedScoreBars = new Set();
        if (this._expandedScoreBars.has(arg)) this._expandedScoreBars.delete(arg); else this._expandedScoreBars.add(arg);
        this._updateEditorSidePanel();
        break;

      case "builder-clear": this.state.builder.blocks = []; this.renderBuilder(); break;
      case "builder-add-custom": this.openCustomBlockModal(); break;
      case "new-builder-structure": this.openNewBuilderStructureModal(false); break;
      case "save-canvas-as-structure": this.openNewBuilderStructureModal(true); break;
      case "apply-builder-structure": {
        const structure = this.pe.getBuilderStructure(arg);
        if (!structure) break;
        if (this.state.builder.blocks.some(b => b.text && b.text.trim())){
          this.confirmDialog({ title: "Replace current canvas?", message: `Applying "${structure.name}" replaces the blocks currently on the canvas. Any text you've written in them will be lost.`, danger: true, confirmLabel: "Replace", onConfirm: () => {
            this._applyBuilderStructure(structure);
          }});
        } else {
          this._applyBuilderStructure(structure);
        }
        break;
      }
      case "delete-builder-structure":
        this.confirmDialog({ title: "Delete this structure?", message: "This can't be undone.", danger: true, confirmLabel: "Delete", onConfirm: async () => {
          await this.pe.deleteBuilderStructure(arg);
          this.toast("Structure deleted.", "info");
          this.renderBuilder();
        }});
        break;
      case "builder-toggle-builtin-group":
        if (this.state.builder.expandedStructureGroups.has("builtin")) this.state.builder.expandedStructureGroups.delete("builtin");
        else this.state.builder.expandedStructureGroups.add("builtin");
        this.renderBuilder();
        break;
      case "builder-compose": {
        const composed = TemplateEngine.composeFromBlocks(this.state.builder.blocks);
        if (!composed.trim()){ this.toast("Add some content to your blocks first.", "warn"); break; }
        // Preserve label/color for custom blocks — they have no CONFIG.BLOCK_TYPES
        // entry to look those up from later, unlike built-in types where `type`
        // alone is enough (blockMeta/dnaProfile resolve those from CONFIG).
        this.state.editor = { promptId: null, title: "", body: composed, dirty: true, blocks: this.state.builder.blocks.map(b => ({ type: b.type, text: b.text, label: b.label, color: b.color })), format: "text" };
        this.navigate("editor");
        this.toast("Composed into the editor.", "success", 1800);
        break;
      }
      case "builder-remove": this.state.builder.blocks = this.state.builder.blocks.filter(b => b.id !== arg); this.renderBuilder(); break;
      case "builder-dup": {
        const idx = this.state.builder.blocks.findIndex(b => b.id === arg);
        if (idx > -1){
          const src = this.state.builder.blocks[idx];
          this.state.builder.blocks.splice(idx + 1, 0, { id: Utils.uid("blk"), type: src.type, text: src.text });
          this.renderBuilder();
        }
        break;
      }

      case "history-select": this._activeHistoryPromptId = arg; this._renderHistoryDetail(arg); break;
      case "history-open-editor": this._loadPromptIntoEditor(arg); this.navigate("editor"); break;
      case "history-restore": {
        const [promptId, versionId] = arg.split(":");
        this.confirmDialog({ title: "Restore this version?", message: "This will overwrite the current content (a new version recording the restore will be created).", confirmLabel: "Restore", onConfirm: async () => {
          await this.versions.restoreVersion(promptId, versionId);
          this.toast("Version restored.", "success");
          this._renderHistoryDetail(promptId);
        }});
        break;
      }
      case "history-diff": {
        const [promptId, oldId, newId] = arg.split(":");
        const versions = await this.versions.listVersions(promptId);
        const oldV = versions.find(v => v.id === oldId), newV = versions.find(v => v.id === newId);
        if (oldV && newV) this.openDiffModal(oldV, newV);
        break;
      }

      case "settings-theme-toggle": this._toggleTheme(); this.renderSettings(); break;
      case "new-custom-model": this.openCustomModelModal(null); break;
      case "edit-custom-model": this.openCustomModelModal(arg); break;
      case "delete-custom-model":
        this.confirmDialog({ title: "Delete this model?", message: "It will be removed from every Model & Tokens picker in the app.", danger: true, confirmLabel: "Delete", onConfirm: () => {
          const list = this.storage.getSetting("customModels", []).filter(m => m.id !== arg);
          this._saveCustomModels(list);
          if (this.state.settings.selectedModel === arg) this.state.settings.selectedModel = "claude";
          this.toast("Model deleted.", "info");
          this.renderSettings();
        }});
        break;
      case "model-toggle-group":
        if (this.state.modelMgmt.expandedGroups.has(arg)) this.state.modelMgmt.expandedGroups.delete(arg);
        else this.state.modelMgmt.expandedGroups.add(arg);
        this.renderSettings();
        break;
      case "model-toggle-select-mode":
        this.state.modelMgmt.selectMode = !this.state.modelMgmt.selectMode;
        this.state.modelMgmt.selectedIds = [];
        this.renderSettings();
        break;
      case "model-toggle-select":
        if (this.state.modelMgmt.selectedIds.includes(arg)) this.state.modelMgmt.selectedIds = this.state.modelMgmt.selectedIds.filter(id => id !== arg);
        else this.state.modelMgmt.selectedIds = [...this.state.modelMgmt.selectedIds, arg];
        this.renderSettings();
        break;
      case "model-bulk-delete": {
        const ids = this.state.modelMgmt.selectedIds;
        if (!ids.length) break;
        this.confirmDialog({ title: `Delete ${ids.length} model${ids.length===1?'':'s'}?`, message: "They'll be removed from every Model & Tokens picker in the app.", danger: true, confirmLabel: "Delete", onConfirm: () => {
          const list = this.storage.getSetting("customModels", []).filter(m => !ids.includes(m.id));
          this._saveCustomModels(list);
          if (ids.includes(this.state.settings.selectedModel)) this.state.settings.selectedModel = "claude";
          this.state.modelMgmt.selectedIds = [];
          this.state.modelMgmt.selectMode = false;
          this.toast(`${ids.length} model${ids.length===1?'':'s'} deleted.`, "info");
          this.renderSettings();
        }});
        break;
      }
      case "settings-export": this.openExportModal(); break;
      case "settings-import": this.openImportModal(); break;
      case "settings-zoom": this._adjustSettingsStepper("zoom", parseInt(arg, 10)); break;
      case "settings-tabwidth": this._adjustSettingsStepper("tabwidth", parseInt(arg, 10)); break;
      case "settings-uiscale": this._adjustSettingsStepper("uiscale", parseInt(arg, 10)); break;
      case "settings-uiscale-reset": this.state.settings.uiScale = 100; this._applyUiScale(); this.storage.setSetting("appSettings", this.state.settings); this.renderSettings(); break;

      case "settings-clear-prompts":
        this.confirmDialog({ title: "Clear all prompts?", message: "This deletes every prompt and its version history. Templates, snippets, and patterns are kept. This cannot be undone.", danger: true, confirmLabel: "Clear prompts", onConfirm: async () => {
          for (const store of ["prompts", "versions", "history"]) await this.storage.clearStore(store);
          this.pe.prompts.clear();
          this.suggest.rebuildFromCorpus();
          this._newEditorDraft();
          this.toast("All prompts cleared.", "info");
          this.navigate("dashboard");
        }});
        break;
      case "settings-clear-templates":
        this.confirmDialog({ title: "Clear templates & snippets?", message: "This deletes every template and /shortcut you've added. This cannot be undone.", danger: true, confirmLabel: "Clear", onConfirm: async () => {
          for (const store of ["templates", "snippets"]) await this.storage.clearStore(store);
          this.pe.templates.clear(); this.pe.snippets.clear();
          await this.pe.load();
          this.suggest.rebuildFromCorpus();
          this.toast("Templates and shortcuts cleared.", "info");
          this.renderView();
        }});
        break;
      case "settings-clear-shortcuts":
        this.confirmDialog({ title: "Clear shortcuts?", message: "This permanently deletes every /shortcut you've added, from this browser. This cannot be undone.", danger: true, confirmLabel: "Clear", onConfirm: async () => {
          await this.storage.clearStore("snippets");
          this.pe.snippets.clear();
          this.toast("Shortcuts cleared.", "info");
          this.renderView();
        }});
        break;
      case "settings-clear-patterns":
        this.confirmDialog({ title: "Clear custom patterns?", message: "This deletes every pattern you've created. Built-in patterns are untouched. This cannot be undone.", danger: true, confirmLabel: "Clear", onConfirm: async () => {
          await this.storage.clearStore("customPatterns");
          this.pe.customPatterns.clear();
          this.toast("Custom patterns cleared.", "info");
          this.renderView();
        }});
        break;
      case "settings-clear-chains":
        this.confirmDialog({ title: "Clear chains?", message: "This deletes every saved chain. The prompts they reference are untouched. This cannot be undone.", danger: true, confirmLabel: "Clear", onConfirm: async () => {
          await this.storage.clearStore("chains");
          this.pe.chains.clear();
          this.toast("Chains cleared.", "info");
          this.renderView();
        }});
        break;
      case "settings-clear-history":
        this.confirmDialog({ title: "Clear history?", message: "This deletes every saved version snapshot across all prompts. Prompts themselves keep their current text — only the ability to look back at or restore older versions is removed. This cannot be undone.", danger: true, confirmLabel: "Clear", onConfirm: async () => {
          await this.storage.clearStore("versions");
          this.toast("Version history cleared.", "info");
          this.renderView();
        }});
        break;
      case "settings-clear-groups":
        this.confirmDialog({ title: "Clear groups?", message: "This removes every group from Library, Templates, and Patterns. The prompts, templates, and patterns themselves are untouched. This cannot be undone.", danger: true, confirmLabel: "Clear", onConfirm: async () => {
          await this.storage.clearStore("groups");
          this.pe.groups.clear();
          this.state.library.group = null; this.state.templates.group = null; this.state.patterns.group = null;
          this.toast("Groups cleared.", "info");
          this.renderView();
        }});
        break;
      case "settings-clear-structures":
        this.confirmDialog({ title: "Clear saved structures?", message: "This deletes every structure you've saved in the Visual Builder. The built-in structures are untouched. This cannot be undone.", danger: true, confirmLabel: "Clear", onConfirm: async () => {
          await this.storage.clearStore("builderStructures");
          this.pe.builderStructures.clear();
          this.toast("Saved structures cleared.", "info");
          this.renderView();
        }});
        break;
      case "settings-clear-all":
        this.confirmDialog({ title: "Clear all data?", message: "This permanently deletes every prompt, template, snippet, pattern, chain, version, group, saved structure, custom model, and saved setting stored in this browser. This cannot be undone.", danger: true, confirmLabel: "Clear everything", onConfirm: async () => {
          // Two separate storage layers both need wiping: the IndexedDB
          // object stores (prompts, templates, versions, groups, ...) AND
          // the localStorage-backed settings namespace (appSettings,
          // customModels, challengeProgress, theme, ...) — clearing only
          // the stores left every setting behind, which is what made
          // "Clear everything" look like it hadn't actually cleared
          // everything.
          for (const store of CONFIG.STORES) await this.storage.clearStore(store);
          this.storage.clearAllSettings();
          this.pe.prompts.clear(); this.pe.templates.clear(); this.pe.snippets.clear();
          this.pe.customPatterns.clear(); this.pe.chains.clear(); this.pe.savedSearches.clear(); this.pe.groups.clear();
          this.pe.builderStructures.clear();
          // CONFIG.MODELS gets custom entries merged in at runtime by
          // _loadCustomModels() — with customModels now gone from storage,
          // re-running it drops them from the live list too.
          this._loadCustomModels();
          // Reset every in-memory setting back to the same defaults used
          // on first load, so the running app reflects a true clean slate
          // immediately rather than only after a manual reload.
          this.state.settings = {
            autoSaveDrafts: true, suggestionsEnabled: true, analyzerLive: true,
            editorFont: "jetbrains", editorZoom: 14, editorTabWidth: 2, editorLineHeight: "relaxed",
            defaultCategory: "custom", defaultOutputFormat: "none",
            autosaveInterval: "900", versionRetention: "25",
            wordCountWarning: 0, syntaxHighlighting: true, showGutter: true,
            selectedModel: "claude", scoringProfile: "default", focusMode: false,
            onboardingSeen: false, volumeCallsPerMonth: 1000, uiScale: 100
          };
          this.state.challengeProgress = {};
          this._applyUiScale();
          this.state.theme = "dark";
          document.body.setAttribute("data-theme", "dark");
          this._syncThemeIcon();
          this.state.library = { query: "", category: "all", tag: null, group: null, sort: "updated", filterFav: false, filterArchived: false, compareMode: false, pageSize: 50, page: 0 };
          this.state.templates = { query: "", group: null, selectMode: false, selectedIds: [] };
          this.state.patterns = { query: "", category: "all", tab: "all", group: null, selectMode: false, selectedIds: [] };
          this.state.compare = { selectedIds: [], pickerQuery: "" };
          await this.pe.load();
          this.suggest.rebuildFromCorpus();
          this._newEditorDraft();
          this.toast("All data cleared.", "info");
          this.navigate("dashboard");
        }});
        break;

      default: break;
    }
  },

  _delegatedInput(e){
    const t = e.target;
    if (t.id === "editorTitleInput"){
      this.state.editor.title = t.value;
      this.state.editor.dirty = true;
      this._flashSaveIndicator("saving");
      this._scheduleAutoSave();
      return;
    }
    if (t.id === "editorTextarea"){
      this.state.editor.body = t.value;
      this.state.editor.dirty = true;
      this._updateSuggestions(t, false);
      this._syncEditorGutter();
      this._syncEditorHighlight();
      this._updateTokenMeter();
      this._updateValidationFlagDebounced();
      this._refreshEditorStatusline();
      this._flashSaveIndicator("saving");
      if (this.state.settings.analyzerLive) this._updateEditorSidePanelDebounced();
      this._scheduleAutoSave();
      this._pushEditorUndoSnapshotDebounced(t.value);
      this._scheduleVariableWizardOffer();
      return;
    }
    if (t.id === "libSearchInput"){ this.state.library.query = t.value; this.state.library.page = 0; this._debouncedRerender("library"); return; }
    if (t.id === "historySearchInput"){ this.state.history.query = t.value; this._debouncedRerender("history"); return; }
    if (t.id === "scSearchInput"){ this.state.shortcuts.query = t.value; this.state.shortcuts.page = 0; this._debouncedRerender("shortcuts"); return; }
    if (t.id === "tplSearchInput"){ this.state.templates.query = t.value; this.state.templates.page = 0; this._debouncedRerender("templates"); return; }
    if (t.id === "patSearchInput"){ this.state.patterns.query = t.value; this.state.patterns.page = 0; this._debouncedRerender("patterns"); return; }
    if (t.id === "comparePickerSearch"){ this.state.compare.pickerQuery = t.value; this._debouncedRerender("compare"); return; }
    if (t.id === "volumeCallsInput"){
      const calls = Math.max(1, parseInt(t.value, 10) || 0);
      this.state.settings.volumeCallsPerMonth = calls;
      this.storage.setSetting("appSettings", this.state.settings);
      const model = TokenEstimator.getModel(this.state.settings.selectedModel || "claude");
      const cost = TokenEstimator.estimateCost(this.state.editor.body, model.id);
      const out = document.getElementById("volumeCostOutput");
      if (out) out.textContent = this._formatVolumeCost(calls * cost.cost);
      return;
    }
    if (t.matches(".builder-block-text")){
      const blk = this.state.builder.blocks.find(b => b.id === t.dataset.blockId);
      if (blk) blk.text = t.value;
      return;
    }
  },

  // Library/Templates/Patterns/Compare-picker search fully re-render their
  // view on every keystroke (debounced) because the result grid, counts,
  // tag chips, and dupe-nudges all need to reflect the query — unlike the
  // "Jump to…" search modal, which only ever touches a separate results
  // <div> below its input and never rebuilds the input itself. Rebuilding
  // the whole view via innerHTML necessarily destroys and recreates the
  // search input's DOM node, which silently drops focus — on mobile this
  // is what closes the on-screen keyboard mid-word, unpredictably, instead
  // of only when the person is actually done (Enter, or picking a result).
  // The fix isn't to stop re-rendering (the filtered results genuinely need
  // to update as you type) — it's to restore focus and cursor position to
  // the newly-rendered input immediately after, so the keyboard never sees
  // a gap. _wireSearchInputBlurOnEnter (Enter closes the keyboard on
  // purpose) is unaffected since that only fires on an explicit keypress.
  _debouncedRerender(view){
    if (!this._rerenderDebouncers) this._rerenderDebouncers = {};
    if (!this._rerenderDebouncers[view]){
      this._rerenderDebouncers[view] = Utils.debounce(() => {
        const active = document.activeElement;
        const wasSearchInput = active && active.matches && active.matches("[data-search-input]");
        const focusId = wasSearchInput ? active.id : null;
        const selStart = wasSearchInput ? active.selectionStart : null;
        const selEnd = wasSearchInput ? active.selectionEnd : null;
        this.renderView();
        if (focusId){
          const el = document.getElementById(focusId);
          if (el){
            el.focus({ preventScroll: true });
            if (selStart != null && el.setSelectionRange){
              try { el.setSelectionRange(selStart, selEnd); } catch(e){ /* not all input types support this */ }
            }
          }
        }
      }, 180);
    }
    this._rerenderDebouncers[view]();
  },

  _delegatedChange(e){
    const t = e.target;
    if (t.id === "editorTitleInput"){ this.state.editor.title = t.value; return; }
    if (t.id === "historyOnlyVersionsCheck"){ this.state.history.onlyWithVersions = t.checked; this.renderHistory(); return; }
    if (t.id === "modelHideBuiltinsCheck"){ this.state.modelMgmt.hideBuiltins = t.checked; this.renderSettings(); return; }
  }
};
