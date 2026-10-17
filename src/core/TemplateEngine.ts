// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "./CONFIG";

/* ============================================================================
   TEMPLATE ENGINE — {{variable}} detection, rendering, and default block
   composition for the Visual Builder.
   ============================================================================ */
export const TemplateEngine = {
  // Original bare-name pattern — kept as VAR_RE so every existing caller
  // (extractVariables's name-only return shape, hasUnfilledVariables, any
  // external code relying on this exact property) keeps working unchanged.
  VAR_RE: /\{\{\s*([\p{L}\p{M}\p{N}_]+)\s*\}\}/gu,

  // Extended pattern: {{name}}, {{name:type}}, {{name:select:a|b|c}},
  // {{name=default}}, {{name:type=default}}. A plain {{name}} still matches
  // this pattern too (type/default groups are simply undefined), so this is
  // a strict superset of VAR_RE — nothing that matched before stops matching.
  VAR_SPEC_RE: /\{\{\s*([\p{L}\p{M}\p{N}_]+)(?::([a-zA-Z]+)(?::([^=}]+))?)?(?:=([^}]*))?\s*\}\}/gu,

  // Parses one {{...}} spec into a structured descriptor. type defaults to
  // "text" (a plain single-line input) when no :type is given — this is
  // exactly what a bare {{var}} has always behaved as, so old templates
  // render with the same input type they always got.
  _parseSpec(name, type, optionsRaw, defaultVal){
    const spec = { name, type: (type || "text").toLowerCase(), default: defaultVal !== undefined ? defaultVal : "" };
    if (spec.type === "select"){
      spec.options = optionsRaw ? optionsRaw.split("|").map(o => o.trim()).filter(Boolean) : [];
      if (!spec.options.length) spec.type = "text"; // malformed :select with no options -> safe fallback
    }
    if (!["text","number","multiline","select"].includes(spec.type)) spec.type = "text"; // unknown type -> safe fallback
    return spec;
  },

  // Rich variable descriptors (name/type/options/default), de-duplicated by
  // name in first-seen order — the shape the Fill-in-template modal and the
  // typed-input renderer use. This is the extended, additive API; existing
  // code should keep using extractVariables()'s plain name-array shape.
  extractVariableSpecs(body){
    if (!body) return [];
    const seen = new Set();
    const out = [];
    let m;
    const re = new RegExp(TemplateEngine.VAR_SPEC_RE.source, "gu");
    while ((m = re.exec(body))){
      const [, name, type, optionsRaw, defaultVal] = m;
      if (!seen.has(name)){
        seen.add(name);
        out.push(TemplateEngine._parseSpec(name, type, optionsRaw, defaultVal));
      }
    }
    return out;
  },

  extractVariables(body){
    // Delegates to extractVariableSpecs so {{var:number}} etc. are also
    // recognized as variables needing a value — but keeps returning the
    // exact same flat name-array shape every existing caller expects.
    return TemplateEngine.extractVariableSpecs(body).map(spec => spec.name);
  },

  render(body, values){
    if (!body) return "";
    return body.replace(new RegExp(TemplateEngine.VAR_SPEC_RE.source, "gu"), (full, name, type, optionsRaw, defaultVal) => {
      const v = values[name];
      if (v !== undefined && v !== null && v !== "") return v;
      // Fall back to the spec's own default= when the caller supplied
      // nothing for this variable, rather than leaving the raw {{...}} in
      // place — this is new behavior but strictly additive: a spec with no
      // default behaves exactly as before (falls through to the raw text).
      if (defaultVal !== undefined && defaultVal !== "") return defaultVal;
      return full;
    });
  },

  hasUnfilledVariables(body){
    // Fresh non-global regex: testing with the shared /g regex kept lastIndex between calls,
    // so the same text alternated true/false on consecutive calls.
    return new RegExp(TemplateEngine.VAR_RE.source, "u").test(body || "");
  },

  humanizeVarName(name){
    return name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  },

  // Compose a single prompt body from an ordered array of block objects,
  // used by the Visual Builder. Skips empty blocks; labels each non-empty
  // one. Custom blocks carry their own `label` (set when the user created
  // the section) rather than being looked up in CONFIG.BLOCK_TYPES.
  composeFromBlocks(blocks){
    const labelMap = Object.fromEntries(CONFIG.BLOCK_TYPES.map(b => [b.id, b.label]));
    return blocks
      .filter(b => b.text && b.text.trim())
      .map(b => `${b.label || labelMap[b.type] || b.type}:\n${b.text.trim()}`)
      .join("\n\n");
  },

  // Look up display metadata for a block. Built-in types resolve from
  // CONFIG.BLOCK_TYPES by id; a custom block (type starts with "custom_")
  // carries its own label/color directly on the block object, since it has
  // no entry in CONFIG.BLOCK_TYPES to look up.
  blockMeta(typeId, block){
    if (block && typeId && typeId.startsWith("custom_")){
      return { id: typeId, label: block.label || "Custom Section", color: block.color || "var(--accent-violet)", placeholder: "Write this section..." };
    }
    return CONFIG.BLOCK_TYPES.find(b => b.id === typeId) || CONFIG.BLOCK_TYPES[CONFIG.BLOCK_TYPES.length - 1];
  },

  // "Extract variables" — scans a FINISHED, plain prompt (no {{}} yet) for
  // spans that look like the concrete specifics someone would swap out
  // when turning a one-off prompt into a reusable template: quoted
  // strings, standalone numbers, and short Capitalized-Phrase spans (a
  // likely proper noun / product name / specific term). This is a
  // deliberately honest heuristic, not semantic understanding — it flags
  // CANDIDATES for the user to accept or skip, never auto-applies anything.
  detectParameterizableSpans(body){
    if (!body || !body.trim()) return [];
    // Dedup key is the lowercased text itself, GLOBAL across all three
    // detectors below — not scoped per-kind — so the same span caught by
    // more than one detector (e.g. a quoted AND title-cased phrase like
    // "Wireless Headphones Pro") shows up once, not twice. Quoted strings
    // are the most confident signal, so they're collected first and win
    // when a later detector would otherwise re-flag the same text.
    const seen = new Set();
    const candidates = [];

    // Quoted strings: 'like this' or "like this" — almost always a
    // concrete example value, name, or literal the author would want to
    // swap per use.
    const quoteRe = /"([^"\n]{2,60})"|'([^'\n]{2,60})'/g;
    let m;
    while ((m = quoteRe.exec(body))){
      const val = m[1] || m[2];
      const key = val.toLowerCase();
      if (!seen.has(key) && val.trim()){ seen.add(key); candidates.push({ text: val, kind: "quoted", index: m.index }); }
    }

    // Standalone numbers with at least 2 digits (word counts, limits,
    // versions, years) — short 1-digit numbers are too often structural
    // (list markers, minor counts) to be worth flagging.
    const numRe = /\b\d{2,}\b/g;
    while ((m = numRe.exec(body))){
      const val = m[0];
      const key = val.toLowerCase();
      if (!seen.has(key)){ seen.add(key); candidates.push({ text: val, kind: "number", index: m.index }); }
    }

    // Short Capitalized Phrase spans (1-4 title-case words in a row) not
    // at the very start of a sentence — a decent proxy for a proper noun,
    // product name, or specific named entity worth parameterizing.
    // Deliberately excludes known structural header words (Role, Task,
    // Context, etc.) so it doesn't flag the prompt's own section labels.
    const headerWords = new Set(CONFIG.BLOCK_TYPES.map(b => b.label.toLowerCase()));
    const capRe = /(?<!^|\. )\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})\b/gm;
    while ((m = capRe.exec(body))){
      const val = m[1];
      const key = val.toLowerCase();
      const firstWord = val.split(/\s+/)[0].toLowerCase();
      if (seen.has(key) || headerWords.has(firstWord)) continue;
      seen.add(key);
      candidates.push({ text: val, kind: "phrase", index: m.index });
    }

    return candidates.sort((a, b) => a.index - b.index);
  },

  // Applies a chosen set of {text -> variableName} replacements to a body,
  // turning each literal occurrence of `text` into {{variableName}}.
  // Replaces ALL occurrences of each literal (not just the first), so a
  // repeated proper noun becomes the same variable everywhere it appears.
  applyExtractedVariables(body, replacements){
    let result = body;
    for (const { text, varName } of replacements){
      if (!text || !varName) continue;
      const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escaped, "g"), `{{${varName}}}`);
    }
    return result;
  }
};
