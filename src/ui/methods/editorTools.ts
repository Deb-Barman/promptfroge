// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Analyzer } from "../../core/Analyzer";
import { Utils } from "../../core/Utils";
import { SecurityScanner } from "../../core/SecurityScanner";
import { PromptTools } from "../../core/PromptTools";
import { PromptCleaner } from "../../core/PromptCleaner";
import { TokenEstimator } from "../../core/TokenEstimator";
import { MessageComposer } from "../../core/MessageComposer";
import { ModelGuide } from "../../core/ModelGuide";
import { CONFIG } from "../../core/CONFIG";

/** UIManager methods: editorTools. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const editorToolsMethods = {
  /* ---------------------------------------------------------------------- */
  /* Improver / Security / Cleaner modals                                   */
  /* ---------------------------------------------------------------------- */
  openImproverModal(){
    const body = this.state.editor.body;
    const suggestions = Analyzer.improve(body);
    this.openModal({
      title: "Prompt Improver",
      bodyHtml: `
        <p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-4)">Rule-based suggestions from local heuristics — no AI call is made.</p>
        ${suggestions.length ? suggestions.map(s => `
          <div class="issue-item issue-warn" style="align-items:flex-start">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.8 12 11h-11Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 5.8v2.5M6.5 9.7v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            <span><b>${Utils.escapeHtml(s.title)}</b><br><span style="color:var(--text-tertiary)">${Utils.escapeHtml(s.detail)}</span></span>
          </div>`).join("") : `<div class="issue-ok"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 7 5 9.5 10.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>This prompt already covers the core structural elements.</div>`}`,
      footerHtml: `<button class="btn btn-primary" id="improverCloseBtn">Got it</button>`,
      onMount: (modal) => modal.querySelector("#improverCloseBtn").addEventListener("click", () => this.closeModal())
    });
  },

  openSecurityModal(){
    const findings = SecurityScanner.scan(this.state.editor.body);
    this.openModal({
      title: "Security Check",
      bodyHtml: findings.length ? `
        <p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-4)">Possible sensitive data detected in this prompt — review before saving or exporting.</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${findings.map(f => `
            <div class="security-alert">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.8 13 12h-12Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M7 5.6v3M7 9.8v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              <span><b>${Utils.escapeHtml(f.label)}</b> — ${f.count} match${f.count>1?'es':''} (e.g. <code>${Utils.escapeHtml(f.sample)}</code>)</span>
            </div>`).join("")}
        </div>` : `<div class="issue-ok"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 7 5 9.5 10.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>No secrets, keys, or credentials detected.</div>`,
      footerHtml: `<button class="btn btn-primary" id="secCloseBtn">Close</button>`,
      onMount: (modal) => modal.querySelector("#secCloseBtn").addEventListener("click", () => this.closeModal())
    });
  },

  // Shared apply-and-sync step for editor body transformations — every
  // toolbar action that rewrites state.editor.body in place needs this
  // same sequence (textarea, undo history, gutter/highlight, token meter,
  // statusline, side panel); factored here for the 10 new toolbar actions
  // below rather than repeating it in each one.
  _applyEditorBodyChange(newBody){
    this.state.editor.body = newBody;
    this.state.editor.dirty = true;
    const ta = document.getElementById("editorTextarea");
    if (ta) ta.value = newBody;
    this._pushEditorUndoSnapshot(newBody);
    this._syncEditorGutter();
    this._syncEditorHighlight();
    this._updateTokenMeter();
    this._refreshEditorStatusline();
    this._updateEditorSidePanelDebounced();
  },

  // --- 10 new editor toolbar tools ---------------------------------------

  _runShortenOnEditor(){
    const body = this.state.editor.body;
    const shortened = PromptTools.shorten(body);
    if (shortened === body.trim()){ this.toast("Nothing obvious to trim — already tight.", "info"); return; }
    const before = Utils.tokenize(body).length, after = Utils.tokenize(shortened).length;
    this._applyEditorBodyChange(shortened);
    this.toast(`Shortened: ${before} → ${after} words.`, "success");
  },

  _runBulletifyOnEditor(){
    const body = this.state.editor.body;
    const out = PromptTools.bulletify(body);
    if (out === body){ this.toast("Nothing prose-like found to convert.", "info"); return; }
    this._applyEditorBodyChange(out);
    this.toast("Converted to bullets.", "success");
  },

  _runAddCotOnEditor(){
    const body = this.state.editor.body;
    if (/step by step/i.test(body)){ this.toast("This prompt already asks for step-by-step reasoning.", "info"); return; }
    this._applyEditorBodyChange(body + PromptTools.chainOfThoughtBlock());
    this.toast("Added a reasoning-steps instruction.", "success");
  },

  _runTableifyOnEditor(){
    const table = PromptTools.tableify(this.state.editor.body);
    if (!table){ this.toast("Couldn't find a bulleted or numbered list to convert.", "warn"); return; }
    this._applyEditorBodyChange(this.state.editor.body.trim() + "\n\n" + table);
    this.toast("Table added below the prompt.", "success");
  },

  openMoreToolsMenu(){
    const existing = document.getElementById("moreToolsPopover");
    if (existing){ existing.remove(); return; }
    const anchor = document.querySelector('[data-action="editor-more-tools"]');
    if (!anchor) return;
    const items = [
      ["editor-tableify", "Table-ify list", "Convert a bulleted list into a Markdown table"],
      ["editor-tone-shift", "Tone shift…", "Reword toward Formal, Casual, Persuasive, or Neutral"],
      ["editor-insert-persona", "Insert persona…", "Add a curated expert Role opener"],
      ["editor-scan-ambiguity", "Scan for ambiguity", "Flag sentences with unclear pronoun references"],
      ["editor-scan-adversarial", "Scan for risky phrasing", "Flag injection/jailbreak-style phrasing in your own template"],
      ["editor-audience-framing", "Audience framing…", "Add an \"explain for this audience\" line"],
      ["editor-find-redundancy", "Find repeated sentences", "Flag near-duplicate sentences within this prompt"]
    ];
    const pop = document.createElement("div");
    pop.id = "moreToolsPopover";
    pop.className = "dd-panel open";
    pop.style.cssText = "position:fixed;z-index:400;min-width:240px;max-width:min(90vw,300px)";
    pop.innerHTML = items.map(([action, label, desc]) => `
      <div class="dd-option" data-menu-action="${action}" style="flex-direction:column;align-items:flex-start;gap:1px">
        <span style="font-weight:600">${label}</span>
        <span style="font-size:var(--fs-2xs);color:var(--text-tertiary);white-space:normal">${desc}</span>
      </div>`).join("");
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    pop.style.top = Math.min(r.bottom + 4, window.innerHeight - popRect.height - 8) + "px";
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - popRect.width - 8)) + "px";
    pop.addEventListener("click", (e) => {
      const item = e.target.closest("[data-menu-action]");
      if (!item) return;
      pop.remove();
      this._runAction(item.dataset.menuAction);
    });
    const dismiss = (e) => { if (!pop.contains(e.target) && e.target !== anchor){ pop.remove(); document.removeEventListener("click", dismiss, true); } };
    setTimeout(() => document.addEventListener("click", dismiss, true), 0);
  },

  openToneShiftModal(){
    const tones = [["formal","Formal"],["casual","Casual"],["persuasive","Persuasive"],["neutral","Neutral (strip hype words)"]];
    this.openModal({
      title: "Tone shift",
      bodyHtml: `<p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-4)">Light word-and-phrase substitution toward the tone you pick — it won't restructure sentences, just nudge the register.</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${tones.map(([id,label]) => `<button class="btn btn-secondary" style="justify-content:flex-start" data-tone="${id}">${label}</button>`).join("")}
        </div>`,
      footerHtml: `<button class="btn btn-ghost" id="toneCloseBtn">Cancel</button>`,
      onMount: (modal) => {
        modal.querySelector("#toneCloseBtn").addEventListener("click", () => this.closeModal());
        modal.querySelectorAll("[data-tone]").forEach(btn => btn.addEventListener("click", () => {
          const tone = btn.dataset.tone;
          const out = PromptTools.toneShift(this.state.editor.body, tone);
          this.closeModal();
          if (out === this.state.editor.body){ this.toast("No matching phrases to shift for that tone.", "info"); return; }
          this._applyEditorBodyChange(out);
          this.toast(`Shifted toward ${tone}.`, "success");
        }));
      }
    });
  },

  openPersonaPickerModal(){
    this.openModal({
      title: "Insert persona",
      bodyHtml: `<p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-4)">Adds a Role opener at the very start of the prompt.</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${PromptTools.PERSONAS.map(p => `<button class="btn btn-secondary" style="justify-content:flex-start" data-persona="${p.id}">${Utils.escapeHtml(p.label)}</button>`).join("")}
        </div>`,
      footerHtml: `<button class="btn btn-ghost" id="personaCloseBtn">Cancel</button>`,
      onMount: (modal) => {
        modal.querySelector("#personaCloseBtn").addEventListener("click", () => this.closeModal());
        modal.querySelectorAll("[data-persona]").forEach(btn => btn.addEventListener("click", () => {
          const persona = PromptTools.PERSONAS.find(p => p.id === btn.dataset.persona);
          this.closeModal();
          const body = this.state.editor.body;
          const out = persona.text + (body.trim() ? "\n\n" + body : "");
          this._applyEditorBodyChange(out);
          this.toast(`Inserted "${persona.label}" persona.`, "success");
        }));
      }
    });
  },

  openAmbiguityModal(){
    const findings = PromptTools.scanAmbiguity(this.state.editor.body);
    this.openModal({
      title: "Ambiguity scan",
      bodyHtml: findings.length ? `
        <p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-4)">${findings.length} sentence${findings.length===1?'':'s'} start with a pronoun that may not clearly point back to something — worth a check.</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${findings.map(f => `<div class="issue-item issue-warn"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.8 12 11h-11Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 5.8v2.5M6.5 9.7v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><span>"${Utils.escapeHtml(f.sentence)}${f.sentence.length>=80?'…':''}"</span></div>`).join("")}
        </div>` : `<div class="issue-ok"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 7 5 9.5 10.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>No obviously ambiguous references found.</div>`,
      footerHtml: `<button class="btn btn-primary" id="ambigCloseBtn">Close</button>`,
      onMount: (modal) => modal.querySelector("#ambigCloseBtn").addEventListener("click", () => this.closeModal())
    });
  },

  openAdversarialScanModal(){
    const findings = PromptTools.scanAdversarial(this.state.editor.body);
    this.openModal({
      title: "Risky phrasing scan",
      bodyHtml: `<p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-4)">Checks your own prompt template for phrasing commonly associated with jailbreak/injection attempts — useful if this prompt will wrap untrusted user input.</p>` + (findings.length ? `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${findings.map(f => `<div class="security-alert"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.8 13 12h-12Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M7 5.6v3M7 9.8v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span>${Utils.escapeHtml(f.label)}</span></div>`).join("")}
        </div>` : `<div class="issue-ok"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 7 5 9.5 10.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>No known adversarial patterns detected.</div>`),
      footerHtml: `<button class="btn btn-primary" id="advCloseBtn">Close</button>`,
      onMount: (modal) => modal.querySelector("#advCloseBtn").addEventListener("click", () => this.closeModal())
    });
  },

  openAudienceFramingModal(){
    this.openModal({
      title: "Audience framing",
      bodyHtml: `<p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-4)">Adds one line telling the model who the response is for.</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${PromptTools.AUDIENCES.map(a => `<button class="btn btn-secondary" style="justify-content:flex-start" data-audience="${a.id}">${Utils.escapeHtml(a.label)}</button>`).join("")}
        </div>`,
      footerHtml: `<button class="btn btn-ghost" id="audCloseBtn">Cancel</button>`,
      onMount: (modal) => {
        modal.querySelector("#audCloseBtn").addEventListener("click", () => this.closeModal());
        modal.querySelectorAll("[data-audience]").forEach(btn => btn.addEventListener("click", () => {
          const aud = PromptTools.AUDIENCES.find(a => a.id === btn.dataset.audience);
          this.closeModal();
          this._applyEditorBodyChange(this.state.editor.body.trim() + "\n\n" + aud.text);
          this.toast("Added audience framing.", "success");
        }));
      }
    });
  },

  openRedundancyModal(){
    const findings = PromptTools.findInternalRedundancy(this.state.editor.body);
    this.openModal({
      title: "Repeated sentences",
      bodyHtml: findings.length ? `
        <p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-4)">${findings.length} pair${findings.length===1?'':'s'} of sentences in this prompt say close to the same thing.</p>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${findings.map(f => `<div class="issue-item issue-warn" style="flex-direction:column;align-items:flex-start;gap:4px"><span>"${Utils.escapeHtml(f.a)}"</span><span style="color:var(--text-tertiary)">≈ "${Utils.escapeHtml(f.b)}"</span></div>`).join("")}
        </div>` : `<div class="issue-ok"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 7 5 9.5 10.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>No near-duplicate sentences found (this catches close-to-verbatim repeats, not differently-worded restatements of the same point).</div>`,
      footerHtml: `<button class="btn btn-primary" id="redunCloseBtn">Close</button>`,
      onMount: (modal) => modal.querySelector("#redunCloseBtn").addEventListener("click", () => this.closeModal())
    });
  },

  async _runCleanerOnEditor(){
    const body = this.state.editor.body;
    const findings = PromptCleaner.inspect(body);
    const cleaned = PromptCleaner.autoClean(body);
    const whitespaceOnly = findings.every(f => f.type === "whitespace");
    if (cleaned !== body){
      this.state.editor.body = cleaned;
      this.state.editor.dirty = true;
      const ta = document.getElementById("editorTextarea");
      if (ta) ta.value = cleaned;
      this._pushEditorUndoSnapshot(cleaned);
      this._syncEditorGutter();
      this._syncEditorHighlight();
      this._updateTokenMeter();
      this._refreshEditorStatusline();
      this._updateEditorSidePanelDebounced();
    }
    if (!findings.length){
      this.toast("Nothing to clean — this prompt looks tidy.", "success");
      return;
    }
    this.openModal({
      title: "Prompt Cleaner",
      bodyHtml: `
        <p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-4)">${cleaned !== body ? "Whitespace was cleaned up automatically. " : ""}The following need a manual look:</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${findings.filter(f => f.type !== "whitespace" || cleaned === body).map(f => `<div class="issue-item issue-warn"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.8 12 11h-11Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 5.8v2.5M6.5 9.7v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><span>${Utils.escapeHtml(f.detail)}</span></div>`).join("") || "<div class=\"issue-ok\">All clear.</div>"}
        </div>`,
      footerHtml: `<button class="btn btn-primary" id="cleanCloseBtn">Close</button>`,
      onMount: (modal) => modal.querySelector("#cleanCloseBtn").addEventListener("click", () => this.closeModal())
    });
  },

  openVersionNoteModal(){
    this.openModal({
      title: "Save version",
      bodyHtml: `
        <div class="field">
          <label class="field-label" for="versionNoteInput">Version note <span class="field-hint">optional</span></label>
          <input class="input" id="versionNoteInput" placeholder="What changed?" maxlength="200">
        </div>`,
      footerHtml: `<button class="btn btn-ghost" id="vnCancelBtn">Cancel</button><button class="btn btn-primary" id="vnSaveBtn">Save version</button>`,
      onMount: (modal) => {
        const input = modal.querySelector("#versionNoteInput");
        modal.querySelector("#vnCancelBtn").addEventListener("click", () => this.closeModal());
        const submit = async () => {
          await this._saveEditorPrompt(false, true);
          const prompt = this.pe.getPrompt(this.state.editor.promptId);
          if (prompt) await this.versions.createVersion(prompt, input.value);
          this.closeModal();
          this.toast("Version saved.", "success", 1800);
          this._refreshEditorStatusline();
        };
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
        modal.querySelector("#vnSaveBtn").addEventListener("click", submit);
      }
    });
  },

  /* ---------------------------------------------------------------------- */
  /* "Copy as…" — renders the current prompt body as a ready-to-paste SDK/   */
  /* API snippet via MessageComposer. Everything here is local string        */
  /* formatting; no network call or AI call is ever made by this feature.   */
  /* ---------------------------------------------------------------------- */
  openCopyAsModal(){
    const body = this.state.editor.body;
    const model = TokenEstimator.getModel(this.state.settings.selectedModel || "claude");
    const formatsByVendor = {
      Anthropic: [{ id: "anthropic_json", label: "Messages API (JSON)" }, { id: "python_anthropic", label: "Python (anthropic SDK)" }, { id: "curl", label: "cURL" }],
      OpenAI: [{ id: "openai_json", label: "Chat Completions (JSON)" }, { id: "python_openai", label: "Python (openai SDK)" }, { id: "curl", label: "cURL" }],
      Google: [{ id: "python_gemini", label: "Python (google-generativeai)" }, { id: "openai_json", label: "Messages array (JSON)" }],
    };
    const formats = (formatsByVendor[model.vendor] || [{ id: "openai_json", label: "Messages array (JSON)" }]).concat([{ id: "langchain", label: "LangChain PromptTemplate" }]);
    let activeFormat = formats[0].id;

    this.openModal({
      title: "Copy as…", size: "modal-lg",
      bodyHtml: `
        <p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-3)">Formats this prompt into a ready-to-paste snippet, entirely on this device — nothing here is sent anywhere or calls any API.</p>
        <div class="pattern-tabs" id="copyAsTabs" style="margin-bottom:var(--sp-3)">
          ${formats.map(f => `<div class="pattern-tab ${f.id===activeFormat?'active':''}" data-format="${f.id}">${Utils.escapeHtml(f.label)}</div>`).join("")}
        </div>
        <pre id="copyAsPreview" style="background:var(--editor-bg);border:1px solid var(--border);border-radius:var(--r-md);padding:14px;font-family:var(--font-mono);font-size:12.5px;white-space:pre-wrap;word-break:break-word;color:var(--text-primary);max-height:340px;overflow-y:auto;margin:0"></pre>`,
      footerHtml: `<button class="btn btn-ghost" id="copyAsCloseBtn">Close</button><button class="btn btn-primary" id="copyAsCopyBtn">Copy to clipboard</button>`,
      onMount: (modal) => {
        const preview = modal.querySelector("#copyAsPreview");
        const render = () => { preview.textContent = MessageComposer.render(body, activeFormat, model); };
        render();
        modal.querySelectorAll("[data-format]").forEach(tab => {
          tab.addEventListener("click", () => {
            activeFormat = tab.dataset.format;
            modal.querySelectorAll("[data-format]").forEach(t => t.classList.toggle("active", t.dataset.format === activeFormat));
            render();
          });
        });
        modal.querySelector("#copyAsCloseBtn").addEventListener("click", () => this.closeModal());
        modal.querySelector("#copyAsCopyBtn").addEventListener("click", async () => {
          const text = preview.textContent;
          const ok = await this._copyToClipboard(text);
          this.toast(ok ? "Copied to clipboard." : "Couldn't copy — select the text manually.", ok ? "success" : "warn", 2000);
        });
      }
    });
  },

  // Clipboard write with a defensive fallback, matching the app's existing
  // pattern of never assuming a browser API is available (see
  // StorageManager._testLocalStorage). Never touches the network either way.
  async _copyToClipboard(text){
    try {
      if (navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch(e){ /* fall through to legacy path */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch(e){ return false; }
  },

  // "Wrap in XML tags" — Claude-style structuring transform. Non-destructive:
  // shows a confirm dialog with a preview-style explanation before applying,
  // matching the existing format-convert confirm flow in _handleFormatChange.
  _wrapEditorInXML(){
    const ed = this.state.editor;
    if (!ed.body.trim()){ this.toast("Nothing to wrap yet.", "warn"); return; }
    const wrapped = ModelGuide.wrapInXML(ed.body, ed.format || "text");
    this.confirmDialog({
      title: "Wrap sections in XML tags?",
      message: "This restructures your detected sections (Role:, Task:, etc.) into <role>, <task> style XML tags — the structuring Claude is trained to track most precisely. Your original text stays inside each tag; nothing is reworded.",
      confirmLabel: "Wrap in XML",
      onConfirm: () => {
        ed.body = wrapped;
        ed.dirty = true;
        const ta = document.getElementById("editorTextarea");
        if (ta) ta.value = wrapped;
        this._pushEditorUndoSnapshot(wrapped);
        this._syncEditorGutter();
        this._syncEditorHighlight();
        this._updateTokenMeter();
        this._refreshEditorStatusline();
        this._updateEditorSidePanelDebounced();
        this._scheduleAutoSave();
        this.toast("Wrapped sections in XML tags.", "success", 1800);
      }
    });
  },

  // "Adapt for model X" — a fuller structural port than the XML-wrap
  // shortcut alone. Reuses the "Copy as…" modal's tabbed-preview pattern
  // for visual consistency. Purely local text restructuring via
  // ModelGuide.adaptForModel; never rewrites wording, never calls any API.
  openAdaptModal(){
    const ed = this.state.editor;
    if (!ed.body.trim()){ this.toast("Nothing to adapt yet.", "warn"); return; }
    let activeModel = this.state.settings.selectedModel || "claude";

    this.openModal({
      title: "Adapt for a model", size: "modal-lg",
      bodyHtml: `
        <p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-3)">Restructures your prompt's sections to match that model's idioms — reordering and reformatting only, never rewording. Nothing here is sent anywhere.</p>
        <div class="pattern-tabs" id="adaptModelTabs" style="margin-bottom:var(--sp-3)">
          ${CONFIG.MODELS.filter(m => m.id !== "generic").map(m => `<div class="pattern-tab ${m.id===activeModel?'active':''}" data-model="${m.id}">${Utils.escapeHtml(m.label.split(" (")[0])}</div>`).join("")}
        </div>
        <pre id="adaptPreview" style="background:var(--editor-bg);border:1px solid var(--border);border-radius:var(--r-md);padding:14px;font-family:var(--font-mono);font-size:12.5px;white-space:pre-wrap;word-break:break-word;color:var(--text-primary);max-height:320px;overflow-y:auto;margin:0"></pre>`,
      footerHtml: `<button class="btn btn-ghost" id="adaptCancelBtn">Cancel</button><button class="btn btn-primary" id="adaptApplyBtn">Apply to editor</button>`,
      onMount: (modal) => {
        const preview = modal.querySelector("#adaptPreview");
        const render = () => { preview.textContent = ModelGuide.adaptForModel(ed.body, ed.format || "text", activeModel); };
        render();
        modal.querySelectorAll("[data-model]").forEach(tab => {
          tab.addEventListener("click", () => {
            activeModel = tab.dataset.model;
            modal.querySelectorAll("[data-model]").forEach(t => t.classList.toggle("active", t.dataset.model === activeModel));
            render();
          });
        });
        modal.querySelector("#adaptCancelBtn").addEventListener("click", () => this.closeModal());
        modal.querySelector("#adaptApplyBtn").addEventListener("click", () => {
          const adapted = preview.textContent;
          ed.body = adapted;
          ed.dirty = true;
          const ta = document.getElementById("editorTextarea");
          if (ta) ta.value = adapted;
          this._pushEditorUndoSnapshot(adapted);
          this._syncEditorGutter();
          this._syncEditorHighlight();
          this._updateTokenMeter();
          this._refreshEditorStatusline();
          this._updateEditorSidePanelDebounced();
          this._scheduleAutoSave();
          this.closeModal();
          this.toast(`Adapted for ${TokenEstimator.getModel(activeModel).label.split(" (")[0]}.`, "success", 1800);
        });
      }
    });
  }
};
