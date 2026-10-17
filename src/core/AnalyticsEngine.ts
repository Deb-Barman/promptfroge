// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "./Utils";

/* ============================================================================
   ANALYTICS ENGINE — aggregate stats for Dashboard + Analytics views.
   ============================================================================ */
export class AnalyticsEngine {
  constructor(promptEngine, suggestionEngine){
    this.pe = promptEngine;
    this.se = suggestionEngine;
  }

  summary(){
    const prompts = this.pe.listPrompts({ includeArchived: true });
    const active = prompts.filter(p => !p.archived);
    const templates = this.pe.listTemplates();
    const snippets = this.pe.listSnippets();
    const totalWords = active.reduce((sum, p) => sum + Utils.countWords(p.body), 0);
    const avgLen = active.length ? Math.round(totalWords / active.length) : 0;
    const favorites = active.filter(p => p.favorite);

    const byCategory = {};
    for (const p of active) byCategory[p.category] = (byCategory[p.category] || 0) + 1;

    // Activity: prompts touched per day, last 14 days
    const days = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--){
      const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const dayStart = d.getTime(), dayEnd = dayStart + 86400000;
      const count = active.filter(p => p.updatedAt >= dayStart && p.updatedAt < dayEnd).length;
      days.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), count, date: dayStart });
    }

    return {
      totalPrompts: active.length,
      totalTemplates: templates.length,
      totalSnippets: snippets.length,
      totalWords,
      avgLen,
      favoriteCount: favorites.length,
      byCategory,
      activity: days,
      topWords: this.se.topWords(20)
    };
  }
}
