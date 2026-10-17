// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "./CONFIG";
import { Utils } from "./Utils";

/* ============================================================================
   VALIDATOR — per-format content validation for the editor's status line.
   JSON uses the browser's real JSON.parse (authoritative, gives exact
   line/column on failure). XML uses DOMParser, which reports a parsererror
   element on malformed input — also authoritative rather than hand-rolled.
   Text and Markdown are permissive by nature and always report valid.
   ============================================================================ */
/* ============================================================================
   JSON IMPORTER — parses pasted or uploaded JSON into prompt/template/pattern
   records for the "Import" option alongside New Prompt / New Template / Add
   Pattern. Accepts a single object OR an array of objects (for bulk import),
   is tolerant of key-name casing and stray whitespace in keys (real pasted
   JSON is often imperfect), and NEVER touches the network — this only reads
   text the user already has (pasted or from a local file they picked).
   ============================================================================ */
export const JSONImporter = {
  // Field aliases per record "kind" — each target field maps to a list of
  // acceptable source key names, matched case-insensitively and with
  // surrounding whitespace stripped from the source key first (so a key
  // literally written as " Tags" in someone's pasted JSON still matches).
  FIELD_ALIASES: {
    prompt: {
      title: ["title", "name"],
      category: ["category", "cat"],
      tags: ["tags", "tag"],
      body: ["prompt", "body", "text", "content"]
    },
    template: {
      name: ["title", "name"],
      category: ["category", "cat"],
      body: ["prompt", "body", "text", "template", "content"]
    },
    pattern: {
      name: ["title", "name"],
      category: ["category", "cat"],
      purpose: ["purpose", "description", "desc"],
      when: ["when", "when_to_use", "whentouse"],
      template: ["prompt", "body", "text", "template", "content"],
      example: ["example", "sample"]
    },
    model: {
      label: ["label", "name", "model"],
      vendor: ["vendor", "provider", "company"],
      group: ["group", "family", "series"],
      contextWindow: ["contextwindow", "context_window", "context", "contextlength", "context_length", "tokens", "maxtokens", "max_tokens"],
      priceIn: ["pricein", "price_in", "inputprice", "input_price", "promptprice", "prompt_price"],
      priceOut: ["priceout", "price_out", "outputprice", "output_price", "completionprice", "completion_price"],
      priceNote: ["pricenote", "price_note", "note", "notes"]
    },
    structure: {
      name: ["name", "title", "label"],
      blocks: ["blocks", "sections", "fields", "structure"]
    }
  },

  // Normalizes one raw parsed object's keys: trims whitespace and
  // lowercases every key so lookups below are forgiving of exactly the
  // kind of imperfect JSON a person hand-writes or copies from elsewhere.
  _normalizeKeys(obj){
    const out = {};
    for (const rawKey in obj){
      const key = rawKey.trim().toLowerCase();
      out[key] = obj[rawKey];
    }
    return out;
  },

  _pickField(normalized, aliasList){
    for (const alias of aliasList){
      if (alias in normalized && normalized[alias] != null) return normalized[alias];
    }
    return "";
  },

  // Parses raw JSON text into an array of normalized records for the given
  // kind ("prompt" | "template" | "pattern"). Accepts a bare object (single
  // record) or an array (bulk). Throws a short, human-readable Error on
  // invalid JSON or an unusable shape — callers show this directly to the
  // user rather than a raw JS parse error.
  parse(text, kind){
    let data;
    try {
      data = JSON.parse(text);
    } catch(e){
      throw new Error("That doesn't look like valid JSON — check for a missing comma, bracket, or quote.");
    }
    const records = Array.isArray(data) ? data : [data];
    if (!records.length) throw new Error("No records found in that JSON.");
    const aliases = JSONImporter.FIELD_ALIASES[kind];
    if (!aliases) throw new Error("Unknown import kind: " + kind);

    return records.map((rec, i) => {
      if (typeof rec !== "object" || rec === null || Array.isArray(rec)){
        throw new Error(`Record ${i + 1} isn't a JSON object — each entry in the array must be { ... }.`);
      }
      const normalized = JSONImporter._normalizeKeys(rec);
      const out = {};
      for (const field in aliases) out[field] = JSONImporter._pickField(normalized, aliases[field]);
      // Tags: accept either a real JSON array (["a","b"]) or a
      // comma-separated string ("a, b"), since both are plausible for
      // hand-written JSON.
      if ("tags" in out){
        if (Array.isArray(out.tags)) out.tags = out.tags.map(t => String(t).trim()).filter(Boolean);
        else if (typeof out.tags === "string") out.tags = out.tags.split(",").map(t => t.trim()).filter(Boolean);
        else out.tags = [];
      }
      // Model records carry numeric fields that a hand-written or
      // AI-generated JSON blob might supply as strings ("1000000") —
      // coerce them so downstream code can rely on them being numbers.
      if (kind === "model"){
        out.contextWindow = Math.max(1, parseInt(out.contextWindow, 10) || 32000);
        out.priceIn = Math.max(0, parseFloat(out.priceIn) || 0);
        out.priceOut = Math.max(0, parseFloat(out.priceOut) || 0);
        if (!out.label) throw new Error(`Record ${i + 1} is missing a model name ("label" or "name").`);
      }
      // Structure "blocks" can arrive as a simple array of section-name
      // strings (["Role","Context","Action","Style"] — the natural shape
      // someone hand-writes or asks an AI to generate) or as fuller
      // {type,label,color} objects (round-tripping this app's own export).
      // Normalize both into the same shape the builder canvas expects.
      if (kind === "structure"){
        if (!out.name) throw new Error(`Record ${i + 1} is missing a structure name ("name" or "title").`);
        if (!Array.isArray(out.blocks) || !out.blocks.length) throw new Error(`Structure "${out.name}" needs a non-empty "blocks" list.`);
        out.blocks = out.blocks.map(b => {
          if (typeof b === "string"){
            const label = b.trim();
            const builtin = CONFIG.BLOCK_TYPES.find(bt => bt.label.toLowerCase() === label.toLowerCase() || bt.id === label.toLowerCase());
            return builtin ? { type: builtin.id } : { type: "custom_" + Utils.uid(""), label, color: "var(--accent-violet)" };
          }
          const typeStr = String(b.type || b.id || b.label || "").trim();
          const builtin = CONFIG.BLOCK_TYPES.find(bt => bt.id === typeStr.toLowerCase() || bt.label.toLowerCase() === typeStr.toLowerCase());
          if (builtin && !b.label) return { type: builtin.id };
          return { type: b.type && b.type.startsWith("custom_") ? b.type : "custom_" + Utils.uid(""), label: b.label || typeStr || "Section", color: b.color || "var(--accent-violet)" };
        });
      }
      return out;
    });
  },

  // Reads a File object (from an <input type="file"> selection) as text.
  // Local file read only — never a network request.
  readFile(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Couldn't read that file."));
      reader.readAsText(file);
    });
  }
};
