// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "./Utils";
import { STOPWORDS } from "./STOPWORDS";

/* ============================================================================
   SUGGESTION ENGINE — the learning autocomplete system.
   Builds a personal language model purely from the user's own saved prompts:
     - word frequency table (unigrams)
     - phrase table (2-4 word n-grams) with frequency + last-used timestamp
     - a prefix index so "You are an" -> matches phrases starting with those
       words and ranks continuations by (frequency, recency, length fit)
   Everything lives in memory, rebuilt from PromptEngine's data on load and
   incrementally updated as the user types/saves — never touches a server.
   ============================================================================ */
export class SuggestionEngine {
  constructor(promptEngine){
    this.pe = promptEngine;
    this.wordFreq = new Map();        // word -> { count, lastUsed }
    this.phraseFreq = new Map();      // "phrase text" -> { count, lastUsed, words:[...] }
    this.phrasesByFirstWord = new Map(); // firstWord -> [phrase keys]  (index for fast prefix lookup)
    this.MIN_PHRASE_LEN = 2;
    this.MAX_PHRASE_LEN = 5;
  }

  /* Rebuild the whole model from every saved prompt/template/snippet body.
     Cheap enough to run fully on load and after bulk import; incremental
     updates (learnFromText) handle the steady-state case of normal typing. */
  rebuildFromCorpus(){
    this.wordFreq.clear();
    this.phraseFreq.clear();
    this.phrasesByFirstWord.clear();
    const corpus = [
      ...this.pe.listPrompts({ includeArchived: true }).map(p => ({ text: p.body, ts: p.updatedAt })),
      ...this.pe.listTemplates().map(t => ({ text: t.body, ts: t.updatedAt })),
      ...this.pe.listSnippets().map(s => ({ text: s.body, ts: s.updatedAt }))
    ];
    for (const item of corpus){
      if (item.text) this.learnFromText(item.text, item.ts || Date.now());
    }
  }

  // Feed one piece of text into the model — called on every save, and can be
  // called repeatedly (e.g. as drafts autosave) without double-counting risk
  // beyond normal frequency accumulation, which is the desired behavior:
  // things the user writes often should rank higher.
  learnFromText(text, ts){
    if (!text || text.length < 2) return;
    const timestamp = ts || Date.now();
    // Split into sentences so phrases don't bridge across sentence boundaries
    // into nonsense combinations.
    const sentences = text.split(/(?<=[.!?\n])\s+/);
    for (const sentence of sentences){
      const words = Utils.tokenize(sentence);
      if (!words.length) continue;
      for (const w of words){
        if (w.length < 2) continue;
        const rec = this.wordFreq.get(w) || { count: 0, lastUsed: 0 };
        rec.count++; rec.lastUsed = Math.max(rec.lastUsed, timestamp);
        this.wordFreq.set(w, rec);
      }
      for (let len = this.MIN_PHRASE_LEN; len <= this.MAX_PHRASE_LEN; len++){
        for (let i = 0; i + len <= words.length; i++){
          const slice = words.slice(i, i + len);
          const key = slice.join(" ");
          const rec = this.phraseFreq.get(key) || { count: 0, lastUsed: 0, words: slice };
          rec.count++; rec.lastUsed = Math.max(rec.lastUsed, timestamp);
          this.phraseFreq.set(key, rec);
          if (!this.phrasesByFirstWord.has(slice[0])) this.phrasesByFirstWord.set(slice[0], new Set());
          this.phrasesByFirstWord.get(slice[0]).add(key);
        }
      }
    }
  }

  /* Core ranking function. cursorContext = the text immediately before the
     caret. Returns an array of { text, type, score, matchLen } suggestions,
     covering three modes at once:
       1. mid-word completion  ("prof" -> "professional")
       2. next-word prediction ("You are an " -> "expert")
       3. phrase continuation  ("You are an " -> "expert Python developer")
  */
  getSuggestions(cursorContext, limit = 8){
    if (!cursorContext) return [];
    const trailingSpace = /\s$/.test(cursorContext);
    const trimmed = cursorContext.replace(/\s+$/, "");
    const ctxWords = Utils.tokenize(trimmed);
    const now = Date.now();
    const results = [];

    if (!trailingSpace && ctxWords.length){
      // Mode 1: user is mid-word — complete the current word from vocabulary.
      const partial = ctxWords[ctxWords.length - 1];
      if (partial.length >= 1){
        for (const [word, rec] of this.wordFreq){
          if (word !== partial && word.startsWith(partial)){
            results.push({
              text: word, type: "word", matchLen: partial.length,
              score: this._score(rec.count, rec.lastUsed, now) 
            });
          }
        }
        // Also offer phrase completions whose first word matches the partial,
        // so "You are an ex" can still surface "expert Python developer".
        const priorWords = ctxWords.slice(0, -1);
        for (const [word, keys] of this.phrasesByFirstWord){
          if (word.startsWith(partial) && word !== partial){
            for (const key of keys){
              const rec = this.phraseFreq.get(key);
              if (!rec) continue;
              results.push({
                text: rec.words.join(" "), type: "phrase", matchLen: partial.length,
                score: this._score(rec.count, rec.lastUsed, now) * (rec.words.length > 1 ? 1.15 : 1)
              });
            }
          }
        }
      }
    } else if (ctxWords.length){
      // Mode 2/3: user just finished a word (trailing space) — predict what
      // comes next by finding phrases in the corpus whose leading words match
      // the tail of what's already been typed, longest match wins priority.
      const maxLookback = Math.min(this.MAX_PHRASE_LEN - 1, ctxWords.length);
      for (let lookback = maxLookback; lookback >= 1; lookback--){
        const tail = ctxWords.slice(ctxWords.length - lookback);
        const firstWord = tail[0];
        const candidateKeys = this.phrasesByFirstWord.get(firstWord);
        if (!candidateKeys) continue;
        for (const key of candidateKeys){
          const rec = this.phraseFreq.get(key);
          if (!rec || rec.words.length <= lookback) continue;
          const prefix = rec.words.slice(0, lookback);
          if (prefix.join(" ") !== tail.join(" ")) continue;
          const continuation = rec.words.slice(lookback).join(" ");
          if (!continuation) continue;
          results.push({
            text: continuation, type: "phrase", matchLen: 0,
            // Longer verified context match = much higher confidence continuation
            score: this._score(rec.count, rec.lastUsed, now) * (1 + lookback * 0.6)
          });
        }
        if (results.length >= limit * 2) break; // enough candidates from longest matches
      }
    }

    // Deduplicate by text (keep highest score), sort, cap to limit.
    const byText = new Map();
    for (const r of results){
      const existing = byText.get(r.text);
      if (!existing || r.score > existing.score) byText.set(r.text, r);
    }
    return Array.from(byText.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Ranking formula: current context (handled by caller matching) + frequency
  // + recency, blended so a frequent-but-old phrase and a rare-but-fresh one
  // both get fair consideration rather than one axis dominating.
  _score(count, lastUsed, now){
    const ageDays = Math.max(0, (now - lastUsed) / 86400000);
    const recencyWeight = 1 / (1 + ageDays / 14); // halves roughly every 2 weeks
    return count * (0.55 + 0.45 * recencyWeight);
  }

  topWords(n = 30){
    return Array.from(this.wordFreq.entries())
      .filter(([w]) => w.length > 2 && !STOPWORDS.has(w))
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, n)
      .map(([word, rec]) => ({ word, count: rec.count }));
  }
}
