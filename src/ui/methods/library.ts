// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "../../core/Utils";
import { DuplicateFinder } from "../../core/DuplicateFinder";
import { Dropdown } from "../Dropdown";
import { CONFIG } from "../../core/CONFIG";
import { Analyzer } from "../../core/Analyzer";

/** UIManager methods: library. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const libraryMethods = {
  /* ---------------------------------------------------------------------- */
  /* LIBRARY VIEW                                                            */
  /* ---------------------------------------------------------------------- */
  renderLibrary(){
    const st = this.state.library;
    let prompts = this.pe.listPrompts({ includeArchived: st.filterArchived });

    if (st.query.trim()){
      const ids = new Set(this.search.search(st.query, { types: ["prompts"], limit: 500 }).map(r => r.id));
      prompts = prompts.filter(p => ids.has(p.id));
    }
    if (st.category !== "all") prompts = prompts.filter(p => p.category === st.category);
    if (st.tag) prompts = prompts.filter(p => (p.tags||[]).includes(st.tag));
    if (st.group){
      const g = this.pe.getGroup(st.group);
      prompts = prompts.filter(p => g && g.memberIds.includes(p.id));
    }
    if (st.filterFav) prompts = prompts.filter(p => p.favorite);
    // filterArchived is an isolate toggle, not an include toggle — "on"
    // means show ONLY archived prompts (mirrors Favorites' own on/off
    // shape), so both branches narrow the list; only which condition
    // they narrow to differs. Previously the "on" branch did nothing,
    // leaving archived and non-archived prompts mixed together.
    prompts = st.filterArchived ? prompts.filter(p => p.archived) : prompts.filter(p => !p.archived);

    const sorters = {
      updated: (a,b) => b.updatedAt - a.updatedAt,
      created: (a,b) => b.createdAt - a.createdAt,
      title: (a,b) => (a.title||"").localeCompare(b.title||""),
      length: (a,b) => Utils.countWords(b.body) - Utils.countWords(a.body)
    };
    prompts.sort(sorters[st.sort] || sorters.updated);
    prompts.sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0)); // pinned always float up

    // Page-size ("All" = 0) lets a 1000+-prompt library stay scannable
    // instead of rendering every card at once; clamp page against the
    // current filtered count so switching to a narrower filter never
    // strands you on a now-nonexistent later page.
    const totalFiltered = prompts.length;
    const pageSize = st.pageSize;
    const totalPages = pageSize ? Math.max(1, Math.ceil(totalFiltered / pageSize)) : 1;
    if (st.page >= totalPages) st.page = totalPages - 1;
    if (st.page < 0) st.page = 0;
    const pageStart = pageSize ? st.page * pageSize : 0;
    const pagePrompts = pageSize ? prompts.slice(pageStart, pageStart + pageSize) : prompts;

    const allTags = new Set();
    this.pe.listPrompts().forEach(p => (p.tags||[]).forEach(t => allTags.add(t)));

    // Duplicate-nudge: computed against the FULL library (not the filtered
    // view) since "you have duplicates" should reflect the whole collection,
    // not whatever subset a search happens to be showing right now.
    if (!this._dismissedDuplicateClusters) this._dismissedDuplicateClusters = new Set();
    const allActivePrompts = this.pe.listPrompts().filter(p => !p.archived);
    const dupeClusters = DuplicateFinder.findClusters(allActivePrompts)
      .filter(cluster => !this._dismissedDuplicateClusters.has(cluster.map(p => p.id).sort().join(",")));

    this.workspace.innerHTML = `
      <div class="view">
        <div class="view-header">
          <div>
            <h1 class="view-title">Library</h1>
            <p class="view-subtitle">${totalFiltered} prompt${totalFiltered===1?'':'s'}</p>
          </div>
          <div class="view-actions">
            <button class="btn btn-sm ${st.compareMode?'btn-primary':'btn-secondary'}" data-action="lib-toggle-compare-mode">${st.compareMode?'Done':'Select'}</button>
            <button class="btn btn-primary" data-action="new-prompt">+ New Prompt</button>
          </div>
        </div>

        ${dupeClusters.length ? dupeClusters.slice(0, 3).map(cluster => {
          const sig = cluster.map(p => p.id).sort().join(",");
          return `<div class="side-panel-section" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:var(--sp-3);border-color:color-mix(in srgb, var(--accent-amber) 30%, var(--border-subtle))">
            <span style="font-size:var(--fs-xs);color:var(--text-secondary)">
              <b>${cluster.length} similar prompts</b> — ${cluster.map(p => Utils.escapeHtml(p.title || "Untitled")).slice(0,3).join(", ")}${cluster.length > 3 ? `, +${cluster.length-3} more` : ""}
            </span>
            <div style="display:flex;gap:8px;flex-shrink:0">
              <button class="btn btn-ghost btn-sm" data-action="dupe-review:${sig}">Review</button>
              <button class="btn btn-ghost btn-sm" data-action="dupe-dismiss:${sig}" aria-label="Dismiss">Dismiss</button>
            </div>
          </div>`;
        }).join("") : ""}

        <div class="filter-bar">
          <div class="search-input-wrap">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.3" stroke="currentColor" stroke-width="1.3"/><path d="M9.1 9.1 12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            <input class="input" id="libSearchInput" data-search-input enterkeyhint="search" placeholder="Search library…" value="${Utils.escapeHtml(st.query)}">
          </div>
          ${Dropdown.renderTrigger({ id: "libCategoryDD", value: st.category, size: "dd-inline", options: [{ value: "all", label: "All categories" }, ...CONFIG.CATEGORIES.map(c => ({ value: c.id, label: c.label, swatchColor: c.color }))] })}
          ${Dropdown.renderTrigger({ id: "libSortDD", value: st.sort, size: "dd-inline", options: [
            { value: "updated", label: "Recently updated" },
            { value: "created", label: "Recently created" },
            { value: "title", label: "Title A–Z" },
            { value: "length", label: "Longest first" }
          ] })}
          ${Dropdown.renderTrigger({ id: "libPageSizeDD", value: String(st.pageSize), size: "dd-inline", options: [
            { value: "50", label: "50 per page" },
            { value: "100", label: "100 per page" },
            { value: "200", label: "200 per page" },
            { value: "0", label: "All prompts" }
          ] })}
          <button class="btn btn-sm ${st.filterFav?'btn-primary':'btn-secondary'}" data-action="lib-toggle-fav">★ Favorites</button>
          <button class="btn btn-sm ${st.filterArchived?'btn-primary':'btn-secondary'}" data-action="lib-toggle-archived">Archived</button>
          <button class="btn btn-sm btn-secondary" data-action="lib-external-diff" title="Diff pasted text (e.g. a colleague's edit) against a saved prompt">Diff pasted text…</button>
          ${st.tag ? `<span class="tag">#${Utils.escapeHtml(st.tag)}<button data-action="lib-clear-tag" aria-label="Clear tag filter">&times;</button></span>` : ""}
          ${st.group ? (() => { const g = this.pe.getGroup(st.group); return g ? `<span class="tag" style="border-color:color-mix(in srgb, ${g.color} 45%, var(--border-subtle));color:${g.color}">&#9679; ${Utils.escapeHtml(g.name)}<button data-action="lib-clear-group" aria-label="Clear group filter">&times;</button></span>` : ""; })() : ""}
          ${this._isLibraryFilterActive(st) ? `<button class="btn btn-ghost btn-sm" data-action="lib-save-search" title="Save this search for one-click reuse">☆ Save search</button>` : ""}
        </div>

        ${this.pe.listSavedSearches().length ? `<div class="chip-row" style="margin-bottom:var(--sp-3)">
          ${this.pe.listSavedSearches().map(s => `<span class="tag" style="cursor:pointer;display:inline-flex;align-items:center;gap:5px" data-action="lib-apply-search:${s.id}">${Utils.escapeHtml(s.name || "Untitled search")}<button data-action="lib-delete-search:${s.id}" data-stop-propagation aria-label="Delete saved search" style="opacity:0.6">&times;</button></span>`).join("")}
        </div>` : ""}

        ${st.compareMode ? `<div class="side-panel-section" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:var(--sp-4)">
          <span style="font-size:var(--fs-xs);color:var(--text-secondary)">${this.state.compare.selectedIds.length} selected — tap cards to select.</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${this.state.compare.selectedIds.length ? `<button class="btn btn-ghost btn-sm" data-action="lib-clear-compare-selection">Clear</button>` : ""}
            ${this.state.compare.selectedIds.length ? `<button class="btn btn-secondary btn-sm" data-action="lib-bulk-archive">Archive</button>` : ""}
            ${this.state.compare.selectedIds.length ? `<button class="btn btn-secondary btn-sm" data-action="lib-bulk-tag">Add tag…</button>` : ""}
            ${this.state.compare.selectedIds.length ? `<button class="btn btn-secondary btn-sm" data-action="lib-bulk-group">Add to group…</button>` : ""}
            ${this.state.compare.selectedIds.length ? `<button class="btn btn-secondary btn-sm" data-action="lib-bulk-category">Set category…</button>` : ""}
            ${this.state.compare.selectedIds.length ? `<button class="btn btn-danger btn-sm" data-action="lib-bulk-delete">Delete</button>` : ""}
            <button class="btn btn-primary btn-sm" data-action="lib-go-compare" ${this.state.compare.selectedIds.length < 2 ? 'disabled' : ''}>Compare${this.state.compare.selectedIds.length ? ` (${this.state.compare.selectedIds.length})` : ""}</button>
          </div>
        </div>` : ""}

        ${allTags.size ? `<div class="chip-row" style="margin-bottom:var(--sp-2)">${Array.from(allTags).slice(0,16).map(t => `<span class="tag" style="cursor:pointer" data-action="lib-filter-tag:${Utils.escapeHtml(t)}">#${Utils.escapeHtml(t)}</span>`).join("")}</div>` : ""}
        ${this._renderGroupChipRow("library")}

        ${prompts.length ? `<div class="grid grid-auto" id="libraryGrid">${pagePrompts.map(p => this._renderPromptCard(p, st.compareMode)).join("")}</div>` : this._renderLibraryEmpty(st)}
        ${pageSize && totalPages > 1 ? `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:var(--sp-4)">
          <span style="font-size:var(--fs-xs);color:var(--text-tertiary)">Showing ${pageStart+1}–${Math.min(pageStart+pageSize, totalFiltered)} of ${totalFiltered}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <button class="btn btn-secondary btn-sm" data-action="lib-page-prev" ${st.page===0?'disabled':''}>&larr; Prev</button>
            <span style="font-size:var(--fs-xs);color:var(--text-secondary)">Page ${st.page+1} of ${totalPages}</span>
            <button class="btn btn-secondary btn-sm" data-action="lib-page-next" ${st.page>=totalPages-1?'disabled':''}>Next &rarr;</button>
          </div>
        </div>` : ""}
      </div>`;

    Dropdown.attach(this.workspace, {
      libCategoryDD: [{ value: "all", label: "All categories" }, ...CONFIG.CATEGORIES.map(c => ({ value: c.id, label: c.label, swatchColor: c.color }))],
      libSortDD: [
        { value: "updated", label: "Recently updated" },
        { value: "created", label: "Recently created" },
        { value: "title", label: "Title A–Z" },
        { value: "length", label: "Longest first" }
      ],
      libPageSizeDD: [
        { value: "50", label: "50 per page" },
        { value: "100", label: "100 per page" },
        { value: "200", label: "200 per page" },
        { value: "0", label: "All prompts" }
      ]
    }, (id, value) => {
      if (id === "libCategoryDD") { this.state.library.category = value; this.state.library.page = 0; }
      if (id === "libSortDD") this.state.library.sort = value;
      if (id === "libPageSizeDD") { this.state.library.pageSize = Number(value); this.state.library.page = 0; }
      this.renderView();
    });
  },

  _renderLibraryEmpty(st){
    if (st.query || st.category !== "all" || st.filterFav || st.tag){
      return `<div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="17" cy="17" r="12" stroke="currentColor" stroke-width="1.6"/><path d="M25.5 25.5 34 34" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <div class="empty-state-title">No matches</div>
        <div class="empty-state-body">Try a different search term, or clear the active filters.</div>
        <button class="btn btn-secondary" data-action="lib-clear-filters">Clear filters</button>
      </div>`;
    }
    return `<div class="empty-state">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none"><path d="M6 8h32M6 8v28a2 2 0 0 0 2 2h24a2 2 0 0 0 2-2V8M14 8V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <div class="empty-state-title">Your library is empty</div>
      <div class="empty-state-body">Prompts you write and save will show up here, organized and searchable.</div>
      <button class="btn btn-primary" data-action="new-prompt">Write your first prompt</button>
    </div>`;
  },

  _renderPromptCard(p, compareMode){
    const cat = CONFIG.CATEGORIES.find(c => c.id === p.category) || CONFIG.CATEGORIES[CONFIG.CATEGORIES.length-1];
    const isSelected = compareMode && this.state.compare.selectedIds.includes(p.id);
    // Every field below defensively falls back for prompts saved before
    // these fields existed (status/useCount/bestOf/needsRevisit) — a
    // legacy prompt object simply won't have them, and undefined must
    // never throw or render as "undefined" text.
    const status = CONFIG.PROMPT_STATUSES.find(s => s.id === p.status) || null;
    const scoreVal = this._cardScoreCache(p);
    const group = compareMode ? null : this._groupFor("library", p.id);
    return `
      <div class="card card-hover card-clickable prompt-card ${isSelected ? 'card-selected' : ''}" data-action="${compareMode ? `compare-toggle:${p.id}` : `open-prompt:${p.id}`}" ${compareMode ? "" : `data-longpress-group="library:${p.id}"`}>
        <div class="prompt-card-top">
          <div style="display:flex;align-items:center;gap:6px;min-width:0">
            ${compareMode ? `<input type="checkbox" ${isSelected ? "checked" : ""} style="pointer-events:none;flex-shrink:0" tabindex="-1">` : `<span class="category-dot ${cat.cls}"></span>`}
            <span class="prompt-card-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.escapeHtml(p.title || "Untitled prompt")}</span>
          </div>
          <div class="prompt-card-menu" data-stop-propagation>
            ${compareMode ? "" : this._cardMenuButton(p)}
          </div>
        </div>
        <div class="prompt-card-snippet">${Utils.escapeHtml(Utils.truncate(p.body, 160)) || "<em>Empty</em>"}</div>
        <div class="chip-row" style="margin-top:6px;justify-content:space-between;align-items:center;flex-wrap:wrap">
          <span class="chip-row" style="margin:0;min-width:0;flex:1">
            ${scoreVal !== null ? `<span class="quality-chip" style="color:${this._scoreColor(scoreVal)};border-color:color-mix(in srgb, ${this._scoreColor(scoreVal)} 40%, var(--border-subtle))" title="Analyzer score">${scoreVal}</span>` : ""}
            ${status && status.id !== "draft" ? `<span class="status-chip" style="color:${status.color};border-color:color-mix(in srgb, ${status.color} 40%, var(--border-subtle))">${status.label}</span>` : ""}
            ${p.needsRevisit ? `<span class="status-chip" style="color:var(--accent-amber);border-color:color-mix(in srgb, var(--accent-amber) 40%, var(--border-subtle))" title="${Utils.escapeHtml(p.needsRevisit.note || 'Flagged to revisit')}">Needs revisit</span>` : ""}
            ${group ? `<span class="tag" style="background:color-mix(in srgb, ${group.color} 18%, transparent);border-color:color-mix(in srgb, ${group.color} 45%, var(--border-subtle));color:${group.color}">&#9679; ${Utils.escapeHtml(group.name)}</span>` : ""}
            ${p.tags && p.tags.length ? p.tags.slice(0,3).map(t=>`<span class="tag">#${Utils.escapeHtml(t)}</span>`).join("") : ""}
          </span>
          ${compareMode ? "" : `<button class="btn btn-secondary btn-sm" data-action="copy-prompt-text:${p.id}" data-stop-propagation title="Copy prompt text" style="flex-shrink:0;gap:5px">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2.5" y="2.5" width="8" height="9.5" rx="1" stroke="currentColor" stroke-width="1.1"/><path d="M4.8 2.5V1.8a.8.8 0 0 1 .8-.8h1.8a.8.8 0 0 1 .8.8v.7" stroke="currentColor" stroke-width="1.1"/><path d="M4.7 6h3.6M4.7 8.3h3.6" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
            Copy
          </button>`}
        </div>
        <div class="prompt-card-foot">
          <span class="prompt-card-meta">${Utils.timeAgo(p.updatedAt)} &middot; ${Utils.countWords(p.body)}w${p.useCount ? ` &middot; used ${p.useCount}&times;` : ""}</span>
          <span style="display:flex;gap:6px;align-items:center">
            ${p.archived ? '<span class="badge">Archived</span>' : ""}
            ${p.bestOf ? '<svg width="13" height="13" viewBox="0 0 13 13" fill="var(--accent-violet)" title="Best of mine"><path d="M6.5 1 8 4.3 11.5 5 9 7.5 9.6 11 6.5 9.3 3.4 11 4 7.5 1.5 5 5 4.3Z" stroke="var(--accent-violet)" stroke-width="0.6" stroke-linejoin="round"/></svg>' : ""}
            ${p.pinned ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="var(--accent-blue)"><path d="M4 1h4l-.5 3.5L9 6.5v1H7v3l-1 1-1-1v-3H3v-1l1.5-2Z"/></svg>' : ""}
            ${p.favorite ? '<svg class="prompt-card-pin" width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><path d="M6.5 1 8.2 4.6 12 5.2 9.2 7.9 9.9 11.7 6.5 9.9 3.1 11.7 3.8 7.9 1 5.2 4.8 4.6Z"/></svg>' : ""}
          </span>
        </div>
      </div>`;
  },

  // Analyzer.analyze isn't free to run on every card on every render (it's
  // fast per-call, but a library view can have hundreds of cards) — cache
  // per prompt id, invalidated when that prompt's body actually changes
  // (tracked by updatedAt, which changes on every real save).
  _cardScoreCache(p){
    if (!p.body || !p.body.trim()) return null;
    if (!this._scoreCacheMap) this._scoreCacheMap = new Map();
    const cached = this._scoreCacheMap.get(p.id);
    if (cached && cached.updatedAt === p.updatedAt) return cached.score;
    const score = Analyzer.analyze(p.body).overall;
    this._scoreCacheMap.set(p.id, { updatedAt: p.updatedAt, score });
    return score;
  },

  // One prompt, rendered as a standalone file in one of four plain formats.
  // Deliberately separate from MessageComposer's "Copy as..." (which wraps
  // the body in SDK/API call code for a specific model) — this is just the
  // prompt's own content, portable to any editor or app outside Prompt Forge.
  _promptToFileFormat(p, format){
    const title = p.title || "Untitled prompt";
    if (format === "json"){
      return JSON.stringify({ title, body: p.body || "", category: p.category || "custom", tags: p.tags || [], updatedAt: p.updatedAt, createdAt: p.createdAt }, null, 2);
    }
    if (format === "md"){
      return `# ${title}\n\n${p.tags && p.tags.length ? p.tags.map(t=>`\`#${t}\``).join(" ") + "\n\n" : ""}${p.body || ""}\n`;
    }
    if (format === "html"){
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${Utils.escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222}pre{white-space:pre-wrap;background:#f7f7f7;padding:16px;border-radius:8px;font-family:ui-monospace,monospace}</style></head><body><h1>${Utils.escapeHtml(title)}</h1><pre>${Utils.escapeHtml(p.body || "")}</pre></body></html>`;
    }
    return p.body || ""; // txt — the raw prompt text, nothing else
  },

  _promptFileExt(format){ return format === "md" ? "md" : format === "html" ? "html" : format === "json" ? "json" : "txt"; },

  _promptFileMime(format){ return format === "md" ? "text/markdown" : format === "html" ? "text/html" : format === "json" ? "application/json" : "text/plain"; },

  // Small anchored popover with one row per format, each offering Copy and
  // Download — opens from a single "Export…" trigger rather than adding
  // per-format icons to the card row (already at capacity, see
  // _cardMenuButton's own comment on why), since both need more than a
  // single icon and a phone-width row can't add either without shrinking.
  // Editor-specific format conversion — separate from _promptToFileFormat
  // because the editor's current draft lives in state.editor (title/body
  // only) and may not correspond to any saved prompt yet (no category,
  // tags, or timestamps to include). XML is unique to this menu — Library
  // card exports don't offer it, since it was only ever requested for the
  // editor's own toolbar.
  _editorContentToFormat(format){
    const title = this.state.editor.title || "Untitled prompt";
    const body = this.state.editor.body || "";
    if (format === "json") return JSON.stringify({ title, body }, null, 2);
    if (format === "xml") return `<?xml version="1.0" encoding="UTF-8"?>\n<prompt>\n  <title>${Utils.escapeHtml(title)}</title>\n  <body>${Utils.escapeHtml(body)}</body>\n</prompt>\n`;
    if (format === "md") return `# ${title}\n\n${body}\n`;
    return body; // txt
  },

  _openEditorDownloadMenu(anchorEl){
    const existing = document.getElementById('editorDownloadPopover');
    if (existing){ existing.remove(); return; }
    const formats = [ ["txt","Plain text"], ["json","JSON"], ["xml","XML"], ["md","Markdown"] ];
    const pop = document.createElement("div");
    pop.id = "editorDownloadPopover";
    pop.className = "dd-panel open";
    pop.style.cssText = "position:fixed;z-index:400;min-width:180px;max-width:min(90vw,240px)";
    pop.innerHTML = formats.map(([fmt,label]) => `<div class="dd-option" data-editor-download-fmt="${fmt}"><span>${label}</span></div>`).join("");
    document.body.appendChild(pop);
    const r = anchorEl.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    pop.style.top = Math.min(r.bottom + 4, window.innerHeight - popRect.height - 8) + "px";
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - popRect.width - 8)) + "px";
    const exts = { txt: "txt", json: "json", xml: "xml", md: "md" };
    const mimes = { txt: "text/plain", json: "application/json", xml: "application/xml", md: "text/markdown" };
    pop.addEventListener("click", (e) => {
      const fmt = e.target.closest("[data-editor-download-fmt]")?.dataset.editorDownloadFmt;
      if (!fmt) return;
      const safeTitle = (this.state.editor.title || "prompt").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "prompt";
      Utils.download(`${safeTitle}.${exts[fmt]}`, this._editorContentToFormat(fmt), mimes[fmt]);
      this.toast(`Downloaded as .${exts[fmt]}.`, "success");
      pop.remove();
    });
    const dismiss = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl){ pop.remove(); document.removeEventListener("click", dismiss, true); } };
    setTimeout(() => document.addEventListener("click", dismiss, true), 0);
  },

  _openExportMenu(anchorEl, p){
    const existing = document.getElementById('exportPopover');
    if (existing) existing.remove();
    const formats = [ ["json","JSON"], ["md","Markdown"], ["txt","Plain text"], ["html","HTML"] ];
    const pop = document.createElement("div");
    pop.id = "exportPopover";
    pop.className = "dd-panel open";
    pop.style.cssText = "position:fixed;z-index:400;min-width:220px;max-width:min(90vw,280px)";
    pop.innerHTML = formats.map(([fmt,label]) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px">
        <span style="font-size:var(--fs-xs);font-weight:600">${label}</span>
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm" data-export-copy="${fmt}">Copy</button>
          <button class="btn btn-ghost btn-sm" data-export-download="${fmt}">Download</button>
        </div>
      </div>`).join("");
    document.body.appendChild(pop);
    const r = anchorEl.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    pop.style.top = Math.min(r.bottom + 4, window.innerHeight - popRect.height - 8) + "px";
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - popRect.width - 8)) + "px";
    pop.addEventListener("click", async (e) => {
      const copyFmt = e.target.dataset.exportCopy;
      const dlFmt = e.target.dataset.exportDownload;
      if (copyFmt){
        const ok = await this._copyToClipboard(this._promptToFileFormat(p, copyFmt));
        this.toast(ok ? `Copied as ${copyFmt.toUpperCase()}.` : "Copy failed — clipboard unavailable.", ok ? "success" : "warn");
        pop.remove();
      } else if (dlFmt){
        const safeTitle = (p.title || "prompt").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "prompt";
        Utils.download(`${safeTitle}.${this._promptFileExt(dlFmt)}`, this._promptToFileFormat(p, dlFmt), this._promptFileMime(dlFmt));
        this.toast(`Downloaded as .${this._promptFileExt(dlFmt)}.`, "success");
        pop.remove();
      }
    });
    const dismiss = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl){ pop.remove(); document.removeEventListener("click", dismiss, true); } };
    setTimeout(() => document.addEventListener("click", dismiss, true), 0);
  },

  _cardMenuButton(p, context = "grid"){
    // Simple inline action row instead of a floating menu — fewer moving
    // parts, works identically with touch and mouse. bestOf joins
    // favorite/pin as a quick binary icon toggle; status + needs-revisit
    // both need more than a binary toggle (a 3-way picker, a note field)
    // so they live behind the single "more" icon instead of adding two
    // more icons to an already-6-wide row — keeps this usable on a phone
    // width without every icon shrinking to fit.
    // Copy (exact clipboard copy of the raw prompt text) sits alongside
    // Duplicate (saves a new library entry) in both contexts now — these
    // are two genuinely different actions the person asked to keep both
    // of, not a replacement of one for the other.
    const copyIcon = `<button class="icon-btn btn-sm" data-action="copy-prompt-text:${p.id}" title="Copy prompt text" aria-label="Copy prompt text">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2.5" y="2.5" width="8" height="9.5" rx="1" stroke="currentColor" stroke-width="1.1"/><path d="M4.8 2.5V1.8a.8.8 0 0 1 .8-.8h1.8a.8.8 0 0 1 .8.8v.7" stroke="currentColor" stroke-width="1.1"/><path d="M4.7 6h3.6M4.7 8.3h3.6" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
      </button>`;
    const duplicateIcon = `<button class="icon-btn btn-sm" data-action="duplicate-prompt:${p.id}" title="Duplicate" aria-label="Duplicate prompt">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="4" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 4V2.5h6.5V9H9.5" stroke="currentColor" stroke-width="1.1"/></svg>
      </button>`;
    return `<div style="display:flex;gap:2px">
      <button class="icon-btn btn-sm" data-action="toggle-fav:${p.id}" title="${p.favorite?'Unfavorite':'Favorite'}" aria-label="Toggle favorite">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="${p.favorite?'var(--accent-amber)':'none'}" stroke="${p.favorite?'var(--accent-amber)':'currentColor'}"><path d="M6.5 1 8.2 4.6 12 5.2 9.2 7.9 9.9 11.7 6.5 9.9 3.1 11.7 3.8 7.9 1 5.2 4.8 4.6Z" stroke-width="1"/></svg>
      </button>
      <button class="icon-btn btn-sm" data-action="toggle-best-of:${p.id}" title="${p.bestOf?'Remove from Best of mine':'Mark as Best of mine'}" aria-label="Toggle best of mine">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="${p.bestOf?'var(--accent-violet)':'none'}" stroke="${p.bestOf?'var(--accent-violet)':'currentColor'}"><path d="M6.5 1 8 4.3 11.5 5 9 7.5 9.6 11 6.5 9.3 3.4 11 4 7.5 1.5 5 5 4.3Z" stroke-width="1"/></svg>
      </button>
      <button class="icon-btn btn-sm" data-action="toggle-pin:${p.id}" title="${p.pinned?'Unpin':'Pin'}" aria-label="Toggle pin">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="${p.pinned?'var(--accent-blue)':'none'}" stroke="${p.pinned?'var(--accent-blue)':'currentColor'}"><path d="M4 1h4l-.5 3.5L9 6.5v1H7v3l-1 1-1-1v-3H3v-1l1.5-2Z" stroke-width="1"/></svg>
      </button>
      ${copyIcon}
      ${duplicateIcon}
      <button class="icon-btn btn-sm" data-action="archive-prompt:${p.id}" title="${p.archived?'Unarchive':'Archive'}" aria-label="Toggle archive">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="2.5" rx="0.5" stroke="currentColor" stroke-width="1.1"/><path d="M2.5 5.5V10a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V5.5M5 7.5h3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
      </button>
      <button class="icon-btn btn-sm" data-action="open-status-modal:${p.id}" title="Status &amp; revisit flag" aria-label="Status and revisit flag">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="3" cy="6.5" r="1.2" fill="currentColor"/><circle cx="6.5" cy="6.5" r="1.2" fill="currentColor"/><circle cx="10" cy="6.5" r="1.2" fill="currentColor"/></svg>
      </button>
      <button class="icon-btn btn-sm" data-action="delete-prompt:${p.id}" title="Delete" aria-label="Delete prompt">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 3.5h8M5 3.5V2h3v1.5M3.5 3.5 4 11h5l0.5-7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>`;
  },

  // The Library card's own click target — shows the full prompt read-only
  // with its metadata, mirroring how Templates/Patterns open a preview
  // first. Opening the actual Editor is one explicit click away from here,
  // so browsing the library never yanks someone into edit mode by accident.
  openPromptViewModal(promptId){
    const p = this.pe.getPrompt(promptId);
    if (!p) return;
    const cat = CONFIG.CATEGORIES.find(c => c.id === p.category) || CONFIG.CATEGORIES[CONFIG.CATEGORIES.length-1];
    const status = CONFIG.PROMPT_STATUSES.find(s => s.id === p.status) || null;
    const group = this._groupFor("library", p.id);
    const scoreVal = this._cardScoreCache(p);
    this.openModal({
      title: p.title || "Untitled prompt", size: "modal-lg",
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
          <div class="chip-row">
            <span class="tag"><span class="category-dot ${cat.cls}" style="margin-right:5px"></span>${Utils.escapeHtml(cat.label)}</span>
            ${status && status.id !== "draft" ? `<span class="status-chip" style="color:${status.color};border-color:color-mix(in srgb, ${status.color} 40%, var(--border-subtle))">${status.label}</span>` : ""}
            ${scoreVal !== null ? `<span class="quality-chip" style="color:${this._scoreColor(scoreVal)};border-color:color-mix(in srgb, ${this._scoreColor(scoreVal)} 40%, var(--border-subtle))" title="Analyzer score">Score: ${scoreVal}</span>` : ""}
            ${group ? `<span class="tag" style="background:color-mix(in srgb, ${group.color} 18%, transparent);border-color:color-mix(in srgb, ${group.color} 45%, var(--border-subtle));color:${group.color}">&#9679; ${Utils.escapeHtml(group.name)}</span>` : ""}
            ${p.favorite ? `<span class="tag" title="Favorited">★ Favorite</span>` : ""}
            ${p.pinned ? `<span class="tag" title="Pinned">Pinned</span>` : ""}
          </div>
          ${p.needsRevisit ? `<div class="status-chip" style="color:var(--accent-amber);border-color:color-mix(in srgb, var(--accent-amber) 40%, var(--border-subtle));width:fit-content">Needs revisit${p.needsRevisit.note ? `: ${Utils.escapeHtml(p.needsRevisit.note)}` : ""}</div>` : ""}
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between">
              <div class="field-label">Prompt</div>
              <button class="btn btn-ghost btn-sm" id="pvExportBtn">Export…</button>
            </div>
            <pre style="background:var(--editor-bg);border:1px solid var(--border);border-radius:var(--r-md);padding:14px;font-family:var(--font-mono);font-size:13px;white-space:pre-wrap;color:var(--text-primary);margin-top:4px;max-height:420px;overflow-y:auto">${Utils.escapeHtml(p.body) || "<em>Empty</em>"}</pre>
          </div>
          ${p.tags && p.tags.length ? `<div>
            <div class="field-label">Tags</div>
            <div class="chip-row" style="margin-top:6px">${p.tags.map(t=>`<span class="tag">#${Utils.escapeHtml(t)}</span>`).join("")}</div>
          </div>` : ""}
          <div style="font-size:var(--fs-2xs);color:var(--text-tertiary)">Used ${p.useCount||0}x &middot; Updated ${Utils.timeAgo(p.updatedAt)} &middot; Created ${Utils.formatDate(p.createdAt)}</div>
        </div>`,
      footerHtml: { spread: true, html: `
        <div style="display:flex;gap:2px">${this._cardMenuButton(p, "detail")}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" id="pvCloseBtn">Close</button>
          <button class="btn btn-primary" id="pvOpenEditorBtn">Open in Editor</button>
        </div>` },
      onMount: (modal) => {
        modal.querySelector("#pvCloseBtn").addEventListener("click", () => this.closeModal());
        modal.querySelector("#pvExportBtn").addEventListener("click", (e) => { e.stopPropagation(); this._openExportMenu(e.currentTarget, p); });
        modal.querySelector("#pvOpenEditorBtn").addEventListener("click", () => {
          this.closeModal();
          this._loadPromptIntoEditor(p.id);
          this.navigate("editor");
        });
        // The quick-action icons in the footer (favorite/best-of/pin/
        // duplicate/archive/status/delete) reuse the same data-action
        // values the card itself uses — route them through the normal
        // action dispatcher and refresh this modal's own content in place
        // afterward so toggling e.g. favorite doesn't need a full close.
        modal.querySelectorAll("[data-action]").forEach(el => {
          if (el.id === "pvCloseBtn" || el.id === "pvOpenEditorBtn") return;
          el.addEventListener("click", async (e) => {
            e.stopPropagation();
            const action = el.dataset.action;
            if (action.startsWith("delete-prompt:")){
              // Deleting closes the modal outright rather than trying to
              // refresh a view of a prompt that no longer exists.
              this._runAction(action);
              return;
            }
            await this._runAction(action);
            if (this.pe.getPrompt(p.id)){ this.closeModal(); this.openPromptViewModal(p.id); }
          });
        });
      }
    });
  }
};
