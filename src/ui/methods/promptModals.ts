// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Dropdown } from "../Dropdown";
import { CONFIG } from "../../core/CONFIG";
import { Utils } from "../../core/Utils";

/** UIManager methods: promptModals. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const promptModalsMethods = {
  openNewPromptModal(){
    const defaultCategory = this.state.settings.defaultCategory || "custom";
    let mode = "manual"; // "manual" | "paste" | "upload"
    const exampleJson = JSON.stringify([
      { "Title": "Example title", "Category": "coding", "Tags": "python, api", "Prompt": "You are a Python expert. ..." }
    ], null, 2);

    this.openModal({
      title: "New Prompt", size: "modal-lg",
      bodyHtml: `
        <div class="pattern-tabs" id="npModeTabs" style="margin-bottom:var(--sp-4)">
          <div class="pattern-tab active" data-mode="manual">Fill in manually</div>
          <div class="pattern-tab" data-mode="paste">Paste JSON</div>
          <div class="pattern-tab" data-mode="upload">Upload JSON file</div>
        </div>

        <div id="npManualPane">
          <div class="field">
            <label class="field-label" for="npTitleInput">Title <span class="field-hint">optional</span></label>
            <input class="input" id="npTitleInput" placeholder="Untitled prompt" maxlength="200">
          </div>
          <div class="field">
            <label class="field-label" id="npCategoryLabel">Category</label>
            ${Dropdown.renderTrigger({ id: "npCategoryDD", value: defaultCategory, options: CONFIG.CATEGORIES.map(c => ({ value: c.id, label: c.label, swatchColor: c.color })) })}
          </div>
          <div class="field">
            <label class="field-label" for="npTagsInput">Tags <span class="field-hint">comma-separated, optional</span></label>
            <input class="input" id="npTagsInput" placeholder="e.g. onboarding, internal">
          </div>
        </div>

        <div id="npImportPane" style="display:none">
          ${this._renderImportPaneMarkup("np", exampleJson)}
        </div>`,
      footerHtml: `<button class="btn btn-ghost" id="npCancelBtn">Cancel</button><button class="btn btn-primary" id="npCreateBtn">Start writing</button>`,
      onMount: (modal) => {
        Dropdown.attach(modal, { npCategoryDD: CONFIG.CATEGORIES.map(c => ({ value: c.id, label: c.label, swatchColor: c.color })) });
        modal.querySelector("#npCancelBtn").addEventListener("click", () => this.closeModal());
        const createBtn = modal.querySelector("#npCreateBtn");

        const setMode = (newMode) => {
          mode = newMode;
          modal.querySelectorAll("#npModeTabs [data-mode]").forEach(t => t.classList.toggle("active", t.dataset.mode === newMode));
          modal.querySelector("#npManualPane").style.display = newMode === "manual" ? "" : "none";
          modal.querySelector("#npImportPane").style.display = newMode === "manual" ? "none" : "";
          modal.querySelector("#npImportPasteWrap").style.display = newMode === "paste" ? "" : "none";
          modal.querySelector("#npImportUploadWrap").style.display = newMode === "upload" ? "" : "none";
          createBtn.textContent = newMode === "manual" ? "Start writing" : "Import";
        };
        modal.querySelectorAll("#npModeTabs [data-mode]").forEach(tab => {
          tab.addEventListener("click", () => setMode(tab.dataset.mode));
        });

        this._wireImportPane(modal, "np");

        const createManual = () => {
          const title = modal.querySelector("#npTitleInput").value;
          const category = modal.querySelector("#npCategoryDD").dataset.ddValue;
          const tags = modal.querySelector("#npTagsInput").value.split(",").map(t => t.trim()).filter(Boolean);
          this.state.editor = { promptId: null, title, body: "", dirty: !!title, blocks: null, format: "text" };
          this._pendingNewPromptMeta = { category, tags };
          this.closeModal();
          this.navigate("editor");
          setTimeout(() => document.getElementById("editorTextarea")?.focus(), 60);
        };

        const createFromImport = async () => {
          const records = this._readImportPaneRecords(modal, "np", "prompt");
          if (!records) return; // error already toasted by _readImportPaneRecords
          if (!records.length){ this.toast("No records to import.", "warn"); return; }
          let created = 0;
          for (const rec of records){
            if (!rec.body.trim() && !rec.title.trim()) continue;
            const validCategory = CONFIG.CATEGORIES.some(c => c.id === rec.category) ? rec.category : (defaultCategory || "custom");
            const prompt = this.pe.newPromptSkeleton({ title: rec.title, body: rec.body, category: validCategory, tags: rec.tags || [] });
            await this.pe.savePrompt(prompt);
            created++;
          }
          this.closeModal();
          if (created === 1){
            // A single imported prompt goes straight to the editor, same as
            // manual creation does — otherwise importing just one record
            // would feel like it did less than filling the form by hand.
            const only = this.pe.listPrompts().sort((a,b)=>b.updatedAt-a.updatedAt)[0];
            if (only) this._loadPromptIntoEditor(only.id);
            this.navigate("editor");
          } else {
            this.toast(`Imported ${created} prompt${created===1?'':'s'}.`, "success", 2000);
            this.renderView();
          }
        };

        modal.querySelector("#npTitleInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && mode === "manual") createManual(); });
        createBtn.addEventListener("click", () => {
          if (mode === "manual") createManual();
          else createFromImport();
        });
      }
    });
  },

  // Flexible date-string parser backing the Dashboard's date search: accepts
  // "Today"/"Yesterday", "12 September 2026" / "September 12, 2026", and
  // "12/9/2026" or "2026-09-12" (day/month/year for slash-separated, since
  // that's the format used throughout the rest of the app's date displays —
  // NOT US month/day/year). Returns a Date at local midnight, or null if
  // the string doesn't match any supported shape.
  _parseFlexibleDate(raw){
    const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    const s = (raw || "").trim().toLowerCase();
    if (!s) return null;
    if (s === "today"){ const d = new Date(); d.setHours(0,0,0,0); return d; }
    if (s === "yesterday"){ const d = new Date(); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); return d; }
    let m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})$/) ||
            s.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
    if (m){
      let day, monthName, year;
      if (/^\d+$/.test(m[1])){ day = +m[1]; monthName = m[2]; year = +m[3]; }
      else { monthName = m[1]; day = +m[2]; year = +m[3]; }
      const monthIdx = MONTHS.findIndex(mo => mo.startsWith(monthName));
      if (monthIdx === -1) return null;
      const d = new Date(year, monthIdx, day);
      return isNaN(d) ? null : d;
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2]-1, +m[3]);
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return new Date(+m[3], +m[2]-1, +m[1]);
    return null;
  },

  openDateSearchModal(){
    const st = { fromText: "", toText: "", mode: "single", sort: "newest", types: new Set(["prompts","templates","patterns","chains","history"]) };
    const TYPE_LABELS = { prompts: "Prompts", templates: "Templates", patterns: "Patterns (custom)", chains: "Chains", history: "Saved versions" };

    const gatherResults = async () => {
      const fromDate = this._parseFlexibleDate(st.fromText);
      const toDate = st.mode === "range" ? this._parseFlexibleDate(st.toText) : fromDate;
      if (!fromDate) return { error: "Enter or pick a valid date first.", items: [] };
      const rangeStart = new Date(fromDate); rangeStart.setHours(0,0,0,0);
      const rangeEnd = new Date(toDate || fromDate); rangeEnd.setHours(23,59,59,999);
      if (rangeEnd < rangeStart) return { error: "The second date is before the first — swap them?", items: [] };

      const items = [];
      const inRange = (ts) => ts >= rangeStart.getTime() && ts <= rangeEnd.getTime();
      if (st.types.has("prompts")){
        for (const p of this.pe.listPrompts()) if (inRange(p.updatedAt)) items.push({ kind: "prompts", id: p.id, title: p.title || "Untitled prompt", ts: p.updatedAt, size: (p.body||"").length });
      }
      if (st.types.has("templates")){
        for (const t of this.pe.listTemplates()) if (inRange(t.updatedAt)) items.push({ kind: "templates", id: t.id, title: t.name || "Untitled template", ts: t.updatedAt, size: (t.body||"").length });
      }
      if (st.types.has("patterns")){
        for (const p of this.pe.listCustomPatterns()) if (inRange(p.updatedAt)) items.push({ kind: "patterns", id: p.id, title: p.name || "Untitled pattern", ts: p.updatedAt, size: (p.template||"").length });
      }
      if (st.types.has("chains")){
        for (const c of this.pe.listChains()) if (inRange(c.updatedAt)) items.push({ kind: "chains", id: c.id, title: c.name || "Untitled chain", ts: c.updatedAt, size: (c.steps||[]).length });
      }
      if (st.types.has("history")){
        const versions = await this.storage.getAll("versions");
        for (const v of versions) if (inRange(v.createdAt)) items.push({ kind: "history", id: v.id, promptId: v.promptId, title: `${v.title || "Untitled"} — v${v.versionNum}`, ts: v.createdAt, size: (v.body||"").length });
      }
      const sorters = {
        newest: (a,b) => b.ts - a.ts, oldest: (a,b) => a.ts - b.ts,
        az: (a,b) => a.title.localeCompare(b.title), za: (a,b) => b.title.localeCompare(a.title),
        big: (a,b) => b.size - a.size, small: (a,b) => a.size - b.size
      };
      items.sort(sorters[st.sort] || sorters.newest);
      return { error: null, items };
    };

    const renderResults = async (container) => {
      const { error, items } = await gatherResults();
      if (error){ container.innerHTML = `<div class="empty-state" style="padding:20px"><div class="empty-state-body">${Utils.escapeHtml(error)}</div></div>`; return; }
      if (!items.length){ container.innerHTML = `<div class="empty-state" style="padding:20px"><div class="empty-state-title">No matches</div><div class="empty-state-body">Nothing in the selected date range and content types.</div></div>`; return; }
      container.innerHTML = `<div style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-bottom:8px">${items.length} result${items.length===1?'':'s'}</div>` +
        items.map(it => `
        <div class="card card-hover card-clickable" style="display:flex;align-items:center;gap:10px;padding:9px 12px;margin-bottom:6px" data-open-result="${it.kind}:${it.id}:${it.promptId||''}">
          <span class="badge" style="flex-shrink:0;text-transform:uppercase;font-size:9px">${TYPE_LABELS[it.kind]}</span>
          <div style="flex:1;min-width:0"><div style="font-size:var(--fs-xs);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.escapeHtml(it.title)}</div></div>
          <span style="font-size:var(--fs-2xs);color:var(--text-tertiary);flex-shrink:0">${Utils.timeAgo(it.ts)}</span>
        </div>`).join("");
    };

    this.openModal({
      title: "Search by date", size: "modal-lg",
      bodyHtml: `
        <div style="display:flex;gap:8px;margin-bottom:var(--sp-3)">
          <button class="btn btn-sm btn-primary" data-date-mode="single">On a date</button>
          <button class="btn btn-sm btn-secondary" data-date-mode="range">Date range</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:var(--sp-3)">
          <div class="field" style="margin:0;flex:1;min-width:160px">
            <label class="field-label" id="dsFromLabel">Date</label>
            <input class="input" id="dsFromInput" placeholder="Today, 12 September 2026, 12/9/2026…">
          </div>
          <div class="field" id="dsToField" style="margin:0;flex:1;min-width:160px;display:none">
            <label class="field-label">To</label>
            <input class="input" id="dsToInput" placeholder="e.g. 3 September 2026">
          </div>
          <input type="date" id="dsFromPicker" class="input" style="width:auto">
          <input type="date" id="dsToPicker" class="input" style="width:auto;display:none">
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:var(--sp-3)">
          ${Object.entries(TYPE_LABELS).map(([k,label]) => `<label style="display:flex;align-items:center;gap:5px;font-size:var(--fs-2xs);color:var(--text-secondary);cursor:pointer;background:var(--bg-1);border:1px solid var(--border-subtle);border-radius:var(--r-pill);padding:4px 10px"><input type="checkbox" data-type-check="${k}" checked style="width:12px;height:12px">${label}</label>`).join("")}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:var(--sp-4)">
          <span style="font-size:var(--fs-2xs);color:var(--text-tertiary)">Sort:</span>
          ${Dropdown.renderTrigger({ id: "dsSortDD", value: "newest", size: "dd-inline", options: [
            { value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" },
            { value: "az", label: "Title A–Z" }, { value: "za", label: "Title Z–A" },
            { value: "big", label: "Largest first" }, { value: "small", label: "Smallest first" }
          ] })}
          <button class="btn btn-primary btn-sm" id="dsSearchBtn" style="margin-left:auto">Search</button>
        </div>
        <div id="dsResults"></div>`,
      footerHtml: `<button class="btn btn-ghost" id="dsCloseBtn">Close</button>`,
      onMount: (modal) => {
        modal.querySelector("#dsCloseBtn").addEventListener("click", () => this.closeModal());
        const resultsEl = modal.querySelector("#dsResults");
        const runSearch = () => renderResults(resultsEl);

        modal.querySelectorAll("[data-date-mode]").forEach(btn => btn.addEventListener("click", () => {
          st.mode = btn.dataset.dateMode;
          modal.querySelectorAll("[data-date-mode]").forEach(b => b.className = `btn btn-sm ${b.dataset.dateMode===st.mode?'btn-primary':'btn-secondary'}`);
          modal.querySelector("#dsFromLabel").textContent = st.mode === "range" ? "From" : "Date";
          modal.querySelector("#dsToField").style.display = st.mode === "range" ? "" : "none";
          modal.querySelector("#dsToPicker").style.display = st.mode === "range" ? "" : "none";
        }));

        modal.querySelector("#dsFromInput").addEventListener("input", (e) => { st.fromText = e.target.value; });
        modal.querySelector("#dsToInput").addEventListener("input", (e) => { st.toText = e.target.value; });
        modal.querySelector("#dsFromPicker").addEventListener("change", (e) => {
          if (!e.target.value) return;
          const [y,mo,d] = e.target.value.split("-");
          st.fromText = `${+d} ${["january","february","march","april","may","june","july","august","september","october","november","december"][+mo-1]} ${y}`;
          modal.querySelector("#dsFromInput").value = st.fromText;
        });
        modal.querySelector("#dsToPicker").addEventListener("change", (e) => {
          if (!e.target.value) return;
          const [y,mo,d] = e.target.value.split("-");
          st.toText = `${+d} ${["january","february","march","april","may","june","july","august","september","october","november","december"][+mo-1]} ${y}`;
          modal.querySelector("#dsToInput").value = st.toText;
        });
        modal.querySelectorAll("[data-type-check]").forEach(cb => cb.addEventListener("change", () => {
          if (cb.checked) st.types.add(cb.dataset.typeCheck); else st.types.delete(cb.dataset.typeCheck);
        }));
        Dropdown.attach(modal, { dsSortDD: [
          { value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" },
          { value: "az", label: "Title A–Z" }, { value: "za", label: "Title Z–A" },
          { value: "big", label: "Largest first" }, { value: "small", label: "Smallest first" }
        ] }, (id, value) => { st.sort = value; runSearch(); });

        modal.querySelector("#dsSearchBtn").addEventListener("click", runSearch);
        resultsEl.addEventListener("click", (e) => {
          const row = e.target.closest("[data-open-result]");
          if (!row) return;
          const [kind, id, promptId] = row.dataset.openResult.split(":");
          this.closeModal();
          if (kind === "prompts") this.openPromptViewModal(id);
          else if (kind === "templates") this.openTemplateFillModal(id);
          else if (kind === "patterns") this.navigate("patterns");
          else if (kind === "chains") this.navigate("chains");
          else if (kind === "history" && promptId) this.openPromptViewModal(promptId);
        });
      }
    });
  },

  openShortcutsManagerModal(){
    let mode = "paste-json"; // paste-json | upload-json
    const normalizeTrigger = (raw) => "/" + (raw || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const renderBody = () => {
      if (mode === "paste-json"){
        return `
          <div style="display:flex;gap:8px;margin-bottom:var(--sp-4)">
            <button class="btn btn-sm btn-primary" data-mode="paste-json">Paste JSON</button>
            <button class="btn btn-sm btn-secondary" data-mode="upload-json">Upload JSON file</button>
          </div>
          <p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-3)">Paste an array of <code>{"name": "...", "text": "..."}</code> objects.</p>
          <textarea class="textarea" id="scJsonPasteInput" rows="8" style="font-family:var(--font-mono);font-size:12px" placeholder='[{"name":"role","text":"Act as an expert ..."}]'></textarea>
          <button class="btn btn-primary" id="scJsonPasteBtn" style="margin-top:var(--sp-3)">Import</button>`;
      }
      return `
        <div style="display:flex;gap:8px;margin-bottom:var(--sp-4)">
          <button class="btn btn-sm btn-secondary" data-mode="paste-json">Paste JSON</button>
          <button class="btn btn-sm btn-primary" data-mode="upload-json">Upload JSON file</button>
        </div>
        <p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-3)">Choose a .json file containing an array of <code>{"name": "...", "text": "..."}</code> objects.</p>
        <input type="file" id="scJsonFileInput" accept="application/json,.json" class="input">`;
    };

    this.openModal({
      title: "Import Shortcuts",
      bodyHtml: `<div id="shortcutsModalBody">${renderBody()}</div>`,
      footerHtml: `<button class="btn btn-ghost" id="scCloseBtn">Close</button>`,
      onMount: (modal) => {
        modal.querySelector("#scCloseBtn").addEventListener("click", () => this.closeModal());
        const body = modal.querySelector("#shortcutsModalBody");

        const importShortcuts = async (rawList) => {
          if (!Array.isArray(rawList)){ this.toast("Expected a JSON array of {name, text} objects.", "warn"); return; }
          let imported = 0, skipped = 0;
          for (const entry of rawList){
            const name = entry && (entry.name || entry.trigger);
            const text = entry && (entry.text || entry.body);
            if (!name || !text){ skipped++; continue; }
            await this.pe.saveSnippet({ id: Utils.uid("snip"), trigger: normalizeTrigger(name), body: String(text) });
            imported++;
          }
          this.toast(`Imported ${imported} shortcut${imported===1?'':'s'}.${skipped?` Skipped ${skipped} invalid entr${skipped===1?'y':'ies'}.`:''}`, imported ? "success" : "warn");
          this.closeModal();
          if (this.state.view === "shortcuts") this.renderShortcuts();
        };

        const attachModeHandlers = () => {
          body.querySelectorAll("[data-mode]").forEach(btn => btn.addEventListener("click", () => {
            mode = btn.dataset.mode;
            body.innerHTML = renderBody();
            attachModeHandlers();
          }));
          const jsonPasteBtn = body.querySelector("#scJsonPasteBtn");
          if (jsonPasteBtn){
            jsonPasteBtn.addEventListener("click", async () => {
              const raw = body.querySelector("#scJsonPasteInput").value;
              let parsed;
              try { parsed = JSON.parse(raw); } catch(e){ this.toast("That isn't valid JSON.", "warn"); return; }
              await importShortcuts(parsed);
            });
          }
          const fileInput = body.querySelector("#scJsonFileInput");
          if (fileInput){
            fileInput.addEventListener("change", async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                await importShortcuts(parsed);
              } catch(err){
                this.toast("Couldn't read that file as JSON.", "warn");
              }
            });
          }
        };
        attachModeHandlers();
      }
    });
  },

  openSnippetEditorModal(snippetId){
    const snip = snippetId ? this.pe.getSnippet(snippetId) : { id: Utils.uid("snip"), trigger: "/", body: "" };
    this.openModal({
      title: snippetId ? "Edit Shortcut" : "New Shortcut",
      bodyHtml: `
        <div class="field">
          <label class="field-label" for="snipTriggerInput">Shortcut name</label>
          <input class="input" id="snipTriggerInput" value="${Utils.escapeHtml(snip.trigger.replace(/^\//, ''))}" placeholder="task-role" style="font-family:var(--font-mono)">
          <div style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-top:4px">Type <span id="snipTriggerPreview" style="font-family:var(--font-mono);color:var(--accent-amber)">${Utils.escapeHtml(snip.trigger)}</span> in the editor to insert this. Spaces become hyphens; other symbols are stripped.</div>
        </div>
        <div class="field">
          <label class="field-label" for="snipBodyInput">Content</label>
          <textarea class="textarea" id="snipBodyInput" rows="5">${Utils.escapeHtml(snip.body)}</textarea>
        </div>`,
      footerHtml: { spread: true, html: `
        <div>${snippetId ? `<button class="btn btn-danger btn-sm" id="snipDeleteBtn">Delete</button>` : ""}</div>
        <div style="display:flex;gap:8px"><button class="btn btn-ghost" id="snipCancelBtn">Cancel</button><button class="btn btn-primary" id="snipSaveBtn">Save Snippet</button></div>` },
      onMount: (modal) => {
        modal.querySelector("#snipCancelBtn").addEventListener("click", () => this.closeModal());
        const previewNormalize = (raw) => "/" + raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        modal.querySelector("#snipTriggerInput").addEventListener("input", (e) => {
          modal.querySelector("#snipTriggerPreview").textContent = previewNormalize(e.target.value) || "/";
        });
        if (snippetId){
          modal.querySelector("#snipDeleteBtn").addEventListener("click", () => {
            this.confirmDialog({ title: "Delete snippet?", message: `Delete "${snip.trigger}"?`, danger: true, confirmLabel: "Delete", onConfirm: async () => {
              await this.pe.deleteSnippet(snippetId);
              this.closeModal();
              this.toast("Snippet deleted.", "info");
              if (this.state.view === "shortcuts") this.renderShortcuts();
            }});
          });
        }
        modal.querySelector("#snipSaveBtn").addEventListener("click", async () => {
          snip.trigger = modal.querySelector("#snipTriggerInput").value;
          snip.body = modal.querySelector("#snipBodyInput").value;
          if (!snip.trigger.trim()){ this.toast("Give this shortcut a name.", "warn"); return; }
          if (!snip.body.trim()){ this.toast("Shortcut content can't be empty.", "warn"); return; }
          await this.pe.saveSnippet(snip);
          this.closeModal();
          this.toast("Shortcut saved.", "success", 1800);
          if (this.state.view === "shortcuts") this.renderShortcuts();
        });
      }
    });
  }
};
