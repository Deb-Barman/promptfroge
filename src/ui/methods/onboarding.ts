// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "../../core/CONFIG";
import { Utils } from "../../core/Utils";

/** UIManager methods: onboarding. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const onboardingMethods = {
  /* ---------------------------------------------------------------------- */
  /* QUICK CAPTURE — a fast, single-textarea modal for jotting a prompt idea */
  /* straight into the "Inbox" category without opening the full editor.    */
  /* Reachable via a rail-independent shortcut so it works from any view.   */
  /* ---------------------------------------------------------------------- */
  openQuickCaptureModal(){
    this.openModal({
      title: "Quick Capture",
      bodyHtml: `
        <p style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--sp-3)">Jot the idea down now — it's saved to your Inbox category, ready to refine in the full editor later.</p>
        <div class="field">
          <textarea class="textarea" id="qcBodyInput" rows="6" placeholder="Type a prompt idea, a rough draft, a fragment worth keeping…" autofocus></textarea>
        </div>
        <div class="field">
          <input class="input" id="qcTitleInput" placeholder="Title (optional — you can add one later)" maxlength="200">
        </div>`,
      footerHtml: { spread: true, html: `
        <div></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" id="qcCancelBtn">Cancel</button>
          <button class="btn btn-secondary" id="qcSaveOpenBtn">Save &amp; Open in Editor</button>
          <button class="btn btn-primary" id="qcSaveBtn">Save to Inbox</button>
        </div>` },
      onMount: (modal) => {
        const bodyInput = modal.querySelector("#qcBodyInput");
        const titleInput = modal.querySelector("#qcTitleInput");
        modal.querySelector("#qcCancelBtn").addEventListener("click", () => this.closeModal());
        // Ctrl/Cmd+Enter submits from either field — a fast-capture modal
        // should not require reaching for the mouse.
        const submitOnMod = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter"){ e.preventDefault(); modal.querySelector("#qcSaveBtn").click(); } };
        bodyInput.addEventListener("keydown", submitOnMod);
        titleInput.addEventListener("keydown", submitOnMod);
        const buildPrompt = () => {
          const body = bodyInput.value.trim();
          if (!body) return null;
          return this.pe.newPromptSkeleton({ title: titleInput.value.trim(), body, category: "inbox" });
        };
        modal.querySelector("#qcSaveBtn").addEventListener("click", async () => {
          const prompt = buildPrompt();
          if (!prompt){ this.toast("Nothing to save yet — type something first.", "warn"); return; }
          await this.pe.savePrompt(prompt);
          this.suggest.learnFromText(prompt.body, prompt.updatedAt);
          this.closeModal();
          this.toast("Saved to Inbox.", "success", 1800);
          if (this.state.view === "dashboard" || this.state.view === "library") this.renderView();
        });
        modal.querySelector("#qcSaveOpenBtn").addEventListener("click", async () => {
          const prompt = buildPrompt();
          if (!prompt){ this.toast("Nothing to save yet — type something first.", "warn"); return; }
          await this.pe.savePrompt(prompt);
          this.suggest.learnFromText(prompt.body, prompt.updatedAt);
          this.closeModal();
          this._loadPromptIntoEditor(prompt.id);
          this.navigate("editor");
        });
      }
    });
  },

  /* "?" shortcut overlay — reuses CONFIG.SHORTCUTS (the same single source
     of truth Settings' own shortcuts panel reads) so the two never drift
     out of sync with each other. */
  openShortcutsModal(){
    this.openModal({
      title: "Keyboard Shortcuts", size: "modal-sm",
      bodyHtml: `<div>${CONFIG.SHORTCUTS.map(sc => `<div class="shortcut-row"><span>${Utils.escapeHtml(sc.desc)}</span><kbd>${Utils.escapeHtml(sc.keys)}</kbd></div>`).join("")}</div>`,
      footerHtml: `<button class="btn btn-primary" id="scCloseBtn">Got it</button>`,
      onMount: (modal) => { modal.querySelector("#scCloseBtn").addEventListener("click", () => this.closeModal()); }
    });
  },

  /* ---------------------------------------------------------------------- */
  /* ONBOARDING — a one-time welcome modal (first load only, replayable from */
  /* Settings) with an optional deeper spotlight tour that walks real rail   */
  /* items. Nothing here is a separate overlay library; the spotlight is a  */
  /* small positioned callout computed from getBoundingClientRect(), in     */
  /* keeping with the app's zero-dependency approach elsewhere.             */
  /* ---------------------------------------------------------------------- */
  _markOnboardingSeen(){
    this.state.settings.onboardingSeen = true;
    this.storage.setSetting("appSettings", this.state.settings);
  },

  openWelcomeModal(){
    this.openModal({
      title: "Welcome to Prompt Forge", size: "modal-lg", closeOnOverlay: false,
      bodyHtml: `
        <p style="font-size:var(--fs-sm);color:var(--text-secondary);margin-bottom:var(--sp-4)">Everything here runs locally — nothing you write ever leaves this device. A quick tour of what's available:</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${[
            ["Editor", "Live analyzer scoring, readability, risk linting, and model-aware token/cost estimates as you type."],
            ["Compare", "Put two or more saved prompts side-by-side with a word-level diff."],
            ["Chains", "Plan multi-step workflows — one prompt's output feeding the next."],
            ["Patterns & Builder", "Start from a proven structure, or drag together labeled blocks visually."],
            ["Quick Capture", "Alt+N from anywhere — jot an idea straight to your Inbox without opening the editor."],
            ["Command palette", "Ctrl+K to jump anywhere or run any action without leaving the keyboard."]
          ].map(([title, desc]) => `<div style="padding:12px;border:1px solid var(--border-subtle);border-radius:var(--r-md)"><div style="font-weight:600;font-size:var(--fs-xs);margin-bottom:4px">${title}</div><div style="font-size:var(--fs-2xs);color:var(--text-tertiary);line-height:1.5">${desc}</div></div>`).join("")}
        </div>`,
      footerHtml: { spread: true, html: `
        <button class="btn btn-ghost" id="welcomeSkipBtn">Skip, I'll explore on my own</button>
        <button class="btn btn-primary" id="welcomeTourBtn">Take the 30-second tour</button>` },
      onMount: (modal) => {
        modal.querySelector("#welcomeSkipBtn").addEventListener("click", () => {
          this._markOnboardingSeen();
          this.closeModal();
        });
        modal.querySelector("#welcomeTourBtn").addEventListener("click", () => {
          this._markOnboardingSeen();
          this.closeModal();
          // Give the modal-close transition a moment before the first
          // spotlight measures element positions, so it doesn't measure
          // mid-transition layout.
          setTimeout(() => this.startSpotlightTour(), 150);
        });
      }
    });
  },

  // Tour steps target a rail item via data-view, or "center" for a step
  // with no specific element (shown as a centered card instead of a
  // pointer callout). Kept as data so extending the tour later is a
  // one-line addition, not new spotlight-rendering logic.
  _tourSteps(){
    return [
      { selector: '[data-view="dashboard"]', title: "Dashboard", body: "Your recent prompts, quick actions, and stats live here." },
      { selector: '[data-view="library"]', title: "Library", body: "Every saved prompt, searchable and filterable. Toggle Compare mode to select several at once." },
      { selector: '[data-view="patterns"]', title: "Patterns", body: "Reusable prompt structures — start from one instead of a blank page." },
      { selector: '[data-view="chains"]', title: "Chains", body: "Plan a multi-step workflow: one prompt's output feeding the next." },
      { selector: '#paletteTriggerBtn', title: "Command palette", body: "Ctrl+K opens this from anywhere — search, jump to any view, or run an action." },
      { selector: null, title: "You're set", body: "Press \"?\" any time to see the full shortcut list. Have a look around — this is your working space now." }
    ];
  },

  startSpotlightTour(){
    this._tourIndex = 0;
    this._renderSpotlightStep();
  },

  _closeSpotlight(){
    const el = document.getElementById("spotlightOverlay");
    if (el) el.remove();
    window.removeEventListener("resize", this._spotlightReposition || (()=>{}));
  },

  _renderSpotlightStep(){
    this._closeSpotlight();
    const steps = this._tourSteps();
    const step = steps[this._tourIndex];
    if (!step) return;

    // On mobile the rail is an off-canvas drawer (transform: translateX
    // when closed) — a step targeting a rail item needs the drawer forced
    // open first, or getBoundingClientRect() reports an off-screen
    // position and the callout ends up pointing at nothing visible.
    const isMobileWidth = window.innerWidth <= 720;
    const targetsRailItem = step.selector && step.selector.startsWith('[data-view=');
    if (isMobileWidth){
      const rail = document.getElementById("railNav");
      const scrim = document.getElementById("railScrim");
      if (targetsRailItem){
        if (rail) rail.classList.add("mobile-open");
        if (scrim) scrim.classList.add("show");
      } else if (rail && rail.classList.contains("mobile-open")){
        // Moved on to a step that doesn't need the rail — close it so it
        // doesn't sit open and block the rest of the tour's target(s).
        rail.classList.remove("mobile-open");
        if (scrim) scrim.classList.remove("show");
      }
    }

    const overlay = document.createElement("div");
    overlay.id = "spotlightOverlay";
    overlay.className = "spotlight-overlay";
    document.body.appendChild(overlay);

    const target = step.selector ? document.querySelector(step.selector) : null;
    const isLast = this._tourIndex === steps.length - 1;

    const positionCallout = () => {
      const callout = overlay.querySelector(".spotlight-callout");
      const ring = overlay.querySelector(".spotlight-ring");
      if (!target){
        // No specific element — center the card in the viewport.
        callout.style.left = "50%"; callout.style.top = "50%";
        callout.style.transform = "translate(-50%, -50%)";
        if (ring) ring.style.display = "none";
        return;
      }
      const rect = target.getBoundingClientRect();
      if (ring){
        ring.style.left = (rect.left - 6) + "px";
        ring.style.top = (rect.top - 6) + "px";
        ring.style.width = (rect.width + 12) + "px";
        ring.style.height = (rect.height + 12) + "px";
      }
      // Prefer placing the callout to the right of the target (rail items
      // are on the left edge); fall back to below if there isn't room.
      // Either way, clamp the final left position so the callout's right
      // edge can never extend past the viewport — on a narrow phone the
      // "space to the right" branch is rarely taken, but the fallback
      // branch alone doesn't account for the callout's own width pushing
      // off-screen, which is what this clamp fixes.
      const calloutWidth = Math.min(280, window.innerWidth - 24);
      const clampLeft = (desired) => Utils.clamp(desired, 12, Math.max(12, window.innerWidth - calloutWidth - 12));
      const spaceRight = window.innerWidth - rect.right;
      if (spaceRight > 300){
        callout.style.left = clampLeft(rect.right + 16) + "px";
        callout.style.top = Math.max(12, rect.top - 8) + "px";
        callout.style.transform = "none";
      } else {
        callout.style.left = clampLeft(rect.left) + "px";
        callout.style.top = (rect.bottom + 12) + "px";
        callout.style.transform = "none";
      }
    };

    overlay.innerHTML = `
      ${target ? `<div class="spotlight-ring"></div>` : ""}
      <div class="spotlight-callout">
        <div style="font-size:var(--fs-2xs);color:var(--text-tertiary);margin-bottom:4px">Step ${this._tourIndex + 1} of ${steps.length}</div>
        <div style="font-weight:600;font-size:var(--fs-sm);margin-bottom:6px">${Utils.escapeHtml(step.title)}</div>
        <div style="font-size:var(--fs-xs);color:var(--text-secondary);line-height:1.5;margin-bottom:14px">${Utils.escapeHtml(step.body)}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <button class="btn btn-ghost btn-sm" id="spotlightSkipBtn">Skip tour</button>
          <button class="btn btn-primary btn-sm" id="spotlightNextBtn">${isLast ? "Done" : "Next"}</button>
        </div>
      </div>`;

    positionCallout();
    this._spotlightReposition = positionCallout;
    window.addEventListener("resize", this._spotlightReposition);

    overlay.querySelector("#spotlightSkipBtn").addEventListener("click", () => this._endSpotlightTour());
    overlay.querySelector("#spotlightNextBtn").addEventListener("click", () => {
      if (isLast){ this._endSpotlightTour(); return; }
      this._tourIndex++;
      this._renderSpotlightStep();
    });
  },

  // True tour-termination cleanup (Skip, or Done on the final step) —
  // distinct from _closeSpotlight(), which _renderSpotlightStep() also
  // calls between every step transition and must NOT close the mobile
  // rail drawer there, or it would flicker shut/open between consecutive
  // rail-targeting steps.
  _endSpotlightTour(){
    this._closeSpotlight();
    if (window.innerWidth <= 720) this._closeMobileNav();
  }
};
