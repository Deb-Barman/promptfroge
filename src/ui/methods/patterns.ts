// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "../../core/CONFIG";
import { Utils } from "../../core/Utils";
import { Dropdown } from "../Dropdown";
import { TemplateEngine } from "../../core/TemplateEngine";

/** UIManager methods: patterns. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const patternsMethods = {
  /* ---------------------------------------------------------------------- */
  /* PATTERNS VIEW                                                          */
  /* ---------------------------------------------------------------------- */
  renderPatterns(){
    const st = this.state.patterns;
    const builtins = CONFIG.PATTERNS;
    const customs = this.pe.listCustomPatterns().sort((a,b) => b.updatedAt - a.updatedAt);
    const activeTab = st.tab || "all";

    let pool = activeTab === "custom" ? customs : activeTab === "builtin" ? builtins : [...builtins, ...customs];
    const categories = ["all", ...new Set(builtins.map(p => p.category))];

    if (st.query.trim()){
      const q = st.query.toLowerCase();
      pool = pool.filter(p => p.name.toLowerCase().includes(q) || (p.purpose||"").toLowerCase().includes(q));
    }
    if (st.category !== "all") pool = pool.filter(p => p.category === st.category);
    if (st.group){
      const g = this.pe.getGroup(st.group);
      pool = pool.filter(p => g && g.memberIds.includes(p.id));
    }
    const pg = this._paginate("patterns", pool);

    this.workspace.innerHTML = `
      <div class="view">
        <div class="view-header">
          <div>
            <h1 class="view-title">Pattern Library</h1>
            <p class="view-subtitle">${builtins.length} built-in pattern${builtins.length===1?'':'s'}${customs.length ? ` &middot; ${customs.length} of your own` : ""}</p>
          </div>
          <div class="view-actions">
            <button class="btn btn-sm ${st.selectMode?'btn-primary':'btn-secondary'}" data-action="patterns-toggle-select-mode">Select</button>
            <button class="btn btn-primary" data-action="new-custom-pattern">+ Add Pattern</button>
          </div>
        </div>

        <div class="pattern-tabs">
          <div class="pattern-tab ${activeTab==='all'?'active':''}" data-action="pattern-tab:all">All (${builtins.length + customs.length})</div>
          <div class="pattern-tab ${activeTab==='builtin'?'active':''}" data-action="pattern-tab:builtin">Built-in (${builtins.length})</div>
          <div class="pattern-tab ${activeTab==='custom'?'active':''}" data-action="pattern-tab:custom">My Patterns (${customs.length})</div>
        </div>

        <div class="filter-bar">
          <div class="search-input-wrap">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.3" stroke="currentColor" stroke-width="1.3"/><path d="M9.1 9.1 12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            <input class="input" id="patSearchInput" data-search-input enterkeyhint="search" placeholder="Search patterns…" value="${Utils.escapeHtml(st.query)}">
          </div>
          ${Dropdown.renderTrigger({ id: "patCategoryDD", value: st.category, size: "dd-inline", options: categories.map(c => ({ value: c, label: c === "all" ? "All types" : c })) })}
          ${pg.dropdownHtml}
          ${st.group ? (() => { const g = this.pe.getGroup(st.group); return g ? `<span class="tag" style="border-color:color-mix(in srgb, ${g.color} 45%, var(--border-subtle));color:${g.color}">&#9679; ${Utils.escapeHtml(g.name)}<button data-action="patterns-clear-group" aria-label="Clear group filter">&times;</button></span>` : ""; })() : ""}
        </div>

        ${this._renderSelectBar("patterns")}

        ${this._renderGroupChipRow("patterns")}

        ${pool.length ? `<div class="grid grid-auto">${pg.pageItems.map(p => this._renderPatternCard(p)).join("")}</div>${pg.footerHtml}` : `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="14" cy="14" r="9" stroke="currentColor" stroke-width="1.6"/><circle cx="26" cy="14" r="9" stroke="currentColor" stroke-width="1.6"/><circle cx="20" cy="26" r="9" stroke="currentColor" stroke-width="1.6"/></svg>
          <div class="empty-state-title">${activeTab === 'custom' ? "No patterns of your own yet" : "No matches"}</div>
          <div class="empty-state-body">${activeTab === 'custom' ? "Build your own reusable pattern from scratch, or start from a built-in and adjust it." : "Try a different search term or category."}</div>
          <button class="btn btn-primary" data-action="new-custom-pattern">Add a pattern</button>
        </div>`}
      </div>`;

    Dropdown.attach(this.workspace, {
      patCategoryDD: categories.map(c => ({ value: c, label: c === "all" ? "All types" : c })),
      [pg.dropdownId]: [
        { value: "50", label: "50 per page" }, { value: "100", label: "100 per page" },
        { value: "200", label: "200 per page" }, { value: "0", label: "All" }
      ]
    }, (id, value) => {
      if (id === "patCategoryDD") { this.state.patterns.category = value; this.state.patterns.page = 0; }
      if (id === pg.dropdownId) { this.state.patterns.pageSize = Number(value); this.state.patterns.page = 0; }
      this.renderView();
    });
  },

  _renderPatternCard(p){
    const isCustom = p.id.startsWith("cpat_");
    const group = this._groupFor("patterns", p.id);
    const selectMode = this.state.patterns.selectMode;
    const isSelected = selectMode && this.state.patterns.selectedIds.includes(p.id);
    return `
      <div class="card card-hover card-clickable pattern-card ${isSelected ? 'card-selected' : ''}" data-action="${selectMode ? `patterns-toggle-select:${p.id}` : `open-pattern:${p.id}`}" ${selectMode ? "" : `data-longpress-group="patterns:${p.id}"`}>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="display:flex;align-items:center;gap:6px;min-width:0">
            ${selectMode ? `<input type="checkbox" ${isSelected ? "checked" : ""} style="pointer-events:none;flex-shrink:0" tabindex="-1">` : ""}
            <span class="prompt-card-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.escapeHtml(p.name || "Untitled pattern")}</span>
          </div>
          <span class="badge ${isCustom?'badge-custom':'badge-builtin'}">${isCustom ? "Custom" : Utils.escapeHtml(p.category)}</span>
        </div>
        <div class="pattern-card-purpose">${Utils.escapeHtml(p.purpose) || "<em>No description yet</em>"}</div>
        ${group ? `<div class="chip-row" style="margin-top:6px"><span class="tag" style="background:color-mix(in srgb, ${group.color} 18%, transparent);border-color:color-mix(in srgb, ${group.color} 45%, var(--border-subtle));color:${group.color}">&#9679; ${Utils.escapeHtml(group.name)}</span></div>` : ""}
        ${isCustom && !selectMode ? `<div style="display:flex;gap:4px;margin-top:auto" data-stop-propagation>
          <button class="icon-btn btn-sm" data-action="edit-custom-pattern:${p.id}" title="Edit" aria-label="Edit pattern">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 2 11 4.5 4.5 11H2V8.5Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>
          </button>
          <button class="icon-btn btn-sm" data-action="delete-custom-pattern:${p.id}" title="Delete" aria-label="Delete pattern">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 3.5h8M5 3.5V2h3v1.5M3.5 3.5 4 11h5l0.5-7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>` : ""}
      </div>`;
  },

  openPatternModal(patternId){
    const isCustom = patternId.startsWith("cpat_");
    const p = isCustom ? this.pe.getCustomPattern(patternId) : CONFIG.PATTERNS.find(x => x.id === patternId);
    if (!p) return;
    this.openModal({
      title: p.name || "Untitled pattern", size: "modal-lg",
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
          ${isCustom ? `<span class="badge badge-custom" style="width:fit-content">Custom pattern</span>` : ""}
          <div>
            <div class="field-label">Purpose</div>
            <p style="font-size:var(--fs-sm);color:var(--text-secondary);line-height:1.55;margin-top:4px">${Utils.escapeHtml(p.purpose) || "<em>Not set</em>"}</p>
          </div>
          <div>
            <div class="field-label">When to use</div>
            <p style="font-size:var(--fs-sm);color:var(--text-secondary);line-height:1.55;margin-top:4px">${Utils.escapeHtml(p.when) || "<em>Not set</em>"}</p>
          </div>
          <div>
            <div class="field-label">Template</div>
            <pre style="background:var(--editor-bg);border:1px solid var(--border);border-radius:var(--r-md);padding:12px;font-family:var(--font-mono);font-size:12.5px;white-space:pre-wrap;color:var(--text-primary);margin-top:4px">${Utils.escapeHtml(p.template) || "<em>Empty</em>"}</pre>
          </div>
          ${p.example ? `<div>
            <div class="field-label">Example</div>
            <pre style="background:var(--bg-2);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:12px;font-family:var(--font-mono);font-size:12.5px;white-space:pre-wrap;color:var(--text-secondary);margin-top:4px">${Utils.escapeHtml(p.example)}</pre>
          </div>` : ""}
          ${p.variables && p.variables.length ? `<div>
            <div class="field-label">Variables</div>
            <div class="chip-row" style="margin-top:6px">${p.variables.map(v=>`<span class="tag">{{${Utils.escapeHtml(v)}}}</span>`).join("")}</div>
          </div>` : ""}
        </div>`,
      footerHtml: { spread: true, html: `
        <div>${isCustom ? `<button class="btn btn-danger btn-sm" id="patDeleteBtn">Delete</button>` : ""}</div>
        <div style="display:flex;gap:8px">
          ${isCustom ? `<button class="btn btn-ghost" id="patEditBtn">Edit</button>` : ""}
          <button class="btn btn-ghost" id="patCloseBtn">Close</button>
          <button class="btn btn-primary" id="patUseBtn">Use this pattern</button>
        </div>` },
      onMount: (modal) => {
        modal.querySelector("#patCloseBtn").addEventListener("click", () => this.closeModal());
        modal.querySelector("#patUseBtn").addEventListener("click", async () => {
          this.closeModal();
          if (isCustom) await this.pe.incrementCustomPatternUse(p.id);
          this.state.editor = { promptId: null, title: p.name, body: p.template, dirty: true, blocks: null, format: "text" };
          this.navigate("editor");
          this.toast("Pattern loaded — fill in the {{variables}}.", "success", 2200);
        });
        if (isCustom){
          modal.querySelector("#patEditBtn").addEventListener("click", () => { this.closeModal(); this.openCustomPatternEditorModal(p.id); });
          modal.querySelector("#patDeleteBtn").addEventListener("click", () => {
            this.confirmDialog({ title: "Delete pattern?", message: `Delete "${p.name || 'this pattern'}"? This can't be undone.`, danger: true, confirmLabel: "Delete", onConfirm: async () => {
              await this.pe.deleteCustomPattern(p.id);
              this.closeModal();
              this.toast("Pattern deleted.", "info");
              this.renderView();
            }});
          });
        }
      }
    });
  },

  openCustomPatternEditorModal(patternId){
    const pat = patternId ? this.pe.getCustomPattern(patternId) : this.pe.newCustomPatternSkeleton();
    if (!pat) return;
    const isNew = !patternId;
    let mode = "manual";
    const exampleJson = JSON.stringify([
      { "Title": "Example pattern", "Category": "QA", "Purpose": "What this pattern is for", "When": "When to reach for it", "Prompt": "You are a {{role}}. {{task}}", "Example": "Optional worked example" }
    ], null, 2);

    this.openModal({
      title: isNew ? "New Pattern" : "Edit Pattern", size: "modal-lg",
      bodyHtml: `
        ${isNew ? `<div class="pattern-tabs" id="cpModeTabs" style="margin-bottom:var(--sp-4)">
          <div class="pattern-tab active" data-mode="manual">Fill in manually</div>
          <div class="pattern-tab" data-mode="paste">Paste JSON</div>
          <div class="pattern-tab" data-mode="upload">Upload JSON file</div>
        </div>` : ""}

        <div id="cpManualPane">
          <div class="field">
            <label class="field-label" for="cpNameInput">Name</label>
            <input class="input" id="cpNameInput" value="${Utils.escapeHtml(pat.name)}" placeholder="e.g. Bug report triage" maxlength="120">
          </div>
          <div class="field">
            <label class="field-label" for="cpCategoryInput">Category label <span class="field-hint">free text, shown as a badge</span></label>
            <input class="input" id="cpCategoryInput" value="${Utils.escapeHtml(pat.category)}" placeholder="e.g. Internal, QA, Support" maxlength="40">
          </div>
          <div class="field">
            <label class="field-label" for="cpPurposeInput">Purpose</label>
            <textarea class="textarea" id="cpPurposeInput" rows="2" placeholder="What is this pattern for?">${Utils.escapeHtml(pat.purpose)}</textarea>
          </div>
          <div class="field">
            <label class="field-label" for="cpWhenInput">When to use</label>
            <textarea class="textarea" id="cpWhenInput" rows="2" placeholder="When does this pattern apply?">${Utils.escapeHtml(pat.when)}</textarea>
          </div>
          <div class="field">
            <label class="field-label" for="cpTemplateInput">Template <span class="field-hint">use {{variable}} for fill-in fields</span></label>
            <textarea class="textarea" id="cpTemplateInput" rows="6" placeholder="You are a {{role}}. ${'{{'}task${'}}'}">${Utils.escapeHtml(pat.template)}</textarea>
          </div>
          <div class="field">
            <label class="field-label" for="cpExampleInput">Example <span class="field-hint">optional</span></label>
            <textarea class="textarea" id="cpExampleInput" rows="3">${Utils.escapeHtml(pat.example)}</textarea>
          </div>
          <div id="cpVarPreview" style="font-size:var(--fs-xs);color:var(--text-tertiary)"></div>
        </div>

        ${isNew ? `<div id="cpImportPane" style="display:none">${this._renderImportPaneMarkup("cp", exampleJson)}</div>` : ""}`,
      footerHtml: { spread: true, html: `
        <div>${!isNew ? `<button class="btn btn-danger btn-sm" id="cpDeleteBtn">Delete</button>` : ""}</div>
        <div style="display:flex;gap:8px"><button class="btn btn-ghost" id="cpCancelBtn">Cancel</button><button class="btn btn-primary" id="cpSaveBtn">Save Pattern</button></div>` },
      onMount: (modal) => {
        const templateInput = modal.querySelector("#cpTemplateInput");
        const preview = modal.querySelector("#cpVarPreview");
        const saveBtn = modal.querySelector("#cpSaveBtn");
        const updatePreview = () => {
          const vars = TemplateEngine.extractVariables(templateInput.value);
          preview.textContent = vars.length ? `Detected variables: ${vars.map(v=>"{{"+v+"}}").join(", ")}` : "No {{variables}} detected yet.";
        };
        updatePreview();
        templateInput.addEventListener("input", updatePreview);
        modal.querySelector("#cpCancelBtn").addEventListener("click", () => this.closeModal());

        if (isNew){
          const setMode = (newMode) => {
            mode = newMode;
            modal.querySelectorAll("#cpModeTabs [data-mode]").forEach(t => t.classList.toggle("active", t.dataset.mode === newMode));
            modal.querySelector("#cpManualPane").style.display = newMode === "manual" ? "" : "none";
            modal.querySelector("#cpImportPane").style.display = newMode === "manual" ? "none" : "";
            modal.querySelector("#cpImportPasteWrap").style.display = newMode === "paste" ? "" : "none";
            modal.querySelector("#cpImportUploadWrap").style.display = newMode === "upload" ? "" : "none";
            saveBtn.textContent = newMode === "manual" ? "Save Pattern" : "Import";
          };
          modal.querySelectorAll("#cpModeTabs [data-mode]").forEach(tab => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
          this._wireImportPane(modal, "cp");
        }

        if (!isNew){
          modal.querySelector("#cpDeleteBtn").addEventListener("click", () => {
            this.confirmDialog({ title: "Delete pattern?", message: `Delete "${pat.name || 'this pattern'}"? This can't be undone.`, danger: true, confirmLabel: "Delete", onConfirm: async () => {
              await this.pe.deleteCustomPattern(pat.id);
              this.closeModal();
              this.toast("Pattern deleted.", "info");
              this.renderView();
            }});
          });
        }

        const saveManual = async () => {
          pat.name = modal.querySelector("#cpNameInput").value;
          pat.category = modal.querySelector("#cpCategoryInput").value || "Custom";
          pat.purpose = modal.querySelector("#cpPurposeInput").value;
          pat.when = modal.querySelector("#cpWhenInput").value;
          pat.template = templateInput.value;
          pat.example = modal.querySelector("#cpExampleInput").value;
          if (!pat.name.trim() && !pat.template.trim()){ this.toast("Add a name or a template first.", "warn"); return; }
          await this.pe.saveCustomPattern(pat);
          if (pat.template) this.suggest.learnFromText(pat.template, pat.updatedAt);
          this.closeModal();
          this.toast("Pattern saved.", "success", 1800);
          this.renderView();
        };

        const saveFromImport = async () => {
          const records = this._readImportPaneRecords(modal, "cp", "pattern");
          if (!records) return;
          if (!records.length){ this.toast("No records to import.", "warn"); return; }
          let created = 0;
          for (const rec of records){
            if (!rec.name.trim() && !rec.template.trim()) continue;
            const newPat = this.pe.newCustomPatternSkeleton({
              name: rec.name, category: rec.category || "Custom", purpose: rec.purpose,
              when: rec.when, template: rec.template, example: rec.example
            });
            await this.pe.saveCustomPattern(newPat);
            created++;
          }
          this.closeModal();
          this.toast(`Imported ${created} pattern${created===1?'':'s'}.`, "success", 2000);
          this.renderView();
        };

        saveBtn.addEventListener("click", () => {
          if (!isNew || mode === "manual") saveManual();
          else saveFromImport();
        });
      }
    });
  }
};
