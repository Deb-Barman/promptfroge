// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { DuplicateFinder } from "../../core/DuplicateFinder";
import { Utils } from "../../core/Utils";
import { CONFIG } from "../../core/CONFIG";

/** UIManager methods: dashboard. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const dashboardMethods = {
  /* ---------------------------------------------------------------------- */
  /* DASHBOARD VIEW                                                          */
  /* ---------------------------------------------------------------------- */
  renderDashboard(){
    const stats = this.analytics.summary();
    const recent = this.pe.listPrompts().sort((a,b) => b.updatedAt - a.updatedAt).slice(0, 5);
    const favorites = this.pe.listPrompts().filter(p => p.favorite).slice(0, 4);
    if (!this._dismissedDuplicateClusters) this._dismissedDuplicateClusters = new Set();
    const dupeClusters = DuplicateFinder.findClusters(this.pe.listPrompts().filter(p => !p.archived))
      .filter(cluster => !this._dismissedDuplicateClusters.has(cluster.map(p => p.id).sort().join(",")));

    this.workspace.innerHTML = `
      <div class="view">
        <div class="view-header">
          <div>
            <h1 class="view-title">Dashboard</h1>
            <p class="view-subtitle">Everything lives on this device — nothing here is sent anywhere.</p>
          </div>
          <div class="view-actions">
            <button class="icon-btn" data-action="open-date-search" title="Search by date">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            </button>
            <button class="icon-btn" data-action="open-graph-view" title="Open graph view — see how your prompts link together">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4.3 8 8M12.2 4.6 8 8M4.1 11.7 8 8" stroke="currentColor" stroke-width="1.2"/><circle cx="4" cy="4.3" r="2" stroke="currentColor" stroke-width="1.3"/><circle cx="12.2" cy="4.6" r="1.6" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.8" stroke="currentColor" stroke-width="1.3"/><circle cx="4.1" cy="11.7" r="1.6" stroke="currentColor" stroke-width="1.3"/><circle cx="12" cy="11.5" r="1.3" stroke="currentColor" stroke-width="1.3"/></svg>
            </button>
            <button class="btn btn-primary" data-action="new-prompt">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              New Prompt
            </button>
          </div>
        </div>

        ${recent.length ? `<div class="card card-hover card-clickable dashboard-continue-card" style="margin-bottom:var(--sp-4);display:flex;align-items:center;justify-content:space-between;gap:16px" data-action="open-prompt:${recent[0].id}">
          <div style="min-width:0">
            <div style="font-size:var(--fs-2xs);color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px">Continue where you left off</div>
            <div class="card-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.escapeHtml(recent[0].title || "Untitled prompt")}</div>
            <div class="card-meta">${Utils.timeAgo(recent[0].updatedAt)}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--text-tertiary)"><path d="M6 4l4.5 4L6 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>` : ""}

        ${dupeClusters.length ? `<div class="side-panel-section" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:var(--sp-4);border-color:color-mix(in srgb, var(--accent-amber) 30%, var(--border-subtle))">
          <span style="font-size:var(--fs-xs);color:var(--text-secondary)">You have ${dupeClusters.length} group${dupeClusters.length===1?'':'s'} of similar prompts in your library.</span>
          <button class="btn btn-ghost btn-sm" data-action="nav:library">Review in Library</button>
        </div>` : ""}

        <div class="grid grid-4" style="margin-bottom:var(--sp-6)">
          ${this._statCard("Prompts", stats.totalPrompts, "prompt")}
          ${this._statCard("Templates", stats.totalTemplates, "template")}
          ${this._statCard("Snippets", stats.totalSnippets, "snippet")}
          ${this._statCard("Words written", stats.totalWords.toLocaleString(), "words")}
        </div>

        <div class="grid grid-2" style="align-items:start">
          <div class="panel" style="padding:var(--sp-5)">
            <div class="side-panel-title"><span>Recently edited</span></div>
            ${recent.length ? recent.map(p => this._recentRow(p)).join("") : this._miniEmpty("No prompts yet — write your first one to see it here.")}
          </div>

          <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
            <div class="panel" style="padding:var(--sp-4)">
              <div class="side-panel-title"><span>Quick actions</span></div>
              <div style="display:flex;flex-direction:column;gap:2px">
                ${this._quickAction("new-prompt", "add", "New Prompt", "Start writing in the editor")}
                ${this._quickAction("quick-capture", "capture", "Quick Capture", "Jot an idea straight to your Inbox")}
                ${this._quickAction("nav:builder", "builder", "Visual Builder", "Drag and drop structured blocks")}
                ${this._quickAction("nav:patterns", "pattern", "Browse Patterns", "15 reusable prompt patterns")}
                ${this._quickAction("nav:learn", "learn", "Learning Mode", "Tips and challenges")}
              </div>
            </div>

            ${favorites.length ? `
            <div class="panel" style="padding:var(--sp-4)">
              <div class="side-panel-title"><span>Favorites</span></div>
              <div style="display:flex;flex-direction:column;gap:2px">
                ${favorites.map(p => this._quickAction(`open-prompt:${p.id}`, "doc", p.title || "Untitled", Utils.truncate(p.body, 46))).join("")}
              </div>
            </div>` : ""}
          </div>
        </div>
      </div>`;
  },

  _statCard(label, num, icon){
    const icons = {
      prompt: '<path d="M4 3h10l4 4v14H4Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M14 3v4h4" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
      template: '<rect x="3" y="3" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M3 8.5h16" stroke="currentColor" stroke-width="1.4"/>',
      snippet: '<path d="M6 3 2 11l4 8M16 3l4 8-4 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
      words: '<path d="M3 6h16M3 11h16M3 16h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
    };
    return `<div class="card">
      <div class="stat-card-icon"><svg width="20" height="20" viewBox="0 0 22 22" fill="none">${icons[icon]}</svg></div>
      <div class="stat-card-num">${num}</div>
      <div class="stat-card-label">${label}</div>
    </div>`;
  },

  _quickAction(action, icon, label, desc){
    const icons = {
      add: '<path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
      builder: '<rect x="1.5" y="2" width="11" height="2.6" rx="0.6" stroke="currentColor" stroke-width="1.2"/><rect x="1.5" y="6" width="11" height="2.6" rx="0.6" stroke="currentColor" stroke-width="1.2"/><rect x="1.5" y="10" width="7" height="2.6" rx="0.6" stroke="currentColor" stroke-width="1.2"/>',
      pattern: '<circle cx="4.5" cy="4.5" r="2.3" stroke="currentColor" stroke-width="1.2"/><circle cx="10.5" cy="4.5" r="2.3" stroke="currentColor" stroke-width="1.2"/><circle cx="7.5" cy="10" r="2.3" stroke="currentColor" stroke-width="1.2"/>',
      learn: '<path d="M7 2 1.5 4.8 7 7.6l5.5-2.8Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
      doc: '<path d="M3 1.5h5l3 3V12.5H3Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>',
      capture: '<path d="M2 4.5V2h2.5M9.5 2H12v2.5M12 9.5V12H9.5M4.5 12H2V9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'
    };
    return `<div class="quick-action" data-action="${action}" style="cursor:pointer;border-radius:var(--r-md)" onmouseover="this.style.background='var(--bg-3)'" onmouseout="this.style.background=''">
      <div class="quick-action-icon"><svg width="15" height="15" viewBox="0 0 15 15" fill="none">${icons[icon] || icons.doc}</svg></div>
      <div style="flex:1;min-width:0">
        <div class="quick-action-label">${Utils.escapeHtml(label)}</div>
        <div class="quick-action-desc">${Utils.escapeHtml(desc)}</div>
      </div>
    </div>`;
  },

  _recentRow(p){
    const cat = CONFIG.CATEGORIES.find(c => c.id === p.category) || CONFIG.CATEGORIES[CONFIG.CATEGORIES.length-1];
    return `<div class="related-item" data-action="open-prompt:${p.id}" style="display:flex;align-items:center;gap:10px;padding:10px 0">
      <span class="category-dot ${cat.cls}"></span>
      <div style="flex:1;min-width:0">
        <div class="related-title">${Utils.escapeHtml(p.title || "Untitled prompt")}</div>
        <div class="related-meta">${Utils.timeAgo(p.updatedAt)} &middot; ${Utils.countWords(p.body)} words</div>
      </div>
      ${p.favorite ? '<svg width="13" height="13" viewBox="0 0 13 13" fill="var(--accent-amber)"><path d="M6.5 1 8.2 4.6 12 5.2 9.2 7.9 9.9 11.7 6.5 9.9 3.1 11.7 3.8 7.9 1 5.2 4.8 4.6Z"/></svg>' : ""}
    </div>`;
  },

  _miniEmpty(text){
    return `<div style="padding:var(--sp-5) 0;color:var(--text-tertiary);font-size:var(--fs-sm)">${Utils.escapeHtml(text)}</div>`;
  }
};
