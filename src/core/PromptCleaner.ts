// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "./Utils";

/* ============================================================================
   PROMPT CLEANER — detects duplicate sentences, empty vars, broken template
   syntax, excessive whitespace. Separate from Analyzer because these are
   mechanical fixes rather than quality-scoring heuristics.
   ============================================================================ */
export const PromptCleaner = {
  inspect(text){
    const raw = text || "";
    const findings = [];

    const sentences = raw.split(Utils.SENTENCE_SPLIT).map(s => s.trim()).filter(Boolean);
    const seen = new Map();
    sentences.forEach((s, i) => {
      const norm = Utils.normalizeForCompare(s);
      if (norm.length < 8) return;
      if (!seen.has(norm)) seen.set(norm, []);
      seen.get(norm).push(i);
    });
    for (const [, idxs] of seen) if (idxs.length > 1) findings.push({ type: "duplicate_sentence", detail: `Sentence repeated ${idxs.length}x: "${Utils.truncate(sentences[idxs[0]], 60)}"` });

    if (/\s{3,}/.test(raw)) findings.push({ type: "whitespace", detail: "Excessive whitespace (3+ consecutive spaces) found." });
    if (/\n{4,}/.test(raw)) findings.push({ type: "whitespace", detail: "Excessive blank lines (3+ in a row) found." });

    const openBraces = (raw.match(/\{\{/g) || []).length;
    const closeBraces = (raw.match(/\}\}/g) || []).length;
    if (openBraces !== closeBraces) findings.push({ type: "broken_template", detail: `Unbalanced template braces: ${openBraces} "{{" vs ${closeBraces} "}}".` });
    if (/\{\{\s*\}\}/.test(raw)) findings.push({ type: "broken_template", detail: "Empty {{}} placeholder found." });

    const conflictPairs = [[/\balways\b/i, /\bnever\b/i], [/\bmust\b/i, /\boptional(ly)?\b/i]];
    for (const [a, b] of conflictPairs) if (a.test(raw) && b.test(raw)) findings.push({ type: "conflict", detail: "Conflicting absolute instructions detected (e.g. 'always' and 'never')." });

    return findings;
  },

  // Auto-fix what's mechanically safe to fix (whitespace only) — duplicate
  // sentences and conflicts need human judgment so they're reported, not auto-removed.
  autoClean(text){
    return (text || "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }
};
