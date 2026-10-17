// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "./Utils";

/* ============================================================================
   DUPLICATE FINDER — cross-library near-duplicate detection using the
   existing Utils.textSimilarity, grouped into clusters rather than pairs so
   the UI can show "these 3 prompts look similar" in one line.
   ============================================================================ */
export const DuplicateFinder = {
  // threshold tuned higher than SearchEngine.relatedTo's 0.06 "related"
  // threshold — this is meant to catch near-copies, not merely similar topics.
  findClusters(prompts, threshold = 0.55){
    const active = prompts.filter(p => p.body && p.body.trim().length > 20);
    const visited = new Set();
    const clusters = [];
    for (let i = 0; i < active.length; i++){
      if (visited.has(active[i].id)) continue;
      const group = [active[i]];
      for (let j = i + 1; j < active.length; j++){
        if (visited.has(active[j].id)) continue;
        if (Utils.textSimilarity(active[i].body, active[j].body) >= threshold){
          group.push(active[j]);
          visited.add(active[j].id);
        }
      }
      if (group.length > 1){
        visited.add(active[i].id);
        clusters.push(group);
      }
    }
    return clusters;
  }
};
