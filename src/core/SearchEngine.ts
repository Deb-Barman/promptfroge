// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "./Utils";
import { CONFIG } from "./CONFIG";

/* ============================================================================
   SEARCH ENGINE — cross-entity search over prompts/templates/snippets/history.
   Simple substring + token-overlap scoring; fast enough for thousands of
   records since it's a linear scan over in-memory Maps, no DB round-trip.
   ============================================================================ */
export class SearchEngine {
  constructor(promptEngine){ this.pe = promptEngine; }

  search(query, { types = ["prompts","templates","snippets"], limit = 30 } = {}){
    const q = (query || "").trim().toLowerCase();
    if (!q) return [];
    const qTokens = Utils.tokenize(q);
    const results = [];

    if (types.includes("prompts")){
      for (const p of this.pe.listPrompts({ includeArchived: true })){
        const hay = `${p.title} ${p.body} ${(p.tags||[]).join(" ")} ${p.category}`.toLowerCase();
        const score = SearchEngine._score(hay, q, qTokens);
        if (score > 0) results.push({ kind: "prompt", id: p.id, title: p.title || "Untitled prompt", snippet: Utils.truncate(p.body, 120), score, record: p });
      }
    }
    if (types.includes("templates")){
      for (const t of this.pe.listTemplates()){
        const hay = `${t.name} ${t.body}`.toLowerCase();
        const score = SearchEngine._score(hay, q, qTokens);
        if (score > 0) results.push({ kind: "template", id: t.id, title: t.name || "Untitled template", snippet: Utils.truncate(t.body, 120), score, record: t });
      }
    }
    if (types.includes("snippets")){
      for (const s of this.pe.listSnippets()){
        const hay = `${s.trigger} ${s.body}`.toLowerCase();
        const score = SearchEngine._score(hay, q, qTokens);
        if (score > 0) results.push({ kind: "snippet", id: s.id, title: s.trigger, snippet: Utils.truncate(s.body, 120), score, record: s });
      }
    }
    if (types.includes("patterns")){
      for (const pat of CONFIG.PATTERNS){
        const hay = `${pat.name} ${pat.purpose} ${pat.when}`.toLowerCase();
        const score = SearchEngine._score(hay, q, qTokens);
        if (score > 0) results.push({ kind: "pattern", id: pat.id, title: pat.name, snippet: pat.purpose, score, record: pat });
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  static _score(haystack, rawQuery, qTokens){
    let score = 0;
    if (haystack.includes(rawQuery)) score += 10;
    let tokensMatched = 0;
    for (const t of qTokens){ if (haystack.includes(t)){ score += 2; tokensMatched++; } }
    // A multi-word query is a person typing several specific words they
    // remember — matching only some of them (e.g. "seeded" and "prompt"
    // out of "seeded prompt 005") isn't really a match, just two common
    // words shared by every similarly-titled record. Require every token
    // to hit once there's more than one; a single-word query keeps the
    // original loose, forgiving behavior since there's nothing to compare
    // it against.
    if (qTokens.length > 1 && tokensMatched < qTokens.length) return 0;
    return score;
  }

  // Related prompts by content similarity — used in the Editor's side panel.
  relatedTo(promptId, text, limit = 5){
    const candidates = this.pe.listPrompts().filter(p => p.id !== promptId && p.body);
    return candidates
      .map(p => ({ prompt: p, sim: Utils.textSimilarity(text, p.body) }))
      .filter(r => r.sim > 0.06)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, limit);
  }
}
