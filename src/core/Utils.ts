// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */

/* ============================================================================
   UTILS
   ============================================================================ */
export const Utils = {
  uid(prefix){
    return (prefix ? prefix + "_" : "") + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  },
  escapeHtml(str){
    if (str == null) return "";
    return String(str).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  },
  // Normalises user text before it is persisted. It must NEVER alter meaningful
  // content: this app edits prompts, and prompts are full of <xml-tags>, HTML code
  // samples and comparisons like "a < b and c > d". The original implementation
  // stripped everything between "<" and ">" on every save, silently destroying XML
  // prompts and any text around a "<". Security does not depend on it: every view
  // escapes on output (Utils.escapeHtml, enforced by tests/fuzz.test.ts) and the
  // production CSP forbids inline script. So this only drops characters that are
  // never legitimate text (NUL and other C0 control characters, lone surrogates)
  // and normalises Windows line endings.
  sanitizeText(str){
    if (str == null) return "";
    return String(str)
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
  },
  // Sentence boundaries for Latin (. ! ?), Devanagari/Bengali (। ॥) and CJK (。！？) text.
  SENTENCE_SPLIT: /(?:(?<=[.!?\u0964\u0965])\s+|(?<=[\u3002\uFF01\uFF1F])\s*)/,
  // Lower-case letters/digits in ANY script, for similarity and duplicate checks.
  normalizeForCompare(str){
    return String(str || "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  },
  clamp(n, min, max){ return Math.max(min, Math.min(max, n)); },
  countWords(str){
    if (!str) return 0;
    const m = str.trim().match(/\S+/g);
    return m ? m.length : 0;
  },
  countChars(str){ return str ? str.length : 0; },
  truncate(str, n){
    if (!str) return "";
    return str.length > n ? str.slice(0, n).trimEnd() + "\u2026" : str;
  },
  timeAgo(ts){
    if (!ts) return "";
    const diff = Date.now() - ts;
    const min = 60000, hr = 3600000, day = 86400000;
    if (diff < 45000) return "just now";
    // floor, not round: 59.6 minutes used to print "60m ago" and 23.7 hours "24h ago".
    if (diff < hr) return Math.max(1, Math.floor(diff / min)) + "m ago";
    if (diff < day) return Math.floor(diff / hr) + "h ago";
    if (diff < day * 30) return Math.floor(diff / day) + "d ago";
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  },
  formatClock(){
    return new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  },
  formatDate(ts){
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  },
  debounce(fn, ms){
    let t;
    return function(...args){ clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  },
  // Tokenize into lowercase word list, stripping punctuation but keeping
  // internal apostrophes/hyphens so "don't" and "step-by-step" survive.
  tokenize(str){
    if (!str) return [];
    // Unicode-aware (letters, combining marks, digits in any script) — the original
    // [a-z0-9] pattern produced zero tokens for Bengali, Hindi, Arabic, CJK, Cyrillic
    // and split accented words ("café" -> "caf").
    return (str.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'\u2019-]*/gu)) || [];
  },
  // Jaccard-ish similarity over token sets — cheap, dependency-free, good
  // enough for "related prompts" ranking at the scale this app runs at.
  textSimilarity(a, b){
    const ta = new Set(Utils.tokenize(a));
    const tb = new Set(Utils.tokenize(b));
    if (!ta.size || !tb.size) return 0;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    const union = ta.size + tb.size - inter;
    return union === 0 ? 0 : inter / union;
  },
  // Word-level LCS-based diff for two strings, split into add/remove/same runs.
  diffWords(oldStr, newStr){
    const a = (oldStr || "").split(/(\s+)/);
    const b = (newStr || "").split(/(\s+)/);
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--){
      for (let j = m - 1; j >= 0; j--){
        dp[i][j] = a[i] === b[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
      }
    }
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m){
      if (a[i] === b[j]){ ops.push({ t: "same", v: a[i] }); i++; j++; }
      else if (dp[i+1][j] >= dp[i][j+1]){ ops.push({ t: "remove", v: a[i] }); i++; }
      else { ops.push({ t: "add", v: b[j] }); j++; }
    }
    while (i < n){ ops.push({ t: "remove", v: a[i] }); i++; }
    while (j < m){ ops.push({ t: "add", v: b[j] }); j++; }
    return ops;
  },
  download(filename, content, mime){
    const blob = new Blob([content], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },
  csvEscape(v){
    const s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  },
  onEnterOrSpace(e, fn){
    if (e.key === "Enter" || e.key === " "){ e.preventDefault(); fn(e); }
  }
};
