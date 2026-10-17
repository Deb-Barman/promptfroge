// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "../core/Utils";

/* ============================================================================
   DROPDOWN — a single reusable animated dropdown that replaces every native
   <select> in the app. A trigger button renders inline; the option panel is
   appended to <body> (position: fixed) so it escapes scroll/overflow
   clipping inside modals and cards, then positioned under its trigger.
   Only one instance is ever open at a time (a global registry closes any
   previously-open dropdown before a new one opens).
   ============================================================================ */
export const Dropdown = {
  _open: null,        // the currently open dropdown's state object, or null
  _panelEl: null,      // shared panel element, reused/repositioned per-open
  _scrollHandlerBound: false,

  // Build the static trigger markup. `options`: [{value,label,swatchColor?}].
  // Call this from view template strings; call Dropdown.attach() after the
  // HTML lands in the DOM to wire behavior.
  renderTrigger({ id, value, options, size = "", placeholder = "Select…" }){
    const selected = options.find(o => o.value === value);
    const label = selected ? selected.label : placeholder;
    const swatch = selected && selected.swatchColor ? `<span class="dd-trigger-swatch" style="background:${selected.swatchColor}"></span>` : "";
    return `
      <div class="dd ${size}" id="${id}" data-dd-value="${Utils.escapeHtml(value ?? "")}">
        <button type="button" class="dd-trigger" data-dd-trigger aria-haspopup="listbox" aria-expanded="false">
          ${swatch}
          <span class="dd-trigger-label">${Utils.escapeHtml(label)}</span>
          <svg class="dd-trigger-icon" width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.5 4 5.5 7 8.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>`;
  },

  // Wire every .dd found under `root` (defaults to document). `onChange(id, value)`
  // fires whenever a selection is made. Safe to call repeatedly after re-renders —
  // it only attaches to elements that don't already have a listener flag.
  // `drillDownIds`: optional array/Set of dropdown ids that should open
  // collapsed to just their group names (from groupOptions()'s markers)
  // rather than the flat "all options with headers" list — clicking a
  // group name drills into that group; every other dropdown (categories,
  // sort order, scoring profile, ...) is completely unaffected, since
  // grouping only ever applies where the caller explicitly opts in.
  attach(root, options, onChange, drillDownIds){
    (root || document).querySelectorAll(".dd[data-dd-value]:not([data-dd-wired])").forEach(ddEl => {
      // Only wire elements this particular attach() call actually has options
      // for. Without this guard, a narrow call like
      // attach(workspace, {editorFormatDD: [...]}) would also match every
      // *other* .dd element already sitting under the same root (e.g. the
      // side panel's model/profile pickers, rendered inline in the same
      // innerHTML), permanently wiring them with an empty options list and
      // marking them data-dd-wired — locking out the later, correct
      // attach() call for those IDs since they'd no longer look "unwired".
      if (!Object.prototype.hasOwnProperty.call(options, ddEl.id)) return;
      ddEl.setAttribute("data-dd-wired", "1");
      const trigger = ddEl.querySelector("[data-dd-trigger]");
      const opts = options[ddEl.id] || [];
      const drillDown = !!(drillDownIds && (drillDownIds.has ? drillDownIds.has(ddEl.id) : drillDownIds.includes(ddEl.id)));
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (Dropdown._open && Dropdown._open.ddEl === ddEl){ Dropdown.closeOpen(); return; }
        Dropdown._openFor(ddEl, trigger, opts, onChange, drillDown);
      });
    });
  },

  _ensurePanel(){
    if (!Dropdown._panelEl){
      Dropdown._panelEl = document.createElement("div");
      Dropdown._panelEl.className = "dd-panel";
      Dropdown._panelEl.setAttribute("role", "listbox");
      document.body.appendChild(Dropdown._panelEl);
    }
    return Dropdown._panelEl;
  },

  _openFor(ddEl, trigger, opts, onChange, drillDown){
    Dropdown.closeOpen();
    const panel = Dropdown._ensurePanel();
    const currentValue = ddEl.dataset.ddValue;

    // Split the flat [{isGroupHeader,label}, {value,label}, ...] array into
    // { name -> [options in that group] }, preserving first-seen order —
    // used both by drill-down mode (to build the group-name screen) and to
    // find which group the currently-selected value lives in (so opening
    // the dropdown on an already-picked GPT model jumps straight to the
    // GPT screen instead of back to the top-level group list every time).
    const buildGroups = () => {
      const groups = [];
      let current = null;
      for (const o of opts){
        if (o.isGroupHeader){ current = { label: o.label, items: [] }; groups.push(current); }
        else if (current) current.items.push(o);
      }
      return groups;
    };

    let screen, groups, activeGroupIdx;
    if (drillDown){
      groups = buildGroups();
      // Always start at the top-level group list — even when the trigger
      // already has a selected value. The person asked for "show only
      // group names, then click to see models under it" as the entry
      // point every time a dropdown like this opens, not a shortcut that
      // skips straight to whichever group happens to be selected already.
      screen = "groups";
      activeGroupIdx = Math.max(0, groups.findIndex(g => g.items.some(o => o.value === currentValue)));
    }

    const renderScreen = () => {
      if (drillDown && screen === "groups"){
        panel.innerHTML = groups.map((g, i) => `
          <div class="dd-option dd-option-group-row" data-dd-group-idx="${i}" role="option">
            <span style="flex:1">${Utils.escapeHtml(g.label)}</span>
            <span style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-right:2px">${g.items.length}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="flex-shrink:0"><path d="M3.5 1.5 7 5 3.5 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>`).join("") || `<div style="padding:10px;font-size:var(--fs-xs);color:var(--text-tertiary)">No options</div>`;
        panel.querySelectorAll("[data-dd-group-idx]").forEach(el => {
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            activeGroupIdx = parseInt(el.dataset.ddGroupIdx, 10);
            screen = "items";
            renderScreen();
          });
        });
        return;
      }

      // "items" screen: either drill-down mode showing one group's models
      // (with a Back row to return to the group list), or the normal flat
      // mode with headers rendered inline and no navigation between them.
      const itemOpts = drillDown ? groups[activeGroupIdx].items : opts;
      const backRow = drillDown ? `<div class="dd-option dd-option-back" data-dd-back role="option">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M6.5 1.5 3 5l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>${Utils.escapeHtml(groups[activeGroupIdx].label)}</span>
      </div>` : "";
      panel.innerHTML = backRow + itemOpts.map((o, i) => {
        if (o.isGroupHeader){
          return `<div class="dd-group-header" data-dd-idx="${i}">${Utils.escapeHtml(o.label)}</div>`;
        }
        return `
        <div class="dd-option ${o.value===currentValue?'dd-option-selected':''} ${o.indent && !drillDown ?'dd-option-indent':''}" data-dd-idx="${i}" role="option" aria-selected="${o.value===currentValue}">
          ${o.swatchColor ? `<span class="dd-trigger-swatch" style="background:${o.swatchColor}"></span>` : ""}
          <span>${Utils.escapeHtml(o.label)}</span>
          <svg class="dd-option-check" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2 5 8.7 9.5 3.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>`;
      }).join("") || (backRow ? "" : `<div style="padding:10px;font-size:var(--fs-xs);color:var(--text-tertiary)">No options</div>`);

      if (drillDown){
        panel.querySelector("[data-dd-back]").addEventListener("click", (e) => {
          e.stopPropagation();
          screen = "groups";
          renderScreen();
        });
      }
      panel.querySelectorAll(".dd-option[data-dd-idx]").forEach(el => {
        el.addEventListener("mouseenter", () => { activeIdx = parseInt(el.dataset.ddIdx, 10); highlight(); });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const opt = itemOpts[parseInt(el.dataset.ddIdx, 10)];
          Dropdown._select(ddEl, trigger, opt, onChange);
        });
      });
      let activeIdx = Math.max(0, itemOpts.findIndex(o => !o.isGroupHeader && o.value === currentValue));
      if (itemOpts[activeIdx] && itemOpts[activeIdx].isGroupHeader) activeIdx = itemOpts.findIndex(o => !o.isGroupHeader);
      const highlight = () => {
        panel.querySelectorAll(".dd-option[data-dd-idx]").forEach((el) => el.classList.toggle("dd-option-active", parseInt(el.dataset.ddIdx, 10) === activeIdx));
      };
      highlight();
      Dropdown._itemsScreenState = { itemOpts, get activeIdx(){ return activeIdx; }, set activeIdx(v){ activeIdx = v; }, highlight };
    };

    renderScreen();
    Dropdown._positionPanel(trigger);
    requestAnimationFrame(() => panel.classList.add("open"));
    trigger.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");

    const keyHandler = (e) => {
      if (e.key === "Escape"){ e.preventDefault(); Dropdown.closeOpen(); trigger.focus(); return; }
      if (e.key === "Tab"){ Dropdown.closeOpen(); return; }
      if (drillDown && screen === "groups"){
        // Group-name screen has no per-row keyboard highlight state of its
        // own (it's short and mouse/tap-oriented) — Enter with nothing
        // highlighted would be ambiguous, so only Escape/Tab apply here.
        return;
      }
      const st = Dropdown._itemsScreenState;
      if (!st) return;
      if (e.key === "ArrowDown"){ e.preventDefault(); let i = st.activeIdx; do { i++; } while (st.itemOpts[i] && st.itemOpts[i].isGroupHeader); if (i < st.itemOpts.length) st.activeIdx = i; st.highlight(); }
      else if (e.key === "ArrowUp"){ e.preventDefault(); let i = st.activeIdx; do { i--; } while (st.itemOpts[i] && st.itemOpts[i].isGroupHeader); if (i >= 0) st.activeIdx = i; st.highlight(); }
      else if (e.key === "Enter"){ e.preventDefault(); const opt = st.itemOpts[st.activeIdx]; if (opt && !opt.isGroupHeader) Dropdown._select(ddEl, trigger, opt, onChange); }
      else if (e.key === "Backspace" && drillDown){ e.preventDefault(); screen = "groups"; renderScreen(); }
    };
    document.addEventListener("keydown", keyHandler);

    Dropdown._open = { ddEl, trigger, panel, keyHandler };

    if (!Dropdown._scrollHandlerBound){
      // "capture: true" on window only catches scroll events dispatched
      // directly at window/document — scroll doesn't bubble like click does,
      // so an overflow:auto container (the main #workspace, or a modal body)
      // scrolling internally never reaches a window-level listener at all.
      // Close on any of those three scroll surfaces explicitly; skip closing
      // when the scroll originated inside the dropdown's own option list
      // (its own scrollIntoView calls, or the user scrolling a long list).
      const closeUnlessInsidePanel = (e) => {
        if (Dropdown._open && Dropdown._open.panel.contains(e.target)) return;
        Dropdown.closeOpen();
      };
      window.addEventListener("scroll", closeUnlessInsidePanel, true);
      document.addEventListener("scroll", closeUnlessInsidePanel, true);
      window.addEventListener("resize", () => Dropdown.closeOpen());
      Dropdown._scrollHandlerBound = true;
    }
  },

  _positionPanel(trigger){
    const rect = trigger.getBoundingClientRect();
    const panel = Dropdown._panelEl;
    panel.style.minWidth = rect.width + "px";
    panel.style.left = Utils.clamp(rect.left, 8, window.innerWidth - 260) + "px";
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 220 && rect.top > 220){
      panel.style.top = "auto";
      panel.style.bottom = (window.innerHeight - rect.top + 6) + "px";
      panel.style.transformOrigin = "bottom center";
    } else {
      panel.style.bottom = "auto";
      panel.style.top = (rect.bottom + 6) + "px";
      panel.style.transformOrigin = "top center";
    }
  },

  _select(ddEl, trigger, opt, onChange){
    ddEl.dataset.ddValue = opt.value;
    trigger.querySelector(".dd-trigger-label").textContent = opt.label;
    const existingSwatch = trigger.querySelector(".dd-trigger-swatch");
    if (opt.swatchColor){
      if (existingSwatch) existingSwatch.style.background = opt.swatchColor;
      else trigger.insertAdjacentHTML("afterbegin", `<span class="dd-trigger-swatch" style="background:${opt.swatchColor}"></span>`);
    } else if (existingSwatch){
      existingSwatch.remove();
    }
    Dropdown.closeOpen();
    if (onChange) onChange(ddEl.id, opt.value);
  },

  closeOpen(){
    if (!Dropdown._open) return;
    const { trigger, panel, keyHandler } = Dropdown._open;
    panel.classList.remove("open");
    trigger.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", keyHandler);
    Dropdown._open = null;
    Dropdown._itemsScreenState = null;
  }
};
