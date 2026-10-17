// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "../../core/CONFIG";
import { Utils } from "../../core/Utils";

/** UIManager methods: analytics. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const analyticsMethods = {
  /* ---------------------------------------------------------------------- */
  /* ANALYTICS VIEW                                                          */
  /* ---------------------------------------------------------------------- */
  renderAnalytics(){
    const stats = this.analytics.summary();
    const maxActivity = Math.max(1, ...stats.activity.map(d => d.count));
    const maxCat = Math.max(1, ...Object.values(stats.byCategory));
    const maxWord = Math.max(1, ...stats.topWords.map(w => w.count));

    this.workspace.innerHTML = `
      <div class="view">
        <div class="view-header">
          <div>
            <h1 class="view-title">Analytics</h1>
            <p class="view-subtitle">Computed locally from your saved data — refreshes every time you visit.</p>
          </div>
        </div>

        <div class="grid grid-4" style="margin-bottom:var(--sp-6)">
          ${this._statCard("Total prompts", stats.totalPrompts, "prompt")}
          ${this._statCard("Avg. length", stats.avgLen + "w", "words")}
          ${this._statCard("Favorites", stats.favoriteCount, "prompt")}
          ${this._statCard("Templates", stats.totalTemplates, "template")}
        </div>

        <div class="grid grid-2" style="align-items:start">
          <div class="panel" style="padding:var(--sp-5)">
            <div class="side-panel-title"><span>Activity — last 14 days</span></div>
            <div style="display:flex;align-items:flex-end;gap:6px;height:120px;padding-top:var(--sp-3)">
              ${stats.activity.map(d => `
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px">
                  <div style="width:100%;background:${d.count?'var(--accent-amber)':'var(--bg-3)'};border-radius:3px 3px 0 0;height:${Math.max(3, (d.count/maxActivity)*90)}px" title="${d.count} edited"></div>
                  <span style="font-size:9px;color:var(--text-tertiary)">${d.label[0]}</span>
                </div>`).join("")}
            </div>
          </div>

          <div class="panel" style="padding:var(--sp-5)">
            <div class="side-panel-title"><span>Prompts by category</span></div>
            ${Object.entries(stats.byCategory).sort((a,b)=>b[1]-a[1]).map(([catId, count]) => {
              const cat = CONFIG.CATEGORIES.find(c => c.id === catId) || CONFIG.CATEGORIES[CONFIG.CATEGORIES.length-1];
              return `<div class="bar-chart-row">
                <span class="bar-chart-label"><span class="category-dot ${cat.cls}" style="display:inline-block;margin-right:6px"></span>${cat.label}</span>
                <span class="bar-chart-track"><span class="bar-chart-fill" style="width:${(count/maxCat)*100}%;background:var(--accent-blue)"></span></span>
                <span class="bar-chart-val">${count}</span>
              </div>`;
            }).join("") || this._miniEmpty("No prompts yet.")}
          </div>
        </div>

        <div class="panel" style="padding:var(--sp-5);margin-top:var(--sp-4)">
          <div class="side-panel-title"><span>Most-used words</span></div>
          ${stats.topWords.length ? `
          <div class="word-cloud">
            ${stats.topWords.map(w => `<span style="font-size:${11 + (w.count/maxWord)*20}px;font-weight:${500 + Math.round((w.count/maxWord)*300)}">${Utils.escapeHtml(w.word)}</span>`).join("")}
          </div>` : this._miniEmpty("Write a few prompts to see your most-used words.")}
        </div>
      </div>`;
  },

  /* ---------------------------------------------------------------------- */
  /* LEARN VIEW — tips + challenges                                         */
  /* ---------------------------------------------------------------------- */
  renderLearn(){
    const progress = this.state.challengeProgress;
    const solvedCount = Object.values(progress).filter(v => v.solved).length;

    this.workspace.innerHTML = `
      <div class="view">
        <div class="view-header">
          <div>
            <h1 class="view-title">Learn</h1>
            <p class="view-subtitle">${solvedCount} of ${CONFIG.CHALLENGES.length} challenges completed</p>
          </div>
        </div>

        <div class="panel" style="padding:var(--sp-5);margin-bottom:var(--sp-6)">
          <div class="side-panel-title"><span>Tips</span></div>
          <div style="display:flex;flex-direction:column;gap:12px">
            ${CONFIG.LEARN_TIPS.map((tip, i) => `
              <div class="tip-card">
                <span class="tip-num">${String(i+1).padStart(2,'0')}</span>
                <span style="font-size:var(--fs-sm);color:var(--text-secondary);line-height:1.5">${Utils.escapeHtml(tip)}</span>
              </div>`).join("")}
          </div>
        </div>

        <h2 style="font-size:var(--fs-lg);font-weight:650;margin-bottom:var(--sp-4)">Challenges</h2>
        <div class="grid grid-auto">
          ${CONFIG.CHALLENGES.map(c => {
            const done = progress[c.id]?.solved;
            return `<div class="card challenge-card">
              <div style="display:flex;align-items:center;justify-content:space-between">
                <span class="challenge-level level-${c.level}">${c.level.toUpperCase()}</span>
                ${done ? '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="7" fill="var(--accent-green)"/><path d="M4.5 7.5 6.5 9.5 10.5 5.5" stroke="var(--bg-0)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ""}
              </div>
              <div class="prompt-card-title">${Utils.escapeHtml(c.title)}</div>
              <div class="prompt-card-snippet" style="-webkit-line-clamp:2">${Utils.escapeHtml(c.task)}</div>
              <button class="btn btn-secondary btn-sm btn-block" data-action="open-challenge:${c.id}">${done ? "Try again" : "Start"}</button>
            </div>`;
          }).join("")}
        </div>
      </div>`;
  },

  openChallengeModal(challengeId){
    const c = CONFIG.CHALLENGES.find(x => x.id === challengeId);
    if (!c) return;
    const prior = this.state.challengeProgress[c.id];
    this.openModal({
      title: c.title, size: "modal-lg",
      bodyHtml: `
        <span class="challenge-level level-${c.level}">${c.level.toUpperCase()}</span>
        <p style="font-size:var(--fs-sm);color:var(--text-secondary);line-height:1.55;margin-top:8px">${Utils.escapeHtml(c.task)}</p>
        <div class="field" style="margin-top:var(--sp-3)">
          <label class="field-label">Original prompt</label>
          <div class="panel" style="padding:10px 12px;font-family:var(--font-mono);font-size:13px;color:var(--text-tertiary)">${Utils.escapeHtml(c.prompt)}</div>
        </div>
        <div class="field">
          <label class="field-label" for="challengeAnswerInput">Your rewrite</label>
          <textarea class="textarea" id="challengeAnswerInput" rows="6" placeholder="Rewrite the prompt here…">${Utils.escapeHtml(prior?.answer || "")}</textarea>
        </div>
        <div id="challengeResult"></div>`,
      footerHtml: `<button class="btn btn-ghost" id="chCancelBtn">Close</button><button class="btn btn-primary" id="chCheckBtn">Check my answer</button>`,
      onMount: (modal) => {
        modal.querySelector("#chCancelBtn").addEventListener("click", () => this.closeModal());
        modal.querySelector("#chCheckBtn").addEventListener("click", () => {
          const answer = modal.querySelector("#challengeAnswerInput").value;
          const lower = answer.toLowerCase();
          const hits = c.checkKeywords.filter(k => lower.includes(k));
          const score = Math.round((hits.length / c.checkKeywords.length) * 100);
          const solved = score >= 40 && answer.trim().length > c.prompt.length;
          this.state.challengeProgress[c.id] = { solved, score, answer, attemptedAt: Date.now() };
          this.storage.setSetting("challengeProgress", this.state.challengeProgress);
          const resultEl = modal.querySelector("#challengeResult");
          resultEl.innerHTML = `<div class="security-alert" style="background:${solved?'color-mix(in srgb, var(--accent-green) 10%, transparent)':'color-mix(in srgb, var(--accent-amber) 10%, transparent)'};border-color:${solved?'color-mix(in srgb, var(--accent-green) 35%, transparent)':'color-mix(in srgb, var(--accent-amber) 35%, transparent)'}">
            <span style="color:${solved?'var(--accent-green)':'var(--accent-amber)'}">${solved ? "✓" : "△"}</span>
            <span style="color:var(--text-secondary)">Local score: ${score}/100 — ${solved ? "nice work, this hits the key elements." : "getting there — look for: " + c.checkKeywords.slice(0,3).join(", ")}</span>
          </div>`;
        });
      }
    });
  }
};
