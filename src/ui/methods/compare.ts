// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "../../core/Utils";
import { Analyzer } from "../../core/Analyzer";
import { Dropdown } from "../Dropdown";
import { CONFIG } from "../../core/CONFIG";

/** UIManager methods: compare. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const compareMethods = {
  /* ---------------------------------------------------------------------- */
  /* HISTORY VIEW — version control                                         */
  /* ---------------------------------------------------------------------- */
  /* ---------------------------------------------------------------------- */
  /* COMPARE VIEW — pick 2+ saved prompts, see bodies + Analyzer scores      */
  /* side-by-side, with an optional pairwise word-level diff (reuses the    */
  /* same Utils.diffWords LCS diff the version-history diff modal uses).    */
  /* ---------------------------------------------------------------------- */
  renderCompare(){
    const st = this.state.compare;
    let all = this.pe.listPrompts().sort((a,b) => b.updatedAt - a.updatedAt);
    const selected = st.selectedIds.map(id => this.pe.getPrompt(id)).filter(Boolean);
    // Drop any selected id that no longer resolves to a live prompt (e.g.
    // deleted from another view) so stale ids don't linger in the picker state.
    if (selected.length !== st.selectedIds.length) st.selectedIds = selected.map(p => p.id);

    const query = (st.pickerQuery || "").trim().toLowerCase();
    let pickerPool = all;
    if (query) pickerPool = all.filter(p => (p.title || "").toLowerCase().includes(query) || (p.body || "").toLowerCase().includes(query));
    // Always keep already-selected prompts visible in the picker even if a
    // search narrows them out, so toggling one off is never more than a click.
    const selectedNotInPool = selected.filter(p => !pickerPool.includes(p));
    const pickerDisplay = [...selectedNotInPool, ...pickerPool].slice(0, 18);

    this.workspace.innerHTML = `
      <div class="view">
        <div class="view-header">
          <div>
            <h1 class="view-title">Compare Prompts</h1>
            <p class="view-subtitle">Pick two or more saved prompts to see their structure and Analyzer scores side-by-side.</p>
          </div>
          ${selected.length ? `<div class="view-actions"><button class="btn btn-ghost" data-action="compare-clear">Clear selection</button></div>` : ""}
        </div>

        <div class="filter-bar" style="margin-bottom:var(--sp-4)">
          <div class="search-input-wrap" style="flex:1">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.3" stroke="currentColor" stroke-width="1.3"/><path d="M9.1 9.1 12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            <input class="input" id="comparePickerSearch" data-search-input enterkeyhint="search" placeholder="Search your library to add prompts to compare…" value="${Utils.escapeHtml(st.pickerQuery || "")}">
          </div>
        </div>

        <div id="comparePickerResults" class="grid grid-auto" style="margin-bottom:var(--sp-5)">
          ${pickerDisplay.map(p => this._renderComparePickCard(p, st.selectedIds.includes(p.id))).join("") || `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-title">${all.length ? "No matches" : "No saved prompts yet"}</div><div class="empty-state-body">${all.length ? "Try a different search term." : "Write and save a prompt in the Editor first, then come back here to compare it against others."}</div></div>`}
        </div>

        ${selected.length >= 2 ? this._renderCompareResults(selected) : selected.length === 1 ? `
          <div class="empty-state">
            <div class="empty-state-title">Pick one more prompt</div>
            <div class="empty-state-body">Select at least one more prompt above to start comparing.</div>
          </div>` : ""}
      </div>`;
  },

  _renderComparePickCard(p, isSelected){
    const analysis = Analyzer.analyze(p.body);
    return `
      <div class="card card-clickable ${isSelected ? 'card-selected' : ''}" data-action="compare-toggle:${p.id}">
        <div style="display:flex;align-items:flex-start;gap:8px">
          <input type="checkbox" ${isSelected ? "checked" : ""} style="margin-top:3px;pointer-events:none" tabindex="-1">
          <div style="flex:1;min-width:0">
            <div class="card-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Utils.escapeHtml(p.title || "Untitled")}</div>
            <div class="card-meta">${Utils.timeAgo(p.updatedAt)} &middot; <span style="color:${this._scoreColor(analysis.overall)}">${analysis.overall}/100</span></div>
          </div>
        </div>
      </div>`;
  },

  _renderCompareResults(prompts){
    const analyses = prompts.map(p => ({ prompt: p, analysis: Analyzer.analyze(p.body) }));
    const dims = [
      ["overall", "Overall"], ["clarity", "Clarity"], ["context", "Context"], ["specificity", "Specificity"],
      ["structure", "Structure"], ["constraints", "Constraints"], ["output", "Output def."]
    ];
    return `
      <div class="side-panel-section" style="margin-bottom:var(--sp-4)">
        <div class="side-panel-title"><span>Score comparison</span></div>
        <div style="overflow-x:auto">
          <table class="compare-score-table" style="width:100%;border-collapse:collapse;font-size:var(--fs-xs)">
            <thead><tr>
              <th style="text-align:left;padding:6px 10px;color:var(--text-tertiary);font-weight:600">Dimension</th>
              ${analyses.map(a => `<th style="text-align:center;padding:6px 10px;color:var(--text-secondary);font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.escapeHtml(a.prompt.title || "Untitled")}</th>`).join("")}
            </tr></thead>
            <tbody>
              ${dims.map(([key, label]) => `<tr style="border-top:1px solid var(--border-subtle)">
                <td style="padding:6px 10px;color:var(--text-tertiary)">${label}</td>
                ${analyses.map(a => {
                  const val = key === "overall" ? a.analysis.overall : a.analysis.scores[key];
                  return `<td style="text-align:center;padding:6px 10px;font-family:var(--font-mono);color:${this._scoreColor(val)};font-weight:${key==='overall'?'700':'500'}">${val}</td>`;
                }).join("")}
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>

      ${prompts.length === 2 ? `
        <div class="side-panel-section" style="margin-bottom:var(--sp-4)">
          <div class="side-panel-title"><span>Word-level diff</span></div>
          <div class="diff-line" style="max-height:340px;overflow-y:auto">${this._renderPairDiff(prompts[0], prompts[1])}</div>
        </div>` : `
        <p style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin:0 0 var(--sp-4) 0">Word-level diff is only shown for exactly 2 selected prompts — deselect down to a pair to see it.</p>`}

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--sp-3)">
        ${analyses.map(a => `
          <div class="card">
            <div class="card-title">${Utils.escapeHtml(a.prompt.title || "Untitled")}</div>
            <pre style="white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);font-size:11.5px;color:var(--text-secondary);max-height:220px;overflow-y:auto;margin:8px 0 0 0;line-height:1.5">${Utils.escapeHtml(a.prompt.body || "")}</pre>
            <div style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-action="open-prompt:${a.prompt.id}">Open in editor</button></div>
          </div>`).join("")}
      </div>`;
  },

  _renderPairDiff(promptA, promptB){
    const ops = Utils.diffWords(promptA.body, promptB.body);
    if (!ops.length) return "<em>Both prompts are empty.</em>";
    const html = ops.map(op => {
      const cls = op.t === "add" ? "diff-add" : op.t === "remove" ? "diff-remove" : "diff-same";
      return `<span class="${cls}">${Utils.escapeHtml(op.v)}</span>`;
    }).join("");
    return html || "<em>No differences — these prompts are identical.</em>";
  },

  _toggleCompareSelection(id){
    const st = this.state.compare;
    if (st.selectedIds.includes(id)) st.selectedIds = st.selectedIds.filter(x => x !== id);
    else st.selectedIds = [...st.selectedIds, id];
    // Re-render whichever view is actually on screen, not always Compare —
    // this selection list is now also how Library's Select mode drives its
    // bulk Archive/Tag/Group/Delete bar, and someone picking a second card
    // there is choosing prompts to delete or group, not asking to jump into
    // the side-by-side Compare screen. Compare's own "Compare (N)" button
    // is still the one deliberate way to actually navigate there.
    this.renderView();
  },

  // External-text diff — for the "a colleague emailed me their edited
  // copy" scenario: paste text from outside the app and diff it against a
  // saved library prompt, reusing the same Utils.diffWords the Compare
  // view's pairwise diff already uses (and is already tested against).
  openExternalDiffModal(){
    const prompts = this.pe.listPrompts().sort((a,b) => (a.title||"").localeCompare(b.title||""));
    if (!prompts.length){ this.toast("Save a prompt first — nothing to diff against yet.", "warn"); return; }
    let selectedId = prompts[0].id;

    this.openModal({
      title: "Diff pasted text against a saved prompt", size: "modal-lg",
      bodyHtml: `
        <div class="field">
          <label class="field-label">Compare against</label>
          ${Dropdown.renderTrigger({ id: "extDiffPromptDD", value: selectedId, options: prompts.map(p => ({ value: p.id, label: p.title || "Untitled" })) })}
        </div>
        <div class="field">
          <label class="field-label" for="extDiffPasteInput">Pasted text</label>
          <textarea class="textarea" id="extDiffPasteInput" rows="8" placeholder="Paste the other version here…" style="font-family:var(--font-mono);font-size:12px"></textarea>
        </div>
        <div id="extDiffResult" style="display:none">
          <div class="field-label" style="margin-bottom:6px">Diff</div>
          <div class="diff-line" style="max-height:320px;overflow-y:auto">
            <div id="extDiffOutput"></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button class="btn btn-secondary btn-sm" id="extDiffSaveNewBtn">Save pasted text as new prompt</button>
            <button class="btn btn-secondary btn-sm" id="extDiffUpdateBtn">Update "${Utils.escapeHtml(prompts.find(p=>p.id===selectedId)?.title||"original")}" with this text</button>
          </div>
        </div>`,
      footerHtml: `<button class="btn btn-ghost" id="extDiffCloseBtn">Close</button><button class="btn btn-primary" id="extDiffRunBtn">Show diff</button>`,
      onMount: (modal) => {
        Dropdown.attach(modal, { extDiffPromptDD: prompts.map(p => ({ value: p.id, label: p.title || "Untitled" })) }, (id, value) => {
          selectedId = value;
          const btn = modal.querySelector("#extDiffUpdateBtn");
          if (btn) btn.textContent = `Update "${prompts.find(p=>p.id===value)?.title||"original"}" with this text`;
        });
        modal.querySelector("#extDiffCloseBtn").addEventListener("click", () => this.closeModal());
        modal.querySelector("#extDiffRunBtn").addEventListener("click", () => {
          const pasted = modal.querySelector("#extDiffPasteInput").value;
          if (!pasted.trim()){ this.toast("Paste some text to diff first.", "warn"); return; }
          const original = this.pe.getPrompt(selectedId);
          if (!original) return;
          const ops = Utils.diffWords(original.body, pasted);
          const output = modal.querySelector("#extDiffOutput");
          output.innerHTML = ops.length
            ? ops.map(op => `<span class="${op.t === 'add' ? 'diff-add' : op.t === 'remove' ? 'diff-remove' : 'diff-same'}">${Utils.escapeHtml(op.v)}</span>`).join("") || "<em>No differences — identical text.</em>"
            : "<em>Both are empty.</em>";
          modal.querySelector("#extDiffResult").style.display = "";
        });
        modal.querySelector("#extDiffSaveNewBtn").addEventListener("click", async () => {
          const pasted = modal.querySelector("#extDiffPasteInput").value;
          if (!pasted.trim()) return;
          const original = this.pe.getPrompt(selectedId);
          const copy = { id: Utils.uid("pr"), title: (original?.title || "Untitled") + " (pasted)", body: pasted, category: original?.category || "custom", tags: [], createdAt: Date.now(), updatedAt: Date.now(), currentVersion: 1 };
          await this.pe.savePrompt(copy);
          this.toast("Saved as a new prompt.", "success");
          this.closeModal();
          this.renderView();
        });
        modal.querySelector("#extDiffUpdateBtn").addEventListener("click", async () => {
          const pasted = modal.querySelector("#extDiffPasteInput").value;
          if (!pasted.trim()) return;
          const original = this.pe.getPrompt(selectedId);
          if (!original) return;
          // Snapshot the pre-update body as a version before overwriting, so
          // the old text isn't lost — same safety net "Save version" gives
          // you in the Editor, just triggered from this modal instead.
          await this.versions.createVersion({ ...original }, "Before update from pasted text");
          original.body = Utils.sanitizeText(pasted);
          await this.pe.savePrompt(original);
          this.toast(`"${original.title || "Prompt"}" updated — previous text saved to History.`, "success");
          this.closeModal();
          this.renderView();
        });
      }
    });
  },

  // True when the Library filter state differs from its defaults — gates
  // whether "Save search" is worth showing, since saving the default
  // (unfiltered) view is never useful.
  _isLibraryFilterActive(st){
    return !!(st.query.trim() || st.category !== "all" || st.tag || st.filterFav || st.sort !== "updated");
  },

  openSaveSearchModal(){
    const st = this.state.library;
    this.openModal({
      title: "Save this search", size: "modal-sm",
      bodyHtml: `
        <div class="field">
          <label class="field-label" for="ssNameInput">Name</label>
          <input class="input" id="ssNameInput" placeholder="e.g. Unfinished coding prompts" maxlength="80" autofocus>
        </div>`,
      footerHtml: `<button class="btn btn-ghost" id="ssCancelBtn">Cancel</button><button class="btn btn-primary" id="ssSaveBtn">Save</button>`,
      onMount: (modal) => {
        const input = modal.querySelector("#ssNameInput");
        modal.querySelector("#ssCancelBtn").addEventListener("click", () => this.closeModal());
        const submit = async () => {
          const name = input.value.trim();
          if (!name){ this.toast("Give this search a name first.", "warn"); return; }
          await this.pe.saveSavedSearch({
            name,
            query: st.query, category: st.category, tag: st.tag, filterFav: st.filterFav, sort: st.sort
          });
          this.closeModal();
          this.toast("Search saved.", "success", 1800);
          this.renderView();
        };
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
        modal.querySelector("#ssSaveBtn").addEventListener("click", submit);
      }
    });
  },

  // Status + needs-revisit — grouped into one small modal rather than two
  // more icon buttons on an already-6-wide card menu row (see
  // _cardMenuButton's comment on why), since both need more than a single
  // click's worth of input (a 3-way picker, a free-text note).
  openStatusModal(promptId){
    const p = this.pe.getPrompt(promptId);
    if (!p) return;
    this.openModal({
      title: "Status & revisit flag", size: "modal-sm",
      bodyHtml: `
        <div class="field">
          <label class="field-label">Status</label>
          <div class="pattern-tabs" id="statusTabs">
            ${CONFIG.PROMPT_STATUSES.map(s => `<div class="pattern-tab ${((p.status||'draft')===s.id)?'active':''}" data-status="${s.id}">${Utils.escapeHtml(s.label)}</div>`).join("")}
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="revisitNoteInput">Needs revisit <span class="field-hint">optional — leave blank to clear the flag</span></label>
          <textarea class="textarea" id="revisitNoteInput" rows="2" placeholder="What's unresolved about this one?">${Utils.escapeHtml(p.needsRevisit ? p.needsRevisit.note : "")}</textarea>
        </div>`,
      footerHtml: `<button class="btn btn-ghost" id="statusCancelBtn">Cancel</button><button class="btn btn-primary" id="statusSaveBtn">Save</button>`,
      onMount: (modal) => {
        let selectedStatus = p.status || "draft";
        modal.querySelectorAll("[data-status]").forEach(tab => {
          tab.addEventListener("click", () => {
            selectedStatus = tab.dataset.status;
            modal.querySelectorAll("[data-status]").forEach(t => t.classList.toggle("active", t.dataset.status === selectedStatus));
          });
        });
        modal.querySelector("#statusCancelBtn").addEventListener("click", () => this.closeModal());
        modal.querySelector("#statusSaveBtn").addEventListener("click", async () => {
          await this.pe.setStatus(promptId, selectedStatus);
          const note = modal.querySelector("#revisitNoteInput").value.trim();
          if (note) await this.pe.setNeedsRevisit(promptId, note);
          else await this.pe.clearNeedsRevisit(promptId);
          this.closeModal();
          this.toast("Updated.", "success", 1500);
          this.renderView();
        });
      }
    });
  },

  openBulkTagModal(){
    const ids = this.state.compare.selectedIds;
    if (!ids.length) return;
    this.openModal({
      title: `Add a tag to ${ids.length} prompt${ids.length===1?'':'s'}`, size: "modal-sm",
      bodyHtml: `<div class="field"><label class="field-label" for="bulkTagInput">Tag</label><input class="input" id="bulkTagInput" placeholder="e.g. reviewed" maxlength="40" autofocus></div>`,
      footerHtml: `<button class="btn btn-ghost" id="bulkTagCancelBtn">Cancel</button><button class="btn btn-primary" id="bulkTagApplyBtn">Add tag</button>`,
      onMount: (modal) => {
        const input = modal.querySelector("#bulkTagInput");
        modal.querySelector("#bulkTagCancelBtn").addEventListener("click", () => this.closeModal());
        const submit = async () => {
          const tag = input.value.trim();
          if (!tag){ this.toast("Enter a tag first.", "warn"); return; }
          await this.pe.bulkAddTag(ids, tag);
          this.closeModal();
          this.toast(`Tagged ${ids.length} prompt${ids.length===1?'':'s'}.`, "success", 1800);
          this.renderView();
        };
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
        modal.querySelector("#bulkTagApplyBtn").addEventListener("click", submit);
      }
    });
  },

  openBulkCategoryModal(){
    const ids = this.state.compare.selectedIds;
    if (!ids.length) return;
    let selected = "custom";
    this.openModal({
      title: `Set category for ${ids.length} prompt${ids.length===1?'':'s'}`, size: "modal-sm",
      bodyHtml: `<div class="field"><label class="field-label">Category</label><div class="pattern-tabs" id="bulkCatTabs" style="flex-wrap:wrap">${CONFIG.CATEGORIES.map(c => `<div class="pattern-tab ${c.id===selected?'active':''}" data-cat="${c.id}">${Utils.escapeHtml(c.label)}</div>`).join("")}</div></div>`,
      footerHtml: `<button class="btn btn-ghost" id="bulkCatCancelBtn">Cancel</button><button class="btn btn-primary" id="bulkCatApplyBtn">Apply</button>`,
      onMount: (modal) => {
        modal.querySelectorAll("[data-cat]").forEach(tab => {
          tab.addEventListener("click", () => {
            selected = tab.dataset.cat;
            modal.querySelectorAll("[data-cat]").forEach(t => t.classList.toggle("active", t.dataset.cat === selected));
          });
        });
        modal.querySelector("#bulkCatCancelBtn").addEventListener("click", () => this.closeModal());
        modal.querySelector("#bulkCatApplyBtn").addEventListener("click", async () => {
          await this.pe.bulkSetCategory(ids, selected);
          this.closeModal();
          this.toast(`Updated category for ${ids.length} prompt${ids.length===1?'':'s'}.`, "success", 1800);
          this.renderView();
        });
      }
    });
  }
};
