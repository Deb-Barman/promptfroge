// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "./Utils";
import { TemplateEngine } from "./TemplateEngine";
import { ScoringProfiles } from "./ScoringProfiles";
import { CONFIG } from "./CONFIG";

/* ============================================================================
   ANALYZER — rule-based prompt scoring & issue detection. No AI call is made;
   every signal below is a local heuristic over the raw text. Also powers the
   Prompt Improver (turns detected gaps into concrete suggestions) and the
   Prompt DNA strand (presence/strength per structural block).
   ============================================================================ */
export const Analyzer = {
  // Cue phrases used to detect whether a structural element is *present*
  // anywhere in the text, independent of the Visual Builder's block system —
  // this lets free-form prompts written in the Editor still get scored.
  CUES: {
    role: /\b(?:you are|act as|as an? (?:expert|professional|senior|certified)|your role is|assume the (?:role|persona) of)\b/i,
    context: /\b(?:context:|background:|given that|here is (?:some|the) (?:context|background)|for context)/i,
    task: /\b(?:task:|your task is|please (?:write|create|generate|build|analyze|summarize|extract|translate|design|review|explain)|i need you to|i want you to)/i,
    constraints: /\b(?:constraints?:|constraint|must not|do not|avoid|limit|no more than|at least|under \d+|only use|restrict|shall not|forbidden|never)/i,
    output: /\b(?:output format:?|output:|respond (?:with|in)|format:|return (?:a|as|the)|answer (?:in|as)|reply (?:in|with)|as (?:json|a table|a list|markdown|bullet points))/i,
    examples: /\b(?:examples?:|for example|e\.g\.|input:.*output:|here(?:'s| is) an example)/i
  },

  analyze(text, profileId){
    const raw = text || "";
    const words = Utils.tokenize(raw);
    const wordCount = words.length;
    const sentences = raw.split(Utils.SENTENCE_SPLIT).filter(s => s.trim());
    const issues = [];

    const has = {};
    for (const key in Analyzer.CUES) has[key] = Analyzer.CUES[key].test(raw);
    // Sub-signal within "constraints": distinguishes prohibition phrasing
    // (must not, avoid, never, forbidden) from requirement phrasing (must,
    // should, required, at least) — purely informational, additive to the
    // existing has.constraints boolean and never affects scoring, so this
    // can't change any existing score math.
    has.mustNotConstraints = /\b(?:must not|do not|don't|avoid|never|forbidden|shall not|no more than|restrict(?:ed)?)\b/i.test(raw);
    has.mustConstraints = /\b(?:must(?!\s*not)|should|required?|at least|only use|has to|need to)\b/i.test(raw);

    /* --- Clarity: shorter, plainer sentences score higher; heavy vagueness hurts --- */
    const vagueWords = (raw.match(/\b(something|somehow|stuff|things|handle|improve|better|nice|good|various|etc\.?|maybe|sort of|kind of)\b/gi) || []).length;
    const avgSentenceLen = sentences.length ? wordCount / sentences.length : 0;
    let clarity = 100;
    if (avgSentenceLen > 28) clarity -= 20;
    else if (avgSentenceLen > 20) clarity -= 10;
    clarity -= Utils.clamp(vagueWords * 8, 0, 40);
    if (wordCount < 6) clarity -= 30;
    clarity = Utils.clamp(clarity, 0, 100);
    if (vagueWords > 0) issues.push({ level: "warn", msg: `${vagueWords} vague word${vagueWords>1?"s":""} detected (e.g. "handle", "improve") — replace with specifics.` });

    /* --- Context --- */
    let context = has.context ? 85 : 30;
    if (!has.context && wordCount > 40) context = 45; // long prompts often smuggle context in without a label
    if (!has.context) issues.push({ level: "warn", msg: "No explicit context/background section detected." });

    /* --- Specificity: numbers, named formats, concrete nouns push this up --- */
    const hasNumbers = /\d/.test(raw);
    const hasQuotedTerms = /["'“][^"'”]{2,40}["'”]/.test(raw);
    let specificity = 40;
    if (hasNumbers) specificity += 20;
    if (hasQuotedTerms) specificity += 15;
    if (has.output) specificity += 15;
    if (wordCount > 15) specificity += 10;
    specificity = Utils.clamp(specificity, 0, 100);

    /* --- Structure: role/task/output all present = well structured --- */
    let structure = 20;
    if (has.role) structure += 20;
    if (has.task) structure += 25;
    if (has.output) structure += 20;
    if (has.constraints) structure += 15;
    structure = Utils.clamp(structure, 0, 100);
    if (!has.role) issues.push({ level: "warn", msg: "No role/persona assigned — consider 'You are a ...' for domain-sensitive tasks." });
    if (!has.task) issues.push({ level: "error", msg: "No clear task instruction detected." });

    /* --- Constraints --- */
    const constraints = has.constraints ? 80 : 20;
    if (!has.constraints) issues.push({ level: "warn", msg: "No constraints specified — output shape/length/tone may be unpredictable." });

    /* --- Output definition --- */
    const output = has.output ? 90 : 15;
    if (!has.output) issues.push({ level: "error", msg: "No output format specified — the model has to guess the shape of the response." });

    /* --- Completeness: composite of the structural cues found --- */
    const cueCount = Object.values(has).filter(Boolean).length;
    const completeness = Utils.clamp(Math.round((cueCount / 6) * 100), 0, 100);

    /* --- Ambiguity: inverse of clarity + vague word density + undefined variables --- */
    const undefinedVars = TemplateEngine.extractVariables(raw);
    let ambiguity = Utils.clamp(100 - clarity + vagueWords * 5, 0, 100);
    if (undefinedVars.length){
      ambiguity = Utils.clamp(ambiguity + undefinedVars.length * 8, 0, 100);
      issues.push({ level: "warn", msg: `${undefinedVars.length} undefined template variable${undefinedVars.length>1?"s":""}: ${undefinedVars.slice(0,4).map(v=>"{{"+v+"}}").join(", ")}${undefinedVars.length>4?"…":""}` });
    }

    /* --- Repeated / conflicting instruction detection --- */
    const seenSentences = new Map();
    for (const s of sentences){
      const norm = Utils.normalizeForCompare(s).trim();
      if (norm.length < 8) continue;
      seenSentences.set(norm, (seenSentences.get(norm) || 0) + 1);
    }
    const repeats = Array.from(seenSentences.values()).filter(c => c > 1).length;
    if (repeats > 0) issues.push({ level: "warn", msg: `${repeats} repeated instruction${repeats>1?"s":""} detected — duplicate sentences can dilute emphasis.` });

    const conflictPairs = [
      [/\bbe (extremely|very) (detailed|thorough|comprehensive)\b/i, /\b(under|no more than|at most)\s+\d{1,3}\s*words?\b/i],
      [/\balways\b/i, /\bnever\b/i],
      [/\bmust\b/i, /\boptional(ly)?\b/i]
    ];
    let conflicts = 0;
    for (const [a, b] of conflictPairs) if (a.test(raw) && b.test(raw)) conflicts++;
    if (conflicts > 0) issues.push({ level: "error", msg: "Potentially conflicting instructions detected (e.g. exhaustive detail + a tight word limit)." });

    if (wordCount > 0 && wordCount < 5) issues.push({ level: "error", msg: "Prompt is extremely short — the model has very little to work with." });

    if (!issues.length){
      issues.push({ level: "ok", msg: "No structural issues detected — this prompt covers the core elements." });
    }

    const scores = { clarity, context, specificity, structure, constraints, output, completeness, ambiguity: 100 - ambiguity };
    // Weight set is selectable via ScoringProfiles; "default" carries the
    // exact original numbers, so omitting profileId reproduces the
    // pre-upgrade score bit-for-bit.
    const w = ScoringProfiles.get(profileId).weights;
    const overall = Math.round(
      scores.clarity * w.clarity + scores.context * w.context + scores.specificity * w.specificity +
      scores.structure * w.structure + scores.constraints * w.constraints + scores.output * w.output + scores.ambiguity * w.ambiguity
    );

    return { scores, overall: Utils.clamp(overall, 0, 100), issues, has, wordCount, undefinedVars, profileId: profileId || "default" };
  },

  // Prompt DNA presence map — one entry per BLOCK_TYPE, strength 0-1, used to
  // size each segment of the strand visualization.
  // Returns an ordered array of { id, label, color, strength } — one entry
  // per structural element actually present or possible. Built-in block
  // types always appear (even at strength 0, so the strand shows what's
  // missing); custom blocks the user added via the Builder are appended
  // after, in the order they appear in `blocks`, since there's no fixed
  // slot for them to occupy.
  dnaProfile(text, blocks){
    const raw = text || "";
    const entries = [];
    if (blocks && blocks.length){
      // Authored via Builder: presence is exact, strength ~ text length (capped).
      for (const type of CONFIG.BLOCK_TYPES){
        const block = blocks.find(b => b.type === type.id);
        const len = block && block.text ? block.text.trim().length : 0;
        entries.push({ id: type.id, label: type.label, color: type.color, strength: len ? Utils.clamp(0.35 + len / 240, 0.35, 1) : 0 });
      }
      // Custom sections the user added — always "present" if they exist at
      // all (they were deliberately created), strength still scales with
      // how much was written so an empty custom section still reads as thin.
      for (const block of blocks){
        if (!block.type || !block.type.startsWith("custom_")) continue;
        const len = block.text ? block.text.trim().length : 0;
        entries.push({ id: block.type, label: block.label || "Custom Section", color: block.color || "var(--accent-violet)", strength: Utils.clamp(0.35 + len / 240, 0.15, 1) });
      }
      return entries;
    }
    // Free-form text: infer via cue regexes (subset also used by analyze()).
    const inferCues = {
      role: Analyzer.CUES.role, context: Analyzer.CUES.context, task: Analyzer.CUES.task,
      constraints: Analyzer.CUES.constraints, output: Analyzer.CUES.output, examples: Analyzer.CUES.examples
    };
    for (const type of CONFIG.BLOCK_TYPES){
      const re = inferCues[type.id];
      entries.push({ id: type.id, label: type.label, color: type.color, strength: re && re.test(raw) ? 0.75 : 0 });
    }
    // objective/instructions/input/evaluation/edgecases have no cheap free-form
    // cue set distinct from task/constraints — leave at 0 unless authored via Builder.
    return entries;
  },

  // Rule-based improvement suggestions — never claims to be AI-generated.
  improve(text){
    const result = Analyzer.analyze(text);
    const suggestions = [];
    if (!result.has.role) suggestions.push({ title: "Add a role", detail: "Open with 'You are a [specific expert]...' to calibrate vocabulary and judgment." });
    if (!result.has.context) suggestions.push({ title: "Add context", detail: "State the background the model needs — audience, existing constraints, prior state." });
    if (!result.has.task) suggestions.push({ title: "State the task explicitly", detail: "Lead with a direct instruction: 'Write...', 'Analyze...', 'Extract...'." });
    if (!result.has.constraints) suggestions.push({ title: "Add constraints", detail: "Specify length, tone, format restrictions, or things to avoid." });
    if (!result.has.output) suggestions.push({ title: "Define the output format", detail: "Say exactly what shape the answer should take — list, JSON, table, word count." });
    if (result.scores.clarity < 60) suggestions.push({ title: "Reduce vague language", detail: "Replace words like 'better', 'handle', 'improve' with concrete criteria." });
    if (result.wordCount < 8) suggestions.push({ title: "Expand the prompt", detail: "Very short prompts leave too much to guesswork — add at least a role, task, and format." });
    if (result.undefinedVars.length) suggestions.push({ title: "Fill in template variables", detail: `${result.undefinedVars.length} variable(s) are still unfilled placeholders.` });
    return suggestions;
  },

  // Produce HTML-escaped, span-wrapped markup for the editor's transparent
  // overlay layer. Dispatches by format — "text" (default) keeps the
  // original block-header/{{variable}}/comment/constraint highlighter;
  // json/xml/markdown use dedicated single-pass tokenizers below so a
  // token is never re-scanned after being wrapped (which previously caused
  // double-nested spans and content inside strings getting re-highlighted).
  highlight(text, format){
    const fmt = format || "text";
    if (fmt === "json") return Analyzer._highlightJSON(text);
    if (fmt === "xml") return Analyzer._highlightXML(text);
    if (fmt === "markdown") return Analyzer._highlightMarkdown(text);
    return Analyzer._highlightText(text);
  },

  _highlightText(text){
    const raw = text || "";
    const headerNames = CONFIG.BLOCK_TYPES.map(b => b.label).join("|");
    const headerRe = new RegExp(`^(\\s*)(${headerNames})(:)`, "gm");
    const varRe = /\{\{\s*[\p{L}\p{M}\p{N}_]+\s*\}\}/gu;
    const commentRe = /^(\s*#.*)$/gm;
    const constraintRe = /\b(must not|never|do not|forbidden|avoid|no more than|at least|only use|shall not)\b/gi;

    // Escape first, then re-insert span tags by walking the string once and
    // marking ranges — simplest correct approach: escape, then run each
    // regex against the escaped text since none of the patterns above can
    // match across an HTML-escaped boundary (&, <, >, " all sit outside the
    // characters these regexes look for).
    let escaped = Utils.escapeHtml(raw);
    escaped = escaped.replace(commentRe, '<span class="hl-comment">$1</span>');
    escaped = escaped.replace(headerRe, '$1<span class="hl-header">$2$3</span>');
    escaped = escaped.replace(varRe, (m) => `<span class="hl-var">${m}</span>`);
    escaped = escaped.replace(constraintRe, '<span class="hl-constraint">$1</span>');
    return escaped;
  },

  // Single-pass JSON tokenizer: walks the raw text once, classifying each
  // token as it's encountered. A quoted string is classified as a "key" only
  // if a colon follows it (after whitespace) — otherwise it's a value string.
  // Single-pass means a token is never re-scanned after being wrapped, which
  // is what makes this safe against both double-nesting and re-highlighting
  // things (like a number) that appear inside an already-emitted string span.
  _highlightJSON(text){
    const raw = text || "";
    let out = "";
    let i = 0;
    const n = raw.length;
    while (i < n){
      const c = raw[i];
      if (c === '"'){
        let j = i + 1;
        while (j < n && raw[j] !== '"'){
          if (raw[j] === "\\") j++;
          j++;
        }
        j = Math.min(j + 1, n);
        const strTok = raw.slice(i, j);
        let k = j;
        while (k < n && /\s/.test(raw[k])) k++;
        const isKey = raw[k] === ":";
        out += `<span class="${isKey ? "hl-json-key" : "hl-json-string"}">${Utils.escapeHtml(strTok)}</span>`;
        i = j;
      } else if (/[{}\[\],:]/.test(c)){
        out += `<span class="hl-json-punct">${Utils.escapeHtml(c)}</span>`;
        i++;
      } else if (/-|\d/.test(c) && /^-?\d/.test(raw.slice(i))){
        const m = raw.slice(i).match(/^-?\d+\.?\d*(?:[eE][+-]?\d+)?/);
        out += `<span class="hl-json-number">${Utils.escapeHtml(m[0])}</span>`;
        i += m[0].length;
      } else if (/[a-zA-Z]/.test(c) && /^(true|false|null)\b/.test(raw.slice(i))){
        const m = raw.slice(i).match(/^(true|false|null)/);
        out += `<span class="hl-json-keyword">${Utils.escapeHtml(m[0])}</span>`;
        i += m[0].length;
      } else {
        out += Utils.escapeHtml(c);
        i++;
      }
    }
    return out;
  },

  // Single-pass XML tokenizer: comments, tags (name + attributes), and text
  // nodes are each emitted as a small self-contained escaped+wrapped chunk,
  // never leaving a span open across an iteration boundary.
  _highlightXML(text){
    const raw = text || "";
    let out = "";
    let i = 0;
    const n = raw.length;
    while (i < n){
      if (raw.slice(i, i + 4) === "<!--"){
        let end = raw.indexOf("-->", i);
        end = end === -1 ? n : end + 3;
        out += `<span class="hl-xml-comment">${Utils.escapeHtml(raw.slice(i, end))}</span>`;
        i = end;
        continue;
      }
      if (raw[i] === "<"){
        let end = raw.indexOf(">", i);
        end = end === -1 ? n : end + 1;
        const tag = raw.slice(i, end);
        const isClosing = tag[1] === "/";
        const isSelfClose = tag.endsWith("/>");
        const nameMatch = tag.match(/^<\/?\s*([a-zA-Z_][\w:.-]*)/);
        const tagName = nameMatch ? nameMatch[1] : "";
        let attrRegion = "";
        if (nameMatch){
          const afterName = tag.indexOf(nameMatch[0]) + nameMatch[0].length;
          const trailingLen = isSelfClose ? 2 : 1;
          attrRegion = tag.slice(afterName, tag.length - trailingLen);
        }
        let attrHtml = "";
        const attrRe = /([a-zA-Z_][\w:.-]*)(\s*=\s*)("[^"]*"|'[^']*')/g;
        let lastIdx = 0, m;
        while ((m = attrRe.exec(attrRegion))){
          attrHtml += Utils.escapeHtml(attrRegion.slice(lastIdx, m.index));
          attrHtml += `<span class="hl-xml-attr">${Utils.escapeHtml(m[1])}</span>${Utils.escapeHtml(m[2])}<span class="hl-xml-attr-val">${Utils.escapeHtml(m[3])}</span>`;
          lastIdx = m.index + m[0].length;
        }
        attrHtml += Utils.escapeHtml(attrRegion.slice(lastIdx));
        out += `${Utils.escapeHtml("<")}${isClosing ? Utils.escapeHtml("/") : ""}<span class="hl-xml-tag">${Utils.escapeHtml(tagName)}</span>${attrHtml}${Utils.escapeHtml(isSelfClose ? "/>" : ">")}`;
        i = end;
        continue;
      }
      let next = raw.indexOf("<", i);
      next = next === -1 ? n : next;
      out += Utils.escapeHtml(raw.slice(i, next));
      i = next;
    }
    return out;
  },

  // Line-based Markdown highlighter: block constructs (headers, quotes,
  // fenced code, list markers) are detected per-line first, then inline
  // patterns (bold/italic/code/links) are applied within non-block lines.
  _highlightMarkdown(text){
    const raw = text || "";
    const lines = raw.split("\n");
    let inFence = false;
    const out = lines.map(line => {
      const escLine = Utils.escapeHtml(line);
      if (/^```/.test(line)){ inFence = !inFence; return `<span class="hl-md-fence">${escLine}</span>`; }
      if (inFence) return `<span class="hl-md-code-block">${escLine}</span>`;
      if (/^#{1,6}\s/.test(line)) return `<span class="hl-md-header">${escLine}</span>`;
      if (/^>\s?/.test(line)) return `<span class="hl-md-quote">${escLine}</span>`;
      let l = escLine;
      l = l.replace(/^(\s*)([-*+]|\d+\.)(\s)/, (m, ind, marker, sp) => `${ind}<span class="hl-md-list">${marker}</span>${sp}`);
      l = l.replace(/`([^`]+)`/g, (m, code) => `<span class="hl-md-code">\`${code}\`</span>`);
      l = l.replace(/\*\*([^*]+)\*\*/g, (m, b) => `<span class="hl-md-bold">**${b}**</span>`);
      l = l.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (m, it) => `<span class="hl-md-italic">*${it}*</span>`);
      l = l.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, txt, url) => `<span class="hl-md-link">[${txt}](${url})</span>`);
      return l;
    });
    return out.join("\n");
  }
};
