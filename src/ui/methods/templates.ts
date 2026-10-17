// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "../../core/Utils";
import { Dropdown } from "../Dropdown";
import { TemplateEngine } from "../../core/TemplateEngine";
import { CONFIG } from "../../core/CONFIG";

/** UIManager methods: templates. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const templatesMethods = {
  /* ---------------------------------------------------------------------- */
  /* TEMPLATES VIEW                                                          */
  /* ---------------------------------------------------------------------- */
  renderTemplates(){
    const st = this.state.templates;
    let templates = this.pe.listTemplates();
    if (st.query.trim()){
      const q = st.query.toLowerCase();
      templates = templates.filter(t => t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q));
    }
    if (st.group){
      const g = this.pe.getGroup(st.group);
      templates = templates.filter(t => g && g.memberIds.includes(t.id));
    }
    templates.sort((a,b) => b.updatedAt - a.updatedAt);
    const pg = this._paginate("templates", templates);

    this.workspace.innerHTML = `
      <div class="view">
        <div class="view-header">
          <div>
            <h1 class="view-title">Templates</h1>
            <p class="view-subtitle">Reusable prompts with {{variables}} you fill in through a form. ${pg.total} template${pg.total===1?'':'s'}</p>
          </div>
          <div class="view-actions">
            <button class="btn btn-sm ${st.selectMode?'btn-primary':'btn-secondary'}" data-action="templates-toggle-select-mode">Select</button>
            <button class="btn btn-primary" data-action="new-template">+ New Template</button>
          </div>
        </div>

        <div class="filter-bar">
          <div class="search-input-wrap">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.3" stroke="currentColor" stroke-width="1.3"/><path d="M9.1 9.1 12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            <input class="input" id="tplSearchInput" data-search-input enterkeyhint="search" placeholder="Search templates…" value="${Utils.escapeHtml(st.query)}">
          </div>
          ${pg.dropdownHtml}
          ${st.group ? (() => { const g = this.pe.getGroup(st.group); return g ? `<span class="tag" style="border-color:color-mix(in srgb, ${g.color} 45%, var(--border-subtle));color:${g.color}">&#9679; ${Utils.escapeHtml(g.name)}<button data-action="templates-clear-group" aria-label="Clear group filter">&times;</button></span>` : ""; })() : ""}
        </div>

        ${this._renderSelectBar("templates")}
        ${this._renderGroupChipRow("templates")}

        ${templates.length ? `<div class="grid grid-auto">${pg.pageItems.map(t => this._renderTemplateCard(t)).join("")}</div>${pg.footerHtml}` : `
        <div class="empty-state">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none"><rect x="6" y="6" width="32" height="32" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M6 15h32" stroke="currentColor" stroke-width="1.6"/></svg>
          <div class="empty-state-title">No templates yet</div>
          <div class="empty-state-body">Turn a prompt you write often into a reusable template with {{variables}}.</div>
          <button class="btn btn-primary" data-action="new-template">Create a template</button>
        </div>`}
      </div>`;
    Dropdown.attach(this.workspace, { [pg.dropdownId]: [
      { value: "50", label: "50 per page" }, { value: "100", label: "100 per page" },
      { value: "200", label: "200 per page" }, { value: "0", label: "All" }
    ] }, (id, value) => { this.state.templates.pageSize = Number(value); this.state.templates.page = 0; this.renderView(); });
  },

  _renderTemplateCard(t){
    const vars = TemplateEngine.extractVariables(t.body);
    const group = this._groupFor("templates", t.id);
    const selectMode = this.state.templates.selectMode;
    const isSelected = selectMode && this.state.templates.selectedIds.includes(t.id);
    return `
      <div class="card card-hover card-clickable prompt-card ${isSelected ? 'card-selected' : ''}" data-action="${selectMode ? `templates-toggle-select:${t.id}` : `open-template:${t.id}`}" ${selectMode ? "" : `data-longpress-group="templates:${t.id}"`}>
        <div class="prompt-card-top">
          <div style="display:flex;align-items:center;gap:6px;min-width:0">
            ${selectMode ? `<input type="checkbox" ${isSelected ? "checked" : ""} style="pointer-events:none;flex-shrink:0" tabindex="-1">` : ""}
            <span class="prompt-card-title">${Utils.escapeHtml(t.name || "Untitled template")}</span>
          </div>
          ${selectMode ? "" : `<div style="display:flex;gap:2px" data-stop-propagation>
            <button class="icon-btn btn-sm" data-action="edit-template:${t.id}" title="Edit" aria-label="Edit template">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 1.8 11.2 4.5 4.3 11.4 1.4 11.6 1.6 8.7Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>
            </button>
            <button class="icon-btn btn-sm" data-action="delete-template:${t.id}" title="Delete" aria-label="Delete template">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 3.5h8M5 3.5V2h3v1.5M3.5 3.5 4 11h5l0.5-7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>`}
        </div>
        <div class="prompt-card-snippet">${Utils.escapeHtml(Utils.truncate(t.body, 150)) || "<em>Empty</em>"}</div>
        ${vars.length ? `<div class="chip-row">${vars.slice(0,5).map(v=>`<span class="tag">{{${Utils.escapeHtml(v)}}}</span>`).join("")}</div>` : ""}
        ${group ? `<div class="chip-row" style="margin-top:4px"><span class="tag" style="background:color-mix(in srgb, ${group.color} 18%, transparent);border-color:color-mix(in srgb, ${group.color} 45%, var(--border-subtle));color:${group.color}">&#9679; ${Utils.escapeHtml(group.name)}</span></div>` : ""}
        <div class="prompt-card-foot">
          <span class="prompt-card-meta">Used ${t.useCount||0}x</span>
          <span class="prompt-card-meta">${Utils.timeAgo(t.updatedAt)}</span>
        </div>
      </div>`;
  },

  openTemplateEditorModal(templateId){
    const tpl = templateId ? this.pe.getTemplate(templateId) : this.pe.newTemplateSkeleton();
    if (!tpl) return;
    // Import tabs only apply to creating a NEW template — editing an
    // existing one has real content already in the form, so offering to
    // overwrite it via pasted/uploaded JSON isn't what was asked for and
    // would risk clobbering an in-progress edit.
    const isNew = !templateId;
    let mode = "manual";
    const exampleJson = JSON.stringify([
      { "Title": "Example template", "Category": "coding", "Prompt": "You are a {{role}}. {{task}}" }
    ], null, 2);

    this.openModal({
      title: templateId ? "Edit Template" : "New Template", size: "modal-lg",
      bodyHtml: `
        ${isNew ? `<div class="pattern-tabs" id="tplModeTabs" style="margin-bottom:var(--sp-4)">
          <div class="pattern-tab active" data-mode="manual">Fill in manually</div>
          <div class="pattern-tab" data-mode="paste">Paste JSON</div>
          <div class="pattern-tab" data-mode="upload">Upload JSON file</div>
        </div>` : ""}

        <div id="tplManualPane">
          <div class="field">
            <label class="field-label" for="tplNameInput">Name</label>
            <input class="input" id="tplNameInput" value="${Utils.escapeHtml(tpl.name)}" placeholder="e.g. Code review request" maxlength="160">
          </div>
          <div class="field">
            <label class="field-label" id="tplCategoryLabel">Category</label>
            ${Dropdown.renderTrigger({ id: "tplCategoryDD", value: tpl.category, options: CONFIG.CATEGORIES.map(c => ({ value: c.id, label: c.label, swatchColor: c.color })) })}
          </div>
          <div class="field">
            <label class="field-label" for="tplBodyInput">Body <span class="field-hint">Use {{variable_name}} for fill-in fields</span></label>
            <textarea class="textarea" id="tplBodyInput" rows="9" placeholder="You are a {{role}}. ${'{{'}task${'}}'}">${Utils.escapeHtml(tpl.body)}</textarea>
          </div>
          <div id="tplVarPreview" style="font-size:var(--fs-xs);color:var(--text-tertiary)"></div>
        </div>

        ${isNew ? `<div id="tplImportPane" style="display:none">${this._renderImportPaneMarkup("tpl", exampleJson)}</div>` : ""}`,
      footerHtml: { spread: true, html: `
        <div>${templateId ? `<button class="btn btn-danger btn-sm" id="tplDeleteBtn">Delete</button>` : ""}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" id="tplCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="tplSaveBtn">Save Template</button>
        </div>` },
      onMount: (modal) => {
        Dropdown.attach(modal, { tplCategoryDD: CONFIG.CATEGORIES.map(c => ({ value: c.id, label: c.label, swatchColor: c.color })) });
        const bodyInput = modal.querySelector("#tplBodyInput");
        const preview = modal.querySelector("#tplVarPreview");
        const saveBtn = modal.querySelector("#tplSaveBtn");
        const updatePreview = () => {
          const vars = TemplateEngine.extractVariables(bodyInput.value);
          preview.textContent = vars.length ? `Detected variables: ${vars.map(v=>"{{"+v+"}}").join(", ")}` : "No {{variables}} detected yet.";
        };
        updatePreview();
        bodyInput.addEventListener("input", updatePreview);
        modal.querySelector("#tplCancelBtn").addEventListener("click", () => this.closeModal());

        if (isNew){
          const setMode = (newMode) => {
            mode = newMode;
            modal.querySelectorAll("#tplModeTabs [data-mode]").forEach(t => t.classList.toggle("active", t.dataset.mode === newMode));
            modal.querySelector("#tplManualPane").style.display = newMode === "manual" ? "" : "none";
            modal.querySelector("#tplImportPane").style.display = newMode === "manual" ? "none" : "";
            modal.querySelector("#tplImportPasteWrap").style.display = newMode === "paste" ? "" : "none";
            modal.querySelector("#tplImportUploadWrap").style.display = newMode === "upload" ? "" : "none";
            saveBtn.textContent = newMode === "manual" ? "Save Template" : "Import";
          };
          modal.querySelectorAll("#tplModeTabs [data-mode]").forEach(tab => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
          this._wireImportPane(modal, "tpl");
        }

        if (templateId){
          modal.querySelector("#tplDeleteBtn").addEventListener("click", () => {
            this.confirmDialog({ title: "Delete template?", message: `Delete "${tpl.name || 'this template'}"? This can't be undone.`, danger: true, confirmLabel: "Delete", onConfirm: async () => {
              await this.pe.deleteTemplate(templateId);
              this.closeModal();
              this.toast("Template deleted.", "info");
              this.renderView();
            }});
          });
        }

        const saveManual = async () => {
          tpl.name = modal.querySelector("#tplNameInput").value;
          tpl.category = modal.querySelector("#tplCategoryDD").dataset.ddValue;
          tpl.body = bodyInput.value;
          if (!tpl.name.trim() && !tpl.body.trim()){ this.toast("Add a name or some content first.", "warn"); return; }
          await this.pe.saveTemplate(tpl);
          this.suggest.learnFromText(tpl.body, tpl.updatedAt);
          this.closeModal();
          this.toast("Template saved.", "success", 1800);
          this.renderView();
        };

        const saveFromImport = async () => {
          const records = this._readImportPaneRecords(modal, "tpl", "template");
          if (!records) return;
          if (!records.length){ this.toast("No records to import.", "warn"); return; }
          let created = 0;
          for (const rec of records){
            if (!rec.name.trim() && !rec.body.trim()) continue;
            const validCategory = CONFIG.CATEGORIES.some(c => c.id === rec.category) ? rec.category : "custom";
            const newTpl = this.pe.newTemplateSkeleton({ name: rec.name, body: rec.body, category: validCategory });
            await this.pe.saveTemplate(newTpl);
            created++;
          }
          this.closeModal();
          this.toast(`Imported ${created} template${created===1?'':'s'}.`, "success", 2000);
          this.renderView();
        };

        saveBtn.addEventListener("click", () => {
          if (!isNew || mode === "manual") saveManual();
          else saveFromImport();
        });
      }
    });
  },

  openTemplateFillModal(templateId){
    const tpl = this.pe.getTemplate(templateId);
    if (!tpl) return;
    const specs = TemplateEngine.extractVariableSpecs(tpl.body);
    if (!specs.length){
      this._sendTemplateToEditor(tpl, tpl.body);
      return;
    }
    this.openModal({
      title: `Fill in "${tpl.name || 'template'}"`, size: "modal-lg",
      bodyHtml: `
        <div id="tplFillFields">
          ${specs.map(spec => `
            <div class="field">
              <label class="field-label" for="fillVar_${Utils.escapeHtml(spec.name)}">${Utils.escapeHtml(TemplateEngine.humanizeVarName(spec.name))}</label>
              ${this._renderTypedFillControl(spec)}
            </div>`).join("")}
        </div>
        <div class="field">
          <label class="field-label">Preview</label>
          <div class="panel" id="tplFillPreview" style="padding:12px;font-family:var(--font-mono);font-size:13px;white-space:pre-wrap;max-height:180px;overflow-y:auto;color:var(--text-secondary)"></div>
        </div>`,
      footerHtml: { spread: true, html: `
        <button class="btn btn-ghost btn-sm" id="fillEditBtn">Edit template</button>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" id="fillCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="fillUseBtn">Use in Editor</button>
        </div>` },
      onMount: (modal) => {
        const preview = modal.querySelector("#tplFillPreview");
        const inputs = modal.querySelectorAll("[data-var]");
        const collectValues = () => {
          const values = {};
          inputs.forEach(i => values[i.dataset.var] = i.value);
          return values;
        };
        const updatePreview = () => { preview.textContent = TemplateEngine.render(tpl.body, collectValues()); };
        updatePreview();
        inputs.forEach(i => i.addEventListener("input", updatePreview));
        modal.querySelector("#fillCancelBtn").addEventListener("click", () => this.closeModal());
        modal.querySelector("#fillEditBtn").addEventListener("click", () => { this.closeModal(); this.openTemplateEditorModal(tpl.id); });
        modal.querySelector("#fillUseBtn").addEventListener("click", async () => {
          const rendered = TemplateEngine.render(tpl.body, collectValues());
          await this.pe.incrementTemplateUse(tpl.id);
          this.closeModal();
          this._sendTemplateToEditor(tpl, rendered);
        });
      }
    });
  },

  // Renders the correct input control for a variable spec — a <select> for
  // :select, a <textarea> for :multiline, a number-typed <input> for
  // :number, and a plain text <input> otherwise (the exact control every
  // {{var}} has always gotten, so old templates render identically).
  // Every control shares the data-var attribute so the modal's generic
  // collectValues()/updatePreview() logic works the same regardless of type.
  _renderTypedFillControl(spec){
    const id = `fillVar_${Utils.escapeHtml(spec.name)}`;
    const common = `id="${id}" data-var="${Utils.escapeHtml(spec.name)}"`;
    if (spec.type === "select"){
      return `<select class="input" ${common}>
        <option value="">Choose…</option>
        ${spec.options.map(o => `<option value="${Utils.escapeHtml(o)}" ${spec.default === o ? "selected" : ""}>${Utils.escapeHtml(o)}</option>`).join("")}
      </select>`;
    }
    if (spec.type === "multiline"){
      return `<textarea class="textarea" rows="3" ${common} placeholder="{{${Utils.escapeHtml(spec.name)}}}">${Utils.escapeHtml(spec.default || "")}</textarea>`;
    }
    if (spec.type === "number"){
      return `<input class="input" type="number" ${common} placeholder="{{${Utils.escapeHtml(spec.name)}}}" value="${Utils.escapeHtml(spec.default || "")}">`;
    }
    return `<input class="input" ${common} placeholder="{{${Utils.escapeHtml(spec.name)}}}" value="${Utils.escapeHtml(spec.default || "")}">`;
  },

  _sendTemplateToEditor(tpl, body){
    this.state.editor = { promptId: null, title: tpl.name, body, dirty: true, blocks: null, format: "text" };
    this.navigate("editor");
    this.toast("Template loaded into the editor.", "success", 1800);
  }
};
