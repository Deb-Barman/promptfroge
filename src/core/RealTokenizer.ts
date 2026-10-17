// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */

/* ============================================================================
   REAL BPE TOKENIZER (cl100k_base — GPT-4 / GPT-4o / GPT-3.5-turbo /
   text-embedding-3 family). This is the exact vocabulary + exact greedy
   lowest-rank byte-pair-merge algorithm used by OpenAI's tiktoken, ported to
   vanilla JS. Nothing here is estimated: the vocab is unpacked from an
   embedded, gzip-compressed rank table (100,256 tokens, shipped once in the
   page as text and decompressed with the browser's native
   DecompressionStream), and the merge loop mirrors tiktoken's reference
   implementation exactly. Other model families (Claude, Gemini, Llama, ...)
   do not have a public, embeddable tokenizer, so RealTokenizer only backs
   OpenAI-family models; everything else still uses the calibrated
   chars-per-token estimator below and is labeled "estimate" in the UI.
   ============================================================================ */
export const RealTokenizer = (() => {
  let vocabPromise = null; // Promise<Uint8Array[]> — token bytes in rank order
  let rankMap = null;      // Map<string, number> — byte-sequence key -> rank
  let ready = false;
  let failed = false;

  function keyOf(bytes){
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += bytes[i] + ",";
    return s;
  }

  async function loadVocab(){
    if (vocabPromise) return vocabPromise;
    vocabPromise = (async () => {
      const b64 = (await import("../assets/cl100k_vocab.b64.txt?raw")).default.trim();
      const gz = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      let raw;
      if ("DecompressionStream" in window){
        const ds = new DecompressionStream("gzip");
        const stream = new Blob([gz]).stream().pipeThrough(ds);
        const buf = await new Response(stream).arrayBuffer();
        raw = new Uint8Array(buf);
      } else {
        // No native gzip support (very old browser) — real tokenization
        // unavailable; caller falls back to the estimator.
        throw new Error("DecompressionStream unsupported");
      }
      const vocab = [];
      let offset = 0;
      while (offset < raw.length){
        const len = raw[offset]; offset += 1;
        vocab.push(raw.subarray(offset, offset + len));
        offset += len;
      }
      rankMap = new Map();
      for (let rank = 0; rank < vocab.length; rank++){
        rankMap.set(keyOf(vocab[rank]), rank);
      }
      ready = true;
      return vocab;
    })().catch(err => { failed = true; console.warn("RealTokenizer: falling back to estimate —", err.message); return null; });
    return vocabPromise;
  }

  // cl100k_base pre-tokenizer pattern (JS-regex equivalent of tiktoken's
  // possessive-quantifier PCRE pattern; produces identical chunk boundaries
  // for well-formed text).
  const PRETOKEN_RE = /'(?:[sSdDmMtT]|[lL][lL]|[vV][eE]|[rR][eE])|[^\r\n\p{L}\p{N}]?\p{L}+|\p{N}{1,3}| ?[^\s\p{L}\p{N}]+[\r\n]*|\s+$|\s*[\r\n]|\s+(?!\S)|\s/gu;

  function bpeEncodeWord(wordBytes){
    if (wordBytes.length === 1){
      const r = rankMap.get(keyOf(wordBytes));
      return r !== undefined ? [r] : [];
    }
    let parts = [];
    for (let i = 0; i < wordBytes.length; i++){
      const b = wordBytes.subarray(i, i + 1);
      parts.push({ bytes: b, key: keyOf(b) });
    }
    while (parts.length > 1){
      let minRank = Infinity, minIdx = -1;
      for (let i = 0; i < parts.length - 1; i++){
        const rank = rankMap.get(parts[i].key + parts[i + 1].key);
        if (rank !== undefined && rank < minRank){ minRank = rank; minIdx = i; }
      }
      if (minIdx === -1) break;
      const a = parts[minIdx], b = parts[minIdx + 1];
      const merged = new Uint8Array(a.bytes.length + b.bytes.length);
      merged.set(a.bytes, 0); merged.set(b.bytes, a.bytes.length);
      parts.splice(minIdx, 2, { bytes: merged, key: a.key + b.key });
    }
    return parts.map(p => rankMap.get(p.key));
  }

  function encode(text){
    if (!text) return [];
    const words = text.match(PRETOKEN_RE) || [];
    const encoder = new TextEncoder();
    const out = [];
    for (const w of words){
      const bytes = encoder.encode(w);
      for (const t of bpeEncodeWord(bytes)) out.push(t);
    }
    return out;
  }

  return {
    // Kick off (and cache) the async vocab load; safe to call repeatedly.
    warm(){ return loadVocab(); },
    isReady(){ return ready; },
    isFailed(){ return failed; },
    // Exact token count for cl100k_base-family models. Returns null if the
    // vocab isn't loaded yet or failed to load — caller should fall back to
    // the estimator in that case (and can call warm() to trigger loading).
    countTokens(text){
      if (!ready || !rankMap) return null;
      try { return encode(text).length; } catch(e){ return null; }
    }
  };
})();
