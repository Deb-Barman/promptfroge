// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */

export const Validator = {
  validate(text, format){
    if (format === "json") return Validator._validateJSON(text);
    if (format === "xml") return Validator._validateXML(text);
    return { valid: true };
  },

  _validateJSON(text){
    const raw = (text || "").trim();
    if (!raw) return { valid: true }; // empty is not "invalid", just not-yet-written
    try {
      JSON.parse(raw);
      return { valid: true };
    } catch(e){
      return { valid: false, message: e.message };
    }
  },

  _validateXML(text){
    const raw = (text || "").trim();
    if (!raw) return { valid: true };
    try {
      const doc = new DOMParser().parseFromString(raw, "application/xml");
      const errorNode = doc.querySelector("parsererror");
      if (errorNode){
        // Browsers embed a human-readable message inside the parsererror
        // node's text content — extract the first line as a concise summary.
        const msg = (errorNode.textContent || "Malformed XML").split("\n").find(l => l.trim()) || "Malformed XML";
        return { valid: false, message: msg.trim() };
      }
      return { valid: true };
    } catch(e){
      return { valid: false, message: e.message || "Malformed XML" };
    }
  },

  // Checks whether PLAIN TEXT is safe to embed as a JSON STRING VALUE
  // (e.g. {"content": "<this prompt>"}) or inside a tool/function-call
  // description field — a different question from _validateJSON above,
  // which checks whether a prompt WRITTEN IN json format is itself valid
  // JSON. This instead flags characters in an ordinary prompt body that
  // would break or silently corrupt it once dropped into someone else's
  // JSON payload, so the problem surfaces here instead of downstream in a
  // production API call.
  checkJSONEmbedSafety(text){
    const raw = text || "";
    const issues = [];
    if (!raw.trim()) return issues;

    // Unescaped double quotes: JSON.stringify handles this automatically
    // when a caller actually uses it, but a person hand-assembling a
    // payload (or pasting into a tool-description field in some UI) often
    // doesn't — and a stray unescaped " silently truncates the string
    // value at that point for anyone who does.
    const quoteCount = (raw.match(/"/g) || []).length;
    if (quoteCount > 0){
      issues.push({
        id: "unescaped_quotes",
        level: "warn",
        label: `${quoteCount} double-quote character${quoteCount===1?'':'s'} found`,
        detail: "If this text is hand-assembled into a JSON string value rather than passed through JSON.stringify, unescaped \" characters will break or truncate the value."
      });
    }

    // Raw control characters (literal newlines/tabs/carriage returns) are
    // NOT valid inside a JSON string literal per spec — a JSON string can
    // only contain them as the escape sequences \n \t \r. Most JSON
    // encoders handle this invisibly, but this is exactly the class of
    // "worked in my test, broke via a different code path" bug.
    const hasRawNewline = /\n/.test(raw);
    const hasRawTab = /\t/.test(raw);
    if (hasRawNewline || hasRawTab){
      issues.push({
        id: "raw_control_chars",
        level: "info",
        label: `Contains raw ${[hasRawNewline && "newline", hasRawTab && "tab"].filter(Boolean).join(" and ")} characters`,
        detail: "Valid JSON strings require these as \\n / \\t escape sequences, not literal characters. Any standard JSON encoder handles this correctly — this is only a concern if the payload is being hand-assembled with string concatenation instead."
      });
    }

    // Unbalanced braces/brackets inside the prompt text itself can be a
    // sign the prompt contains a stray JSON-like fragment (e.g. a partial
    // example) that could confuse a downstream parser expecting the WHOLE
    // field to be exactly this prompt's text and nothing structural.
    const openBraces = (raw.match(/\{/g) || []).length, closeBraces = (raw.match(/\}/g) || []).length;
    if (openBraces !== closeBraces){
      issues.push({
        id: "unbalanced_braces",
        level: "info",
        label: `Unbalanced braces (${openBraces} \`{\` vs ${closeBraces} \`}\`)`,
        detail: "Not necessarily a problem for plain text, but worth a glance if this prompt is meant to also contain a JSON example — an unbalanced count usually means the example itself is incomplete."
      });
    }

    return issues;
  }
};
