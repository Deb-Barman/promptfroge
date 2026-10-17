// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "../../core/Utils";
import { CONFIG } from "../../core/CONFIG";
import { Dropdown } from "../Dropdown";

/** UIManager methods: core. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const coreMethods = {
  // Scales the entire app UI (not just the editor font) using CSS zoom on
  // the document root. zoom is supported in all current Chrome, Edge,
  // Safari, and Firefox releases; it scales layout AND rendering together
  // (unlike a transform: scale, which would need manual width/height
  // compensation to avoid clipping or extra scrollbars).
  _applyUiScale(){
    const pct = Utils.clamp(this.state.settings.uiScale || 100, 70, 150);
    document.documentElement.style.zoom = (pct / 100).toString();
  },

  _loadCustomModels(){
    const custom = this.storage.getSetting("customModels", []);
    // Re-entrant safe: strip any previously-merged custom models first (by
    // the isCustom flag) so repeated calls (e.g. after editing one) don't
    // duplicate built-ins or pile up stale copies.
    CONFIG.MODELS = CONFIG.MODELS.filter(m => !m.isCustom);
    for (const m of custom){
      // group falls back to vendor for models saved before the Group field
      // existed, so the Editor's dropdown never shows an "undefined" or
      // empty group heading for an older custom model.
      CONFIG.MODELS.push({ ...m, group: m.group || m.vendor || "Other", isCustom: true, tokenizer: "estimate", idiomKey: m.idiomKey || "generic" });
    }
  },

  _saveCustomModels(list){
    this.storage.setSetting("customModels", list);
    this._loadCustomModels();
  },

  /* ---------------------------------------------------------------------- */
  /* Bootstrapping & global chrome                                          */
  /* ---------------------------------------------------------------------- */
  init(){
    document.body.setAttribute("data-theme", this.state.theme);
    this._syncThemeIcon();
    this._wireGlobalChrome();
    this._wireKeyboardShortcuts();
    this._tickClock();
    setInterval(() => this._tickClock(), 30000);
    this.navigate("dashboard");
    this._updateStorageStatus();
    if (!this.state.settings.onboardingSeen) this.openWelcomeModal();
  },

  _wireGlobalChrome(){
    document.getElementById("navToggleBtn").addEventListener("click", () => this._toggleNav());
    document.getElementById("brandHome").addEventListener("click", () => this.navigate("dashboard"));
    document.getElementById("brandHome").addEventListener("keydown", e => Utils.onEnterOrSpace(e, () => this.navigate("dashboard")));
    document.getElementById("themeToggleBtn").addEventListener("click", () => this._toggleTheme());
    document.getElementById("exportQuickBtn").addEventListener("click", () => this.openExportModal());
    document.getElementById("paletteTriggerBtn").addEventListener("click", () => this.openPalette());
    document.getElementById("railScrim").addEventListener("click", () => this._closeMobileNav());

    document.querySelectorAll(".rail-item").forEach(btn => {
      btn.addEventListener("click", () => this.navigate(btn.dataset.view));
    });

    this.workspace.addEventListener("click", (e) => this._delegatedClick(e));
    this.workspace.addEventListener("input", (e) => this._delegatedInput(e));
    this.workspace.addEventListener("change", (e) => this._delegatedChange(e));
    this._wireLongPressGrouping();
    this._wireSearchInputBlurOnEnter();

    window.addEventListener("beforeunload", (e) => {
      if (this.state.editor.dirty){
        e.preventDefault(); e.returnValue = "";
      }
    });
  },

  // Every search-style input (Library/Templates/Patterns filter search,
  // the Compare picker, the Export item picker, the global search view,
  // and the command palette) is filterable-as-you-type, so there's nothing
  // to "submit" on Enter the way a form field normally would be. On mobile,
  // though, the on-screen keyboard staying open after someone's found what
  // they were looking for just eats screen space for no reason — so Enter
  // blurs the field, which is what closes the virtual keyboard on every
  // mobile browser. A single document-level listener keyed off
  // data-search-input covers all of these (including ones inside modals,
  // which render outside the workspace element) rather than wiring each
  // input individually and risking a future one being missed.
  _wireSearchInputBlurOnEnter(){
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (!el.matches("[data-search-input]")) return;
      el.blur();
    });
  },

  // Long-press (or right-click, for mouse/trackpad users where a "long
  // press" isn't natural) on any card carrying data-longpress-group="kind:id"
  // opens the group picker for that card. Uses pointer events so the same
  // code path handles touch and mouse: pointerdown starts a timer,
  // pointerup/pointermove/pointerleave before it fires cancels it — a real
  // press-and-hold, not just "click and release fast".
  _wireLongPressGrouping(){
    const LONG_PRESS_MS = 550;
    const MOVE_CANCEL_PX = 10;
    let timer = null, startX = 0, startY = 0, target = null;
    const cancel = () => { if (timer){ clearTimeout(timer); timer = null; } target = null; };
    this.workspace.addEventListener("pointerdown", (e) => {
      const card = e.target.closest("[data-longpress-group]");
      if (!card) return;
      // A click on an icon button (edit/delete/etc) inside the card should
      // never also trigger the group picker underneath it.
      if (e.target.closest("[data-stop-propagation]")) return;
      target = card; startX = e.clientX; startY = e.clientY;
      timer = setTimeout(() => {
        const [kind, id] = card.dataset.longpressGroup.split(":");
        this._vibrateIfSupported();
        this.openGroupPickerModal(kind, id);
        cancel();
      }, LONG_PRESS_MS);
    });
    this.workspace.addEventListener("pointermove", (e) => {
      if (!timer) return;
      if (Math.abs(e.clientX - startX) > MOVE_CANCEL_PX || Math.abs(e.clientY - startY) > MOVE_CANCEL_PX) cancel();
    });
    this.workspace.addEventListener("pointerup", cancel);
    this.workspace.addEventListener("pointerleave", cancel, true);
    this.workspace.addEventListener("pointercancel", cancel);
    // Right-click is the mouse-user equivalent of a long-press for this
    // gesture — same target resolution, opens the same modal, and prevents
    // the browser's own context menu from covering it.
    this.workspace.addEventListener("contextmenu", (e) => {
      const card = e.target.closest("[data-longpress-group]");
      if (!card) return;
      e.preventDefault();
      const [kind, id] = card.dataset.longpressGroup.split(":");
      this.openGroupPickerModal(kind, id);
    });
  },

  _vibrateIfSupported(){ try { if (navigator.vibrate) navigator.vibrate(15); } catch(e){} },

  // Shared "select multiple → bulk actions" bar for Templates and Patterns
  // (Library already has its own richer version via Compare mode, wired
  // separately). Only "Add to group…" and delete are offered here since
  // templates/patterns don't have tags/categories/archive in the same
  // sense prompts do.
  _renderSelectBar(kind){
    const st = this.state[kind];
    if (!st.selectMode) return "";
    const n = st.selectedIds.length;
    return `<div class="side-panel-section" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:var(--sp-4)">
      <span style="font-size:var(--fs-xs);color:var(--text-secondary)">${n} selected — click cards to select.</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${n ? `<button class="btn btn-ghost btn-sm" data-action="${kind}-clear-selection">Clear</button>` : ""}
        ${n ? `<button class="btn btn-secondary btn-sm" data-action="${kind}-bulk-group">Add to group…</button>` : ""}
        ${n ? `<button class="btn btn-danger btn-sm" data-action="${kind}-bulk-delete">Delete</button>` : ""}
      </div>
    </div>`;
  },

  // Shared page-size dropdown + Prev/Next controls for any section keyed
  // the same way Library/Templates/Patterns are (state[kind].pageSize,
  // state[kind].page). Given the full filtered list, returns both the
  // page-size dropdown trigger HTML (render this in the filter bar) and
  // the already-sliced page of items plus a pagination footer (render
  // this below the grid) — so each caller only needs to slice once.
  _paginate(kind, items){
    const st = this.state[kind];
    const pageSize = st.pageSize;
    const total = items.length;
    const totalPages = pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
    if (st.page >= totalPages) st.page = totalPages - 1;
    if (st.page < 0) st.page = 0;
    const start = pageSize ? st.page * pageSize : 0;
    const pageItems = pageSize ? items.slice(start, start + pageSize) : items;
    const dropdownId = `${kind}PageSizeDD`;
    const dropdownHtml = Dropdown.renderTrigger({ id: dropdownId, value: String(pageSize), size: "dd-inline", options: [
      { value: "50", label: "50 per page" },
      { value: "100", label: "100 per page" },
      { value: "200", label: "200 per page" },
      { value: "0", label: "All" }
    ] });
    const footerHtml = (pageSize && totalPages > 1) ? `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:var(--sp-4)">
        <span style="font-size:var(--fs-xs);color:var(--text-tertiary)">Showing ${start+1}–${Math.min(start+pageSize, total)} of ${total}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-secondary btn-sm" data-action="${kind}-page-prev" ${st.page===0?'disabled':''}>&larr; Prev</button>
          <span style="font-size:var(--fs-xs);color:var(--text-secondary)">Page ${st.page+1} of ${totalPages}</span>
          <button class="btn btn-secondary btn-sm" data-action="${kind}-page-next" ${st.page>=totalPages-1?'disabled':''}>Next &rarr;</button>
        </div>
      </div>` : "";
    return { pageItems, dropdownId, dropdownHtml, footerHtml, total };
  },

  // The group a given card currently belongs to, or null — used by each
  // section's card renderer to show the colored group chip.
  _groupFor(kind, memberId){ return this.pe.groupForMember(kind, memberId); },

  // Shared "filter by group" chip row for Library/Templates/Patterns —
  // clicking a chip filters that section's grid to just that group's
  // members; clicking the active one again clears the filter. Renders
  // nothing when no groups exist yet for this kind, so it never adds an
  // empty row before anyone has long-pressed a single card.
  _renderGroupChipRow(kind){
    const groups = this.pe.listGroups(kind);
    if (!groups.length) return "";
    const activeId = this.state[kind].group;
    return `<div class="chip-row" style="margin-bottom:var(--sp-4)">
      ${groups.map(g => `<span class="tag" style="cursor:pointer;${activeId===g.id ? `border-color:${g.color};background:color-mix(in srgb, ${g.color} 16%, transparent);color:${g.color}` : ''}" data-action="${kind}-filter-group:${g.id}">&#9679; ${Utils.escapeHtml(g.name)} <span style="opacity:0.65">${g.memberIds.length}</span></span>`).join("")}
      <button class="btn btn-ghost btn-sm" data-action="manage-groups:${kind}" title="Rename or delete groups">Manage groups…</button>
    </div>`;
  }
};
