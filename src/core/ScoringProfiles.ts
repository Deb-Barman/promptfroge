// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "./CONFIG";

/* ============================================================================
   SCORING PROFILES — resolves a profile id to a weight set for Analyzer's
   overall score. "default" is byte-for-byte the original fixed weighting,
   so leaving this unselected reproduces the exact pre-upgrade score.
   ============================================================================ */
export const ScoringProfiles = {
  get(id){
    return CONFIG.SCORING_PROFILES.find(p => p.id === id) || CONFIG.SCORING_PROFILES[0];
  }
};
