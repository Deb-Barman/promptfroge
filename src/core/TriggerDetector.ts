// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "./CONFIG";

/* ============================================================================
   TRIGGER DETECTOR — the "/", "//", "///", "\", "\\" insertion-source family.
   Each prefix opens the same suggestion popup UI but pulls from a different
   content source. Detected independently of SnippetManager (which still
   owns the original single-"/trigger" snippet-expansion behavior) because
   these match on the PREFIX alone — the text after it is a live search
   query, not a fixed trigger word to match exactly.
     /   -> existing snippet expansion (unchanged, handled by SnippetManager)
     //  -> insert an existing saved prompt (search library by title/body)
     /// -> insert a pattern (built-in + custom, search by name/purpose)
     \   -> insert a template (search by name, keeps {{variables}} intact)
     \\  -> insert a block header (Role:, Context:, etc. — same as toolbar)
   ============================================================================ */
export const TriggerDetector = {
  // Matches 1-3 leading slashes OR 1-2 leading backslashes at the end of the
  // text-before-cursor, immediately preceded by start-of-string or whitespace
  // (so mid-word slashes like a URL's "https://" don't false-trigger), plus
  // whatever non-whitespace query text follows (may be empty).
  // Matches 1-3 leading slashes, 1-2 leading backslashes, or a single "@"
  // at the end of the text-before-cursor, immediately preceded by
  // start-of-string or whitespace (so mid-word slashes like a URL's
  // "https://" or an email's "@" don't false-trigger), plus whatever
  // non-whitespace query text follows (may be empty).
  detect(textBeforeCursor){
    const m = textBeforeCursor.match(/(^|\s)(\/{1,3}|\\{1,2}|@)([^\s]*)$/);
    if (!m) return null;
    return { prefix: m[2], query: m[3] || "", fullMatch: m[2] + (m[3] || "") };
  },

  kindForPrefix(prefix){
    return { "/": "snippet", "//": "prompt", "///": "pattern", "\\": "template", "\\\\": "block", "@": "link" }[prefix] || null;
  },

  // Returns up to `limit` candidate items for the given prefix+query, already
  // shaped as { label, text, src, replaceFrom } ready for the popup — the
  // caller only needs to set replaceFrom (depends on cursor position it has).
  candidatesFor(kind, query, { promptEngine, searchEngine } = {}){
    const q = (query || "").trim();
    if (kind === "prompt"){
      const prompts = promptEngine.listPrompts();
      const pool = q ? searchEngine.search(q, { types: ["prompts"], limit: 8 }).map(r => promptEngine.getPrompt(r.id)).filter(Boolean)
                      : prompts.slice().sort((a,b) => b.updatedAt - a.updatedAt).slice(0, 8);
      return pool.map(p => ({ label: p.title || "Untitled prompt", text: p.body, src: "prompt", meta: p.id }));
    }
    if (kind === "pattern"){
      const all = [...CONFIG.PATTERNS, ...promptEngine.listCustomPatterns()];
      const pool = q ? all.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || (p.purpose||"").toLowerCase().includes(q.toLowerCase())).slice(0, 8)
                      : all.slice(0, 8);
      return pool.map(p => ({ label: p.name, text: p.template, src: "pattern", meta: p.id }));
    }
    if (kind === "template"){
      const templates = promptEngine.listTemplates();
      const pool = q ? templates.filter(t => t.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
                      : templates.slice().sort((a,b) => b.updatedAt - a.updatedAt).slice(0, 8);
      return pool.map(t => ({ label: t.name || "Untitled template", text: t.body, src: "template", meta: t.id }));
    }
    if (kind === "block"){
      const q2 = q.toLowerCase();
      const pool = q2 ? CONFIG.BLOCK_TYPES.filter(b => b.id.startsWith(q2) || b.label.toLowerCase().startsWith(q2)) : CONFIG.BLOCK_TYPES;
      return pool.slice(0, 11).map(b => ({ label: b.label, text: b.label + ":\n", src: "block", meta: b.id }));
    }
    if (kind === "link"){
      const prompts = promptEngine.listPrompts();
      const pool = q ? searchEngine.search(q, { types: ["prompts"], limit: 8 }).map(r => promptEngine.getPrompt(r.id)).filter(Boolean)
                      : prompts.slice().sort((a,b) => b.updatedAt - a.updatedAt).slice(0, 8);
      // Unlike // (which pastes the target's full body as a one-time copy),
      // @ inserts a durable [[Title]] reference — the link persists as text
      // in the prompt body itself, so it survives saves/reloads without any
      // separate relational store, and openDateSearchModal-style scanning
      // at graph-build time is all that's needed to resolve it back to an id.
      return pool.map(p => ({ label: p.title || "Untitled prompt", text: `[[${p.title || "Untitled prompt"}]]`, src: "link", meta: p.id }));
    }
    return [];
  },

  _emptyHint(kind){
    return {
      prompt: "No saved prompts yet — write and save one first.",
      pattern: "No patterns match.",
      template: "No saved templates yet — create one in the Templates tab.",
      block: "No matching block type."
    }[kind] || "Nothing to show.";
  }
};
