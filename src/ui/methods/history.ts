// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "../../core/Utils";
import { Dropdown } from "../Dropdown";

/** UIManager methods: history. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const historyMethods = {
  renderHistory(){
    const st = this.state.history;
    let prompts = this.pe.listPrompts().sort((a,b) => b.updatedAt - a.updatedAt);
    const totalCount = prompts.length;
    if (st.query.trim()){
      const q = st.query.trim().toLowerCase();
      prompts = prompts.filter(p => (p.title || "").toLowerCase().includes(q));
    }
    if (st.onlyWithVersions){
      prompts = prompts.filter(p => (p.currentVersion || 1) > 1);
    }
    this.workspace.innerHTML = `
      <div class="view">
        <div class="view-header">
          <div>
            <h1 class="view-title">History &amp; Versions</h1>
            <p class="view-subtitle">Pick a prompt to see its saved versions, compare, and restore.</p>
          </div>
        </div>
        <div class="grid history-layout" style="align-items:start">
          <div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
              <div class="search-input-wrap">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.3" stroke="currentColor" stroke-width="1.3"/><path d="M9.1 9.1 12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                <input class="input" id="historySearchInput" data-search-input enterkeyhint="search" placeholder="Search prompts by title…" value="${Utils.escapeHtml(st.query)}">
              </div>
              <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);color:var(--text-secondary);cursor:pointer">
                <input type="checkbox" id="historyOnlyVersionsCheck" ${st.onlyWithVersions?'checked':''}>
                Only prompts with saved versions
              </label>
              ${(st.query.trim() || st.onlyWithVersions) ? `<span style="font-size:var(--fs-2xs);color:var(--text-tertiary)">${prompts.length} of ${totalCount}</span>` : ""}
            </div>
            <div class="panel" style="padding:var(--sp-3);max-height:calc(100vh - 320px);overflow-y:auto">
              ${prompts.length ? prompts.map(p => `
                <div class="related-item" data-action="history-select:${p.id}" style="padding:10px 8px;border-radius:var(--r-md);${this._activeHistoryPromptId===p.id?'background:var(--bg-2)':''}">
                  <div class="related-title">${Utils.escapeHtml(p.title || "Untitled prompt")}</div>
                  <div class="related-meta">v${p.currentVersion || 1} &middot; ${Utils.timeAgo(p.updatedAt)}</div>
                </div>`).join("") : this._miniEmpty(totalCount ? "No prompts match." : "No prompts yet.")}
            </div>
          </div>
          <div id="historyDetail">
            <div class="empty-state">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M18 10v8l5.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6.6 12.8A12 12 0 1 1 6 20" stroke="currentColor" stroke-width="1.6"/></svg>
              <div class="empty-state-title">Select a prompt</div>
              <div class="empty-state-body">Choose a prompt on the left to view its version history.</div>
            </div>
          </div>
        </div>
      </div>`;
    // A search or filter change re-renders the whole view, including the
    // list — but shouldn't kick you out of whatever detail panel you had
    // open, as long as that prompt still matches the current filter.
    if (this._activeHistoryPromptId && prompts.some(p => p.id === this._activeHistoryPromptId)){
      this._renderHistoryDetail(this._activeHistoryPromptId);
    }
  },

  renderShortcuts(){
    const st = this.state.shortcuts;
    // Built-ins never show here at all — this screen is specifically the
    // "your own shortcuts" workspace the user asked for, not a picker that
    // needs the full set. The 5 defaults are still fully usable via the
    // editor's /trigger autocomplete; they're just not managed from here.
    let shortcuts = this.pe.listSnippets();
    const totalCount = shortcuts.length;
    if (st.query.trim()){
      const q = st.query.trim().toLowerCase();
      shortcuts = shortcuts.filter(s => s.trigger.toLowerCase().includes(q) || s.body.toLowerCase().includes(q));
    }
    shortcuts.sort((a,b) => b.updatedAt - a.updatedAt);
    const pg = this._paginate("shortcuts", shortcuts);

    this.workspace.innerHTML = `
      <div class="view">
        <div class="view-header">
          <div>
            <h1 class="view-title">Shortcuts</h1>
            <p class="view-subtitle">Type <code>/name</code> in the Editor to insert one. ${totalCount} shortcut${totalCount===1?'':'s'} of your own.</p>
          </div>
          <div class="view-actions">
            <button class="btn btn-sm ${st.selectMode?'btn-primary':'btn-secondary'}" data-action="shortcuts-toggle-select-mode">${st.selectMode?'Done':'Select'}</button>
            <button class="btn btn-secondary btn-sm" data-action="shortcuts-import">Paste / Upload JSON</button>
            <button class="btn btn-primary" data-action="shortcuts-add-new">+ Add Shortcut</button>
            <button class="icon-btn" data-action="close-shortcuts" title="Close" aria-label="Close">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M3 3 12 12M12 3 3 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>

        <div class="filter-bar">
          <div class="search-input-wrap">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.3" stroke="currentColor" stroke-width="1.3"/><path d="M9.1 9.1 12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            <input class="input" id="scSearchInput" data-search-input enterkeyhint="search" placeholder="Search shortcuts…" value="${Utils.escapeHtml(st.query)}">
          </div>
          ${pg.dropdownHtml}
        </div>

        ${st.selectMode ? `<div class="side-panel-section" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:var(--sp-4)">
          <span style="font-size:var(--fs-xs);color:var(--text-secondary)">${st.selectedIds.length} selected — tap to select.</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${st.selectedIds.length ? `<button class="btn btn-ghost btn-sm" data-action="shortcuts-clear-selection">Clear</button>` : ""}
            ${st.selectedIds.length ? `<button class="btn btn-danger btn-sm" data-action="shortcuts-bulk-delete">Delete (${st.selectedIds.length})</button>` : ""}
          </div>
        </div>` : ""}

        ${shortcuts.length ? `
        <div style="display:flex;flex-direction:column;gap:6px">
          ${pg.pageItems.map(s => {
            const isSelected = st.selectMode && st.selectedIds.includes(s.id);
            return `
          <div class="card ${isSelected?'card-selected':''}" style="display:flex;align-items:center;gap:10px;padding:11px 14px" ${st.selectMode ? `data-action="shortcuts-toggle-select:${s.id}"` : ""}>
            ${st.selectMode ? `<input type="checkbox" ${isSelected?"checked":""} style="pointer-events:none;flex-shrink:0" tabindex="-1">` : ""}
            <div style="flex:1;min-width:0">
              <div style="font-family:var(--font-mono);font-size:var(--fs-sm);font-weight:600;color:var(--accent-amber)">${Utils.escapeHtml(s.trigger)}</div>
              <div style="font-size:var(--fs-xs);color:var(--text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">${Utils.escapeHtml(s.body)}</div>
            </div>
            <span style="font-size:var(--fs-2xs);color:var(--text-tertiary);flex-shrink:0">used ${s.useCount||0}&times; &middot; ${Utils.timeAgo(s.updatedAt)}</span>
            ${!st.selectMode ? `<div style="display:flex;gap:2px;flex-shrink:0">
              <button class="icon-btn btn-sm" data-action="shortcuts-edit:${s.id}" title="Edit"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 1.8 11.2 4.5 4.3 11.4 1.4 11.6 1.6 8.7Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg></button>
              <button class="icon-btn btn-sm" data-action="shortcuts-delete:${s.id}" title="Delete"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 3.5h8M5 3.5V2h3v1.5M3.5 3.5 4 11h5l0.5-7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            </div>` : ""}
          </div>`;
          }).join("")}
        </div>${pg.footerHtml}` : `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="8" y="8" width="24" height="24" rx="4" stroke="currentColor" stroke-width="1.6"/><path d="M16 20h8M20 16v8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <div class="empty-state-title">${totalCount ? "No matches" : "No shortcuts yet"}</div>
          <div class="empty-state-body">${totalCount ? "Try a different search term." : "Add one manually, or import several at once with JSON."}</div>
          <button class="btn btn-primary" data-action="shortcuts-add-new">Add a shortcut</button>
        </div>`}
      </div>`;

    Dropdown.attach(this.workspace, { [pg.dropdownId]: [
      { value: "50", label: "50 per page" }, { value: "100", label: "100 per page" },
      { value: "200", label: "200 per page" }, { value: "0", label: "All" }
    ] }, (id, value) => { this.state.shortcuts.pageSize = Number(value); this.state.shortcuts.page = 0; this.renderView(); });
  },

  // Force-directed layout, computed once per render rather than animated
  // continuously — this is a snapshot view of how prompts currently link
  // together, not a live physics toy, so a fixed number of settle
  // iterations up front keeps the view stable and cheap to re-render.
  // Nodes seed on a circle (never all-at-origin) so repulsion has a
  // direction to push in from the very first iteration.
  _layoutLinkGraph(nodes, edges, width, height){
    const positions = new Map();
    const n = nodes.length;
    if (!n) return positions;
    nodes.forEach((node, i) => {
      const angle = (i / n) * Math.PI * 2;
      const seedR = Math.min(width, height) * 0.32;
      positions.set(node.id, { x: width/2 + Math.cos(angle) * seedR, y: height/2 + Math.sin(angle) * seedR });
    });
    const REPULSION = 6000, SPRING = 0.02, IDEAL_DIST = 110, DAMPING = 0.85, ITER = 180;
    const velocities = new Map(nodes.map(nd => [nd.id, { vx: 0, vy: 0 }]));
    for (let iter = 0; iter < ITER; iter++){
      for (let i = 0; i < n; i++){
        for (let j = i + 1; j < n; j++){
          const a = positions.get(nodes[i].id), b = positions.get(nodes[j].id);
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx*dx + dy*dy) || 0.01;
          const force = REPULSION / (dist * dist);
          const fx = (dx/dist) * force, fy = (dy/dist) * force;
          const va = velocities.get(nodes[i].id), vb = velocities.get(nodes[j].id);
          va.vx += fx; va.vy += fy; vb.vx -= fx; vb.vy -= fy;
        }
      }
      for (const { source, target } of edges){
        const a = positions.get(source), b = positions.get(target);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 0.01;
        const force = (dist - IDEAL_DIST) * SPRING;
        const fx = (dx/dist) * force, fy = (dy/dist) * force;
        const va = velocities.get(source), vb = velocities.get(target);
        va.vx += fx; va.vy += fy; vb.vx -= fx; vb.vy -= fy;
      }
      for (const node of nodes){
        const v = velocities.get(node.id), p = positions.get(node.id);
        v.vx *= DAMPING; v.vy *= DAMPING;
        p.x += v.vx * 0.02; p.y += v.vy * 0.02;
        p.x += (width/2 - p.x) * 0.001;
        p.y += (height/2 - p.y) * 0.001;
        p.x = Math.max(24, Math.min(width - 24, p.x));
        p.y = Math.max(24, Math.min(height - 24, p.y));
      }
    }
    return positions;
  },

  renderGraphView(){
    const { nodes, edges, brokenLinks } = this.pe.buildLinkGraph();
    const width = Math.max(320, (this.workspace?.clientWidth || 900) - 32);
    const height = 560;
    const positions = this._layoutLinkGraph(nodes, edges, width, height);
    const linkedIds = new Set();
    for (const e of edges){ linkedIds.add(e.source); linkedIds.add(e.target); }
    const isolatedCount = nodes.length - linkedIds.size;

    const edgeLines = edges.map(e => {
      const a = positions.get(e.source), b = positions.get(e.target);
      if (!a || !b) return "";
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--border-strong)" stroke-width="1.2" />`;
    }).join("");
    const nodeCircles = nodes.map(nd => {
      const p = positions.get(nd.id);
      const isLinked = linkedIds.has(nd.id);
      const r = isLinked ? 8 : 5;
      return `<g data-graph-node="${nd.id}" style="cursor:pointer">
        <circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${isLinked ? 'var(--accent-amber)' : 'var(--text-tertiary)'}" stroke="var(--bg-0)" stroke-width="2" />
        <text x="${p.x}" y="${p.y + r + 13}" text-anchor="middle" font-size="10" fill="var(--text-secondary)">${Utils.escapeHtml((nd.title||"").slice(0,22))}${nd.title.length>22?"…":""}</text>
      </g>`;
    }).join("");

    this.workspace.innerHTML = `
      <div class="view">
        <div class="view-header">
          <div>
            <h1 class="view-title">Prompt Graph</h1>
            <p class="view-subtitle">${nodes.length} prompt${nodes.length===1?'':'s'} &middot; ${edges.length} link${edges.length===1?'':'s'}${isolatedCount ? ` &middot; ${isolatedCount} unlinked` : ""}${brokenLinks.length ? ` &middot; ${brokenLinks.length} broken link${brokenLinks.length===1?'':'s'}` : ""}</p>
          </div>
          <div class="view-actions">
            <button class="btn btn-secondary btn-sm" data-action="graph-refresh">Refresh layout</button>
            <button class="icon-btn" data-action="close-graph-view" title="Close" aria-label="Close">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M3 3 12 12M12 3 3 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-3)">Type <code>@</code> in the Editor and pick a prompt to link it here — amber nodes have at least one link.</div>
        ${nodes.length ? `
        <div class="panel" style="padding:0;overflow:hidden">
          <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;max-width:100%">
            ${edgeLines}
            ${nodeCircles}
          </svg>
        </div>
        ${brokenLinks.length ? `
        <div class="panel" style="margin-top:var(--sp-4);padding:var(--sp-4)">
          <div style="font-size:var(--fs-xs);font-weight:600;color:var(--text-secondary);margin-bottom:8px">Broken links</div>
          ${brokenLinks.map(b => `<div style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-bottom:4px">"${Utils.escapeHtml(b.sourceTitle)}" links to <span style="color:var(--accent-red)">[[${Utils.escapeHtml(b.targetTitle)}]]</span> — no prompt with that title exists.</div>`).join("")}
        </div>` : ""}` : `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.6"/><circle cx="28" cy="12" r="4" stroke="currentColor" stroke-width="1.6"/><circle cx="20" cy="30" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M15.5 14.5 24 26M24.5 14.5 16 26M16 12h8" stroke="currentColor" stroke-width="1.4"/></svg>
          <div class="empty-state-title">No prompts yet</div>
          <div class="empty-state-body">Save a few prompts, then link them with @ in the Editor to see the graph.</div>
        </div>`}
      </div>`;

    this.workspace.querySelectorAll("[data-graph-node]").forEach(el => {
      el.addEventListener("click", () => this.openPromptViewModal(el.dataset.graphNode));
    });
  },

  async _renderHistoryDetail(promptId){
    const detail = document.getElementById("historyDetail");
    const prompt = this.pe.getPrompt(promptId);
    if (!detail || !prompt) return;
    const versions = await this.versions.listVersions(promptId);
    detail.innerHTML = `
      <div class="panel" style="padding:var(--sp-4);margin-bottom:var(--sp-4)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-2)">
          <h3 style="font-size:var(--fs-md);font-weight:650">${Utils.escapeHtml(prompt.title || "Untitled prompt")}</h3>
          <button class="btn btn-secondary btn-sm" data-action="history-open-editor:${prompt.id}">Open in Editor</button>
        </div>
        <p style="font-size:var(--fs-xs);color:var(--text-tertiary)">${versions.length} saved version${versions.length===1?'':'s'}</p>
        ${this._renderScoreSparkline(versions)}
      </div>
      <div class="panel" style="padding:var(--sp-4)">
        ${versions.length ? versions.slice().reverse().map((v, i) => `
          <div class="version-item ${i===0?'is-current':''}">
            <div class="version-item-info">
              <span class="version-dot"></span>
              <span class="version-label">v${v.versionNum}</span>
              <span class="version-note">${Utils.escapeHtml(v.note || "—")}</span>
              <span class="version-time">${Utils.formatDate(v.createdAt)}</span>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0">
              ${i < versions.length - 1 ? `<button class="btn btn-ghost btn-sm" data-action="history-diff:${prompt.id}:${versions[versions.length - 2 - i].id}:${v.id}">Diff vs prev</button>` : ""}
              ${i !== 0 ? `<button class="btn btn-secondary btn-sm" data-action="history-restore:${prompt.id}:${v.id}">Restore</button>` : `<span class="badge">Current</span>`}
            </div>
          </div>`).join("") : this._miniEmpty("No versions saved yet — use 'Save version' in the editor to start tracking history.")}
      </div>`;
  },

  openDiffModal(oldVersion, newVersion){
    const ops = Utils.diffWords(oldVersion.body, newVersion.body);
    const html = ops.map(op => {
      const cls = op.t === "add" ? "diff-add" : op.t === "remove" ? "diff-remove" : "diff-same";
      return `<span class="${cls}">${Utils.escapeHtml(op.v)}</span>`;
    }).join("");
    this.openModal({
      title: `Compare v${oldVersion.versionNum} → v${newVersion.versionNum}`, size: "modal-lg",
      bodyHtml: `<div class="diff-line" style="max-height:50vh;overflow-y:auto">${html || "<em>No changes</em>"}</div>`,
      footerHtml: `<button class="btn btn-primary" id="diffCloseBtn">Close</button>`,
      onMount: (modal) => modal.querySelector("#diffCloseBtn").addEventListener("click", () => this.closeModal())
    });
  }
};
