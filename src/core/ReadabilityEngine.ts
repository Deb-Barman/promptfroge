// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "./Utils";

/* ============================================================================
   READABILITY ENGINE — Flesch Reading Ease + Flesch-Kincaid Grade Level.
   Syllable counts use a vowel-group heuristic (no dictionary needed, stays
   dependency-free like the rest of the app) — accurate for the large
   majority of English text, intentionally simple rather than perfect.
   ============================================================================ */
export const ReadabilityEngine = {
  countSyllables(word){
    const w = (word || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return 0;
    if (w.length <= 3) return 1;
    // Strip a silent trailing e (but not for words ending -le like "table").
    const stripped = w.replace(/e$/, "").replace(/^y/, "");
    const groups = stripped.match(/[aeiouy]+/g);
    let count = groups ? groups.length : 1;
    if (w.endsWith("le") && w.length > 2 && !"aeiouy".includes(w[w.length - 3])) count++;
    return Math.max(1, count);
  },

  analyze(text){
    const raw = text || "";
    const words = Utils.tokenize(raw);
    const sentences = raw.split(Utils.SENTENCE_SPLIT).filter(s => s.trim());
    const wordCount = words.length;
    const sentenceCount = Math.max(1, sentences.length);
    if (!wordCount) return { fleschScore: 0, gradeLevel: 0, avgSentenceLen: 0, avgWordLen: 0, syllablesPerWord: 0, label: "—" };

    const totalSyllables = words.reduce((sum, w) => sum + ReadabilityEngine.countSyllables(w), 0);
    const avgSentenceLen = wordCount / sentenceCount;
    const syllablesPerWord = totalSyllables / wordCount;
    const avgWordLen = words.reduce((sum, w) => sum + w.length, 0) / wordCount;

    const flesch = Utils.clamp(206.835 - 1.015 * avgSentenceLen - 84.6 * syllablesPerWord, 0, 100);
    const grade = Utils.clamp(0.39 * avgSentenceLen + 11.8 * syllablesPerWord - 15.59, 0, 18);

    let label = "Very difficult";
    if (flesch >= 90) label = "Very easy";
    else if (flesch >= 70) label = "Easy";
    else if (flesch >= 50) label = "Standard";
    else if (flesch >= 30) label = "Difficult";

    return {
      fleschScore: Math.round(flesch), gradeLevel: Math.round(grade * 10) / 10,
      avgSentenceLen: Math.round(avgSentenceLen * 10) / 10, avgWordLen: Math.round(avgWordLen * 10) / 10,
      syllablesPerWord: Math.round(syllablesPerWord * 100) / 100, label
    };
  }
};
