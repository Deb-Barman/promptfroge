// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "../../core/CONFIG";
import { Utils } from "../../core/Utils";

/** UIManager methods: models. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const modelsMethods = {
  openCustomModelModal(modelId){
    const existing = modelId ? CONFIG.MODELS.find(m => m.id === modelId) : null;
    const m = existing || { id: "", label: "", vendor: "", group: "", contextWindow: 128000, priceIn: 0, priceOut: 0, priceNote: "per 1M tokens" };
    let mode = "manual"; // "manual" | "paste" | "upload" — import modes only apply when adding new
    const exampleJson = JSON.stringify([
      { "label": "Gemini 3", "vendor": "Google", "group": "Gemini", "contextWindow": 2000000, "priceIn": 2.00, "priceOut": 8.00, "priceNote": "per 1M tokens" }
    ], null, 2);

    this.openModal({
      title: existing ? "Edit Model" : "Add Model", size: existing ? "" : "modal-lg",
      bodyHtml: `
        ${existing ? "" : `<div class="pattern-tabs" id="cmModeTabs" style="margin-bottom:var(--sp-4)">
          <div class="pattern-tab active" data-mode="manual">Fill in manually</div>
          <div class="pattern-tab" data-mode="paste">Paste JSON</div>
          <div class="pattern-tab" data-mode="upload">Upload JSON file</div>
        </div>`}

        <div id="cmManualPane">
          <div class="field">
            <label class="field-label" for="cmLabelInput">Model name</label>
            <input class="input" id="cmLabelInput" placeholder="e.g. Gemini 3" value="${Utils.escapeHtml(m.label)}" maxlength="80">
          </div>
          <div style="display:flex;gap:10px">
            <div class="field" style="flex:1">
              <label class="field-label" for="cmVendorInput">Vendor</label>
              <input class="input" id="cmVendorInput" placeholder="e.g. Google" value="${Utils.escapeHtml(m.vendor)}" maxlength="40">
            </div>
            <div class="field" style="flex:1">
              <label class="field-label" for="cmGroupInput">Group <span class="field-hint">for the dropdown</span></label>
              <input class="input" id="cmGroupInput" placeholder="e.g. Gemini" value="${Utils.escapeHtml(m.group || "")}" maxlength="40">
            </div>
          </div>
          <div class="field-hint" style="margin:-8px 0 12px">Models sharing a Group are clustered together in the Editor's Model &amp; tokens dropdown, e.g. all your GPT models under one "GPT" heading. Leave blank to use the vendor name as the group.</div>
          <div class="field">
            <label class="field-label" for="cmContextInput">Context window (tokens)</label>
            <input class="input" id="cmContextInput" type="number" min="1" step="1000" placeholder="e.g. 1000000" value="${m.contextWindow || ""}">
            <div class="field-hint">e.g. Gemini 1.5 Pro — 1,000,000</div>
          </div>
          <div style="display:flex;gap:10px">
            <div class="field" style="flex:1">
              <label class="field-label" for="cmPriceInInput">Price in ($ / 1M tok)</label>
              <input class="input" id="cmPriceInInput" type="number" min="0" step="0.01" value="${m.priceIn ?? 0}">
            </div>
            <div class="field" style="flex:1">
              <label class="field-label" for="cmPriceOutInput">Price out ($ / 1M tok)</label>
              <input class="input" id="cmPriceOutInput" type="number" min="0" step="0.01" value="${m.priceOut ?? 0}">
            </div>
          </div>
          <div class="field" style="margin-bottom:0">
            <label class="field-label" for="cmNoteInput">Pricing note (optional)</label>
            <input class="input" id="cmNoteInput" placeholder="e.g. per 1M tokens, ≤128K prompt tier" value="${Utils.escapeHtml(m.priceNote || "")}" maxlength="80">
          </div>
        </div>

        ${existing ? "" : `<div id="cmImportPane" style="display:none">
          ${this._renderImportPaneMarkup("cm", exampleJson)}
        </div>`}
        <p style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-top:var(--sp-3)">Token counts for custom models use a calibrated estimate — only OpenAI's GPT-4/4o/3.5 family gets the real, exact tokenizer built into this app.</p>`,
      footerHtml: { spread: true, html: `
        ${existing ? `<button class="btn btn-ghost btn-sm" id="cmDeleteBtn" style="color:var(--accent-red)">Delete</button>` : `<span></span>`}
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" id="cmCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="cmSaveBtn">${existing ? "Save" : "Add model"}</button>
        </div>` },
      onMount: (modal) => {
        modal.querySelector("#cmCancelBtn").addEventListener("click", () => this.closeModal());
        const deleteBtn = modal.querySelector("#cmDeleteBtn");
        if (deleteBtn){
          deleteBtn.addEventListener("click", () => {
            this.closeModal();
            this._runAction(`delete-custom-model:${existing.id}`);
          });
        }
        const saveBtn = modal.querySelector("#cmSaveBtn");

        const saveOneRecord = (rec) => {
          const list = this.storage.getSetting("customModels", []);
          const id = existing ? existing.id : Utils.uid("cmodel");
          const vendor = rec.vendor || "—";
          const record = { id, label: rec.label, vendor, group: (rec.group && rec.group.trim()) || vendor, contextWindow: rec.contextWindow, priceIn: rec.priceIn, priceOut: rec.priceOut, priceNote: rec.priceNote || "per 1M tokens", charsPerToken: 4.0 };
          const idx = list.findIndex(x => x.id === id);
          if (idx >= 0) list[idx] = record; else list.push(record);
          this._saveCustomModels(list);
          return record;
        };

        const saveManual = () => {
          const label = modal.querySelector("#cmLabelInput").value.trim();
          if (!label){ this.toast("Give the model a name.", "warn"); return; }
          const vendor = modal.querySelector("#cmVendorInput").value.trim();
          const group = modal.querySelector("#cmGroupInput").value.trim();
          const contextWindow = Math.max(1, parseInt(modal.querySelector("#cmContextInput").value, 10) || 32000);
          const priceIn = Math.max(0, parseFloat(modal.querySelector("#cmPriceInInput").value) || 0);
          const priceOut = Math.max(0, parseFloat(modal.querySelector("#cmPriceOutInput").value) || 0);
          const priceNote = modal.querySelector("#cmNoteInput").value.trim();
          saveOneRecord({ label, vendor, group, contextWindow, priceIn, priceOut, priceNote });
          this.closeModal();
          this.toast(existing ? "Model updated." : "Model added — pick it from any Model & tokens dropdown.", "success");
          this.renderSettings();
        };

        if (existing){
          saveBtn.addEventListener("click", saveManual);
          modal.querySelector("#cmLabelInput").addEventListener("keydown", e => { if (e.key === "Enter") saveManual(); });
          return;
        }

        // Import modes only exist on the "Add" path — editing one specific
        // model is always the manual form, same reasoning as templates and
        // patterns: bulk import makes sense for adding, not for a targeted
        // single-record edit.
        const setMode = (newMode) => {
          mode = newMode;
          modal.querySelectorAll("#cmModeTabs [data-mode]").forEach(t => t.classList.toggle("active", t.dataset.mode === newMode));
          modal.querySelector("#cmManualPane").style.display = newMode === "manual" ? "" : "none";
          modal.querySelector("#cmImportPane").style.display = newMode === "manual" ? "none" : "";
          modal.querySelector("#cmImportPasteWrap").style.display = newMode === "paste" ? "" : "none";
          modal.querySelector("#cmImportUploadWrap").style.display = newMode === "upload" ? "" : "none";
          saveBtn.textContent = newMode === "manual" ? "Add model" : "Import";
        };
        modal.querySelectorAll("#cmModeTabs [data-mode]").forEach(tab => {
          tab.addEventListener("click", () => setMode(tab.dataset.mode));
        });
        this._wireImportPane(modal, "cm");

        const saveFromImport = () => {
          const records = this._readImportPaneRecords(modal, "cm", "model");
          if (!records) return;
          if (!records.length){ this.toast("No records to import.", "warn"); return; }
          let created = 0;
          for (const rec of records){
            if (!rec.label || !rec.label.trim()) continue;
            saveOneRecord(rec);
            created++;
          }
          this.closeModal();
          this.toast(`Added ${created} model${created===1?'':'s'} — pick from any Model & tokens dropdown.`, "success", 2200);
          this.renderSettings();
        };

        modal.querySelector("#cmLabelInput").addEventListener("keydown", e => { if (e.key === "Enter" && mode === "manual") saveManual(); });
        saveBtn.addEventListener("click", () => {
          if (mode === "manual") saveManual();
          else saveFromImport();
        });
      }
    });
  }
};
