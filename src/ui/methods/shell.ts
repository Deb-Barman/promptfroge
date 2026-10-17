// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "../../core/Utils";

/** UIManager methods: shell. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const shellMethods = {
  _wireKeyboardShortcuts(){
    document.addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k"){ e.preventDefault(); this.togglePalette(); return; }
      if (e.altKey && !mod && e.key.toLowerCase() === "n"){ e.preventDefault(); this.openQuickCaptureModal(); return; }
      // "?" opens the shortcut overlay, but only when focus isn't inside a
      // text-entry element — unlike Ctrl-modified shortcuts, a bare "?" is a
      // character someone might legitimately be typing into a prompt body,
      // title, or search field, so this needs an explicit typing guard.
      if (e.key === "?" && !mod && !e.altKey){
        const ae = document.activeElement;
        const isTyping = ae && (ae.tagName === "TEXTAREA" || ae.tagName === "INPUT" || ae.isContentEditable);
        if (!isTyping){ e.preventDefault(); this.openShortcutsModal(); return; }
      }
      if (mod && e.key === " " && this.state.view === "editor"){ e.preventDefault(); this._triggerSuggestionsManually(); return; }
      if (mod && e.key.toLowerCase() === "f" && this.state.view === "editor"){ e.preventDefault(); this._toggleFindReplace(true); return; }
      if (mod && (e.key === "+" || e.key === "=") && this.state.view === "editor"){ e.preventDefault(); this._adjustEditorZoom(1); return; }
      if (mod && e.key === "-" && this.state.view === "editor"){ e.preventDefault(); this._adjustEditorZoom(-1); return; }
      // Custom undo/redo only takes over inside the prompt textarea itself —
      // everywhere else (title field, modal inputs) keeps native undo, since
      // this stack only ever tracks editorTextarea's content.
      const inEditorTextarea = this.state.view === "editor" && document.activeElement && document.activeElement.id === "editorTextarea";
      if (mod && !e.shiftKey && e.key.toLowerCase() === "z" && inEditorTextarea){ e.preventDefault(); this._editorUndo(); return; }
      if (mod && ((e.shiftKey && e.key.toLowerCase() === "z") || e.key.toLowerCase() === "y") && inEditorTextarea){ e.preventDefault(); this._editorRedo(); return; }
      if (e.key === "Escape"){
        if (this.state.paletteOpen){ this.closePalette(); return; }
        if (this._suggestionPopup.open){ this._closeSuggestionPopup(); return; }
        const findBar = document.getElementById("findReplaceBar");
        if (findBar && findBar.classList.contains("open") && document.activeElement && document.activeElement.closest("#findReplaceBar")){ this._toggleFindReplace(false); return; }
        const openModal = this.modalRoot.querySelector(".modal-overlay");
        if (openModal) this.closeModal();
        return;
      }
      if (mod && e.key.toLowerCase() === "s" && this.state.view === "editor"){
        e.preventDefault(); this._saveEditorPrompt(true);
      }
    });
  },

  _tickClock(){
    const el = document.getElementById("statusClock");
    if (el) el.textContent = Utils.formatClock();
  },

  async _updateStorageStatus(){
    const el = document.getElementById("statusStorage");
    if (!el) return;
    if (!this.storage.available){
      el.textContent = "Using in-browser fallback storage";
      return;
    }
    const est = await this.storage.estimateUsage();
    if (est && est.usage != null && est.quota){
      const mb = (est.usage / (1024*1024)).toFixed(1);
      el.textContent = `${mb} MB used locally`;
    } else {
      el.textContent = "Local storage ready";
    }
  },

  _toggleNav(){
    this.state.navCollapsed = !this.state.navCollapsed;
    this.storage.setSetting("navCollapsed", this.state.navCollapsed);
    const rail = document.getElementById("railNav");
    if (window.innerWidth <= 720){
      rail.classList.toggle("mobile-open");
      document.getElementById("railScrim").classList.toggle("show", rail.classList.contains("mobile-open"));
    } else {
      rail.classList.toggle("collapsed", this.state.navCollapsed);
    }
  },

  _closeMobileNav(){
    document.getElementById("railNav").classList.remove("mobile-open");
    document.getElementById("railScrim").classList.remove("show");
  },

  _toggleTheme(){
    this.state.theme = this.state.theme === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", this.state.theme);
    this.storage.setSetting("theme", this.state.theme);
    this._syncThemeIcon();
  },

  _syncThemeIcon(){
    const sun = document.getElementById("themeIconSun"), moon = document.getElementById("themeIconMoon");
    if (this.state.theme === "dark"){ sun.style.display = "none"; moon.style.display = ""; }
    else { sun.style.display = ""; moon.style.display = "none"; }
  },

  navigate(view){
    if (this.state.view === "editor" && view !== "editor" && this.state.editor.dirty){
      this._saveEditorPrompt(false);
    }
    // Focus mode is an editor-only concept — leaving the editor for any
    // other view should always bring the rail/topbar back, regardless of
    // whether the user's focusMode setting is still "on" for next time.
    if (this.state.view === "editor" && view !== "editor"){
      document.body.classList.remove("focus-mode");
      clearTimeout(this._varWizardTimer);
      this._hideVariableWizardOffer();
    }
    this.state.view = view;
    document.querySelectorAll(".rail-item").forEach(btn => {
      const active = btn.dataset.view === view;
      if (active) btn.setAttribute("aria-current", "page"); else btn.removeAttribute("aria-current");
    });
    document.getElementById("statusView").textContent = view.charAt(0).toUpperCase() + view.slice(1);
    this._closeMobileNav();
    this.renderView();
    this.workspace.scrollTop = 0;
    this.workspace.focus({ preventScroll: true });
  },

  renderView(){
    const v = this.state.view;
    const renderers = {
      dashboard: () => this.renderDashboard(),
      editor: () => this.renderEditor(),
      builder: () => this.renderBuilder(),
      library: () => this.renderLibrary(),
      compare: () => this.renderCompare(),
      templates: () => this.renderTemplates(),
      patterns: () => this.renderPatterns(),
      chains: () => this.renderChains(),
      history: () => this.renderHistory(),
      analytics: () => this.renderAnalytics(),
      learn: () => this.renderLearn(),
      settings: () => this.renderSettings(),
      shortcuts: () => this.renderShortcuts(),
      graph: () => this.renderGraphView()
    };
    (renderers[v] || renderers.dashboard)();
    this._updateStatusCounts();
  },

  _updateStatusCounts(){
    let text = "";
    if (this.state.view === "editor") text = this.state.editor.body || "";
    document.getElementById("statusWordCount").textContent = Utils.countWords(text) + " words";
    document.getElementById("statusCharCount").textContent = Utils.countChars(text) + " chars";
  },

  /* ---------------------------------------------------------------------- */
  /* Toasts                                                                  */
  /* ---------------------------------------------------------------------- */
  toast(message, type = "info", timeout = 3600){
    const id = "toast_" + (++this._toastId);
    const icons = {
      success: '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2.5 8 6 11.5 12.5 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      error: '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.4"/><path d="M7.5 4.5v3.5M7.5 10.2v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
      warn: '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 2 13.5 12.5h-12Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7.5 6.5v2.7M7.5 11v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
      info: '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.4"/><path d="M7.5 6.8v3.8M7.5 4.5v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
    };
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.id = id;
    el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-body">${Utils.escapeHtml(message)}</span><button class="toast-close" aria-label="Dismiss notification">&times;</button>`;
    el.querySelector(".toast-close").addEventListener("click", () => this._dismissToast(id));
    this.toastStack.appendChild(el);
    if (timeout) setTimeout(() => this._dismissToast(id), timeout);
    return id;
  },

  _dismissToast(id){
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 200);
  },

  /* ---------------------------------------------------------------------- */
  /* Modals                                                                  */
  /* ---------------------------------------------------------------------- */
  openModal({ title, bodyHtml, footerHtml, size = "", onMount, closeOnOverlay = true }){
    this.closeModal();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="modalTitleEl">
        <div class="modal-header">
          <h2 class="modal-title" id="modalTitleEl">${Utils.escapeHtml(title)}</h2>
          <button class="icon-btn" id="modalCloseBtn" aria-label="Close dialog">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer${footerHtml.spread ? ' spread' : ''}">${footerHtml.html || footerHtml}</div>` : ""}
      </div>`;
    this.modalRoot.appendChild(overlay);
    overlay.querySelector("#modalCloseBtn").addEventListener("click", () => this.closeModal());
    if (closeOnOverlay){
      overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) this.closeModal(); });
    }
    const modalEl = overlay.querySelector(".modal");
    if (onMount) onMount(modalEl);
    const focusable = modalEl.querySelector("input, textarea, select, button:not(#modalCloseBtn)");
    if (focusable) setTimeout(() => focusable.focus(), 30);
    return modalEl;
  },

  closeModal(){ this.modalRoot.innerHTML = ""; },

  confirmDialog({ title, message, confirmLabel = "Confirm", danger = false, onConfirm }){
    this.openModal({
      title, bodyHtml: `<p style="font-size:var(--fs-sm);color:var(--text-secondary);line-height:1.55">${Utils.escapeHtml(message)}</p>`,
      footerHtml: `<button class="btn btn-ghost" id="cdCancel">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cdConfirm">${Utils.escapeHtml(confirmLabel)}</button>`,
      onMount: (modal) => {
        modal.querySelector("#cdCancel").addEventListener("click", () => this.closeModal());
        modal.querySelector("#cdConfirm").addEventListener("click", () => { this.closeModal(); onConfirm(); });
      }
    });
  },

  /* ---------------------------------------------------------------------- */
  /* Command Palette                                                        */
  /* ---------------------------------------------------------------------- */
  togglePalette(){ this.state.paletteOpen ? this.closePalette() : this.openPalette(); },

  openPalette(){
    this.state.paletteOpen = true;
    const overlay = document.createElement("div");
    overlay.className = "palette-overlay";
    overlay.id = "paletteOverlay";
    overlay.innerHTML = `
      <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="palette-input-row">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.4"/><path d="M10.2 10.2 14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <input class="palette-input" id="paletteInput" data-search-input enterkeyhint="search" placeholder="Type a command or search…" autocomplete="off" spellcheck="false">
        </div>
        <div class="palette-list" id="paletteList"></div>
      </div>`;
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) this.closePalette(); });
    this.paletteRoot.appendChild(overlay);
    const input = document.getElementById("paletteInput");
    input.focus();
    this._paletteItems = [];
    this._paletteIndex = 0;
    this._renderPaletteResults("");
    input.addEventListener("input", () => { this._renderPaletteResults(input.value); });
    input.addEventListener("keydown", (e) => this._paletteKeydown(e));
  },

  closePalette(){
    this.state.paletteOpen = false;
    this.paletteRoot.innerHTML = "";
  },

  _paletteCommands(){
    return [
      { label: "New Prompt", meta: "Editor", icon: "add", action: () => { this._newEditorDraft(); this.navigate("editor"); } },
      { label: "Save current prompt", meta: "Editor", icon: "save", action: () => this._saveEditorPrompt(true) },
      { label: "Analyze current prompt", meta: "Editor", icon: "analyze", action: () => { this.navigate("editor"); this.toast("Analysis updates live in the side panel as you type.", "info"); } },
      { label: "Improve current prompt", meta: "Editor", icon: "improve", action: () => this.openImproverModal() },
      { label: "Create Template", meta: "Templates", icon: "template", action: () => this.openTemplateEditorModal(null) },
      { label: "Insert Snippet", meta: "Editor", icon: "snippet", action: () => { this.navigate("editor"); this._triggerSuggestionsManually(true); } },
      { label: "Quick Capture", meta: "Editor", icon: "save", action: () => this.openQuickCaptureModal() },
      { label: "Search everything", meta: "Search", icon: "search", action: () => this.openSearchModal() },
      { label: "Export data", meta: "Data", icon: "export", action: () => this.openExportModal() },
      { label: "Import data", meta: "Data", icon: "import", action: () => this.openImportModal() },
      { label: "Open Settings", meta: "Nav", icon: "settings", action: () => this.navigate("settings") },
      { label: "Go to Dashboard", meta: "Nav", icon: "nav", action: () => this.navigate("dashboard") },
      { label: "Go to Library", meta: "Nav", icon: "nav", action: () => this.navigate("library") },
      { label: "Go to Compare", meta: "Nav", icon: "nav", action: () => this.navigate("compare") },
      { label: "Go to Builder", meta: "Nav", icon: "nav", action: () => this.navigate("builder") },
      { label: "Go to Patterns", meta: "Nav", icon: "nav", action: () => this.navigate("patterns") },
      { label: "Go to Chains", meta: "Nav", icon: "nav", action: () => this.navigate("chains") },
      { label: "Go to History", meta: "Nav", icon: "nav", action: () => this.navigate("history") },
      { label: "Go to Analytics", meta: "Nav", icon: "nav", action: () => this.navigate("analytics") },
      { label: "Go to Learn", meta: "Nav", icon: "nav", action: () => this.navigate("learn") },
      { label: "Toggle theme", meta: "UI", icon: "theme", action: () => this._toggleTheme() }
    ];
  },

  _renderPaletteResults(query){
    const list = document.getElementById("paletteList");
    const q = query.trim().toLowerCase();
    let items = [];
    if (!q){
      items = this._paletteCommands().map(c => ({ type: "command", ...c }));
    } else {
      const cmdMatches = this._paletteCommands().filter(c => c.label.toLowerCase().includes(q)).map(c => ({ type: "command", ...c }));
      const searchMatches = this.search.search(q, { limit: 8 }).map(r => ({
        type: "result", label: r.title, meta: r.kind, icon: "doc",
        action: () => this._openSearchResult(r)
      }));
      items = [...cmdMatches, ...searchMatches];
    }
    this._paletteItems = items;
    this._paletteIndex = 0;
    if (!items.length){
      list.innerHTML = `<div class="palette-empty">No matches for "${Utils.escapeHtml(query)}"</div>`;
      return;
    }
    list.innerHTML = items.map((it, i) => `
      <div class="palette-item${i===0?' selected':''}" data-idx="${i}">
        ${this._paletteIcon(it.icon)}
        <span class="pi-label">${Utils.escapeHtml(it.label)}</span>
        <span class="pi-meta">${Utils.escapeHtml(it.meta || "")}</span>
      </div>`).join("");
    list.querySelectorAll(".palette-item").forEach(el => {
      el.addEventListener("click", () => this._runPaletteItem(parseInt(el.dataset.idx, 10)));
      el.addEventListener("mouseenter", () => { this._paletteIndex = parseInt(el.dataset.idx, 10); this._highlightPalette(); });
    });
  },

  _paletteIcon(kind){
    const icons = {
      add: '<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      save: '<path d="M2.5 2.5h8l2 2v7h-10Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M4.5 2.5v3.5h5V2.5" stroke="currentColor" stroke-width="1.3"/>',
      analyze: '<path d="M2 12V7M6 12V3M10 12V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
      improve: '<path d="M7 1.5 8.4 5 12 6.4 8.4 7.8 7 11.3 5.6 7.8 2 6.4 5.6 5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
      template: '<rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 5.5h10" stroke="currentColor" stroke-width="1.3"/>',
      snippet: '<path d="M4 2 2 7l2 5M10 2l2 5-2 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
      search: '<circle cx="5.8" cy="5.8" r="4" stroke="currentColor" stroke-width="1.3"/><path d="M8.6 8.6 12 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
      export: '<path d="M7 1.5v7M4.5 6l2.5 2.5L9.5 6M2.5 11v1.5h9V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
      import: '<path d="M7 8.5v-7M4.5 4l2.5-2.5L9.5 4M2.5 11v1.5h9V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
      settings: '<circle cx="7" cy="7" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M7 1.8v1.4M7 11.8v1.4M12.2 7h-1.4M2.8 7H1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
      nav: '<path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
      theme: '<circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.3"/>',
      doc: '<path d="M4 1.5h4l2.5 2.5V12.5h-6.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>'
    };
    return `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">${icons[kind] || icons.doc}</svg>`;
  },

  _highlightPalette(){
    document.querySelectorAll(".palette-item").forEach(el => {
      el.classList.toggle("selected", parseInt(el.dataset.idx, 10) === this._paletteIndex);
    });
    const active = document.querySelector(".palette-item.selected");
    if (active) active.scrollIntoView({ block: "nearest" });
  },

  _paletteKeydown(e){
    if (!this._paletteItems.length) return;
    if (e.key === "ArrowDown"){ e.preventDefault(); this._paletteIndex = (this._paletteIndex + 1) % this._paletteItems.length; this._highlightPalette(); }
    else if (e.key === "ArrowUp"){ e.preventDefault(); this._paletteIndex = (this._paletteIndex - 1 + this._paletteItems.length) % this._paletteItems.length; this._highlightPalette(); }
    else if (e.key === "Enter"){ e.preventDefault(); this._runPaletteItem(this._paletteIndex); }
  },

  _runPaletteItem(idx){
    const item = this._paletteItems[idx];
    if (!item) return;
    this.closePalette();
    item.action();
  },

  _openSearchResult(r){
    if (r.kind === "prompt"){ this._loadPromptIntoEditor(r.id); this.navigate("editor"); }
    else if (r.kind === "template"){ this.openTemplateEditorModal(r.id); }
    else if (r.kind === "snippet"){ this.openSnippetEditorModal(r.id); }
    else if (r.kind === "pattern"){ this.openPatternModal(r.id); }
  },

  openSearchModal(){
    this.openModal({
      title: "Search everything", size: "modal-lg",
      bodyHtml: `
        <div class="search-input-wrap" style="max-width:none;margin-bottom:var(--sp-4)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.3" stroke="currentColor" stroke-width="1.3"/><path d="M9.1 9.1 12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          <input class="input" id="globalSearchInput" data-search-input enterkeyhint="search" placeholder="Search prompts, templates, snippets, patterns…" autocomplete="off">
        </div>
        <div id="globalSearchResults"></div>`,
      onMount: (modal) => {
        const input = modal.querySelector("#globalSearchInput");
        const resultsEl = modal.querySelector("#globalSearchResults");
        const run = () => {
          const results = this.search.search(input.value, { types: ["prompts","templates","snippets","patterns"], limit: 40 });
          if (!input.value.trim()){ resultsEl.innerHTML = `<div class="empty-state" style="padding:var(--sp-6)"><div class="empty-state-body">Start typing to search across your whole workspace.</div></div>`; return; }
          if (!results.length){ resultsEl.innerHTML = `<div class="empty-state" style="padding:var(--sp-6)"><div class="empty-state-body">No matches for "${Utils.escapeHtml(input.value)}".</div></div>`; return; }
          resultsEl.innerHTML = results.map(r => `
            <div class="palette-item" data-kind="${r.kind}" data-id="${r.id}" style="border-radius:var(--r-md)">
              ${this._paletteIcon("doc")}
              <span class="pi-label">${Utils.escapeHtml(r.title)} <span style="color:var(--text-tertiary);font-weight:400">— ${Utils.escapeHtml(r.snippet || "")}</span></span>
              <span class="pi-meta">${r.kind}</span>
            </div>`).join("");
          resultsEl.querySelectorAll(".palette-item").forEach(el => {
            el.addEventListener("click", () => {
              this.closeModal();
              this._openSearchResult({ kind: el.dataset.kind, id: el.dataset.id });
            });
          });
        };
        input.addEventListener("input", Utils.debounce(run, 120));
        run();
      }
    });
  }
};
