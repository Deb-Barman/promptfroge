// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "../../core/CONFIG";
import { TokenEstimator } from "../../core/TokenEstimator";
import { Dropdown } from "../Dropdown";
import { Utils } from "../../core/Utils";

/** UIManager methods: settings. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const settingsMethods = {
  /* ---------------------------------------------------------------------- */
  /* SETTINGS VIEW                                                           */
  /* ---------------------------------------------------------------------- */
  renderSettings(){
    const s = this.state.settings;
    const fontMeta = CONFIG.EDITOR_FONTS.find(f => f.id === s.editorFont) || CONFIG.EDITOR_FONTS[0];
    const idiom = CONFIG.MODEL_IDIOMS[TokenEstimator.getModel(s.selectedModel||"claude").idiomKey] || CONFIG.MODEL_IDIOMS.generic;

    this.workspace.innerHTML = `
      <div class="view" style="max-width:820px">
        <div class="view-header"><div><h1 class="view-title">Settings</h1><p class="view-subtitle">Everything here is stored on this device only.</p></div></div>

        <div class="panel" style="padding:var(--sp-5)">

          <div class="settings-section-title">Editor</div>
          <div class="settings-row">
            <div><div class="settings-row-label">Editor font</div><div class="settings-row-desc">Monospace face used in the editor and highlight overlay.</div></div>
            <div class="settings-inline-control">${Dropdown.renderTrigger({ id: "setFontDD", value: s.editorFont, options: CONFIG.EDITOR_FONTS.map(f => ({ value: f.id, label: f.label })) })}</div>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Font preview</div><div class="settings-row-desc">How the current font/size/tab settings look.</div></div>
          </div>
          <div class="font-preview" id="settingsFontPreview" style="font-family:${fontMeta.stack};font-size:${s.editorZoom||14}px;line-height:${s.editorLineHeight==='compact'?1.4:s.editorLineHeight==='loose'?2.0:1.7}">Role:${"\u000A"}${"\u0009"}You are an expert Python developer.</div>
          <div class="settings-row">
            <div><div class="settings-row-label">Font size</div><div class="settings-row-desc">Also adjustable in the editor with Ctrl + / Ctrl -.</div></div>
            <div class="stepper">
              <button data-action="settings-zoom:-1" aria-label="Decrease font size">−</button>
              <span class="stepper-val" id="setZoomVal">${s.editorZoom||14}px</span>
              <button data-action="settings-zoom:1" aria-label="Increase font size">+</button>
            </div>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Tab width</div><div class="settings-row-desc">Spaces inserted per Tab keypress in the editor.</div></div>
            <div class="stepper">
              <button data-action="settings-tabwidth:-1" aria-label="Decrease tab width">−</button>
              <span class="stepper-val" id="setTabVal">${s.editorTabWidth||2}</span>
              <button data-action="settings-tabwidth:1" aria-label="Increase tab width">+</button>
            </div>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Line height</div><div class="settings-row-desc">Vertical spacing between lines in the editor.</div></div>
            <div class="settings-inline-control">${Dropdown.renderTrigger({ id: "setLineHeightDD", value: s.editorLineHeight||"relaxed", options: [{value:"compact",label:"Compact"},{value:"relaxed",label:"Relaxed"},{value:"loose",label:"Loose"}] })}</div>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Line numbers</div><div class="settings-row-desc">Show the line-number gutter beside the editor.</div></div>
            <div class="toggle ${s.showGutter?'on':''}" data-toggle="showGutter" role="switch" aria-checked="${s.showGutter}" tabindex="0"></div>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Syntax highlighting</div><div class="settings-row-desc">Color block headers, {{variables}}, comments, and constraint keywords.</div></div>
            <div class="toggle ${s.syntaxHighlighting?'on':''}" data-toggle="syntaxHighlighting" role="switch" aria-checked="${s.syntaxHighlighting}" tabindex="0"></div>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Autocomplete suggestions</div><div class="settings-row-desc">Show learned word/phrase suggestions while typing.</div></div>
            <div class="toggle ${s.suggestionsEnabled?'on':''}" data-toggle="suggestionsEnabled" role="switch" aria-checked="${s.suggestionsEnabled}" tabindex="0"></div>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Live analysis</div><div class="settings-row-desc">Update the Prompt Analyzer panel as you type (vs. only on save).</div></div>
            <div class="toggle ${s.analyzerLive?'on':''}" data-toggle="analyzerLive" role="switch" aria-checked="${s.analyzerLive}" tabindex="0"></div>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Word-count warning</div><div class="settings-row-desc">Flag in the side panel once a prompt passes this many words. 0 disables it.</div></div>
            <input class="input" id="setWordWarnInput" type="number" min="0" step="50" value="${s.wordCountWarning||0}" style="width:100px">
          </div>

          <div class="settings-section-title">AI model &amp; scoring</div>
          <div class="settings-row">
            <div><div class="settings-row-label">Default model</div><div class="settings-row-desc">Drives the editor's token/cost estimate and the default in "Copy as…". A second entry point to the same picker in the editor side panel.</div></div>
            <div class="settings-inline-control">${Dropdown.renderTrigger({ id: "setModelDD", value: s.selectedModel||"claude", options: TokenEstimator.groupedModelOptions() })}</div>
          </div>

          <div class="settings-row" style="align-items:flex-start">
            <div><div class="settings-row-label">Model &amp; tokens</div><div class="settings-row-desc">The models available everywhere in the app (Editor's Model &amp; tokens picker, cost estimator, "Copy as…"). Add any model with its context window and per-1M-token pricing — it shows up in every dropdown automatically. Only OpenAI's GPT-4/4o/3.5 family gets an exact token count here (real tokenizer); everything else — built-in or custom — uses a calibrated estimate.</div></div>
          </div>
          ${(() => {
            const mm = this.state.modelMgmt;
            const customCount = CONFIG.MODELS.filter(m => m.isCustom).length;
            if (!customCount) return "";
            return `<div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-bottom:8px">
              ${mm.selectMode && mm.selectedIds.length ? `<span style="font-size:var(--fs-2xs);color:var(--text-secondary);margin-right:auto">${mm.selectedIds.length} selected</span>` : ""}
              ${mm.selectMode && mm.selectedIds.length ? `<button class="btn btn-danger btn-sm" data-action="model-bulk-delete">Delete</button>` : ""}
              <label style="display:flex;align-items:center;gap:5px;font-size:var(--fs-2xs);color:var(--text-secondary);cursor:pointer;margin-right:4px">
                <input type="checkbox" id="modelHideBuiltinsCheck" ${mm.hideBuiltins?'checked':''}>
                Hide built-in models
              </label>
              <button class="btn btn-sm ${mm.selectMode?'btn-primary':'btn-secondary'}" data-action="model-toggle-select-mode">${mm.selectMode?'Done':'Select'}</button>
            </div>`;
          })()}
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:var(--sp-3)">
            ${(() => {
              const mm = this.state.modelMgmt;
              const groups = [];
              const byGroup = new Map();
              for (const m of CONFIG.MODELS){
                if (mm.hideBuiltins && !m.isCustom) continue; // skip built-ins entirely, not just collapse them
                const g = m.group || m.vendor || "Other";
                if (!byGroup.has(g)){ byGroup.set(g, []); groups.push(g); }
                byGroup.get(g).push(m);
              }
              if (mm.hideBuiltins && !groups.length){
                return `<div class="empty-state" style="padding:24px 16px"><div class="empty-state-title">No custom models</div><div class="empty-state-body">Every model right now is built-in. Uncheck "Hide built-in models" to see them, or add your own below.</div></div>`;
              }
              // Groups default open the first time they're seen (nothing to
              // hide yet) — only collapse once a group actually has enough
              // models that hiding it is worth doing. This is why a fresh
              // profile with just the 6 built-ins never shows a wall of
              // group cards: expandedGroups starts empty, but so does the
              // motivation to collapse anything.
              return groups.map(g => {
                const models = byGroup.get(g);
                const customInGroup = models.filter(m => m.isCustom).length;
                const isExpanded = mm.expandedGroups.has(g) || models.length <= 3;
                return `
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);margin:10px 0 2px 2px">${Utils.escapeHtml(g)}</div>
                ${!isExpanded ? `
                <div class="card card-hover card-clickable" style="display:flex;align-items:center;gap:10px;padding:9px 12px" data-action="model-toggle-group:${Utils.escapeHtml(g)}">
                  <div style="flex:1;min-width:0">
                    <div style="font-size:var(--fs-xs);font-weight:600;color:var(--text-primary)">${models.length} model${models.length===1?'':'s'}${customInGroup ? ` &middot; ${customInGroup} custom` : ""}</div>
                    <div style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-top:2px">${models.slice(0,3).map(m=>Utils.escapeHtml(m.label.split(" (")[0])).join(", ")}${models.length>3?", …":""}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0;color:var(--text-tertiary)"><path d="M5 3.5 9 7l-4 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>` : `
                ${models.length > 3 ? `<button class="btn btn-ghost btn-sm" style="align-self:flex-start;margin-bottom:2px" data-action="model-toggle-group:${Utils.escapeHtml(g)}">&#8963; Collapse ${Utils.escapeHtml(g)}</button>` : ""}
                ${models.map(m => {
                  const isSelected = mm.selectMode && mm.selectedIds.includes(m.id);
                  return `
                <div class="card ${isSelected?'card-selected':''}" style="display:flex;align-items:center;gap:10px;padding:9px 12px" ${mm.selectMode && m.isCustom ? `data-action="model-toggle-select:${m.id}"` : ""}>
                  ${mm.selectMode ? (m.isCustom ? `<input type="checkbox" ${isSelected?"checked":""} style="pointer-events:none;flex-shrink:0" tabindex="-1">` : `<span style="width:13px;flex-shrink:0"></span>`) : ""}
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                      <span style="font-size:var(--fs-xs);font-weight:600;color:var(--text-primary)">${Utils.escapeHtml(m.label)}</span>
                      ${m.tokenizer === "cl100k" ? `<span class="token-exact-badge" title="Real cl100k_base BPE tokenizer">exact</span>` : `<span style="font-size:9px;color:var(--text-tertiary);border:1px solid var(--border-subtle);border-radius:4px;padding:0 4px">est.</span>`}
                      ${m.isCustom ? `<span class="badge badge-custom">Custom</span>` : ""}
                    </div>
                    <div style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-top:2px">${m.vendor} &middot; ${m.contextWindow.toLocaleString()} ctx &middot; $${m.priceIn.toFixed(2)} / $${m.priceOut.toFixed(2)} per 1M (in/out)</div>
                  </div>
                  ${!mm.selectMode ? (m.isCustom ? `<div style="display:flex;gap:2px;flex-shrink:0" data-stop-propagation>
                    <button class="icon-btn btn-sm" data-action="edit-custom-model:${m.id}" title="Edit" aria-label="Edit model">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 1.8 11.2 4.5 4.3 11.4 1.4 11.6 1.6 8.7Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>
                    </button>
                    <button class="icon-btn btn-sm" data-action="delete-custom-model:${m.id}" title="Delete" aria-label="Delete model">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 3.5h8M5 3.5V2h3v1.5M3.5 3.5 4 11h5l0.5-7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                  </div>` : `<span style="font-size:var(--fs-2xs);color:var(--text-tertiary);flex-shrink:0">Built-in</span>`) : ""}
                </div>`;
                }).join("")}`}
              `;
              }).join("");
            })()}
          </div>
          <button class="btn btn-secondary btn-sm" data-action="new-custom-model">+ Add model</button>

          <div class="settings-row" style="margin-top:var(--sp-5)">
            <div><div class="settings-row-label">Default scoring profile</div><div class="settings-row-desc">Which weighting the Prompt Analyzer's overall score uses by default.</div></div>
            <div class="settings-inline-control">${Dropdown.renderTrigger({ id: "setProfileDD", value: s.scoringProfile||"default", options: CONFIG.SCORING_PROFILES.map(p => ({ value: p.id, label: p.label })) })}</div>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Prompting tips for ${idiom.label}</div><div class="settings-row-desc">Idioms this model tends to respond well to — also available via "Wrap XML" or "Adapt for…" in the editor toolbar.</div></div>
          </div>
          ${idiom.comparative ? `<div style="font-size:var(--fs-xs);color:var(--text-secondary);background:var(--bg-2);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 12px;margin-bottom:var(--sp-3);line-height:1.5"><b>Compared to other models:</b> ${Utils.escapeHtml(idiom.comparative)}</div>` : ""}
          <ul style="margin:0 0 var(--sp-3) 0;padding-left:20px;font-size:var(--fs-xs);color:var(--text-secondary);line-height:1.7">
            ${idiom.tips.map(t => `<li>${Utils.escapeHtml(t)}</li>`).join("")}
          </ul>

          <div class="settings-section-title">Defaults for new prompts</div>
          <div class="settings-row">
            <div><div class="settings-row-label">Default category</div><div class="settings-row-desc">Pre-selected category when starting a new prompt.</div></div>
            <div class="settings-inline-control">${Dropdown.renderTrigger({ id: "setDefaultCatDD", value: s.defaultCategory||"custom", options: CONFIG.CATEGORIES.map(c => ({ value: c.id, label: c.label, swatchColor: c.color })) })}</div>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Default output format hint</div><div class="settings-row-desc">Pre-filled when you insert an Output Format block.</div></div>
            <div class="settings-inline-control">${Dropdown.renderTrigger({ id: "setOutputFmtDD", value: s.defaultOutputFormat||"none", options: CONFIG.OUTPUT_FORMAT_HINTS.map(h => ({ value: h.id, label: h.label })) })}</div>
          </div>

          <div class="settings-section-title">Autosave &amp; versions</div>
          <div class="settings-row">
            <div><div class="settings-row-label">Autosave drafts</div><div class="settings-row-desc">Automatically save your work in the editor as you type.</div></div>
            <div class="toggle ${s.autoSaveDrafts?'on':''}" data-toggle="autoSaveDrafts" role="switch" aria-checked="${s.autoSaveDrafts}" tabindex="0"></div>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Autosave interval</div><div class="settings-row-desc">How long to wait after you stop typing before saving.</div></div>
            <div class="settings-inline-control">${Dropdown.renderTrigger({ id: "setAutosaveIntervalDD", value: s.autosaveInterval||"900", options: CONFIG.AUTOSAVE_INTERVALS.map(a => ({ value: a.id, label: a.label })) })}</div>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Version retention</div><div class="settings-row-desc">Oldest versions beyond this count are pruned automatically per prompt.</div></div>
            <div class="settings-inline-control">${Dropdown.renderTrigger({ id: "setRetentionDD", value: s.versionRetention||"25", options: CONFIG.VERSION_RETENTION.map(v => ({ value: v.id, label: v.label })) })}</div>
          </div>

          <div class="settings-section-title">Appearance</div>
          <div class="settings-row">
            <div><div class="settings-row-label">Theme</div><div class="settings-row-desc">Switch between dark and light appearance.</div></div>
            <button class="btn btn-secondary btn-sm" data-action="settings-theme-toggle">${this.state.theme === "dark" ? "Switch to light" : "Switch to dark"}</button>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">App size</div><div class="settings-row-desc">Scales the whole app up or down — every screen, not just the editor's font. Handy on a small phone or a very large monitor.</div></div>
            <div class="stepper">
              <button class="stepper-btn" data-action="settings-uiscale:-10" aria-label="Decrease app size">&minus;</button>
              <span class="stepper-val" id="setUiScaleVal">${this.state.settings.uiScale || 100}%</span>
              <button class="stepper-btn" data-action="settings-uiscale:10" aria-label="Increase app size">+</button>
              ${(this.state.settings.uiScale || 100) !== 100 ? `<button class="btn btn-ghost btn-sm" data-action="settings-uiscale-reset" style="margin-left:8px">Reset</button>` : ""}
            </div>
          </div>
        </div>

        <div class="panel" style="padding:var(--sp-5);margin-top:var(--sp-5)">
          <div class="side-panel-title"><span>Keyboard shortcuts</span></div>
          <div class="shortcut-grid">
            ${CONFIG.SHORTCUTS.map(sc => `<div class="shortcut-row"><span>${Utils.escapeHtml(sc.desc)}</span><kbd>${Utils.escapeHtml(sc.keys)}</kbd></div>`).join("")}
          </div>
        </div>

        <div class="panel" style="padding:var(--sp-5);margin-top:var(--sp-5)">
          <div class="side-panel-title"><span>Data</span></div>
          <div class="settings-row">
            <div><div class="settings-row-label">Export everything</div><div class="settings-row-desc">One JSON backup with every prompt, template, pattern, chain, snippet, saved search, group, and custom model — everything, so it's easy to fully restore later. Need only some of it, or a different file format? Use "Choose sections & items to export…" inside Export.</div></div>
            <button class="btn btn-secondary btn-sm" data-action="settings-export">Export</button>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Import backup</div><div class="settings-row-desc">Restore from a previously exported JSON file — upload it or paste its contents directly.</div></div>
            <button class="btn btn-secondary btn-sm" data-action="settings-import">Import</button>
          </div>
        </div>

        <div class="danger-zone" style="margin-top:var(--sp-5)">
          <div class="side-panel-title" style="color:var(--accent-red)"><span>Danger zone</span></div>
          <div class="settings-row">
            <div><div class="settings-row-label">Clear prompts only</div><div class="settings-row-desc">Delete all prompts and their version history. Templates, snippets, and patterns are kept.</div></div>
            <button class="btn btn-danger btn-sm" data-action="settings-clear-prompts">Clear prompts</button>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Clear templates &amp; snippets</div><div class="settings-row-desc">Delete all templates and any /shortcut text-expansion snippets you've added.</div></div>
            <button class="btn btn-danger btn-sm" data-action="settings-clear-templates">Clear templates &amp; snippets</button>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Clear shortcuts</div><div class="settings-row-desc">Permanently delete every /shortcut you've added, from this browser. This can't be undone.</div></div>
            <button class="btn btn-danger btn-sm" data-action="settings-clear-shortcuts">Clear shortcuts</button>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Clear custom patterns</div><div class="settings-row-desc">Delete all patterns you've created. Built-in patterns are untouched.</div></div>
            <button class="btn btn-danger btn-sm" data-action="settings-clear-patterns">Clear custom patterns</button>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Clear chains</div><div class="settings-row-desc">Delete every saved chain. The prompts they reference are untouched.</div></div>
            <button class="btn btn-danger btn-sm" data-action="settings-clear-chains">Clear chains</button>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Clear history</div><div class="settings-row-desc">Delete every saved version snapshot across all prompts. The prompts themselves, at their current text, are kept — this only removes the ability to look back at or restore older versions.</div></div>
            <button class="btn btn-danger btn-sm" data-action="settings-clear-history">Clear history</button>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Clear groups</div><div class="settings-row-desc">Remove every group from Library, Templates, and Patterns. The prompts, templates, and patterns themselves are untouched — only the grouping is deleted.</div></div>
            <button class="btn btn-danger btn-sm" data-action="settings-clear-groups">Clear groups</button>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Clear saved structures</div><div class="settings-row-desc">Delete every structure you've saved in the Visual Builder. The built-in structures (Basic, Image, RTF, CO-STAR, Full spec) are untouched.</div></div>
            <button class="btn btn-danger btn-sm" data-action="settings-clear-structures">Clear structures</button>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Clear everything</div><div class="settings-row-desc">Permanently delete every prompt, template, snippet, pattern, chain, version, group, saved structure, custom model, and saved setting on this device.</div></div>
            <button class="btn btn-danger btn-sm" data-action="settings-clear-all">Clear everything</button>
          </div>
        </div>

        <div class="panel" style="padding:var(--sp-5);margin-top:var(--sp-5)">
          <div class="side-panel-title"><span>Help</span></div>
          <div class="settings-row">
            <div><div class="settings-row-label">Welcome tour</div><div class="settings-row-desc">Replay the first-time walkthrough of the Editor, Library, Patterns, Chains, and command palette.</div></div>
            <button class="btn btn-secondary btn-sm" data-action="settings-replay-onboarding">Replay tour</button>
          </div>
          <div class="settings-row">
            <div><div class="settings-row-label">Keyboard shortcuts</div><div class="settings-row-desc">Also reachable any time by pressing "?" outside a text field.</div></div>
            <button class="btn btn-secondary btn-sm" data-action="open-shortcuts">View shortcuts</button>
          </div>
        </div>

        <div class="panel" style="padding:var(--sp-5);margin-top:var(--sp-5)">
          <div class="side-panel-title"><span>About</span></div>
          <p style="font-size:var(--fs-xs);color:var(--text-tertiary);line-height:1.6">Prompt Forge runs entirely in this browser tab. There is no backend, no account, and no network request carries your prompt content anywhere. All suggestions, scoring, and analytics are computed from data already stored on this device.</p>
        </div>
      </div>`;

    this.workspace.querySelectorAll("[data-toggle]").forEach(el => {
      const fire = () => this._handleSettingsToggle(el.dataset.toggle);
      el.addEventListener("click", fire);
      el.addEventListener("keydown", (e) => Utils.onEnterOrSpace(e, fire));
    });

    Dropdown.attach(this.workspace, {
      setFontDD: CONFIG.EDITOR_FONTS.map(f => ({ value: f.id, label: f.label })),
      setLineHeightDD: [{value:"compact",label:"Compact"},{value:"relaxed",label:"Relaxed"},{value:"loose",label:"Loose"}],
      setDefaultCatDD: CONFIG.CATEGORIES.map(c => ({ value: c.id, label: c.label, swatchColor: c.color })),
      setOutputFmtDD: CONFIG.OUTPUT_FORMAT_HINTS.map(h => ({ value: h.id, label: h.label })),
      setAutosaveIntervalDD: CONFIG.AUTOSAVE_INTERVALS.map(a => ({ value: a.id, label: a.label })),
      setRetentionDD: CONFIG.VERSION_RETENTION.map(v => ({ value: v.id, label: v.label })),
      setModelDD: TokenEstimator.groupedModelOptions(),
      setProfileDD: CONFIG.SCORING_PROFILES.map(p => ({ value: p.id, label: p.label }))
    }, (id, value) => this._handleSettingsDropdown(id, value), ["setModelDD"]);

    const wordWarnInput = document.getElementById("setWordWarnInput");
    if (wordWarnInput){
      wordWarnInput.addEventListener("change", () => {
        this.state.settings.wordCountWarning = Utils.clamp(parseInt(wordWarnInput.value, 10) || 0, 0, 100000);
        this.storage.setSetting("appSettings", this.state.settings);
      });
    }
  },

  _handleSettingsToggle(key){
    this.state.settings[key] = !this.state.settings[key];
    this.storage.setSetting("appSettings", this.state.settings);
    this.renderSettings();
  },

  _handleSettingsDropdown(id, value){
    const map = {
      setFontDD: "editorFont", setLineHeightDD: "editorLineHeight",
      setDefaultCatDD: "defaultCategory", setOutputFmtDD: "defaultOutputFormat",
      setAutosaveIntervalDD: "autosaveInterval", setRetentionDD: "versionRetention",
      setModelDD: "selectedModel", setProfileDD: "scoringProfile"
    };
    const key = map[id];
    if (!key) return;
    this.state.settings[key] = value;
    this.storage.setSetting("appSettings", this.state.settings);
    // Font/line-height changes are visible immediately in the preview block
    // without a full re-render; model changes need one to refresh the
    // prompting-tips list (which depends on the selected model); everything
    // else just needs the value saved.
    if (id === "setFontDD" || id === "setLineHeightDD" || id === "setModelDD") this.renderSettings();
  },

  _adjustSettingsStepper(kind, delta){
    const s = this.state.settings;
    if (kind === "zoom"){
      s.editorZoom = Utils.clamp((s.editorZoom || 14) + delta, 10, 22);
      const el = document.getElementById("setZoomVal");
      if (el) el.textContent = s.editorZoom + "px";
      const preview = document.getElementById("settingsFontPreview");
      if (preview) preview.style.fontSize = s.editorZoom + "px";
    } else if (kind === "tabwidth"){
      s.editorTabWidth = Utils.clamp((s.editorTabWidth || 2) + delta, 1, 8);
      const el = document.getElementById("setTabVal");
      if (el) el.textContent = s.editorTabWidth;
    } else if (kind === "uiscale"){
      s.uiScale = Utils.clamp((s.uiScale || 100) + delta, 70, 150);
      this._applyUiScale();
      this.renderSettings();
    }
    this.storage.setSetting("appSettings", s);
  }
};
