// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "../../core/CONFIG";
import { Utils } from "../../core/Utils";
import { TemplateEngine } from "../../core/TemplateEngine";

/** UIManager methods: builder. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const builderMethods = {
  /* ---------------------------------------------------------------------- */
  /* BUILDER VIEW — drag/reorder structured blocks                          */
  /* ---------------------------------------------------------------------- */
  renderBuilder(){
    if (!this.state.builder.blocks.length){
      this.state.builder.blocks = CONFIG.DEFAULT_BUILDER_ORDER.map(type => ({ id: Utils.uid("blk"), type, text: "" }));
    }
    const b = this.state.builder;
    const structures = this.pe.listBuilderStructures();

    this.workspace.innerHTML = `
      <div class="view">
        <div class="view-header">
          <div>
            <h1 class="view-title">Visual Builder</h1>
            <p class="view-subtitle">Drag blocks from the palette, reorder them, then compose into a prompt.</p>
          </div>
          <div class="view-actions">
            <button class="btn btn-secondary" data-action="builder-clear">Clear canvas</button>
            <button class="btn btn-primary" data-action="builder-compose">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 12 12 2M6 2h6v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Send to Editor
            </button>
          </div>
        </div>

        <div class="builder-layout">
          <div class="builder-palette">
            <div class="field-label" style="margin-bottom:2px;display:flex;align-items:center;justify-content:space-between">
              <span>Structures</span>
              <button class="icon-btn btn-sm" data-action="save-canvas-as-structure" title="Save current canvas as a structure" aria-label="Save as structure">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5v9M1.5 6.5h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
              </button>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px;max-height:280px;overflow-y:auto">
              ${(() => {
                const builtins = structures.filter(s => s.builtin);
                const custom = structures.filter(s => !s.builtin);
                const bx = this.state.builder;
                const renderItem = s => `
                <div class="builder-palette-item" style="cursor:pointer;justify-content:space-between;display:flex;align-items:center;gap:6px" data-action="apply-builder-structure:${s.id}" title="${Utils.escapeHtml(s.name)} — click to apply">
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${Utils.escapeHtml(s.name)}</span>
                  ${s.builtin ? `<span class="badge badge-builtin" style="flex-shrink:0">Built-in</span>` : `<button class="icon-btn btn-sm" data-action="delete-builder-structure:${s.id}" data-stop-propagation title="Delete" aria-label="Delete structure"><svg width="11" height="11" viewBox="0 0 13 13" fill="none"><path d="M2.5 3.5h8M5 3.5V2h3v1.5M3.5 3.5 4 11h5l0.5-7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`}
                </div>`;
                // Nothing to declutter until there's at least one custom
                // structure alongside the built-ins — so a first-time user
                // (only the 5 shipped presets) sees the plain flat list
                // exactly as before, no extra section header or click.
                if (!custom.length) return builtins.map(renderItem).join("");
                const builtinsOpen = bx.expandedStructureGroups.has("builtin");
                return `
                  ${custom.length > 1 ? `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);margin:2px 0 1px 2px">Your structures</div>` : ""}
                  ${custom.map(renderItem).join("")}
                  <div class="builder-palette-item" style="cursor:pointer;justify-content:space-between;display:flex;align-items:center;gap:6px;margin-top:6px" data-action="builder-toggle-builtin-group">
                    <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary)">Built-in (${builtins.length})</span>
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style="flex-shrink:0;color:var(--text-tertiary);transform:rotate(${builtinsOpen?90:0}deg);transition:transform var(--dur-fast) var(--ease)"><path d="M5 3.5 9 7l-4 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </div>
                  ${builtinsOpen ? builtins.map(renderItem).join("") : ""}`;
              })()}
            </div>
            <button class="btn btn-secondary btn-sm btn-block" data-action="new-builder-structure" style="margin-bottom:14px;justify-content:flex-start;gap:6px">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              New structure…
            </button>

            <div class="field-label" style="margin-bottom:2px">Block types</div>
            ${CONFIG.BLOCK_TYPES.map(bt => `
              <div class="builder-palette-item" draggable="true" data-palette-type="${bt.id}" style="border-left:3px solid ${bt.color}">
                <span>${bt.label}</span>
              </div>`).join("")}
            <button class="btn btn-secondary btn-sm btn-block" data-action="builder-add-custom" style="margin-top:8px;justify-content:flex-start;gap:6px">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              Add your own section
            </button>
          </div>

          <div>
            <div class="builder-canvas" id="builderCanvas">
              ${b.blocks.length ? b.blocks.map((blk, i) => this._renderBuilderBlock(blk, i)).join("") : `<div class="builder-dropzone">Drag a block type here to begin</div>`}
            </div>
            <div class="builder-dropzone" id="builderEndDropzone" style="margin-top:var(--sp-3)">Drop here to add to the end</div>
          </div>
        </div>
      </div>`;

    this._wireBuilderDnD();
  },

  _renderBuilderBlock(blk, index){
    const meta = TemplateEngine.blockMeta(blk.type, blk);
    return `
      <div class="builder-block" data-block-id="${blk.id}" data-index="${index}" style="--block-color:${meta.color}" draggable="true">
        <div class="builder-block-head">
          <span class="builder-block-handle" title="Drag to reorder">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="4.5" cy="3.5" r="1" fill="currentColor"/><circle cx="8.5" cy="3.5" r="1" fill="currentColor"/><circle cx="4.5" cy="6.5" r="1" fill="currentColor"/><circle cx="8.5" cy="6.5" r="1" fill="currentColor"/><circle cx="4.5" cy="9.5" r="1" fill="currentColor"/><circle cx="8.5" cy="9.5" r="1" fill="currentColor"/></svg>
          </span>
          <span class="builder-block-type">${meta.label}</span>
          <div class="builder-block-actions">
            <button class="icon-btn btn-sm" data-action="builder-dup:${blk.id}" title="Duplicate" aria-label="Duplicate block">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="4" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 4V2.5h6.5V9H9.5" stroke="currentColor" stroke-width="1.2"/></svg>
            </button>
            <button class="icon-btn btn-sm" data-action="builder-remove:${blk.id}" title="Delete" aria-label="Delete block">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 3.5h8M5 3.5V2h3v1.5M3.5 3.5 4 11h5l0.5-7.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
        <textarea class="builder-block-text" data-block-id="${blk.id}" placeholder="${Utils.escapeHtml(meta.placeholder)}" rows="2">${Utils.escapeHtml(blk.text)}</textarea>
      </div>`;
  },

  openCustomBlockModal(){
    const colorChoices = [
      { id: "violet", val: "var(--accent-violet)" }, { id: "blue", val: "var(--accent-blue)" },
      { id: "green", val: "var(--accent-green)" }, { id: "amber", val: "var(--accent-amber)" },
      { id: "red", val: "var(--accent-red)" }, { id: "teal", val: "#4FC3D9" }
    ];
    this.openModal({
      title: "Add your own section",
      bodyHtml: `
        <div class="field">
          <label class="field-label" for="cbLabelInput">Section name</label>
          <input class="input" id="cbLabelInput" placeholder="e.g. Tone, Persona Backstory, Safety Notes" maxlength="60">
        </div>
        <div class="field">
          <label class="field-label">Color</label>
          <div class="chip-row" id="cbColorRow">
            ${colorChoices.map((c, i) => `<button type="button" class="category-dot" data-color-idx="${i}" style="width:22px;height:22px;background:${c.val};border:2px solid ${i===0?'var(--text-primary)':'transparent'};cursor:pointer" title="${c.id}" aria-label="${c.id}"></button>`).join("")}
          </div>
        </div>`,
      footerHtml: `<button class="btn btn-ghost" id="cbCancelBtn">Cancel</button><button class="btn btn-primary" id="cbAddBtn">Add section</button>`,
      onMount: (modal) => {
        let selectedIdx = 0;
        modal.querySelectorAll("[data-color-idx]").forEach(btn => {
          btn.addEventListener("click", () => {
            selectedIdx = parseInt(btn.dataset.colorIdx, 10);
            modal.querySelectorAll("[data-color-idx]").forEach((b, i) => b.style.borderColor = i === selectedIdx ? "var(--text-primary)" : "transparent");
          });
        });
        const labelInput = modal.querySelector("#cbLabelInput");
        modal.querySelector("#cbCancelBtn").addEventListener("click", () => this.closeModal());
        const submit = () => {
          const label = labelInput.value.trim();
          if (!label){ this.toast("Give the section a name first.", "warn"); return; }
          const newBlock = { id: Utils.uid("blk"), type: "custom_" + Utils.uid(""), label, color: colorChoices[selectedIdx].val, text: "" };
          this.state.builder.blocks.push(newBlock);
          this.closeModal();
          this.renderBuilder();
        };
        labelInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
        modal.querySelector("#cbAddBtn").addEventListener("click", submit);
      }
    });
  },

  // Structures are named, reusable block layouts for the Visual Builder
  // (e.g. "Basic: Role+Context+Action+Style"). Same three-mode pattern as
  // New Prompt / Add Model: fill in manually (pick block types with
  // checkboxes, in order), paste JSON, or upload a JSON file.
  openNewBuilderStructureModal(prefillFromCanvas){
    let mode = "manual";
    const exampleJson = JSON.stringify([
      { "name": "Basic", "blocks": ["Role", "Context", "Action", "Style"] },
      { "name": "Image", "blocks": [{ "type": "custom_character", "label": "Character" }, { "type": "custom_background", "label": "Background" }, { "type": "custom_style", "label": "Style" }] }
    ], null, 2);
    // "Save current canvas" prefills the manual picker with exactly the
    // blocks already on the canvas, in their current order, including any
    // custom sections the person added — so turning a one-off layout into
    // a reusable structure is one click, not re-picking every block again.
    const prefillBlocks = prefillFromCanvas ? this.state.builder.blocks.map(b => ({ type: b.type, label: b.label, color: b.color })) : null;

    this.openModal({
      title: "New Structure", size: "modal-lg",
      bodyHtml: `
        <div class="pattern-tabs" id="bsModeTabs" style="margin-bottom:var(--sp-4)">
          <div class="pattern-tab active" data-mode="manual">Fill in manually</div>
          <div class="pattern-tab" data-mode="paste">Paste JSON</div>
          <div class="pattern-tab" data-mode="upload">Upload JSON file</div>
        </div>

        <div id="bsManualPane">
          <div class="field">
            <label class="field-label" for="bsNameInput">Structure name</label>
            <input class="input" id="bsNameInput" placeholder="e.g. Image (Character + Background + Style)" maxlength="80">
          </div>
          <div class="field" style="margin-bottom:0">
            <label class="field-label">Blocks, in order</label>
            <div class="field-hint" style="margin-bottom:6px">Check the built-in sections to include, or add your own below. Drag to reorder after saving isn't needed — just check them in the order you want.</div>
            <div id="bsBlockCheckList" style="display:flex;flex-direction:column;gap:4px;max-height:220px;overflow-y:auto;border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:8px">
              ${CONFIG.BLOCK_TYPES.map(bt => `
                <label class="checkbox-row" style="padding:5px 4px">
                  <input type="checkbox" class="bs-block-check" data-type="${bt.id}" data-label="${Utils.escapeHtml(bt.label)}">
                  <span style="width:9px;height:9px;border-radius:50%;background:${bt.color};flex-shrink:0;margin-right:2px"></span>
                  <span>${bt.label}</span>
                </label>`).join("")}
            </div>
            <div id="bsCustomBlocksList" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"></div>
            <div style="display:flex;gap:8px;margin-top:8px">
              <input class="input" id="bsCustomNameInput" placeholder="Custom section name, e.g. Character" style="flex:1">
              <button class="btn btn-secondary btn-sm" id="bsAddCustomBtn">Add</button>
            </div>
          </div>
        </div>

        <div id="bsImportPane" style="display:none">
          ${this._renderImportPaneMarkup("bs", exampleJson)}
        </div>`,
      footerHtml: { spread: true, html: `
        <span></span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" id="bsCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="bsSaveBtn">Save structure</button>
        </div>` },
      onMount: (modal) => {
        modal.querySelector("#bsCancelBtn").addEventListener("click", () => this.closeModal());
        const saveBtn = modal.querySelector("#bsSaveBtn");
        const customBlocks = []; // { type, label } added via the manual "Add" button

        const renderCustomBlocksList = () => {
          const wrap = modal.querySelector("#bsCustomBlocksList");
          wrap.innerHTML = customBlocks.map((c, i) => `
            <label class="checkbox-row" style="padding:5px 4px">
              <input type="checkbox" class="bs-custom-check" data-idx="${i}" checked>
              <span style="width:9px;height:9px;border-radius:50%;background:var(--accent-violet);flex-shrink:0;margin-right:2px"></span>
              <span style="flex:1">${Utils.escapeHtml(c.label)}</span>
              <button class="icon-btn btn-sm" data-remove-custom="${i}" title="Remove" aria-label="Remove"><svg width="11" height="11" viewBox="0 0 13 13" fill="none"><path d="M2.5 3.5h8M5 3.5V2h3v1.5M3.5 3.5 4 11h5l0.5-7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            </label>`).join("");
          wrap.querySelectorAll("[data-remove-custom]").forEach(btn => btn.addEventListener("click", () => {
            customBlocks.splice(parseInt(btn.dataset.removeCustom, 10), 1);
            renderCustomBlocksList();
          }));
        };

        // Pre-check + pre-add whatever was on the canvas, in order, when
        // opened via "Save current canvas as a structure".
        if (prefillBlocks){
          modal.querySelector("#bsNameInput").value = "";
          for (const blk of prefillBlocks){
            if (blk.type && blk.type.startsWith("custom_")){
              customBlocks.push({ type: blk.type, label: blk.label || "Section", color: blk.color });
            } else {
              const check = modal.querySelector(`.bs-block-check[data-type="${blk.type}"]`);
              if (check) check.checked = true;
            }
          }
          renderCustomBlocksList();
        }

        modal.querySelector("#bsAddCustomBtn").addEventListener("click", () => {
          const nameInput = modal.querySelector("#bsCustomNameInput");
          const label = nameInput.value.trim();
          if (!label){ this.toast("Name the section first.", "warn"); return; }
          customBlocks.push({ type: "custom_" + Utils.uid(""), label, color: "var(--accent-violet)" });
          nameInput.value = "";
          renderCustomBlocksList();
        });

        const saveManual = async () => {
          const name = modal.querySelector("#bsNameInput").value.trim();
          if (!name){ this.toast("Give the structure a name.", "warn"); return; }
          const blocks = [];
          modal.querySelectorAll(".bs-block-check").forEach(c => { if (c.checked) blocks.push({ type: c.dataset.type }); });
          modal.querySelectorAll(".bs-custom-check").forEach(c => { if (c.checked) blocks.push(customBlocks[parseInt(c.dataset.idx, 10)]); });
          if (!blocks.length){ this.toast("Pick at least one block.", "warn"); return; }
          const structure = this.pe.newBuilderStructureSkeleton({ name, blocks });
          await this.pe.saveBuilderStructure(structure);
          this.closeModal();
          this.toast(`"${name}" saved — pick it from the Structures list anytime.`, "success");
          this.renderBuilder();
        };

        const setMode = (newMode) => {
          mode = newMode;
          modal.querySelectorAll("#bsModeTabs [data-mode]").forEach(t => t.classList.toggle("active", t.dataset.mode === newMode));
          modal.querySelector("#bsManualPane").style.display = newMode === "manual" ? "" : "none";
          modal.querySelector("#bsImportPane").style.display = newMode === "manual" ? "none" : "";
          modal.querySelector("#bsImportPasteWrap").style.display = newMode === "paste" ? "" : "none";
          modal.querySelector("#bsImportUploadWrap").style.display = newMode === "upload" ? "" : "none";
          saveBtn.textContent = newMode === "manual" ? "Save structure" : "Import";
        };
        modal.querySelectorAll("#bsModeTabs [data-mode]").forEach(tab => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
        this._wireImportPane(modal, "bs");

        const saveFromImport = async () => {
          const records = this._readImportPaneRecords(modal, "bs", "structure");
          if (!records) return;
          if (!records.length){ this.toast("No structures to import.", "warn"); return; }
          let created = 0;
          for (const rec of records){
            const structure = this.pe.newBuilderStructureSkeleton({ name: rec.name, blocks: rec.blocks });
            await this.pe.saveBuilderStructure(structure);
            created++;
          }
          this.closeModal();
          this.toast(`Added ${created} structure${created===1?'':'s'}.`, "success", 2200);
          this.renderBuilder();
        };

        saveBtn.addEventListener("click", () => {
          if (mode === "manual") saveManual();
          else saveFromImport();
        });
      }
    });
  },

  // Applies a saved structure to the canvas — always fresh copies of the
  // block definitions with new ids, never a live reference to the saved
  // structure's own block array, so editing text in the canvas can never
  // retroactively mutate the saved preset.
  _applyBuilderStructure(structure){
    this.state.builder.blocks = structure.blocks.map(b => ({
      id: Utils.uid("blk"), type: b.type, text: "", label: b.label, color: b.color
    }));
    this.renderBuilder();
    this.toast(`Applied "${structure.name}".`, "success", 1600);
  },

  _wireBuilderDnD(){
    const canvas = document.getElementById("builderCanvas");
    let dragged = null; // { fromPalette: bool, type or blockId }

    document.querySelectorAll(".builder-palette-item").forEach(el => {
      el.addEventListener("dragstart", (e) => {
        dragged = { fromPalette: true, type: el.dataset.paletteType };
        e.dataTransfer.effectAllowed = "copy";
      });
    });

    const attachBlockDnD = () => {
      canvas.querySelectorAll(".builder-block").forEach(el => {
        el.addEventListener("dragstart", (e) => {
          if (e.target.closest("textarea, button")) { e.preventDefault(); return; }
          dragged = { fromPalette: false, blockId: el.dataset.blockId };
          el.classList.add("dragging");
        });
        el.addEventListener("dragend", () => el.classList.remove("dragging"));
        el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drag-over"); });
        el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
        el.addEventListener("drop", (e) => {
          e.preventDefault(); el.classList.remove("drag-over");
          this._handleBuilderDrop(dragged, el.dataset.blockId);
        });
      });
    };
    attachBlockDnD();

    canvas.addEventListener("dragover", (e) => { if (!canvas.querySelector(".builder-block")) e.preventDefault(); });
    canvas.addEventListener("drop", (e) => {
      if (canvas.querySelector(".builder-block")) return;
      e.preventDefault();
      this._handleBuilderDrop(dragged, null);
    });

    const endZone = document.getElementById("builderEndDropzone");
    endZone.addEventListener("dragover", (e) => { e.preventDefault(); endZone.classList.add("drag-over"); });
    endZone.addEventListener("dragleave", () => endZone.classList.remove("drag-over"));
    endZone.addEventListener("drop", (e) => {
      e.preventDefault(); endZone.classList.remove("drag-over");
      this._handleBuilderDrop(dragged, null);
    });
  },

  _handleBuilderDrop(dragged, targetBlockId){
    if (!dragged) return;
    const blocks = this.state.builder.blocks;
    if (dragged.fromPalette){
      const newBlock = { id: Utils.uid("blk"), type: dragged.type, text: "" };
      if (targetBlockId){
        const idx = blocks.findIndex(b => b.id === targetBlockId);
        blocks.splice(idx, 0, newBlock);
      } else {
        blocks.push(newBlock);
      }
    } else {
      const fromIdx = blocks.findIndex(b => b.id === dragged.blockId);
      if (fromIdx === -1) return;
      const [moved] = blocks.splice(fromIdx, 1);
      if (targetBlockId && targetBlockId !== dragged.blockId){
        const toIdx = blocks.findIndex(b => b.id === targetBlockId);
        blocks.splice(toIdx, 0, moved);
      } else {
        blocks.push(moved);
      }
    }
    this.renderBuilder();
  }
};
