// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "../../core/CONFIG";
import { TemplateEngine } from "../../core/TemplateEngine";
import { Utils } from "../../core/Utils";
import { Dropdown } from "../Dropdown";
import { Analyzer } from "../../core/Analyzer";
import { TokenEstimator } from "../../core/TokenEstimator";
import { RealTokenizer } from "../../core/RealTokenizer";
import { Validator } from "../../core/Validator";
import { FormatConverter } from "../../core/FormatConverter";
import { ReadabilityEngine } from "../../core/ReadabilityEngine";
import { RiskLinter } from "../../core/RiskLinter";
import { SnippetManager } from "../../core/SnippetManager";
import { TriggerDetector } from "../../core/TriggerDetector";

/** UIManager methods: editor. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const editorMethods = {
  /* ---------------------------------------------------------------------- */
  /* EDITOR VIEW                                                             */
  /* ---------------------------------------------------------------------- */
  _newEditorDraft(){
    this.state.editor = { promptId: null, title: "", body: "", dirty: false, blocks: null, format: "text" };
  },

  _loadPromptIntoEditor(id){
    const p = this.pe.getPrompt(id);
    if (!p) return;
    this.state.editor = { promptId: p.id, title: p.title || "", body: p.body || "", dirty: false, blocks: p.blocks || null, format: p.format || "text" };
    // Fire-and-forget: a use-count increment doesn't need to block entering
    // the editor, and no caller of this method needs to await it — the
    // synchronous state.editor assignment above is what every call site
    // actually depends on.
    this.pe.incrementUseCount(id);
  },

  renderEditor(){
    const ed = this.state.editor;
    const s = this.state.settings;
    const fontMeta = CONFIG.EDITOR_FONTS.find(f => f.id === s.editorFont) || CONFIG.EDITOR_FONTS[0];
    const zoom = s.editorZoom || 14;
    // Restore the focus-mode visual state from the persisted setting every
    // time the editor is (re-)entered — navigate() strips the class when
    // leaving the editor, so this is what brings it back on return.
    document.body.classList.toggle("focus-mode", !!s.focusMode);
    // Fresh undo/redo stack per editor session (new draft or newly-loaded
    // prompt) — seeded with the current body as the initial checkpoint.
    this._editorUndoStack = [ed.body];
    this._editorUndoIndex = 0;
    // A dismissal recorded against a PREVIOUS prompt's variable set must
    // never suppress the offer for a different prompt that happens to
    // reuse the same variable names — reset on every real entry into the
    // editor, whether that's a fresh draft or opening a saved prompt.
    this._dismissedVarSignature = null;
    this._hideVariableWizardOffer();
    clearTimeout(this._varWizardTimer);
    if (ed.body && TemplateEngine.extractVariables(ed.body).length){
      // Opening an existing prompt that already has {{variables}} — no
      // typing pause to wait for, so offer right away rather than on the
      // usual 2-second post-keystroke debounce.
      setTimeout(() => this._maybeOfferVariableWizard(), 300);
    }

    this.workspace.innerHTML = `
      <div class="view">
        <div class="editor-layout">
          <div class="editor-main">
            <div class="editor-toolbar">
              <input class="editor-title-input" id="editorTitleInput" placeholder="Untitled prompt" value="${Utils.escapeHtml(ed.title)}" maxlength="200">
              ${Dropdown.renderTrigger({ id: "editorFormatDD", value: ed.format || "text", size: "dd-sm dd-inline", options: CONFIG.PROMPT_FORMATS.map(f => ({ value: f.id, label: f.label })) })}
              <button class="btn btn-secondary btn-sm" data-action="editor-save">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2h7l2 2v7H2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M4 2v3h4.5V2" stroke="currentColor" stroke-width="1.3"/></svg>
                Save
              </button>
              <button class="btn btn-secondary btn-sm" id="editorDownloadBtn" data-action="editor-download" title="Download the current text as .txt, .json, .xml, or .md">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5v7M3.5 6l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 10.5h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                Download
              </button>
              <button class="btn btn-secondary btn-sm" data-action="editor-version">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 3.5V7l2.3 1.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                Save version
              </button>
              <button class="btn btn-ghost btn-sm" data-action="editor-clean">Clean</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-improve">Improve</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-security">Security check</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-copy-as" title="Export as a Python/cURL/JSON snippet">Copy as…</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-wrap-xml" title="Wrap sections in XML tags (Claude-style)">Wrap XML</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-adapt-model" title="Restructure for a specific model's idioms">Adapt for…</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-insert-constraint" title="Insert a common negative-constraint atom">+ Constraint</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-extract-variables" title="Find reusable specifics and turn them into {{variables}}">Extract variables</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-few-shot-builder" title="Build structured Input/Output example pairs">+ Examples</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-edge-cases" title="Review this prompt against common edge cases">Edge cases</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-shorten" title="Strip filler phrases and redundant qualifiers">Shorten</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-bulletify" title="Convert prose paragraphs into a bulleted list">Bulletify</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-add-cot" title="Insert a step-by-step reasoning instruction">+ Reasoning</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-more-tools" title="More prompt tools">More tools &#9662;</button>
              <button class="btn btn-ghost btn-sm" data-action="open-shortcuts-manager" title="Manage your /shortcut text expansions">Shortcuts</button>
              <button class="btn btn-ghost btn-sm" data-action="editor-find" title="Find & replace (Ctrl+F)">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="currentColor" stroke-width="1.3"/><path d="M8.5 8.5 11.5 11.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
              </button>
              <button class="icon-btn btn-sm" data-action="editor-undo" title="Undo (Ctrl+Z)" aria-label="Undo">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M3 6.5h5.5a3 3 0 0 1 0 6H6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M5.5 4 3 6.5 5.5 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="icon-btn btn-sm" data-action="editor-redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M10 6.5H4.5a3 3 0 0 0 0 6H7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M7.5 4 10 6.5 7.5 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="icon-btn btn-sm ${s.focusMode ? 'active' : ''}" data-action="editor-toggle-focus" title="Focus mode — hide chrome, center for distraction-free writing" aria-label="Toggle focus mode" aria-pressed="${s.focusMode ? 'true' : 'false'}">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 4.5V2h2.5M8.5 2H11v2.5M11 8.5V11H8.5M4.5 11H2V8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="btn btn-ghost btn-sm" data-action="editor-new" title="New prompt">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 2v9M2 6.5h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
              </button>
              <div class="editor-zoom-ctrl">
                <button class="icon-btn btn-sm" data-action="editor-zoom-out" title="Smaller text (Ctrl -)" aria-label="Decrease editor font size">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                </button>
                <span style="font-size:10px;color:var(--text-tertiary);font-family:var(--font-mono);width:26px;text-align:center" id="editorZoomLabel">${zoom}px</span>
                <button class="icon-btn btn-sm" data-action="editor-zoom-in" title="Larger text (Ctrl +)" aria-label="Increase editor font size">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2.5v7M2.5 6h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                </button>
              </div>
            </div>

            <div class="editor-block-toolbar" role="toolbar" aria-label="Insert prompt block">
              ${CONFIG.BLOCK_TYPES.map(bt => `<span class="editor-block-chip" style="--chip-color:${bt.color}" data-action="editor-insert-block:${bt.id}">+ ${bt.label}</span>`).join("")}
            </div>

            <div class="find-replace-bar" id="findReplaceBar">
              <input id="frFindInput" placeholder="Find…" autocomplete="off">
              <input id="frReplaceInput" placeholder="Replace with…" autocomplete="off">
              <span class="find-replace-count" id="frCount">0 / 0</span>
              <button class="btn btn-ghost btn-sm" id="frPrevBtn" title="Previous match" aria-label="Previous match">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M7 2.5 3.5 5.5 7 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="btn btn-ghost btn-sm" id="frNextBtn" title="Next match" aria-label="Next match">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M4 2.5 7.5 5.5 4 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="btn btn-secondary btn-sm" id="frReplaceBtn">Replace</button>
              <button class="btn btn-secondary btn-sm" id="frReplaceAllBtn">Replace All</button>
              <button class="icon-btn btn-sm" id="frCloseBtn" style="margin-left:auto" aria-label="Close find and replace">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
              </button>
            </div>

            <div class="editor-surface">
              <div class="editor-body-row">
                <div class="editor-gutter" id="editorGutter" style="font-size:${zoom}px;line-height:${s.editorLineHeight==='compact'?1.4:s.editorLineHeight==='loose'?2.0:1.7};${s.showGutter===false?'display:none':''}"></div>
                <div class="editor-text-stack">
                  <pre class="editor-highlight-layer" id="editorHighlightLayer" style="font-family:${fontMeta.stack};font-size:${zoom}px;tab-size:${s.editorTabWidth||2};line-height:${s.editorLineHeight==='compact'?1.4:s.editorLineHeight==='loose'?2.0:1.7}"></pre>
                  <textarea class="editor-textarea with-gutter" id="editorTextarea" style="font-family:${fontMeta.stack};font-size:${zoom}px;tab-size:${s.editorTabWidth||2};line-height:${s.editorLineHeight==='compact'?1.4:s.editorLineHeight==='loose'?2.0:1.7}" placeholder="Start writing your prompt… try 'You are an' or type / for a snippet. Ctrl+Space opens suggestions." spellcheck="false">${Utils.escapeHtml(ed.body)}</textarea>
                  <div class="suggestion-popup" id="suggestionPopup" role="listbox" aria-label="Suggestions"></div>
                </div>
              </div>
              <div class="editor-statusline">
                <span id="editorDirtyFlag">${ed.promptId ? "Saved" : "Draft — not yet saved"}</span>
                <span class="status-sep">&middot;</span>
                <span id="editorAutosaveFlag"></span>
                <span id="scoreDeltaFlash" class="score-delta-flash" title="Analyzer score change from this save"></span>
                <span id="editorValidationFlag"></span>
                <span class="token-meter" style="margin-left:auto" id="editorTokenMeter"></span>
              </div>
            </div>
          </div>

          <div class="side-panel" id="editorSidePanel">
            ${this._renderEditorSidePanel(ed.body, ed.promptId, ed.blocks)}
          </div>
        </div>
      </div>`;

    const ta = document.getElementById("editorTextarea");
    ta.addEventListener("keydown", (e) => this._editorKeydown(e));
    ta.addEventListener("click", () => this._closeSuggestionPopup());
    ta.addEventListener("scroll", () => this._syncEditorScroll());
    Dropdown.attach(this.workspace, { editorFormatDD: CONFIG.PROMPT_FORMATS.map(f => ({ value: f.id, label: f.label })) }, (id, value) => this._handleFormatChange(value));
    this._wireSidePanelDropdowns();
    this._syncEditorGutter();
    this._syncEditorHighlight();
    this._syncEditorScroll();
    this._updateTokenMeter();
    this._updateValidationFlag();
    this._refreshEditorStatusline();
  },

  /* ---- gutter / highlight-overlay / scroll sync — three layers that must
     stay pixel-aligned: the invisible textarea (source of truth + input),
     the highlight <pre> underneath it, and the line-number gutter beside it. ---- */
  _syncEditorGutter(){
    const ta = document.getElementById("editorTextarea");
    const gutter = document.getElementById("editorGutter");
    if (!ta || !gutter) return;
    if (!this.state.settings.showGutter) return;
    const lineCount = Math.max(1, (ta.value.match(/\n/g) || []).length + 1);
    let html = "";
    for (let i = 1; i <= lineCount; i++) html += `<div class="editor-gutter-line">${i}</div>`;
    gutter.innerHTML = html;
  },

  _syncEditorHighlight(){
    const ta = document.getElementById("editorTextarea");
    const layer = document.getElementById("editorHighlightLayer");
    if (!ta || !layer) return;
    if (!this.state.settings.syntaxHighlighting){ layer.innerHTML = ""; return; }
    // Trailing newline needs a phantom space or the <pre> collapses the last
    // empty line, throwing off scroll-height alignment with the textarea.
    layer.innerHTML = Analyzer.highlight(ta.value, this.state.editor.format) + (ta.value.endsWith("\n") ? " " : "");
  },

  _syncEditorScroll(){
    const ta = document.getElementById("editorTextarea");
    const layer = document.getElementById("editorHighlightLayer");
    const gutter = document.getElementById("editorGutter");
    if (!ta) return;
    if (layer){ layer.scrollTop = ta.scrollTop; layer.scrollLeft = ta.scrollLeft; }
    if (gutter) gutter.scrollTop = ta.scrollTop;
  },

  _updateTokenMeter(){
    const el = document.getElementById("editorTokenMeter");
    if (!el) return;
    const body = this.state.editor.body || "";
    const model = TokenEstimator.getModel(this.state.settings.selectedModel || "claude");
    const pendingExact = TokenEstimator.isPendingExact(model.id);
    const status = TokenEstimator.contextStatus(body, model.id);
    const exact = TokenEstimator.isExact(model.id);
    const color = status.level === "over" ? "var(--accent-red)" : status.level === "warn" ? "var(--accent-amber)" : "var(--accent-green)";
    const pct = Utils.clamp(status.pct, 2, 100);
    const prefix = exact ? "" : "~";
    const title = exact
      ? `Exact token count for ${Utils.escapeHtml(model.label)} — real cl100k_base BPE tokenizer, not an estimate`
      : pendingExact
        ? `Loading the real tokenizer for ${Utils.escapeHtml(model.label)}\u2026 showing a chars-per-token estimate until it's ready`
        : `Estimated for ${Utils.escapeHtml(model.label)} — a chars-per-token heuristic (no public exact tokenizer for this model)`;
    el.innerHTML = `<span title="${title}">${prefix}${status.tokens.toLocaleString()} tok (${model.label.split(" (")[0]})${exact ? ' <b class="token-exact-badge" title="Exact count">exact</b>' : pendingExact ? ' <b class="token-exact-badge token-exact-badge--loading" title="Loading real tokenizer">…</b>' : ""}</span><span class="token-meter-bar"><span class="token-meter-fill" style="width:${pct}%;background:${color}"></span></span>`;
    // The real vocab loads asynchronously the first time a cl100k model is
    // selected; once it's ready, refresh this meter so the badge flips from
    // "loading" to "exact" and the count itself updates from the estimate.
    if (pendingExact && !this._tokenizerWatchScheduled){
      this._tokenizerWatchScheduled = true;
      RealTokenizer.warm().then(() => {
        this._tokenizerWatchScheduled = false;
        this._updateTokenMeter();
        this._updateEditorSidePanelDebounced && this._updateEditorSidePanelDebounced();
      });
    }
  },

  _updateValidationFlag(){
    const el = document.getElementById("editorValidationFlag");
    if (!el) return;
    const format = this.state.editor.format || "text";
    const result = Validator.validate(this.state.editor.body, format);
    if (format === "text" || format === "markdown"){
      el.className = ""; el.innerHTML = ""; return; // no validation concept for these
    }
    el.className = result.valid ? "valid" : "invalid";
    if (result.valid){
      el.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5 4.5 8 9 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Valid ${format.toUpperCase()}</span>`;
    } else {
      el.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4.3" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 3.2v3M5.5 7.6v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><span>Invalid ${format.toUpperCase()}</span>`;
      el.title = result.message || "";
    }
  },

  _handleFormatChange(newFormat){
    const ed = this.state.editor;
    const oldFormat = ed.format || "text";
    if (newFormat === oldFormat) return;
    ed.format = newFormat;
    ed.dirty = true;
    this._syncEditorHighlight();
    this._updateValidationFlag();
    this._scheduleAutoSave();
    // No content to reinterpret if the editor is empty — nothing further needed.
    if (!ed.body.trim()) return;
    // Offer to restructure the existing content into the new format's syntax
    // rather than silently leaving Text-formatted content sitting under a
    // JSON label (which would just look broken / fail validation instantly).
    this.confirmDialog({
      title: `Convert content to ${CONFIG.PROMPT_FORMATS.find(f=>f.id===newFormat)?.label || newFormat}?`,
      message: `You switched the format. Want me to restructure your current content into ${newFormat.toUpperCase()} syntax? (Detected sections are kept; nothing is reworded or invented.) Choosing "Keep as-is" just changes the highlighting.`,
      confirmLabel: "Convert content",
      onConfirm: () => {
        const converted = FormatConverter.convert(ed.body, oldFormat, newFormat);
        ed.body = converted;
        const ta = document.getElementById("editorTextarea");
        if (ta) ta.value = converted;
        this._pushEditorUndoSnapshot(converted);
        this._syncEditorGutter();
        this._syncEditorHighlight();
        this._updateTokenMeter();
        this._updateValidationFlag();
        this._refreshEditorStatusline();
        this._updateEditorSidePanelDebounced();
        this._scheduleAutoSave();
        this.toast(`Converted to ${newFormat.toUpperCase()}.`, "success", 1800);
      }
    });
  },

  _insertEditorBlockHeader(blockTypeId){
    const meta = TemplateEngine.blockMeta(blockTypeId);
    const ta = document.getElementById("editorTextarea");
    if (!ta) return;
    const cursor = ta.selectionStart;
    const before = ta.value.slice(0, cursor);
    const after = ta.value.slice(cursor);
    const needsLeadingBreak = before.length && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    // For the Output block specifically, pre-fill with the user's configured
    // default hint (set in Settings) so the header isn't left dangling empty —
    // still fully editable, just a starting point instead of a blank prompt.
    let bodyLine = "";
    if (blockTypeId === "output"){
      const hint = CONFIG.OUTPUT_FORMAT_HINTS.find(h => h.id === this.state.settings.defaultOutputFormat);
      if (hint && hint.id !== "none") bodyLine = hint.label + "\n";
    }
    const insertion = `${needsLeadingBreak}${meta.label}:\n${bodyLine}`;
    ta.value = before + insertion + after;
    const newCursor = before.length + insertion.length;
    ta.setSelectionRange(newCursor, newCursor);
    this.state.editor.body = ta.value;
    this.state.editor.dirty = true;
    this._pushEditorUndoSnapshot(ta.value);
    this._syncEditorGutter();
    this._syncEditorHighlight();
    this._refreshEditorStatusline();
    this._updateEditorSidePanelDebounced();
    this._updateTokenMeter();
    this._scheduleAutoSave();
    ta.focus();
  },

  // Constraint library picker — inserts one curated negative-constraint
  // atom at the current cursor position. Deliberately simple insertion
  // (no attempt to detect/merge into an existing Constraints: section)
  // since guessing wrong about section boundaries would be more confusing
  // than just inserting where the cursor already is and letting the user
  // place it — the same predictable behavior as block-header insertion.
  openConstraintPicker(){
    const ta = document.getElementById("editorTextarea");
    if (!ta){ this.toast("Open a prompt in the editor first.", "warn"); return; }
    const categories = [...new Set(CONFIG.CONSTRAINT_LIBRARY.map(c => c.category))];
    this.openModal({
      title: "Insert a constraint", size: "modal-lg",
      bodyHtml: categories.map(cat => `
        <div style="margin-bottom:var(--sp-4)">
          <div class="side-panel-title"><span>${Utils.escapeHtml(cat)}</span></div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${CONFIG.CONSTRAINT_LIBRARY.filter(c => c.category === cat).map(c => `
              <button class="card card-hover card-clickable" style="text-align:left;padding:10px 12px;border:1px solid var(--border-subtle);background:var(--bg-1);cursor:pointer" data-constraint-id="${c.id}">
                <div style="font-weight:600;font-size:var(--fs-xs);margin-bottom:3px">${Utils.escapeHtml(c.label)}</div>
                <div style="font-size:var(--fs-2xs);color:var(--text-tertiary);line-height:1.4">${Utils.escapeHtml(c.text)}</div>
              </button>`).join("")}
          </div>
        </div>`).join(""),
      footerHtml: `<button class="btn btn-ghost" id="constraintCloseBtn">Close</button>`,
      onMount: (modal) => {
        modal.querySelector("#constraintCloseBtn").addEventListener("click", () => this.closeModal());
        modal.querySelectorAll("[data-constraint-id]").forEach(btn => {
          btn.addEventListener("click", () => {
            const entry = CONFIG.CONSTRAINT_LIBRARY.find(c => c.id === btn.dataset.constraintId);
            if (!entry) return;
            this._insertTextAtCursor(entry.text);
            this.closeModal();
            this.toast("Constraint inserted.", "success", 1500);
          });
        });
      }
    });
  },

  // "Extract variables" — scans the current editor body for parameterizable
  // candidates (see TemplateEngine.detectParameterizableSpans), lets the
  // user pick which to templatize and name each one, shows a live preview,
  // and applies non-destructively on confirm — matching the app's
  // established preview-then-confirm pattern used by format-convert, the
  // XML-wrap transform, and Adapt-for-model.
  openExtractVariablesModal(){
    const ed = this.state.editor;
    if (!ed.body.trim()){ this.toast("Nothing to scan yet.", "warn"); return; }
    const candidates = TemplateEngine.detectParameterizableSpans(ed.body);
    if (!candidates.length){ this.toast("No obvious reusable specifics found to extract.", "info"); return; }
    const existingVarNames = new Set(TemplateEngine.extractVariables(ed.body));

    // Build a default {{var_name}} slug per candidate, guaranteed unique
    // against both the prompt's existing variables and each other.
    const usedNames = new Set(existingVarNames);
    const items = candidates.map((c, i) => {
      let base = c.text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || `value_${i+1}`;
      let name = base, n = 2;
      while (usedNames.has(name)) name = `${base}_${n++}`;
      usedNames.add(name);
      return { ...c, varName: name, enabled: true };
    });

    this.openModal({
      title: "Extract variables", size: "modal-lg",
      bodyHtml: `
        <p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-3)">Found ${items.length} reusable specific${items.length===1?'':'s'} in this prompt. Uncheck any you don't want templated, and rename the {{variable}} if you'd like something clearer.</p>
        <div id="extractVarList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:var(--sp-4)"></div>
        <div class="field">
          <label class="field-label">Preview</label>
          <pre id="extractVarPreview" style="background:var(--editor-bg);border:1px solid var(--border);border-radius:var(--r-md);padding:12px;font-family:var(--font-mono);font-size:12px;white-space:pre-wrap;word-break:break-word;color:var(--text-secondary);max-height:220px;overflow-y:auto;margin:0"></pre>
        </div>`,
      footerHtml: `<button class="btn btn-ghost" id="extractCancelBtn">Cancel</button><button class="btn btn-primary" id="extractApplyBtn">Apply to editor</button>`,
      onMount: (modal) => {
        const list = modal.querySelector("#extractVarList");
        const preview = modal.querySelector("#extractVarPreview");
        const kindLabel = { quoted: "quoted text", number: "number", phrase: "capitalized phrase" };

        const renderPreview = () => {
          const active = items.filter(it => it.enabled);
          preview.textContent = TemplateEngine.applyExtractedVariables(ed.body, active);
        };

        list.innerHTML = items.map((it, i) => `
          <div class="card" style="padding:10px 12px;display:flex;align-items:center;gap:10px">
            <input type="checkbox" id="extractCheck_${i}" ${it.enabled ? "checked" : ""} style="flex-shrink:0">
            <div style="flex:1;min-width:0">
              <div style="font-size:var(--fs-xs);color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${Utils.escapeHtml(it.text)}">"${Utils.escapeHtml(it.text)}" <span style="color:var(--text-tertiary)">(${kindLabel[it.kind] || it.kind})</span></div>
            </div>
            <span style="color:var(--text-tertiary);font-size:var(--fs-xs)">{{</span>
            <input class="input" id="extractName_${i}" value="${Utils.escapeHtml(it.varName)}" style="width:140px;font-family:var(--font-mono);font-size:12px">
            <span style="color:var(--text-tertiary);font-size:var(--fs-xs)">}}</span>
          </div>`).join("");

        items.forEach((it, i) => {
          modal.querySelector(`#extractCheck_${i}`).addEventListener("change", (e) => {
            it.enabled = e.target.checked;
            renderPreview();
          });
          modal.querySelector(`#extractName_${i}`).addEventListener("input", (e) => {
            // Sanitize to a valid {{name}} shape as they type — the
            // existing VAR_RE only ever matched [a-zA-Z0-9_]+, so a name
            // with spaces or symbols would silently fail to actually
            // become a working variable.
            const clean = e.target.value.replace(/[^a-zA-Z0-9_]/g, "");
            it.varName = clean;
            renderPreview();
          });
        });

        renderPreview();
        modal.querySelector("#extractCancelBtn").addEventListener("click", () => this.closeModal());
        modal.querySelector("#extractApplyBtn").addEventListener("click", () => {
          const active = items.filter(it => it.enabled);
          if (!active.length){ this.toast("Nothing selected to extract.", "warn"); return; }
          const emptyName = active.find(it => !it.varName.trim());
          if (emptyName){ this.toast("Every selected item needs a variable name.", "warn"); return; }
          const result = TemplateEngine.applyExtractedVariables(ed.body, active);
          ed.body = result;
          ed.dirty = true;
          const ta = document.getElementById("editorTextarea");
          if (ta) ta.value = result;
          this._pushEditorUndoSnapshot(result);
          this._syncEditorGutter();
          this._syncEditorHighlight();
          this._updateTokenMeter();
          this._refreshEditorStatusline();
          this._updateEditorSidePanelDebounced();
          this._scheduleAutoSave();
          this.closeModal();
          this.toast(`Extracted ${active.length} variable${active.length===1?'':'s'}.`, "success", 1800);
        });
      }
    });
  },

  // Few-shot example block builder — a structured Input:/Output: pair
  // form, distinct from just typing under a freeform "Examples:" header:
  // this guarantees consistent formatting across pairs and lets the user
  // add/remove pairs without hand-managing the numbering. Generates plain
  // text and inserts it via the same _insertTextAtCursor primitive the
  // constraint picker uses.
  openFewShotBuilder(){
    const ta = document.getElementById("editorTextarea");
    if (!ta){ this.toast("Open a prompt in the editor first.", "warn"); return; }
    let pairs = [{ input: "", output: "" }, { input: "", output: "" }];

    this.openModal({
      title: "Build few-shot examples", size: "modal-lg",
      bodyHtml: `<div id="fewShotPairs"></div><button class="btn btn-ghost btn-sm" id="fewShotAddBtn">+ Add example</button>`,
      footerHtml: `<button class="btn btn-ghost" id="fewShotCancelBtn">Cancel</button><button class="btn btn-primary" id="fewShotInsertBtn">Insert into prompt</button>`,
      onMount: (modal) => {
        const container = modal.querySelector("#fewShotPairs");
        const renderPairs = () => {
          container.innerHTML = pairs.map((p, i) => `
            <div class="card" style="padding:12px;margin-bottom:8px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <span style="font-size:var(--fs-2xs);color:var(--text-tertiary);font-weight:600">Example ${i + 1}</span>
                ${pairs.length > 1 ? `<button class="icon-btn btn-sm" data-remove-pair="${i}" style="color:var(--accent-red)" aria-label="Remove example"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>` : ""}
              </div>
              <div class="field"><label class="field-label">Input</label><textarea class="textarea" rows="2" data-pair-input="${i}" placeholder="Example input...">${Utils.escapeHtml(p.input)}</textarea></div>
              <div class="field" style="margin-bottom:0"><label class="field-label">Output</label><textarea class="textarea" rows="2" data-pair-output="${i}" placeholder="Expected output...">${Utils.escapeHtml(p.output)}</textarea></div>
            </div>`).join("");
          container.querySelectorAll("[data-pair-input]").forEach(el => el.addEventListener("input", () => { pairs[+el.dataset.pairInput].input = el.value; }));
          container.querySelectorAll("[data-pair-output]").forEach(el => el.addEventListener("input", () => { pairs[+el.dataset.pairOutput].output = el.value; }));
          container.querySelectorAll("[data-remove-pair]").forEach(btn => btn.addEventListener("click", () => { pairs.splice(+btn.dataset.removePair, 1); renderPairs(); }));
        };
        renderPairs();
        modal.querySelector("#fewShotAddBtn").addEventListener("click", () => { pairs.push({ input: "", output: "" }); renderPairs(); });
        modal.querySelector("#fewShotCancelBtn").addEventListener("click", () => this.closeModal());
        modal.querySelector("#fewShotInsertBtn").addEventListener("click", () => {
          const usable = pairs.filter(p => p.input.trim() || p.output.trim());
          if (!usable.length){ this.toast("Add at least one example first.", "warn"); return; }
          const text = "Examples:\n" + usable.map((p, i) => `\nExample ${i + 1}:\nInput: ${p.input.trim()}\nOutput: ${p.output.trim()}`).join("\n");
          this.closeModal();
          this._insertTextAtCursor(text);
          this.toast(`Inserted ${usable.length} example${usable.length===1?'':'s'}.`, "success", 1800);
        });
      }
    });
  },

  // Edge-case checklist — a REFERENCE panel to review against, distinct
  // from the constraint picker: nothing here is ever auto-inserted into
  // the prompt text. Checkbox state persists per-prompt (needs a saved
  // promptId — an unfilled draft has nowhere to persist to, so this
  // explains that rather than silently doing nothing or crashing).
  openEdgeCaseChecklist(){
    const ed = this.state.editor;
    if (!ed.promptId){
      this.toast("Save this prompt first — the checklist needs somewhere to remember your progress.", "warn");
      return;
    }
    const prompt = this.pe.getPrompt(ed.promptId);
    if (!prompt) return;
    const checks = prompt.edgeCaseChecks || {};

    this.openModal({
      title: "Edge-case checklist", size: "modal-lg",
      bodyHtml: `
        <p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-3)">A reference to review against — checking a box just tracks that you've thought it through, it doesn't change your prompt.</p>
        <div id="edgeCaseList" style="display:flex;flex-direction:column;gap:2px"></div>`,
      footerHtml: `<button class="btn btn-primary" id="edgeCaseCloseBtn">Done</button>`,
      onMount: (modal) => {
        const list = modal.querySelector("#edgeCaseList");
        list.innerHTML = CONFIG.EDGE_CASE_CHECKLIST.map(item => `
          <label class="card" style="padding:10px 12px;display:flex;align-items:flex-start;gap:10px;cursor:pointer">
            <input type="checkbox" id="edgeCheck_${item.id}" ${checks[item.id] ? "checked" : ""} style="margin-top:2px;flex-shrink:0">
            <div>
              <div style="font-size:var(--fs-xs);font-weight:600;margin-bottom:2px">${Utils.escapeHtml(item.label)}</div>
              <div style="font-size:var(--fs-2xs);color:var(--text-tertiary);line-height:1.4">${Utils.escapeHtml(item.question)}</div>
            </div>
          </label>`).join("");
        CONFIG.EDGE_CASE_CHECKLIST.forEach(item => {
          modal.querySelector(`#edgeCheck_${item.id}`).addEventListener("change", async (e) => {
            await this.pe.setEdgeCaseCheck(ed.promptId, item.id, e.target.checked);
          });
        });
        modal.querySelector("#edgeCaseCloseBtn").addEventListener("click", () => this.closeModal());
      }
    });
  },

  // Shared cursor-insertion primitive — inserts text at the editor
  // textarea's current cursor position with a sensible leading line break,
  // mirroring the exact logic _insertEditorBlockHeader already uses so
  // both stay consistent and only one place needs to get this right.
  _insertTextAtCursor(text){
    const ta = document.getElementById("editorTextarea");
    if (!ta) return;
    const cursor = ta.selectionStart;
    const before = ta.value.slice(0, cursor);
    const after = ta.value.slice(cursor);
    const needsLeadingBreak = before.length && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const insertion = `${needsLeadingBreak}${text}`;
    ta.value = before + insertion + after;
    const newCursor = before.length + insertion.length;
    ta.setSelectionRange(newCursor, newCursor);
    this.state.editor.body = ta.value;
    this.state.editor.dirty = true;
    this._pushEditorUndoSnapshot(ta.value);
    this._syncEditorGutter();
    this._syncEditorHighlight();
    this._refreshEditorStatusline();
    this._updateEditorSidePanelDebounced();
    this._updateTokenMeter();
    this._scheduleAutoSave();
    ta.focus();
  },

  /* ---- Find & Replace ---- */
  _toggleFindReplace(forceOpen){
    const bar = document.getElementById("findReplaceBar");
    if (!bar) return;
    const willOpen = forceOpen !== undefined ? forceOpen : !bar.classList.contains("open");
    bar.classList.toggle("open", willOpen);
    if (willOpen){
      const findInput = document.getElementById("frFindInput");
      findInput.focus();
      if (!this._frWired){
        this._frWired = true;
        const ta = document.getElementById("editorTextarea");
        const runFind = () => this._runFind(findInput.value);
        findInput.addEventListener("input", Utils.debounce(runFind, 80));
        document.getElementById("frNextBtn").addEventListener("click", () => this._frStep(1));
        document.getElementById("frPrevBtn").addEventListener("click", () => this._frStep(-1));
        document.getElementById("frReplaceBtn").addEventListener("click", () => this._frReplaceOne());
        document.getElementById("frReplaceAllBtn").addEventListener("click", () => this._frReplaceAll());
        document.getElementById("frCloseBtn").addEventListener("click", () => this._toggleFindReplace(false));
        findInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter"){ e.preventDefault(); this._frStep(e.shiftKey ? -1 : 1); }
          if (e.key === "Escape"){ e.preventDefault(); this._toggleFindReplace(false); ta.focus(); }
        });
      }
    } else {
      this._frMatches = [];
      this._updateFrCount();
    }
  },

  _runFind(query){
    const ta = document.getElementById("editorTextarea");
    this._frQuery = query;
    this._frMatches = [];
    this._frActive = -1;
    if (query){
      const hay = ta.value.toLowerCase();
      const needle = query.toLowerCase();
      let idx = hay.indexOf(needle);
      while (idx !== -1){
        this._frMatches.push(idx);
        idx = hay.indexOf(needle, idx + needle.length);
      }
      if (this._frMatches.length) this._frActive = 0;
    }
    this._updateFrCount();
    if (this._frActive >= 0) this._frSelectMatch();
  },

  _frStep(dir){
    if (!this._frMatches || !this._frMatches.length) return;
    this._frActive = (this._frActive + dir + this._frMatches.length) % this._frMatches.length;
    this._updateFrCount();
    this._frSelectMatch();
  },

  _frSelectMatch(){
    const ta = document.getElementById("editorTextarea");
    const start = this._frMatches[this._frActive];
    const len = (this._frQuery || "").length;
    ta.focus();
    ta.setSelectionRange(start, start + len);
    // Scroll the selection into view — textareas don't do this automatically.
    const before = ta.value.slice(0, start);
    const lineNum = (before.match(/\n/g) || []).length;
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    ta.scrollTop = Utils.clamp(lineNum * lineHeight - ta.clientHeight / 2, 0, ta.scrollHeight);
    this._syncEditorScroll();
  },

  _updateFrCount(){
    const el = document.getElementById("frCount");
    if (!el) return;
    const total = this._frMatches ? this._frMatches.length : 0;
    el.textContent = total ? `${this._frActive + 1} / ${total}` : "0 / 0";
  },

  _frReplaceOne(){
    if (!this._frMatches || this._frActive < 0) return;
    const ta = document.getElementById("editorTextarea");
    const replacement = document.getElementById("frReplaceInput").value;
    const start = this._frMatches[this._frActive];
    const len = (this._frQuery || "").length;
    ta.value = ta.value.slice(0, start) + replacement + ta.value.slice(start + len);
    this._commitEditorTextareaChange(ta);
    this._runFind(this._frQuery);
  },

  _frReplaceAll(){
    if (!this._frQuery) return;
    const ta = document.getElementById("editorTextarea");
    const replacement = document.getElementById("frReplaceInput").value;
    const re = new RegExp(this._frQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const count = (ta.value.match(re) || []).length;
    ta.value = ta.value.replace(re, replacement);
    this._commitEditorTextareaChange(ta);
    this._runFind("");
    document.getElementById("frFindInput").value = "";
    this.toast(`Replaced ${count} match${count===1?'':'es'}.`, "success", 1800);
  },

  _commitEditorTextareaChange(ta){
    this.state.editor.body = ta.value;
    this.state.editor.dirty = true;
    this._pushEditorUndoSnapshot(ta.value);
    this._syncEditorGutter();
    this._syncEditorHighlight();
    this._refreshEditorStatusline();
    this._updateEditorSidePanelDebounced();
    this._updateTokenMeter();
    this._scheduleAutoSave();
  },

  _adjustEditorZoom(delta){
    const s = this.state.settings;
    s.editorZoom = Utils.clamp((s.editorZoom || 14) + delta, 10, 22);
    this.storage.setSetting("appSettings", s);
    const ta = document.getElementById("editorTextarea");
    const layer = document.getElementById("editorHighlightLayer");
    const gutter = document.getElementById("editorGutter");
    const label = document.getElementById("editorZoomLabel");
    if (ta) ta.style.fontSize = s.editorZoom + "px";
    if (layer) layer.style.fontSize = s.editorZoom + "px";
    if (gutter) gutter.style.fontSize = s.editorZoom + "px";
    if (label) label.textContent = s.editorZoom + "px";
    this._syncEditorScroll();
  },

  // Focus/Zen mode toggle — flips a body-level class (CSS handles hiding
  // rail/topbar/side-panel and centering the textarea column) and updates
  // just the toggle button's pressed-state in place, rather than a full
  // renderEditor() re-render, so cursor position and scroll aren't disturbed.
  _toggleFocusMode(){
    const s = this.state.settings;
    s.focusMode = !s.focusMode;
    this.storage.setSetting("appSettings", s);
    document.body.classList.toggle("focus-mode", s.focusMode);
    const btn = this.workspace.querySelector('[data-action="editor-toggle-focus"]');
    if (btn){
      btn.classList.toggle("active", s.focusMode);
      btn.setAttribute("aria-pressed", s.focusMode ? "true" : "false");
    }
    // The editor surface's available width just changed (side panel and
    // rail hidden/shown), so the highlight-overlay/gutter alignment and the
    // suggestion-popup's cached caret coordinates both need to resync.
    this._syncEditorGutter();
    this._syncEditorHighlight();
    this._syncEditorScroll();
  },

  /* ---- Undo/redo stack — snapshot-based, independent of the textarea's
     native browser undo. Needed because several actions here (Clean,
     Convert format, block-insert, Wrap in XML) write ta.value directly,
     which silently wipes the browser's native undo history — a real
     pre-existing gap this closes rather than a purely additive feature. ---- */
  _pushEditorUndoSnapshotDebounced(value){
    if (!this._undoDebounce) this._undoDebounce = Utils.debounce((v) => this._pushEditorUndoSnapshot(v), 500);
    this._undoDebounce(value);
  },

  _pushEditorUndoSnapshot(value){
    if (!this._editorUndoStack) this._editorUndoStack = [value];
    // Skip if nothing changed since the last checkpoint (e.g. a debounced
    // call landing after the user already stopped typing at the same text).
    if (this._editorUndoStack[this._editorUndoIndex] === value) return;
    // Discard any "future" redo states once a new edit branches off.
    this._editorUndoStack = this._editorUndoStack.slice(0, this._editorUndoIndex + 1);
    this._editorUndoStack.push(value);
    if (this._editorUndoStack.length > 100) this._editorUndoStack.shift(); // cap memory use
    this._editorUndoIndex = this._editorUndoStack.length - 1;
  },

  _editorUndo(){
    if (!this._editorUndoStack || this._editorUndoIndex <= 0) return;
    // If the textarea has moved ahead of the last snapshot (the user is
    // still mid-pause and the debounce hasn't fired), fold that into the
    // stack in place at the current index first, WITHOUT advancing the
    // index — otherwise pushing it would consume the very undo step the
    // user just asked for.
    const ta = document.getElementById("editorTextarea");
    if (ta && ta.value !== this._editorUndoStack[this._editorUndoIndex]){
      this._editorUndoStack[this._editorUndoIndex] = ta.value;
    }
    this._editorUndoIndex = Math.max(0, this._editorUndoIndex - 1);
    this._applyEditorUndoState();
  },

  _editorRedo(){
    if (!this._editorUndoStack || this._editorUndoIndex >= this._editorUndoStack.length - 1) return;
    this._editorUndoIndex++;
    this._applyEditorUndoState();
  },

  _applyEditorUndoState(){
    const value = this._editorUndoStack[this._editorUndoIndex];
    if (value == null) return;
    const ta = document.getElementById("editorTextarea");
    this.state.editor.body = value;
    this.state.editor.dirty = true;
    if (ta) ta.value = value;
    this._syncEditorGutter();
    this._syncEditorHighlight();
    this._updateTokenMeter();
    this._refreshEditorStatusline();
    this._updateEditorSidePanelDebounced();
    this._scheduleAutoSave();
  },

  // Per-section token budget breakdown — reuses FormatConverter's existing
  // section-extraction (the same primitive the XML-wrap / Adapt-for-model
  // transforms already use) rather than re-parsing the body a different
  // way. Only rendered when there are at least 2 sections, since a
  // single-section prompt has nothing to break down.
  _renderSectionTokenBreakdown(body, blocks, modelId){
    const sections = FormatConverter.extractSections(body, "text");
    if (sections.length < 2) return "";
    const totals = sections.map(s => ({ label: s.label, tokens: TokenEstimator.estimateTokens(s.content, modelId) }));
    const grandTotal = totals.reduce((sum, t) => sum + t.tokens, 0) || 1;
    return `
      <div style="margin:8px 0;padding-top:8px;border-top:1px solid var(--border-subtle)">
        <div style="font-size:9px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:5px">By section</div>
        ${totals.map(t => {
          const pct = Math.round((t.tokens / grandTotal) * 100);
          return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="font-size:10px;color:var(--text-secondary);width:76px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${Utils.escapeHtml(t.label)}">${Utils.escapeHtml(t.label)}</span>
            <span class="token-meter-bar" style="flex:1;height:4px"><span class="token-meter-fill" style="width:${Math.max(3,pct)}%;background:var(--text-tertiary)"></span></span>
            <span style="font-family:var(--font-mono);font-size:9px;color:var(--text-tertiary);width:36px;text-align:right;flex-shrink:0">${pct}%</span>
          </div>`;
        }).join("")}
      </div>`;
  },

  // Formats a projected monthly cost with sensible precision — whole
  // dollars for larger totals, cents-level precision for small ones,
  // matching the same < $0.01 threshold logic the per-call estimate uses.
  _formatVolumeCost(total){
    if (total === 0) return "$0";
    if (total < 0.01) return "$" + total.toFixed(5);
    if (total < 10) return "$" + total.toFixed(3);
    return "$" + total.toLocaleString(undefined, { maximumFractionDigits: 0 });
  },

  _renderEditorSidePanel(body, promptId, blocks){
    const s = this.state.settings;
    const profileId = s.scoringProfile || "default";
    const analysis = Analyzer.analyze(body, profileId);
    const dna = Analyzer.dnaProfile(body, blocks);
    const related = this.search.relatedTo(promptId, body, 5);
    const warnThreshold = parseInt(s.wordCountWarning, 10) || 0;
    const overThreshold = warnThreshold > 0 && analysis.wordCount > warnThreshold;
    const readability = ReadabilityEngine.analyze(body);
    const riskFindings = RiskLinter.scan(body);
    const injectionFindings = RiskLinter.checkInjectionSurface(body);
    // Only the warn-level subset (unescaped quotes) — the info-level ones
    // (raw newlines, unbalanced braces) are true of nearly every multi-line
    // prompt and would make this a permanently-on, ignorable banner rather
    // than a genuine signal. Framed for the "someone hand-pastes this
    // elsewhere" scenario, not this app's own JSON export (which already
    // goes through JSON.stringify correctly, so it's never at risk here).
    const jsonWarnFindings = Validator.checkJSONEmbedSafety(body).filter(f => f.level === "warn");
    const model = TokenEstimator.getModel(s.selectedModel || "claude");
    const ctxStatus = TokenEstimator.contextStatus(body, model.id);
    const cost = TokenEstimator.estimateCost(body, model.id);
    const nearestPattern = this._nearestPattern(dna);

    return `
      ${overThreshold ? `<div class="side-panel-section" style="border-color:color-mix(in srgb, var(--accent-amber) 35%, var(--border-subtle))">
        <div class="issue-item issue-warn" style="border:none;padding:0">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.8 12 11h-11Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 5.8v2.5M6.5 9.7v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <span>${analysis.wordCount} words — past your ${warnThreshold}-word threshold (set in Settings).</span>
        </div>
      </div>` : ""}

      <div class="side-panel-section">
        <div class="side-panel-title"><span>Prompt DNA</span></div>
        ${this._renderDnaStrand(dna)}
        ${nearestPattern ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-subtle);font-size:var(--fs-2xs);color:var(--text-tertiary)">
          Closest built-in pattern: <a href="#" data-action="open-pattern:${nearestPattern.pattern.id}" style="color:var(--accent-blue);text-decoration:none">${Utils.escapeHtml(nearestPattern.pattern.name)}</a>
          ${nearestPattern.missing.length ? ` — missing: ${nearestPattern.missing.map(Utils.escapeHtml).join(", ")}` : " — structure matches"}
        </div>` : ""}
      </div>

      <div class="side-panel-section">
        <div class="side-panel-title">
          <span>Prompt Analyzer</span>
          <span style="font-family:var(--font-mono);color:${this._scoreColor(analysis.overall)}">${analysis.overall}/100</span>
        </div>
        <div style="margin-bottom:10px">${Dropdown.renderTrigger({ id: "sidePanelProfileDD", value: profileId, size: "dd-sm", options: CONFIG.SCORING_PROFILES.map(p => ({ value: p.id, label: p.label })) })}</div>
        ${this._scoreBar("Clarity", analysis.scores.clarity, "clarity", analysis)}
        ${this._scoreBar("Context", analysis.scores.context, "context", analysis)}
        ${this._scoreBar("Specificity", analysis.scores.specificity, "specificity", analysis)}
        ${this._scoreBar("Structure", analysis.scores.structure, "structure", analysis)}
        ${this._scoreBar("Constraints", analysis.scores.constraints, "constraints", analysis)}
        ${this._scoreBar("Output def.", analysis.scores.output, "output", analysis)}
        <div style="margin-top:var(--sp-3);padding-top:var(--sp-3);border-top:1px solid var(--border-subtle)">
          ${analysis.issues.slice(0,5).map(i => this._issueLine(i)).join("")}
        </div>
      </div>

      <div class="side-panel-section">
        <div class="side-panel-title"><span>Readability</span></div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
          <span style="font-size:var(--fs-lg);font-weight:700;font-family:var(--font-mono);color:${this._scoreColor(readability.fleschScore)}">${readability.fleschScore}</span>
          <span style="font-size:var(--fs-xs);color:var(--text-tertiary)">${readability.label} &middot; grade ~${readability.gradeLevel}</span>
        </div>
        <div style="font-size:var(--fs-2xs);color:var(--text-tertiary);display:grid;grid-template-columns:1fr 1fr;gap:4px 10px">
          <span>Avg sentence length</span><span style="text-align:right;font-family:var(--font-mono)">${readability.avgSentenceLen} words</span>
          <span>Avg word length</span><span style="text-align:right;font-family:var(--font-mono)">${readability.avgWordLen} chars</span>
          <span>Syllables / word</span><span style="text-align:right;font-family:var(--font-mono)">${readability.syllablesPerWord}</span>
        </div>
      </div>

      <div class="side-panel-section">
        <div class="side-panel-title">
          <span>Model &amp; tokens</span>
          ${TokenEstimator.isExact(model.id)
            ? `<span style="font-size:9px;color:var(--accent-green);font-weight:600;text-transform:none;letter-spacing:0" title="Real cl100k_base BPE tokenizer — exact, not estimated">exact</span>`
            : TokenEstimator.isPendingExact(model.id)
              ? `<span style="font-size:9px;color:var(--text-tertiary);font-weight:500;text-transform:none;letter-spacing:0" title="Loading the real tokenizer…">loading…</span>`
              : `<span style="font-size:9px;color:var(--text-tertiary);font-weight:500;text-transform:none;letter-spacing:0" title="No public exact tokenizer for this model — chars-per-token heuristic">est.</span>`}
        </div>
        <div style="margin-bottom:10px">${Dropdown.renderTrigger({ id: "sidePanelModelDD", value: model.id, size: "dd-sm", options: TokenEstimator.groupedModelOptions() })}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span class="token-meter-bar" style="flex:1;height:5px">
            <span class="token-meter-fill" style="width:${Utils.clamp(ctxStatus.pct,2,100)}%;background:${ctxStatus.level==='over'?'var(--accent-red)':ctxStatus.level==='warn'?'var(--accent-amber)':'var(--accent-green)'}"></span>
          </span>
          <span style="font-family:var(--font-mono);font-size:var(--fs-2xs);color:var(--text-tertiary);white-space:nowrap">${ctxStatus.tokens.toLocaleString()} / ${ctxStatus.limit.toLocaleString()}</span>
        </div>
        ${this._renderSectionTokenBreakdown(body, blocks, model.id)}
        <div style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-top:8px">
          Est. cost per call: <span style="font-family:var(--font-mono);color:var(--text-secondary)">$${cost.cost < 0.01 && cost.cost > 0 ? cost.cost.toFixed(5) : cost.cost.toFixed(4)}</span>
          ${model.priceIn === 0 ? " (free / self-hosted)" : ""}
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
          <span style="font-size:var(--fs-2xs);color:var(--text-tertiary);white-space:nowrap">At</span>
          <input class="input" id="volumeCallsInput" type="number" min="1" step="100" value="${this.state.settings.volumeCallsPerMonth || 1000}" style="width:80px;padding:4px 8px;font-size:var(--fs-2xs)">
          <span style="font-size:var(--fs-2xs);color:var(--text-tertiary);white-space:nowrap">calls/mo:</span>
          <span id="volumeCostOutput" style="font-family:var(--font-mono);font-size:var(--fs-2xs);color:var(--text-secondary);font-weight:600">${this._formatVolumeCost((this.state.settings.volumeCallsPerMonth || 1000) * cost.cost)}</span>
        </div>
        <button class="btn btn-ghost btn-sm btn-block" style="margin-top:8px" data-action="editor-copy-as">Copy as…</button>
      </div>

      ${riskFindings.length ? `<div class="side-panel-section" style="border-color:color-mix(in srgb, var(--accent-amber) 30%, var(--border-subtle))">
        <div class="side-panel-title"><span>Risk linter</span></div>
        ${riskFindings.map(f => `<div class="issue-item issue-warn"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.8 12 11h-11Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 5.8v2.5M6.5 9.7v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><span><b>${Utils.escapeHtml(f.label)}</b><br><span style="color:var(--text-tertiary)">${Utils.escapeHtml(f.detail)}</span></span></div>`).join("")}
      </div>` : ""}

      ${jsonWarnFindings.length ? `<div style="font-size:var(--fs-2xs);color:var(--text-tertiary);padding:0 2px;margin-bottom:var(--sp-3);line-height:1.5">
        <b style="color:var(--text-secondary)">Heads up:</b> this prompt contains quote characters — if you hand-paste it into a JSON field elsewhere (not this app's own "Copy as…", which already escapes correctly), an unescaped <code>"</code> can truncate the value.
      </div>` : ""}

      ${injectionFindings.length ? `<div class="side-panel-section" style="border-color:color-mix(in srgb, var(--accent-amber) 30%, var(--border-subtle))">
        <div class="side-panel-title"><span>Injection surface</span></div>
        ${injectionFindings.map(f => `<div class="issue-item issue-warn"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.8 12 11h-11Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 5.8v2.5M6.5 9.7v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><span><b>${Utils.escapeHtml(f.label)}</b><br><span style="color:var(--text-tertiary)">${Utils.escapeHtml(f.detail)}</span></span></div>`).join("")}
      </div>` : ""}

      <div class="side-panel-section">
        <div class="side-panel-title"><span>Related prompts</span></div>
        ${related.length ? related.map(r => `
          <div class="related-item" data-action="open-prompt:${r.prompt.id}">
            <div class="related-title">${Utils.escapeHtml(r.prompt.title || "Untitled")}</div>
            <div class="related-meta">${Math.round(r.sim*100)}% similar &middot; ${Utils.timeAgo(r.prompt.updatedAt)}</div>
          </div>`).join("") : this._miniEmpty("As you write, similar past prompts will show up here.")}
      </div>`;
  },

  // Finds the built-in PATTERN whose typical structure most overlaps the
  // current prompt's detected DNA, using the same block-presence data the
  // DNA strand already computed — no extra analysis pass needed. Patterns
  // don't declare which BLOCK_TYPES they use directly, so this infers it
  // from cue-word overlap between the pattern's template and each block
  // type's own detection cues (the same Analyzer.CUES used for free-form DNA).
  _nearestPattern(dna){
    const present = new Set(dna.filter(d => d.strength > 0).map(d => d.id));
    if (!present.size) return null;
    let best = null;
    for (const pattern of CONFIG.PATTERNS){
      const patternBlocks = new Set();
      for (const key in Analyzer.CUES){
        if (Analyzer.CUES[key].test(pattern.template)) patternBlocks.add(key);
      }
      if (!patternBlocks.size) continue;
      let overlap = 0;
      for (const b of patternBlocks) if (present.has(b)) overlap++;
      const score = overlap / patternBlocks.size;
      if (!best || score > best.score) best = { pattern, score, patternBlocks };
    }
    if (!best || best.score <= 0) return null;
    const missing = Array.from(best.patternBlocks).filter(b => !present.has(b))
      .map(id => (CONFIG.BLOCK_TYPES.find(t => t.id === id) || {}).label).filter(Boolean);
    return { pattern: best.pattern, missing };
  },

  // Score-history sparkline — one bar per saved version, height
  // proportional to that version's Analyzer overall score, so a regression
  // between versions is visible at a glance instead of requiring a manual
  // pairwise diff read. Built the same way the DNA strand is (flexbox
  // segments, not hand-rolled SVG path math) for consistency and
  // robustness — a bar-height sparkline conveys the same trend as a line
  // sparkline for this purpose.
  _renderScoreSparkline(versions){
    if (versions.length < 2) return ""; // nothing to trend with fewer than 2 points
    const scored = versions.map(v => ({ v, score: Analyzer.analyze(v.body).overall }));
    const bars = scored.map((entry, i) => {
      const heightPct = Math.max(6, entry.score); // floor so a 0 score still shows a sliver, not nothing
      const color = this._scoreColor(entry.score);
      const prev = i > 0 ? scored[i - 1].score : null;
      const delta = prev !== null ? entry.score - prev : null;
      const deltaLabel = delta === null ? "" : delta > 0 ? ` (+${delta})` : delta < 0 ? ` (${delta})` : " (±0)";
      return `<div class="score-spark-bar" style="height:${heightPct}%;background:${color}" title="v${entry.v.versionNum}: ${entry.score}/100${deltaLabel}"></div>`;
    }).join("");
    const first = scored[0].score, last = scored[scored.length - 1].score;
    const netDelta = last - first;
    const netLabel = netDelta > 0 ? `+${netDelta}` : netDelta === 0 ? "±0" : `${netDelta}`;
    const netColor = netDelta > 0 ? "var(--accent-green)" : netDelta < 0 ? "var(--accent-red)" : "var(--text-tertiary)";
    return `
      <div style="margin-top:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;flex-wrap:wrap;gap:4px 8px">
          <span style="font-size:var(--fs-2xs);color:var(--text-tertiary)">Score across versions</span>
          <span style="font-size:var(--fs-2xs);font-family:var(--font-mono);color:${netColor}">${netLabel} since v${scored[0].v.versionNum}</span>
        </div>
        <div class="score-spark-row">${bars}</div>
      </div>`;
  },

  _renderDnaStrand(dna){
    // dna is now an ordered array of { id, label, color, strength } — built-in
    // types first (always present, even at strength 0 so gaps are visible),
    // then any custom sections the user added via the Builder appended after.
    const segs = dna.map(entry => {
      const grow = entry.strength > 0 ? Math.max(entry.strength, 0.12) : 0.04;
      return `<div class="dna-seg${entry.strength===0?' empty':''}" style="flex-grow:${grow};background:${entry.color}" title="${Utils.escapeHtml(entry.label)}"></div>`;
    }).join("");
    const legend = dna.map(entry => {
      const present = entry.strength > 0;
      return `<div class="dna-legend-item${present?' present':''}"><span class="dna-legend-dot" style="background:${entry.color};opacity:${present?1:0.3}"></span>${Utils.escapeHtml(entry.label)}</div>`;
    }).join("");
    const presentCount = dna.filter(entry => entry.strength > 0).length;
    return `<div class="dna-strand">${segs}</div>
      <div style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-top:8px">${presentCount} of ${dna.length} elements present</div>
      <div class="dna-legend">${legend}</div>`;
  },

  _scoreColor(n){
    if (n >= 75) return "var(--accent-green)";
    if (n >= 45) return "var(--accent-amber)";
    return "var(--accent-red)";
  },

  // `dimension` + `analysis` are optional — when given, the label becomes
  // clickable and expands a one-line "why" explanation built from data
  // Analyzer.analyze already computed (analysis.has, vagueWords via issues,
  // etc.) rather than running any new analysis pass.
  _scoreBar(label, val, dimension, analysis){
    const color = this._scoreColor(val);
    if (!this._expandedScoreBars) this._expandedScoreBars = new Set();
    const expanded = dimension && this._expandedScoreBars.has(dimension);
    const explain = dimension && analysis ? this._explainScore(dimension, analysis) : "";
    return `<div class="score-bar-row" style="flex-wrap:wrap;margin-bottom:${expanded?'2px':'7px'}">
      <span class="sbr-label" ${dimension ? `data-action="toggle-score-explain:${dimension}" style="width:76px;flex-shrink:0;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-decoration-color:var(--border-strong)"` : ''}>${label}</span>
      <span class="score-bar-track"><span class="score-bar-fill" style="width:${val}%;background:${color}"></span></span>
      <span class="score-bar-val">${val}</span>
      ${expanded ? `<div style="width:100%;font-size:10px;color:var(--text-tertiary);padding:3px 0 5px 0;line-height:1.4">${Utils.escapeHtml(explain)}</div>` : ""}
    </div>`;
  },

  // Plain-language "why this number" for each score dimension, built from
  // fields Analyzer.analyze already returns — no new computation, just
  // surfacing what was already there instead of discarding it.
  _explainScore(dimension, analysis){
    const has = analysis.has || {};
    switch(dimension){
      case "clarity": {
        const vagueIssue = (analysis.issues || []).find(i => /vague word/i.test(i.msg));
        return vagueIssue ? vagueIssue.msg : "No vague-language flags and sentence length looks reasonable.";
      }
      case "context": return has.context ? "A context/background section was detected." : "No 'Context:' / 'Background:' style section was detected.";
      case "specificity": return "Driven by presence of numbers, quoted terms, an output-format section, and overall length.";
      case "structure": return `Role: ${has.role?'present':'missing'} &middot; Task: ${has.task?'present':'missing'} &middot; Output: ${has.output?'present':'missing'} &middot; Constraints: ${has.constraints?'present':'missing'}`.replace(/&middot;/g, "·");
      case "constraints": {
        if (!has.constraints) return "No constraints or limiting phrases detected — output shape may be unpredictable.";
        const parts = [];
        if (has.mustNotConstraints) parts.push("prohibitions (must not / avoid)");
        if (has.mustConstraints) parts.push("requirements (must / should)");
        return parts.length ? `Detected ${parts.join(" and ")}.` : "A constraints section was detected.";
      }
      case "output": return has.output ? "An explicit output-format instruction was detected." : "No explicit output-format instruction detected — the model has to guess the shape of the reply.";
      default: return "";
    }
  },

  _issueLine(issue){
    if (issue.level === "ok"){
      return `<div class="issue-ok"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 7 5 9.5 10.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>${Utils.escapeHtml(issue.msg)}</div>`;
    }
    const cls = issue.level === "error" ? "issue-error" : "issue-warn";
    const icon = issue.level === "error"
      ? '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.2" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 3.8v3.2M6.5 9v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
      : '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.8 12 11h-11Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 5.8v2.5M6.5 9.7v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
    return `<div class="issue-item ${cls}">${icon}<span>${Utils.escapeHtml(issue.msg)}</span></div>`;
  },

  _refreshEditorStatusline(){
    const ed = this.state.editor;
    const flagEl = document.getElementById("editorDirtyFlag");
    if (flagEl) flagEl.textContent = ed.dirty ? "Unsaved changes" : (ed.promptId ? "Saved" : "Draft — not yet saved");
    this._updateStatusCounts();
  },

  _updateEditorSidePanelDebounced(){
    if (!this._sidePanelDebounce) this._sidePanelDebounce = Utils.debounce(() => this._updateEditorSidePanel(), 260);
    this._sidePanelDebounce();
  },

  _updateEditorSidePanel(){
    const panel = document.getElementById("editorSidePanel");
    if (!panel || this.state.view !== "editor") return;
    const ed = this.state.editor;
    panel.innerHTML = this._renderEditorSidePanel(ed.body, ed.promptId, ed.blocks);
    this._wireSidePanelDropdowns();
  },

  // Wires the side panel's own dropdowns (scoring profile, model picker).
  // Called both right after renderEditor()'s initial paint and every time
  // _updateEditorSidePanel() replaces the panel's innerHTML, since a fresh
  // dropdown trigger element needs Dropdown.attach() run against it again —
  // attach() is safe to call repeatedly, it only wires elements that don't
  // already carry the data-dd-wired flag.
  _wireSidePanelDropdowns(){
    Dropdown.attach(this.workspace, {
      sidePanelProfileDD: CONFIG.SCORING_PROFILES.map(p => ({ value: p.id, label: p.label })),
      sidePanelModelDD: TokenEstimator.groupedModelOptions()
    }, (id, value) => {
      if (id === "sidePanelProfileDD") this.state.settings.scoringProfile = value;
      if (id === "sidePanelModelDD") this.state.settings.selectedModel = value;
      this.storage.setSetting("appSettings", this.state.settings);
      this._updateEditorSidePanel();
      if (id === "sidePanelModelDD") this._updateTokenMeter();
    }, ["sidePanelModelDD"]);
  },

  _updateValidationFlagDebounced(){
    if (!this._validationDebounce) this._validationDebounce = Utils.debounce(() => this._updateValidationFlag(), 350);
    this._validationDebounce();
  },

  /* ---- autosave: local drafts, debounced, no server round-trip ---- */
  _scheduleAutoSave(){
    if (!this.state.settings.autoSaveDrafts) return;
    clearTimeout(this._autoSaveTimer);
    const flag = document.getElementById("editorAutosaveFlag");
    if (flag) flag.textContent = "Autosaving…";
    const interval = parseInt(this.state.settings.autosaveInterval, 10) || 900;
    this._autoSaveTimer = setTimeout(async () => {
      await this._saveEditorPrompt(false, true);
      const f = document.getElementById("editorAutosaveFlag");
      if (f) f.textContent = "Draft autosaved " + Utils.formatClock();
    }, interval);
  },

  async _saveEditorPrompt(showToast, silent){
    const ed = this.state.editor;
    if (!ed.body.trim() && !ed.title.trim()) return;
    this._flashSaveIndicator("saving");
    let prompt;
    let previousBody = null;
    if (ed.promptId){
      prompt = this.pe.getPrompt(ed.promptId) || this.pe.newPromptSkeleton({ id: ed.promptId });
      previousBody = prompt.body; // capture BEFORE this save overwrites it, for the score-delta indicator below
    } else {
      prompt = this.pe.newPromptSkeleton();
      ed.promptId = prompt.id;
    }
    prompt.title = ed.title;
    prompt.body = ed.body;
    prompt.format = ed.format || "text";
    if (ed.blocks) prompt.blocks = ed.blocks;
    await this.pe.savePrompt(prompt);
    this.suggest.learnFromText(prompt.body, prompt.updatedAt);
    ed.dirty = false;
    this._refreshEditorStatusline();
    this._flashSaveIndicator("saved");
    this._flashScoreDelta(previousBody, prompt.body);
    if (showToast && !silent) this.toast("Prompt saved.", "success", 1800);
  },

  // Auto score-delta indicator on save — a brief "+6" / "-4" flash next to
  // the save indicator when a save meaningfully changes the Analyzer
  // score, so "did that edit actually help" has an answer without
  // manually reopening the analyzer panel. Only fires on a genuine change
  // (skips a no-op save where the body is identical) and only flashes for
  // a non-trivial delta (±2 or more) so tiny score jitter from unrelated
  // scoring-formula rounding doesn't create visual noise on every save.
  _flashScoreDelta(previousBody, newBody){
    if (previousBody === null || previousBody === newBody) return;
    const profileId = this.state.settings.scoringProfile;
    const before = Analyzer.analyze(previousBody, profileId).overall;
    const after = Analyzer.analyze(newBody, profileId).overall;
    const delta = after - before;
    if (Math.abs(delta) < 2) return;
    const el = document.getElementById("scoreDeltaFlash");
    if (!el) return;
    const color = delta > 0 ? "var(--accent-green)" : "var(--accent-red)";
    el.textContent = (delta > 0 ? "+" : "") + delta;
    el.style.color = color;
    el.classList.add("show");
    if (this._scoreDeltaTimeout) clearTimeout(this._scoreDeltaTimeout);
    this._scoreDeltaTimeout = setTimeout(() => el.classList.remove("show"), 3200);
  },

  /* ---------------------------------------------------------------------- */
  /* VARIABLE WIZARD — when a prompt written in the Editor contains          */
  /* {{variable}} placeholders, offer (never force) a step-by-step fill-in   */
  /* flow: one variable at a time, in order of first appearance, with a     */
  /* live preview, auto-substituting as the user goes and saving the final  */
  /* fully-filled prompt on completion.                                     */
  /* ---------------------------------------------------------------------- */

  // Debounced 2-second-after-typing-stops detector, matching the exact
  // timing requested. Deliberately its own timer, independent of the
  // general autosave interval (which is user-configurable in Settings for
  // a different purpose) so changing one never silently changes the other.
  _scheduleVariableWizardOffer(){
    clearTimeout(this._varWizardTimer);
    this._varWizardTimer = setTimeout(() => this._maybeOfferVariableWizard(), 2000);
  },

  _maybeOfferVariableWizard(){
    const ed = this.state.editor;
    const vars = TemplateEngine.extractVariables(ed.body);
    if (!vars.length){ this._hideVariableWizardOffer(); return; }
    // Don't re-offer for the exact same variable set the user already
    // dismissed or already completed in this editing session — otherwise
    // every subsequent 2-second pause would re-nag about the same
    // {{variables}} they've already said no to once.
    const signature = vars.join("|");
    if (this._dismissedVarSignature === signature) return;
    this._showVariableWizardOffer(vars);
  },

  _showVariableWizardOffer(vars){
    let el = document.getElementById("varWizardOffer");
    if (!el){
      el = document.createElement("div");
      el.id = "varWizardOffer";
      el.className = "var-wizard-offer";
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <span>${vars.length} variable${vars.length===1?'':'s'} detected — fill them in step by step?</span>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" id="varWizardDismissBtn">Not now</button>
        <button class="btn btn-primary btn-sm" id="varWizardStartBtn">Fill in…</button>
      </div>`;
    el.classList.add("show");
    const signature = vars.join("|");
    document.getElementById("varWizardDismissBtn").onclick = () => {
      this._dismissedVarSignature = signature;
      this._hideVariableWizardOffer();
    };
    document.getElementById("varWizardStartBtn").onclick = () => {
      this._hideVariableWizardOffer();
      this.openVariableWizard();
    };
  },

  _hideVariableWizardOffer(){
    const el = document.getElementById("varWizardOffer");
    if (el) el.classList.remove("show");
  },

  // The step-by-step wizard itself: one {{variable}} per screen, in order
  // of first appearance in the body, with Back/Next, a live preview of the
  // substitution so far, and a final Save that writes the fully-rendered
  // prompt via the existing, already-tested TemplateEngine.render (so a
  // variable used more than once is filled once and substituted
  // everywhere it appears, same guarantee the Templates Fill modal has).
  openVariableWizard(){
    const ed = this.state.editor;
    const vars = TemplateEngine.extractVariables(ed.body);
    if (!vars.length){ this.toast("No {{variables}} found to fill in.", "warn"); return; }
    const originalBody = ed.body;
    const values = {};
    let step = 0;

    this.openModal({
      title: "Fill in variables", size: "modal-lg", closeOnOverlay: false,
      bodyHtml: `<div id="varWizardBody"></div>`,
      footerHtml: `
        <button class="btn btn-ghost" id="vwBackBtn">Back</button>
        <button class="btn btn-primary" id="vwNextBtn">Next</button>`,
      onMount: (modal) => {
        const body = modal.querySelector("#varWizardBody");
        const backBtn = modal.querySelector("#vwBackBtn");
        const nextBtn = modal.querySelector("#vwNextBtn");

        const renderStep = () => {
          const name = vars[step];
          const isLast = step === vars.length - 1;
          const preview = TemplateEngine.render(originalBody, values);
          body.innerHTML = `
            <div style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-bottom:10px">Step ${step + 1} of ${vars.length}</div>
            <div class="field">
              <label class="field-label" for="vwInput">${Utils.escapeHtml(TemplateEngine.humanizeVarName(name))}</label>
              <textarea class="textarea" id="vwInput" rows="2" placeholder="{{${Utils.escapeHtml(name)}}}" autofocus>${Utils.escapeHtml(values[name] || "")}</textarea>
            </div>
            <div class="field">
              <label class="field-label">Preview so far</label>
              <pre style="background:var(--editor-bg);border:1px solid var(--border);border-radius:var(--r-md);padding:12px;font-family:var(--font-mono);font-size:12px;white-space:pre-wrap;word-break:break-word;color:var(--text-secondary);max-height:220px;overflow-y:auto;margin:0">${Utils.escapeHtml(preview)}</pre>
            </div>`;
          backBtn.disabled = step === 0;
          backBtn.style.opacity = step === 0 ? "0.4" : "1";
          nextBtn.textContent = isLast ? "Save prompt" : "Next";
          const input = modal.querySelector("#vwInput");
          input.focus();
          input.addEventListener("input", () => { values[name] = input.value; });
        };

        const commitCurrentField = () => {
          const input = modal.querySelector("#vwInput");
          if (input) values[vars[step]] = input.value;
        };

        backBtn.addEventListener("click", () => {
          if (step === 0) return;
          commitCurrentField();
          step--;
          renderStep();
        });
        nextBtn.addEventListener("click", async () => {
          commitCurrentField();
          if (step < vars.length - 1){
            step++;
            renderStep();
            return;
          }
          // Final step -> substitute everywhere and save, per the
          // "auto fill the variable and Save the final prompt" spec.
          const finalBody = TemplateEngine.render(originalBody, values);
          ed.body = finalBody;
          ed.dirty = true;
          const ta = document.getElementById("editorTextarea");
          if (ta) ta.value = finalBody;
          this._pushEditorUndoSnapshot(finalBody);
          this._syncEditorGutter();
          this._syncEditorHighlight();
          this._updateTokenMeter();
          this._refreshEditorStatusline();
          this._updateEditorSidePanelDebounced();
          await this._saveEditorPrompt(true, false);
          this.closeModal();
          this._dismissedVarSignature = vars.join("|"); // don't re-offer for a set that was just completed
        });

        renderStep();
      }
    });
  },

  _flashSaveIndicator(kind){
    const el = document.getElementById("saveIndicator");
    if (!el) return;
    el.className = "save-indicator " + kind;
    el.textContent = kind === "saving" ? "Saving…" : "Saved " + Utils.formatClock();
    if (kind === "saved") setTimeout(() => { if (el.className.includes("saved")) el.className = "save-indicator"; }, 2400);
  },

  /* ---- Suggestion popup (autocomplete) ---- */
  _triggerSuggestionsManually(snippetMode){
    const ta = document.getElementById("editorTextarea");
    if (!ta) return;
    ta.focus();
    this._updateSuggestions(ta, true);
  },

  _editorKeydown(e){
    const ta = e.target;
    const popup = this._suggestionPopup;

    if (popup.open && popup.items.length){
      if (e.key === "ArrowDown"){ e.preventDefault(); popup.activeIndex = (popup.activeIndex + 1) % popup.items.length; this._renderSuggestionPopup(); return; }
      if (e.key === "ArrowUp"){ e.preventDefault(); popup.activeIndex = (popup.activeIndex - 1 + popup.items.length) % popup.items.length; this._renderSuggestionPopup(); return; }
      if (e.key === "Tab" || e.key === "Enter"){ e.preventDefault(); this._acceptSuggestion(ta, popup.items[popup.activeIndex]); return; }
      if (e.key === "Escape"){ e.preventDefault(); this._closeSuggestionPopup(); return; }
    } else if (popup.open && e.key === "Escape"){
      // Empty-hint state (e.g. bare "//" with nothing saved yet) — Escape
      // should still dismiss it even though there's no item list to navigate.
      e.preventDefault(); this._closeSuggestionPopup(); return;
    }

    if (e.ctrlKey && e.code === "Space"){ e.preventDefault(); this._updateSuggestions(ta, true); return; }

    // Let normal typing fall through; input handler re-evaluates suggestions.
  },

  _updateSuggestions(ta, force){
    if (!this.state.settings.suggestionsEnabled && !force){ this._closeSuggestionPopup(); return; }
    const cursor = ta.selectionStart;
    const before = ta.value.slice(0, cursor);

    // Single "/trig" snippet expansion — the ORIGINAL, exact-trigger-word
    // behavior, checked first since it's the most established workflow and
    // takes priority when a saved snippet trigger actually matches.
    const snipTrigger = SnippetManager.detectTrigger(before);
    if (snipTrigger && snipTrigger.length >= 1){
      const matches = SnippetManager.matchCandidates(this.pe, snipTrigger);
      if (matches.length){
        this._suggestionPopup = {
          open: true, activeIndex: 0, kind: "snippet",
          items: matches.slice(0, 8).map(s => ({ text: s.body, label: s.trigger, src: "snippet", snippetId: s.id, replaceFrom: cursor - snipTrigger.length }))
        };
        this._positionAndRenderPopup(ta);
        return;
      }
    }

    // The wider "//" "///" "\" "\\" family — live search against a different
    // content source per prefix, opens even with an empty query (shows recent
    // items) so the popup responds the instant the prefix itself is typed.
    const trig = TriggerDetector.detect(before);
    if (trig){
      const kind = TriggerDetector.kindForPrefix(trig.prefix);
      if (kind){
        const candidates = TriggerDetector.candidatesFor(kind, trig.query, { promptEngine: this.pe, searchEngine: this.search });
        const replaceFrom = cursor - trig.fullMatch.length;
        if (candidates.length){
          this._suggestionPopup = {
            open: true, activeIndex: 0, kind: "trigger:" + kind,
            items: candidates.map(c => ({ text: c.text, label: c.label, src: kind, meta: c.meta, replaceFrom }))
          };
          this._positionAndRenderPopup(ta);
          return;
        } else if (trig.query === "" ){
          // Bare prefix with nothing to show yet (e.g. no saved templates) —
          // still show an empty-state hint rather than silently doing nothing,
          // so the user knows the prefix was recognized.
          this._suggestionPopup = { open: true, activeIndex: 0, kind: "trigger:" + kind, items: [], emptyHint: TriggerDetector._emptyHint(kind) };
          this._positionAndRenderPopup(ta);
          return;
        }
      }
    }

    const contextWindow = before.slice(-140);
    const raw = this.suggest.getSuggestions(contextWindow, 8);
    if (!raw.length || (!force && contextWindow.trim().length < 2)){ this._closeSuggestionPopup(); return; }

    const trailingSpace = /\s$/.test(contextWindow);
    const currentWord = trailingSpace ? "" : Utils.tokenize(contextWindow).slice(-1)[0] || "";
    const replaceFrom = trailingSpace ? cursor : cursor - currentWord.length;

    this._suggestionPopup = {
      open: true, activeIndex: 0, kind: "learned",
      items: raw.map(r => ({ text: r.text, label: r.text, src: r.type === "phrase" ? "phrase" : "word", replaceFrom }))
    };
    this._positionAndRenderPopup(ta);
  },

  _positionAndRenderPopup(ta){
    // Approximate caret pixel position using a mirror technique-free heuristic:
    // place the popup just under the textarea's visible caret row using a
    // hidden mirror div for accurate coordinates.
    const coords = this._caretCoordinates(ta, ta.selectionStart);
    const popup = document.getElementById("suggestionPopup");
    if (!popup) return;
    popup.style.left = coords.left + "px";
    popup.style.top = (coords.top + 20) + "px";
    this._renderSuggestionPopup();
  },

  _caretCoordinates(el, position){
    // Mirror div technique: clone textarea styling into an offscreen div,
    // insert a marker span at the caret position, measure its offset.
    if (!this._mirrorDiv){
      this._mirrorDiv = document.createElement("div");
      this._mirrorDiv.style.cssText = "position:absolute;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;top:0;left:-9999px;";
      document.body.appendChild(this._mirrorDiv);
    }
    const style = window.getComputedStyle(el);
    const props = ["fontFamily","fontSize","fontWeight","lineHeight","letterSpacing","padding","border","boxSizing","width","tabSize"];
    props.forEach(p => this._mirrorDiv.style[p] = style[p]);
    this._mirrorDiv.style.width = el.clientWidth + "px";
    const before = el.value.slice(0, position);
    this._mirrorDiv.textContent = before;
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    this._mirrorDiv.appendChild(marker);
    const elRect = el.getBoundingClientRect();
    const editorSurfaceRect = el.closest(".editor-surface").getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = this._mirrorDiv.getBoundingClientRect();
    const relLeft = Utils.clamp(markerRect.left - mirrorRect.left, 0, el.clientWidth - 240);
    const relTop = Utils.clamp((markerRect.top - mirrorRect.top) - el.scrollTop, 0, el.clientHeight);
    return {
      left: (elRect.left - editorSurfaceRect.left) + relLeft,
      top: (elRect.top - editorSurfaceRect.top) + relTop
    };
  },

  _renderSuggestionPopup(){
    const popup = document.getElementById("suggestionPopup");
    const state = this._suggestionPopup;
    if (!popup || !state.open){ if(popup) popup.classList.remove("open"); return; }
    if (!state.items.length){
      if (state.emptyHint){
        popup.innerHTML = `<div class="palette-empty" style="padding:14px">${Utils.escapeHtml(state.emptyHint)}</div>`;
        popup.classList.add("open");
      } else {
        popup.classList.remove("open");
      }
      return;
    }
    popup.innerHTML = state.items.map((it, i) => `
      <div class="suggestion-item${i===state.activeIndex?' active':''}" data-idx="${i}">
        <span class="suggestion-text">${Utils.escapeHtml(it.label)}</span>
        <span class="suggestion-src">${it.src}</span>
      </div>`).join("");
    popup.classList.add("open");
    popup.querySelectorAll(".suggestion-item").forEach(el => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const ta = document.getElementById("editorTextarea");
        this._acceptSuggestion(ta, state.items[parseInt(el.dataset.idx, 10)]);
      });
    });
  },

  _closeSuggestionPopup(){
    this._suggestionPopup = { open: false, items: [], activeIndex: 0, kind: null };
    const popup = document.getElementById("suggestionPopup");
    if (popup) popup.classList.remove("open");
  },

  async _acceptSuggestion(ta, item){
    if (!item) return;
    const cursor = ta.selectionStart;
    const from = Utils.clamp(item.replaceFrom, 0, cursor);
    const before = ta.value.slice(0, from);
    const after = ta.value.slice(cursor);
    const insertion = item.text;
    ta.value = before + insertion + after;
    const newCursor = before.length + insertion.length;
    ta.setSelectionRange(newCursor, newCursor);
    this.state.editor.body = ta.value;
    this.state.editor.dirty = true;
    this._pushEditorUndoSnapshotDebounced(ta.value);
    this._closeSuggestionPopup();
    this._syncEditorGutter();
    this._syncEditorHighlight();
    this._updateTokenMeter();
    this._refreshEditorStatusline();
    this._updateEditorSidePanelDebounced();
    this._scheduleAutoSave();
    if (item.src === "snippet" && item.snippetId) await this.pe.incrementSnippetUse(item.snippetId);
    if (item.src === "template" && item.meta) await this.pe.incrementTemplateUse(item.meta);
    if (item.src === "pattern" && item.meta && String(item.meta).startsWith("cpat_")) await this.pe.incrementCustomPatternUse(item.meta);
    ta.focus();
  }
};
