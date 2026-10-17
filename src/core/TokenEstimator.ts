// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "./CONFIG";
import { RealTokenizer } from "./RealTokenizer";
import { Utils } from "./Utils";

/* ============================================================================
   TOKEN ESTIMATOR — per-model token/cost estimation. All figures are local
   heuristics (a chars-per-token ratio calibrated per tokenizer family) rather
   than a real tokenizer, and are always labeled as estimates in the UI. No
   network call is ever made to compute these — everything here is arithmetic
   over CONFIG.MODELS, which ships with the app.
   ============================================================================ */
export const TokenEstimator = {
  getModel(id){ return CONFIG.MODELS.find(m => m.id === id) || CONFIG.MODELS[CONFIG.MODELS.length - 1]; },

  // Builds a flat option list with interspersed group-header markers for
  // Dropdown._openFor — every "Model & tokens" picker in the app (Editor
  // side panel, Settings default-model) calls this instead of mapping
  // CONFIG.MODELS directly, so a model added anywhere lands in the right
  // group everywhere automatically. Models are grouped by their `group`
  // field (falls back to vendor, set by _loadCustomModels for older custom
  // models); groups are ordered by first appearance in CONFIG.MODELS so
  // built-in groups (Claude, GPT, Gemini, Llama) stay in a stable, familiar
  // order with custom groups appended after.
  groupedModelOptions(){
    const groups = [];
    const byGroup = new Map();
    for (const m of CONFIG.MODELS){
      const g = m.group || m.vendor || "Other";
      if (!byGroup.has(g)){ byGroup.set(g, []); groups.push(g); }
      byGroup.get(g).push(m);
    }
    const opts = [];
    for (const g of groups){
      // A lone single-model group (e.g. "Claude" with just one entry today)
      // still gets its header — consistent grouping reads better than
      // some models floating above any heading while others sit under one.
      opts.push({ isGroupHeader: true, label: g });
      for (const m of byGroup.get(g)){
        opts.push({ value: m.id, label: m.label, indent: true });
      }
    }
    return opts;
  },

  // Ensures the real tokenizer's vocab is loading in the background as soon
  // as anything asks for a count. Cheap and idempotent — safe to call from
  // every render.
  warmRealTokenizer(){ RealTokenizer.warm(); },

  // True when this model's count comes from the exact cl100k_base BPE
  // tokenizer rather than the chars-per-token heuristic. UI surfaces should
  // use this to label counts "exact" vs "estimate" rather than guessing.
  isExact(modelId){
    const model = TokenEstimator.getModel(modelId);
    return model.tokenizer === "cl100k" && RealTokenizer.isReady();
  },

  // True when this model *would* be exact once the vocab finishes loading —
  // used to show a "loading real tokenizer…" state instead of silently
  // falling back, so the person isn't misled into thinking an estimate is
  // the final answer.
  isPendingExact(modelId){
    const model = TokenEstimator.getModel(modelId);
    return model.tokenizer === "cl100k" && !RealTokenizer.isReady() && !RealTokenizer.isFailed();
  },

  estimateTokens(text, modelId){
    const model = TokenEstimator.getModel(modelId);
    if (model.tokenizer === "cl100k"){
      TokenEstimator.warmRealTokenizer();
      const exact = RealTokenizer.countTokens(text || "");
      if (exact !== null) return exact;
      // Vocab still loading or failed to load — heuristic fallback only
      // until it's ready; callers check isExact()/isPendingExact() to know
      // which case they're in.
    }
    const len = (text || "").length;
    if (!len) return 0;
    return Math.max(1, Math.round(len / model.charsPerToken));
  },

  // Cost for a single call: promptTokens billed at priceIn, an assumed
  // completion size billed at priceOut. completionTokens defaults to a
  // rough 25% of prompt size (a reasonable middle ground for a raw estimate,
  // clearly labeled as such wherever shown) since actual completion length
  // is unknowable ahead of a real API call.
  estimateCost(text, modelId, completionTokens){
    const model = TokenEstimator.getModel(modelId);
    const promptTokens = TokenEstimator.estimateTokens(text, modelId);
    const compTokens = completionTokens != null ? completionTokens : Math.round(promptTokens * 0.25);
    const cost = (promptTokens / 1e6) * model.priceIn + (compTokens / 1e6) * model.priceOut;
    return { promptTokens, completionTokens: compTokens, cost, model };
  },

  contextStatus(text, modelId){
    const model = TokenEstimator.getModel(modelId);
    const tokens = TokenEstimator.estimateTokens(text, modelId);
    const pct = Utils.clamp((tokens / model.contextWindow) * 100, 0, 999);
    let level = "ok";
    if (pct >= 95) level = "over";
    else if (pct >= 70) level = "warn";
    return { tokens, limit: model.contextWindow, pct, level };
  }
};
