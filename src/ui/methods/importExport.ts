// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "../../core/CONFIG";
import { TemplateEngine } from "../../core/TemplateEngine";
import { Utils } from "../../core/Utils";
import { JSONImporter } from "../../core/JSONImporter";

/** UIManager methods: importExport. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const importExportMethods = {
  /* ---------------------------------------------------------------------- */
  /* Import / Export                                                        */
  /* ---------------------------------------------------------------------- */
  // Normalizes every exportable section into one common shape so the
  // export picker, search, and all four non-JSON formats can treat them
  // uniformly. "body" is what actually gets written into Markdown/txt/HTML;
  // "meta" is extra columns for the CSV format only.
  _collectExportableItems(kinds){
    const items = [];
    if (kinds.includes("prompts")){
      for (const p of this.pe.listPrompts({ includeArchived: true })){
        const cat = CONFIG.CATEGORIES.find(c => c.id === p.category);
        items.push({ id: p.id, kind: "prompts", kindLabel: "Prompt", title: p.title || "Untitled prompt", body: p.body, updatedAt: p.updatedAt,
          meta: { Category: cat ? cat.label : p.category, Tags: (p.tags||[]).join("|"), Favorite: p.favorite?"yes":"no", Archived: p.archived?"yes":"no" } });
      }
    }
    if (kinds.includes("templates")){
      for (const t of this.pe.listTemplates()){
        items.push({ id: t.id, kind: "templates", kindLabel: "Template", title: t.name || "Untitled template", body: t.body, updatedAt: t.updatedAt,
          meta: { Variables: TemplateEngine.extractVariables(t.body).join("|"), "Used×": t.useCount||0 } });
      }
    }
    if (kinds.includes("patterns")){
      const all = [...CONFIG.PATTERNS.map(p => ({ ...p, isCustom: false })), ...this.pe.listCustomPatterns().map(p => ({ ...p, isCustom: true }))];
      for (const p of all){
        items.push({ id: p.id, kind: "patterns", kindLabel: "Pattern", title: p.name || "Untitled pattern", body: p.template || p.purpose || "", updatedAt: p.updatedAt || 0,
          meta: { Category: p.category || "", Custom: p.isCustom ? "yes" : "no", Purpose: p.purpose || "" } });
      }
    }
    if (kinds.includes("chains")){
      for (const c of this.pe.listChains()){
        const stepLines = (c.steps||[]).map((s, i) => {
          const p = s.promptId ? this.pe.getPrompt(s.promptId) : null;
          return `${i+1}. ${p ? (p.title||"Untitled prompt") : "(missing prompt)"}${s.note ? ` — ${s.note}` : ""}`;
        }).join("\n");
        items.push({ id: c.id, kind: "chains", kindLabel: "Chain", title: c.name || "Untitled chain", body: [c.description, stepLines].filter(Boolean).join("\n\n"), updatedAt: c.updatedAt,
          meta: { Steps: (c.steps||[]).length } });
      }
    }
    if (kinds.includes("shortcuts")){
      for (const s of this.pe.listSnippets()){
        items.push({ id: s.id, kind: "shortcuts", kindLabel: "Shortcut", title: s.trigger, body: s.body, updatedAt: s.updatedAt,
          meta: { "Used×": s.useCount||0 } });
      }
    }
    // "history" (saved versions) is collected separately via
    // _collectHistoryItems() since it needs an async IndexedDB read —
    // callers merge the two lists together.
    return items;
  },

  // History needs an async fetch (versions live in their own IndexedDB
  // store), so it's collected separately and merged in — kept as its own
  // method rather than making _collectExportableItems async, since every
  // other section is already in memory via PromptEngine's maps.
  async _collectHistoryItems(){
    const items = [];
    for (const p of this.pe.listPrompts({ includeArchived: true })){
      const versions = await this.versions.listVersions(p.id);
      for (const v of versions){
        items.push({ id: v.id, kind: "history", kindLabel: "History", title: `${p.title || "Untitled prompt"} — v${v.versionNum || "?"}`, body: v.body || "", updatedAt: v.createdAt || 0,
          meta: { Prompt: p.title || "Untitled prompt", Version: v.versionNum || "", Note: v.note || "", Saved: Utils.formatDate(v.createdAt) } });
      }
    }
    return items;
  },

  openExportModal(){
    this.openModal({
      title: "Export data",
      bodyHtml: `
        <p style="font-size:var(--fs-sm);color:var(--text-secondary);margin-bottom:var(--sp-4)">Download a full backup, or pick specific sections and items to export in another format.</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-secondary btn-block" data-export="json" style="justify-content:flex-start;white-space:normal;text-align:left;height:auto">JSON — full backup, everything (prompts, templates, patterns, chains, history, snippets, custom models &amp; groups)</button>
          <button class="btn btn-secondary btn-block" id="expPickSectionsBtn" style="justify-content:flex-start;white-space:normal;text-align:left;height:auto">Choose sections &amp; items to export…</button>
        </div>`,
      footerHtml: `<button class="btn btn-ghost" id="expCloseBtn">Close</button>`,
      onMount: (modal) => {
        modal.querySelector("#expCloseBtn").addEventListener("click", () => this.closeModal());
        modal.querySelector("[data-export='json']").addEventListener("click", () => this._runExport("json", null));
        modal.querySelector("#expPickSectionsBtn").addEventListener("click", () => this.openExportSectionModal());
      }
    });
  },

  // Step 2 of the non-JSON export flow: which sections to pull from
  // (prompts/templates/patterns/chains/history). Kept as its own step
  // before the item picker so choosing "just Templates and Patterns"
  // doesn't require scrolling past every prompt and history entry first.
  openExportSectionModal(){
    const sections = [
      { id: "prompts", label: "Prompts (Library)", count: this.pe.listPrompts({ includeArchived: true }).length },
      { id: "templates", label: "Templates", count: this.pe.listTemplates().length },
      { id: "patterns", label: "Patterns", count: CONFIG.PATTERNS.length + this.pe.listCustomPatterns().length },
      { id: "chains", label: "Chains", count: this.pe.listChains().length },
      { id: "shortcuts", label: "Shortcuts", count: this.pe.listSnippets().length },
      { id: "history", label: "History (saved versions)", count: null } // count needs an async fetch — shown as "—" until picked
    ];
    this.openModal({
      title: "Choose sections to export",
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:4px">
          ${sections.map(s => `
            <label class="checkbox-row" style="padding:9px 4px">
              <input type="checkbox" class="exp-section-check" data-section="${s.id}" ${s.count > 0 || s.count === null ? "checked" : ""} ${s.count === 0 ? "disabled" : ""}>
              <span style="flex:1">${s.label}</span>
              <span style="font-size:var(--fs-2xs);color:var(--text-tertiary)">${s.count === null ? "" : `${s.count} item${s.count===1?'':'s'}`}</span>
            </label>`).join("")}
        </div>`,
      footerHtml: { spread: true, html: `
        <button class="btn btn-ghost" id="expSecBackBtn">&larr; Back</button>
        <button class="btn btn-primary" id="expSecNextBtn">Next</button>` },
      onMount: (modal) => {
        modal.querySelector("#expSecBackBtn").addEventListener("click", () => this.openExportModal());
        modal.querySelector("#expSecNextBtn").addEventListener("click", () => {
          const chosen = Array.from(modal.querySelectorAll(".exp-section-check")).filter(c => c.checked).map(c => c.dataset.section);
          if (!chosen.length){ this.toast("Pick at least one section.", "warn"); return; }
          this.openExportFormatModal(chosen);
        });
      }
    });
  },

  // Step 3: which file format. Format comes before the item picker/search
  // so the item list's column layout (CSV shows a metadata-heavy table;
  // Markdown/txt/HTML show a simple title list) can adapt to it, and so
  // switching format doesn't lose an in-progress search.
  openExportFormatModal(sectionKinds){
    const formats = [
      { id: "markdown", label: "Markdown", desc: "Export as .md" },
      { id: "txt", label: "Plain text", desc: "Export as .txt" },
      { id: "csv", label: "CSV", desc: "Export metadata table" },
      { id: "html", label: "HTML", desc: "Export printable page" }
    ];
    this.openModal({
      title: "Choose a format",
      bodyHtml: `<div style="display:flex;flex-direction:column;gap:8px">
        ${formats.map(f => `<button class="btn btn-secondary btn-block" data-format="${f.id}" style="justify-content:flex-start">${f.label} — ${f.desc}</button>`).join("")}
      </div>`,
      footerHtml: `<button class="btn btn-ghost" id="expFmtBackBtn">&larr; Back</button>`,
      onMount: (modal) => {
        modal.querySelector("#expFmtBackBtn").addEventListener("click", () => this.openExportSectionModal());
        modal.querySelectorAll("[data-format]").forEach(btn => {
          btn.addEventListener("click", () => this.openExportSelectModal(btn.dataset.format, sectionKinds));
        });
      }
    });
  },

  // Step 2 of the non-JSON export flow: which specific prompts to include, then hand off to
  // _runExport with an explicit id list (rather than "all prompts").
  // Step 4: pick which specific items (across whichever sections were
  // chosen) to include, with a live search box, then hand off to
  // _runExport with the final item list.
  async openExportSelectModal(format, sectionKinds){
    const formatLabels = { markdown: "Markdown (.md)", txt: "Plain text (.txt)", csv: "CSV", html: "HTML" };
    let items = this._collectExportableItems(sectionKinds.filter(k => k !== "history"));
    if (sectionKinds.includes("history")) items = items.concat(await this._collectHistoryItems());
    items.sort((a,b) => b.updatedAt - a.updatedAt);

    const kindBadgeColor = { prompts: "var(--accent-blue, #3b82f6)", templates: "var(--accent-purple, #a855f7)", patterns: "var(--accent-teal, #14b8a6)", chains: "var(--accent-amber)", shortcuts: "var(--accent-green)", history: "var(--text-tertiary)" };

    this.openModal({
      title: `Export as ${formatLabels[format] || format}`, size: "modal-lg",
      bodyHtml: `
        <div class="search-input-wrap" style="margin-bottom:var(--sp-3)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.3" stroke="currentColor" stroke-width="1.3"/><path d="M9.1 9.1 12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          <input class="input" id="expSearchInput" data-search-input enterkeyhint="search" placeholder="Search by title…">
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-3)">
          <label class="checkbox-row"><input type="checkbox" id="expSelectAllCheck" checked> Select all</label>
          <span style="font-size:var(--fs-xs);color:var(--text-tertiary)" id="expSelectedCount">${items.length} of ${items.length} selected</span>
        </div>
        <div id="expItemListWrap" style="max-height:min(50vh, 420px);overflow-y:auto;border:1px solid var(--border-subtle);border-radius:var(--r-md)">
          ${items.length ? items.map((it, i) => `
            <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border-subtle);cursor:pointer" class="exp-item-row" data-title="${Utils.escapeHtml((it.title||"").toLowerCase())}">
              <input type="checkbox" class="exp-item-check" data-item-idx="${i}" checked>
              <span class="badge" style="background:color-mix(in srgb, ${kindBadgeColor[it.kind]} 18%, transparent);color:${kindBadgeColor[it.kind]};border-color:color-mix(in srgb, ${kindBadgeColor[it.kind]} 40%, var(--border-subtle));flex-shrink:0">${it.kindLabel}</span>
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--fs-sm)">${Utils.escapeHtml(it.title)}</span>
              <span style="font-size:10px;color:var(--text-tertiary);font-family:var(--font-mono);flex-shrink:0">${Utils.countWords(it.body)}w</span>
            </label>`).join("") : this._miniEmpty("Nothing to export in the chosen sections yet.")}
        </div>
        <div id="expNoMatch" style="display:none;padding:20px;text-align:center;font-size:var(--fs-xs);color:var(--text-tertiary)">No items match your search.</div>
        ${(format === "markdown" || format === "html") ? `<div class="field" style="margin-top:var(--sp-3)">
          <label class="field-label" for="expCoverNoteInput">Cover note <span class="field-hint">optional — for a client handoff, e.g. who this is for and why</span></label>
          <textarea class="textarea" id="expCoverNoteInput" rows="2" placeholder="e.g. Prepared for Acme Corp — onboarding prompt set, March 2026"></textarea>
        </div>` : ""}
      `,
      footerHtml: { spread: true, html: `
        <button class="btn btn-ghost" id="expSelBackBtn">&larr; Back</button>
        <button class="btn btn-primary" id="expSelDownloadBtn" ${!items.length?'disabled':''}>Download selected</button>
      ` },
      onMount: (modal) => {
        const rows = () => Array.from(modal.querySelectorAll(".exp-item-row"));
        const visibleChecks = () => rows().filter(r => r.style.display !== "none").map(r => r.querySelector(".exp-item-check"));
        const countEl = modal.querySelector("#expSelectedCount");
        const selectAll = modal.querySelector("#expSelectAllCheck");
        const updateCount = () => {
          const vc = visibleChecks();
          const checked = vc.filter(c => c.checked).length;
          const totalChecked = Array.from(modal.querySelectorAll(".exp-item-check")).filter(c => c.checked).length;
          countEl.textContent = `${totalChecked} of ${items.length} selected`;
          selectAll.checked = vc.length > 0 && checked === vc.length;
          selectAll.indeterminate = checked > 0 && checked < vc.length;
          modal.querySelector("#expSelDownloadBtn").disabled = totalChecked === 0;
        };
        selectAll.addEventListener("change", () => {
          visibleChecks().forEach(c => c.checked = selectAll.checked);
          updateCount();
        });
        modal.querySelectorAll(".exp-item-check").forEach(c => c.addEventListener("change", updateCount));

        const searchInput = modal.querySelector("#expSearchInput");
        const listWrap = modal.querySelector("#expItemListWrap");
        const noMatch = modal.querySelector("#expNoMatch");
        searchInput.addEventListener("input", () => {
          const q = searchInput.value.trim().toLowerCase();
          let anyVisible = false;
          rows().forEach(r => {
            const match = !q || r.dataset.title.includes(q);
            r.style.display = match ? "" : "none";
            if (match) anyVisible = true;
          });
          listWrap.style.display = anyVisible || !q ? "" : "none";
          noMatch.style.display = !anyVisible && q ? "" : "none";
          updateCount();
        });

        modal.querySelector("#expSelBackBtn").addEventListener("click", () => this.openExportFormatModal(sectionKinds));
        modal.querySelector("#expSelDownloadBtn").addEventListener("click", () => {
          const selectedItems = Array.from(modal.querySelectorAll(".exp-item-check")).filter(c => c.checked).map(c => items[parseInt(c.dataset.itemIdx, 10)]);
          if (!selectedItems.length){ this.toast("Select at least one item.", "warn"); return; }
          const coverNoteEl = modal.querySelector("#expCoverNoteInput");
          this._runExport(format, selectedItems, coverNoteEl ? coverNoteEl.value.trim() : "");
        });
      }
    });
  },

  async _runExport(format, items, coverNote){
    // items === null means "full set" (used only by the JSON full-backup
    // path); an array of normalized export items (see
    // _collectExportableItems/_collectHistoryItems) is what the selection
    // step above always passes for every other format.
    const ts = new Date().toISOString().slice(0,10);
    try {
      if (format === "json"){
        const dump = await this.storage.exportAll();
        Utils.download(`prompt-forge-backup-${ts}.json`, JSON.stringify(dump, null, 2), "application/json");
        this.toast("Full backup downloaded.", "success");
        this.closeModal();
        return;
      }
      const scopeTag = `-${items.length}items`;
      if (format === "markdown"){
        const cover = coverNote ? `${coverNote}\n\n---\n\n` : "";
        const md = cover + items.map(it => `## ${it.title}\n\n*${it.kindLabel} · ${Utils.formatDate(it.updatedAt)}*\n\n${it.body}\n`).join("\n---\n\n");
        Utils.download(`export${scopeTag}-${ts}.md`, md, "text/markdown");
      } else if (format === "txt"){
        const txt = items.map(it => `${it.title}\n${"=".repeat(it.title.length)}\n\n${it.body}\n`).join("\n\n");
        Utils.download(`export${scopeTag}-${ts}.txt`, txt, "text/plain");
      } else if (format === "csv"){
        // Metadata columns differ per kind, so the CSV header is the union
        // of every meta key actually present across the selected items —
        // a prompts-only export gets prompt columns, a mixed export gets
        // every relevant column with blanks where a row's kind has no
        // value for it.
        const metaKeys = [];
        items.forEach(it => Object.keys(it.meta || {}).forEach(k => { if (!metaKeys.includes(k)) metaKeys.push(k); }));
        const rows = [["Type","Title","Words","Updated", ...metaKeys]];
        items.forEach(it => rows.push([it.kindLabel, it.title, Utils.countWords(it.body), new Date(it.updatedAt || 0).toISOString(), ...metaKeys.map(k => (it.meta && it.meta[k] != null) ? it.meta[k] : "")]));
        const csv = rows.map(r => r.map(Utils.csvEscape).join(",")).join("\n");
        Utils.download(`export${scopeTag}-${ts}.csv`, csv, "text/csv");
      } else if (format === "html"){
        const coverHtml = coverNote ? `<p style="font-size:1.05em;color:#444;border-left:3px solid #ddd;padding-left:14px;margin:20px 0">${Utils.escapeHtml(coverNote)}</p>` : "";
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Prompt Forge Export</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222}h2{border-bottom:2px solid #eee;padding-bottom:8px;margin-top:40px}pre{white-space:pre-wrap;background:#f7f7f7;padding:16px;border-radius:8px;font-family:ui-monospace,monospace}small{color:#888}.kind{display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#888;border:1px solid #ddd;border-radius:4px;padding:1px 6px;margin-right:8px}</style></head><body><h1>Prompt Forge Export</h1><p><small>Exported ${new Date().toLocaleString()}</small></p>${coverHtml}${items.map(it => `<h2><span class="kind">${Utils.escapeHtml(it.kindLabel)}</span>${Utils.escapeHtml(it.title)}</h2><p><small>${Utils.formatDate(it.updatedAt)}</small></p><pre>${Utils.escapeHtml(it.body)}</pre>`).join("")}</body></html>`;
        Utils.download(`export${scopeTag}-${ts}.html`, html, "text/html");
      }
      this.toast(`${items.length} item${items.length===1?'':'s'} downloaded.`, "success");
      this.closeModal();
    } catch(e){
      console.error(e);
      this.toast("Export failed — see console for details.", "error");
    }
  },

  openImportModal(){
    let mode = "upload"; // "upload" | "paste"
    this.openModal({
      title: "Import backup", size: "modal-lg",
      bodyHtml: `
        <p style="font-size:var(--fs-sm);color:var(--text-secondary);margin-bottom:var(--sp-4)">Restore a full Prompt Forge JSON backup — prompts, templates, patterns, chains, history, snippets, groups, and custom models.</p>
        <div class="pattern-tabs" id="impModeTabs" style="margin-bottom:var(--sp-4)">
          <div class="pattern-tab active" data-mode="upload">Upload JSON file</div>
          <div class="pattern-tab" data-mode="paste">Paste JSON</div>
        </div>
        <div id="impUploadPane">
          <input type="file" id="importFileInput" accept="application/json,.json" class="input" style="padding:8px">
        </div>
        <div id="impPastePane" style="display:none">
          <textarea class="textarea" id="importPasteInput" rows="10" placeholder="Paste the full contents of a Prompt Forge backup .json file here…" style="font-family:var(--font-mono);font-size:12px"></textarea>
        </div>
        <div class="field" style="margin-top:var(--sp-4)">
          <label class="checkbox-row"><input type="checkbox" id="importReplaceCheck"> Replace all existing data instead of merging</label>
          <div class="field-hint">Merge (default) adds new items and overwrites any with a matching id, keeping everything else. Replace wipes each section first — custom models are always merged by id regardless, so a backup never silently deletes a model you're actively using.</div>
        </div>
        <div id="importStatus" style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-top:var(--sp-3)"></div>`,
      footerHtml: `<button class="btn btn-ghost" id="impCancelBtn">Cancel</button><button class="btn btn-primary" id="impRunBtn" disabled>Import</button>`,
      onMount: (modal) => {
        const runBtn = modal.querySelector("#impRunBtn");
        const status = modal.querySelector("#importStatus");
        const fileInput = modal.querySelector("#importFileInput");
        const pasteInput = modal.querySelector("#importPasteInput");
        let parsed = null;

        const describeAndValidate = (raw) => {
          let obj;
          try { obj = JSON.parse(raw); }
          catch(e){ status.innerHTML = `<span style="color:var(--accent-red)">Couldn't read this as valid JSON — check it's the full, unmodified contents of a backup file.</span>`; runBtn.disabled = true; return null; }
          if (!obj || typeof obj !== "object" || Array.isArray(obj)){
            status.innerHTML = `<span style="color:var(--accent-red)">This doesn't look like a Prompt Forge backup — expected a JSON object with sections like "prompts", "templates", etc.</span>`;
            runBtn.disabled = true; return null;
          }
          const knownKeys = CONFIG.STORES.filter(s => Array.isArray(obj[s]));
          const modelCount = (obj._settings && Array.isArray(obj._settings.customModels)) ? obj._settings.customModels.length : 0;
          if (!knownKeys.length && !modelCount){
            status.innerHTML = `<span style="color:var(--accent-amber)">Valid JSON, but no recognizable Prompt Forge data was found in it.</span>`;
            runBtn.disabled = true; return null;
          }
          const counts = knownKeys.map(s => `${obj[s].length} ${s}`);
          if (modelCount) counts.push(`${modelCount} custom model${modelCount===1?'':'s'}`);
          const when = obj._meta && obj._meta.exportedAt ? ` &middot; exported ${Utils.formatDate(obj._meta.exportedAt)}` : "";
          status.innerHTML = `<span style="color:var(--accent-green)">Found:</span> ${counts.join(", ") || "nothing"}${when}`;
          runBtn.disabled = false;
          return obj;
        };

        fileInput.addEventListener("change", async () => {
          const file = fileInput.files[0];
          if (!file) return;
          try { parsed = describeAndValidate(await file.text()); }
          catch(e){ status.innerHTML = `<span style="color:var(--accent-red)">Couldn't read that file.</span>`; runBtn.disabled = true; }
        });
        pasteInput.addEventListener("input", Utils.debounce(() => {
          if (!pasteInput.value.trim()){ status.textContent = ""; runBtn.disabled = true; return; }
          parsed = describeAndValidate(pasteInput.value);
        }, 300));

        modal.querySelectorAll("#impModeTabs [data-mode]").forEach(tab => {
          tab.addEventListener("click", () => {
            mode = tab.dataset.mode;
            modal.querySelectorAll("#impModeTabs [data-mode]").forEach(t => t.classList.toggle("active", t === tab));
            modal.querySelector("#impUploadPane").style.display = mode === "upload" ? "" : "none";
            modal.querySelector("#impPastePane").style.display = mode === "paste" ? "" : "none";
            parsed = null; status.textContent = ""; runBtn.disabled = true;
          });
        });

        modal.querySelector("#impCancelBtn").addEventListener("click", () => this.closeModal());
        runBtn.addEventListener("click", async () => {
          if (!parsed) return;
          const importMode = modal.querySelector("#importReplaceCheck").checked ? "replace" : "merge";
          try {
            await this.storage.importAll(parsed, importMode);
            await this.pe.load();
            this._loadCustomModels();
            this.suggest.rebuildFromCorpus();
            this.closeModal();
            this.toast("Import complete.", "success");
            this.renderView();
          } catch(e){
            console.error(e);
            this.toast("Import failed — see console for details.", "error");
          }
        });
      }
    });
  },

  /* ---------------------------------------------------------------------- */
  /* New-prompt metadata modal (title optional here — full editing happens  */
  /* in the Editor view; this just seeds category/tags before opening it).  */
  /* ---------------------------------------------------------------------- */
  /* ---------------------------------------------------------------------- */
  /* SHARED IMPORT PANE — the "Paste JSON" / "Upload JSON file" panel used   */
  /* by New Prompt, New Template, and Add Pattern. Kept as one shared        */
  /* implementation (parameterized by an id prefix + JSONImporter "kind")    */
  /* rather than copy-pasted three times, so a fix here fixes all three.     */
  /* Reading a local file the user picked, or JSON they pasted, never        */
  /* touches the network either way.                                        */
  /* ---------------------------------------------------------------------- */

  // Renders the import pane's markup, parameterized by idPrefix (e.g. "np",
  // "tpl", "cp") so element ids never collide, and an exampleJson string
  // shown in a collapsible reference section.
  _renderImportPaneMarkup(idPrefix, exampleJson){
    return `
      <div id="${idPrefix}ImportPasteWrap">
        <div class="field">
          <label class="field-label" for="${idPrefix}ImportPasteInput">Paste JSON</label>
          <textarea class="textarea" id="${idPrefix}ImportPasteInput" rows="8" placeholder="Paste a JSON object or array here…" style="font-family:var(--font-mono);font-size:12px"></textarea>
        </div>
      </div>
      <div id="${idPrefix}ImportUploadWrap" style="display:none">
        <div class="field">
          <label class="field-label" for="${idPrefix}ImportFileInput">Upload a .json file</label>
          <input type="file" id="${idPrefix}ImportFileInput" accept=".json,application/json" class="input">
          <div id="${idPrefix}ImportFileStatus" style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-top:6px"></div>
        </div>
      </div>
      <div id="${idPrefix}ImportError" style="display:none;font-size:var(--fs-xs);color:var(--accent-red);background:color-mix(in srgb, var(--accent-red) 8%, transparent);border:1px solid color-mix(in srgb, var(--accent-red) 25%, var(--border-subtle));border-radius:var(--r-md);padding:8px 10px;margin-bottom:var(--sp-3)"></div>
      <details style="margin-top:var(--sp-2)">
        <summary style="cursor:pointer;font-size:var(--fs-2xs);color:var(--text-tertiary)">Example JSON format</summary>
        <pre style="background:var(--editor-bg);border:1px solid var(--border);border-radius:var(--r-md);padding:10px;font-family:var(--font-mono);font-size:11px;white-space:pre-wrap;word-break:break-word;color:var(--text-secondary);margin-top:6px">${Utils.escapeHtml(exampleJson)}</pre>
      </details>`;
  },

  // Wires the paste-textarea and file-upload interactions for one import
  // pane. File selection reads the file and drops its text into the SAME
  // paste textarea (rather than a separate hidden field) so there is only
  // ever one source of truth for "what JSON text will be parsed" — the
  // upload path just populates it for the user instead of them typing it.
  _wireImportPane(modal, idPrefix){
    const fileInput = modal.querySelector(`#${idPrefix}ImportFileInput`);
    if (!fileInput) return;
    const status = modal.querySelector(`#${idPrefix}ImportFileStatus`);
    const pasteInput = modal.querySelector(`#${idPrefix}ImportPasteInput`);
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const text = await JSONImporter.readFile(file);
        pasteInput.value = text;
        if (status) status.textContent = `Loaded "${file.name}" (${text.length.toLocaleString()} characters).`;
      } catch(e){
        if (status) status.textContent = "Couldn't read that file.";
      }
    });
  },

  // Reads and parses whichever import source is active (paste textarea,
  // which the upload path also fills) for the given kind. Shows a
  // human-readable error inline in the modal and returns null on failure
  // — the empty-array case (valid JSON, zero usable records) is handled
  // by the caller, not here, since "no records" isn't a parse error.
  _readImportPaneRecords(modal, idPrefix, kind){
    const errorEl = modal.querySelector(`#${idPrefix}ImportError`);
    const pasteInput = modal.querySelector(`#${idPrefix}ImportPasteInput`);
    const text = pasteInput ? pasteInput.value.trim() : "";
    if (errorEl) errorEl.style.display = "none";
    if (!text){
      if (errorEl){ errorEl.textContent = "Paste some JSON, or upload a .json file, first."; errorEl.style.display = ""; }
      return null;
    }
    try {
      return JSONImporter.parse(text, kind);
    } catch(e){
      if (errorEl){ errorEl.textContent = e.message; errorEl.style.display = ""; }
      return null;
    }
  }
};
