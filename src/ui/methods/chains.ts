// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "../../core/Utils";
import { Dropdown } from "../Dropdown";

/** UIManager methods: chains. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const chainsMethods = {
  /* ---------------------------------------------------------------------- */
  /* CHAINS VIEW — a chain is a planning artifact: an ordered list of steps,  */
  /* each pointing at a saved prompt plus a note on what that step feeds     */
  /* into next. This documents a multi-step workflow; it does not execute   */
  /* anything or call any model, staying consistent with the app's fully    */
  /* offline scope.                                                         */
  /* ---------------------------------------------------------------------- */
  renderChains(){
    const chains = this.pe.listChains();
    this.workspace.innerHTML = `
      <div class="view">
        <div class="view-header">
          <div>
            <h1 class="view-title">Prompt Chains</h1>
            <p class="view-subtitle">Plan multi-step workflows — one prompt's output feeding the next. A planning artifact, not an execution engine: nothing here calls any model.</p>
          </div>
          <div class="view-actions">
            <button class="btn btn-primary" data-action="new-chain">+ New Chain</button>
          </div>
        </div>

        ${chains.length ? `<div class="grid grid-auto">${chains.map(c => this._renderChainCard(c)).join("")}</div>` : `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="10" cy="12" r="5" stroke="currentColor" stroke-width="1.6"/><circle cx="20" cy="22" r="5" stroke="currentColor" stroke-width="1.6"/><circle cx="30" cy="30" r="5" stroke="currentColor" stroke-width="1.6"/><path d="M14 15 17 19M24 25 27 27" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <div class="empty-state-title">No chains yet</div>
          <div class="empty-state-body">Build a chain when a task needs more than one prompt in sequence — e.g. "extract data" → "summarize" → "format as email".</div>
          <button class="btn btn-primary" data-action="new-chain">Create your first chain</button>
        </div>`}
      </div>`;
  },

  _renderChainCard(chain){
    const steps = chain.steps || [];
    const resolvedSteps = steps.map(s => ({ ...s, prompt: s.promptId ? this.pe.getPrompt(s.promptId) : null }));
    return `
      <div class="card card-hover card-clickable" data-action="open-chain:${chain.id}">
        <div class="card-title">${Utils.escapeHtml(chain.name || "Untitled chain")}</div>
        <div class="card-meta">${steps.length} step${steps.length===1?'':'s'} &middot; ${Utils.timeAgo(chain.updatedAt)}</div>
        ${chain.description ? `<div style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-top:6px">${Utils.escapeHtml(chain.description)}</div>` : ""}
        ${resolvedSteps.length ? `<div style="margin-top:10px;display:flex;flex-direction:column;gap:4px">
          ${resolvedSteps.slice(0,4).map((s,i) => `
            <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary)">
              <span style="width:16px;height:16px;border-radius:50%;background:var(--bg-3);display:flex;align-items:center;justify-content:center;font-size:9px;font-family:var(--font-mono);flex-shrink:0">${i+1}</span>
              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.prompt ? Utils.escapeHtml(s.prompt.title || "Untitled") : '<em style="color:var(--accent-red)">missing prompt</em>'}</span>
            </div>`).join("")}
          ${resolvedSteps.length > 4 ? `<div style="font-size:10px;color:var(--text-tertiary);padding-left:22px">+${resolvedSteps.length - 4} more</div>` : ""}
        </div>` : `<div style="margin-top:10px;font-size:var(--fs-2xs);color:var(--text-tertiary)">No steps yet — click to add some.</div>`}
      </div>`;
  },

  openChainEditorModal(chainId){
    const chain = chainId ? this.pe.getChain(chainId) : this.pe.newChainSkeleton();
    if (!chain) return;
    // Work on a local deep-ish copy so cancelling the modal never mutates
    // the saved record — mirrors the non-destructive intent used elsewhere
    // (e.g. format-convert's confirm-before-apply flow).
    const draft = { ...chain, steps: (chain.steps || []).map(s => ({ ...s })) };
    const allPrompts = this.pe.listPrompts().sort((a,b) => (a.title||"").localeCompare(b.title||""));

    const renderStepsList = (modal) => {
      const container = modal.querySelector("#chainStepsList");
      if (!container) return;
      container.innerHTML = draft.steps.length ? draft.steps.map((s, i) => `
        <div class="card" style="padding:12px;margin-bottom:8px" data-step-idx="${i}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="width:20px;height:20px;border-radius:50%;background:var(--bg-3);display:flex;align-items:center;justify-content:center;font-size:10px;font-family:var(--font-mono);flex-shrink:0">${i+1}</span>
            <div style="flex:1">${Dropdown.renderTrigger({ id: `chainStepPromptDD_${i}`, value: s.promptId || "", size: "dd-sm", placeholder: "Choose a saved prompt…", options: allPrompts.map(p => ({ value: p.id, label: p.title || "Untitled" })) })}</div>
            <button class="icon-btn btn-sm" data-step-action="up:${i}" title="Move up" ${i===0?'disabled style="opacity:0.3;pointer-events:none"':''}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9.5V2.5M2.5 6 6 2.5 9.5 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="icon-btn btn-sm" data-step-action="down:${i}" title="Move down" ${i===draft.steps.length-1?'disabled style="opacity:0.3;pointer-events:none"':''}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2.5v7M2.5 6 6 9.5 9.5 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="icon-btn btn-sm" data-step-action="remove:${i}" title="Remove step" style="color:var(--accent-red)">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            </button>
          </div>
          <input class="input" data-step-note="${i}" placeholder="What does this step's output feed into next? (optional note)" value="${Utils.escapeHtml(s.note || "")}" style="font-size:var(--fs-xs)">
        </div>`).join("") : `<p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin:0 0 8px 0">No steps yet. Add your first one below.</p>`;

      Dropdown.attach(container, Object.fromEntries(draft.steps.map((s,i) => [`chainStepPromptDD_${i}`, allPrompts.map(p => ({ value: p.id, label: p.title || "Untitled" }))])),
        (id, value) => { const idx = parseInt(id.split("_")[1], 10); draft.steps[idx].promptId = value; });

      container.querySelectorAll("[data-step-note]").forEach(inp => {
        inp.addEventListener("input", () => { draft.steps[parseInt(inp.dataset.stepNote, 10)].note = inp.value; });
      });
      container.querySelectorAll("[data-step-action]").forEach(btn => {
        btn.addEventListener("click", () => {
          const [act, idxStr] = btn.dataset.stepAction.split(":");
          const idx = parseInt(idxStr, 10);
          if (act === "remove") draft.steps.splice(idx, 1);
          else if (act === "up" && idx > 0) [draft.steps[idx-1], draft.steps[idx]] = [draft.steps[idx], draft.steps[idx-1]];
          else if (act === "down" && idx < draft.steps.length - 1) [draft.steps[idx], draft.steps[idx+1]] = [draft.steps[idx+1], draft.steps[idx]];
          renderStepsList(modal);
        });
      });
    };

    this.openModal({
      title: chainId ? "Edit Chain" : "New Chain", size: "modal-lg",
      bodyHtml: `
        <div class="field">
          <label class="field-label" for="chainNameInput">Chain name</label>
          <input class="input" id="chainNameInput" value="${Utils.escapeHtml(draft.name)}" placeholder="e.g. Data extraction → Summary → Email" maxlength="120">
        </div>
        <div class="field">
          <label class="field-label" for="chainDescInput">Description <span class="field-hint">optional</span></label>
          <input class="input" id="chainDescInput" value="${Utils.escapeHtml(draft.description)}" placeholder="What is this chain for?" maxlength="500">
        </div>
        <div class="field">
          <label class="field-label">Steps</label>
          <div id="chainStepsList"></div>
          <button class="btn btn-ghost btn-sm" id="chainAddStepBtn" ${!allPrompts.length ? 'disabled title="Save a prompt first"' : ''}>+ Add step</button>
          ${!allPrompts.length ? `<p style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-top:6px">You don't have any saved prompts yet — write and save one in the Editor first.</p>` : ""}
        </div>`,
      footerHtml: { spread: true, html: `
        <div>${chainId ? `<button class="btn btn-danger btn-sm" id="chainDeleteBtn">Delete</button>` : ""}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" id="chainCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="chainSaveBtn">Save Chain</button>
        </div>` },
      onMount: (modal) => {
        renderStepsList(modal);
        modal.querySelector("#chainAddStepBtn").addEventListener("click", () => {
          draft.steps.push({ id: Utils.uid("step"), promptId: allPrompts[0] ? allPrompts[0].id : null, note: "" });
          renderStepsList(modal);
        });
        modal.querySelector("#chainCancelBtn").addEventListener("click", () => this.closeModal());
        if (chainId){
          modal.querySelector("#chainDeleteBtn").addEventListener("click", () => {
            this.confirmDialog({ title: "Delete chain?", message: `Delete "${chain.name || 'this chain'}"? This can't be undone.`, danger: true, confirmLabel: "Delete", onConfirm: async () => {
              await this.pe.deleteChain(chainId);
              this.closeModal();
              this.toast("Chain deleted.", "info");
              this.renderView();
            }});
          });
        }
        modal.querySelector("#chainSaveBtn").addEventListener("click", async () => {
          draft.name = modal.querySelector("#chainNameInput").value;
          draft.description = modal.querySelector("#chainDescInput").value;
          if (!draft.name.trim()){ this.toast("Give this chain a name first.", "warn"); return; }
          const incomplete = draft.steps.some(s => !s.promptId);
          if (incomplete){ this.toast("Every step needs a prompt selected — remove any empty steps first.", "warn"); return; }
          await this.pe.saveChain(draft);
          this.closeModal();
          this.toast("Chain saved.", "success", 1800);
          this.renderView();
        });
      }
    });
  }
};
