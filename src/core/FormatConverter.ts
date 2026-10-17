// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "./CONFIG";
import { TemplateEngine } from "./TemplateEngine";
import { Utils } from "./Utils";

/* ============================================================================
   FORMAT CONVERTER — one-click conversion between the four prompt formats.
   Converts via a shared intermediate representation: an ordered list of
   { label, content } sections. Text/Markdown -> sections by detecting
   "Label:" headers (reusing Analyzer's block-label vocabulary) or Markdown
   "## Label" headers; JSON/XML -> sections by reading top-level key/value
   pairs or top-level child elements. Converting INTO Text/Markdown/JSON/XML
   then renders those same sections back out in the target syntax.
   This is honest about its scope: it restructures whatever sections it can
   detect — it does not invent content, rewrite prose, or use any AI call.
   ============================================================================ */
export const FormatConverter = {
  // ---- extraction: format -> sections ----
  _sectionsFromText(text){
    const raw = text || "";
    const headerNames = CONFIG.BLOCK_TYPES.map(b => b.label).join("|");
    const re = new RegExp(`^(${headerNames})\\s*:\\s*\\n?`, "gm");
    const parts = raw.split(re);
    // split() with a capturing group interleaves [preamble, label, body, label, body, ...]
    const sections = [];
    if (parts[0] && parts[0].trim()) sections.push({ label: "Notes", content: parts[0].trim() });
    for (let i = 1; i < parts.length; i += 2){
      const label = parts[i];
      const body = (parts[i + 1] || "").trim();
      if (label) sections.push({ label, content: body });
    }
    return sections.length ? sections : [{ label: "Notes", content: raw.trim() }];
  },

  _sectionsFromMarkdown(text){
    const raw = text || "";
    const lines = raw.split("\n");
    const sections = [];
    let current = null;
    for (const line of lines){
      const m = line.match(/^#{1,3}\s+(.+)/);
      if (m){
        if (current) sections.push(current);
        current = { label: m[1].trim(), content: "" };
      } else if (current){
        current.content += (current.content ? "\n" : "") + line;
      } else {
        if (line.trim()){
          if (!sections.length || sections[sections.length-1].label !== "Notes") sections.push({ label: "Notes", content: line });
          else sections[sections.length-1].content += "\n" + line;
        }
      }
    }
    if (current) sections.push(current);
    sections.forEach(s => s.content = s.content.trim());
    return sections.length ? sections : [{ label: "Notes", content: raw.trim() }];
  },

  _sectionsFromJSON(text){
    try {
      const obj = JSON.parse(text || "{}");
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return [{ label: "Notes", content: String(text || "").trim() }];
      return Object.entries(obj).map(([k, v]) => ({
        label: TemplateEngine.humanizeVarName(k),
        content: typeof v === "string" ? v : JSON.stringify(v, null, 2)
      }));
    } catch(e){
      return [{ label: "Notes", content: (text || "").trim() }];
    }
  },

  _sectionsFromXML(text){
    try {
      const doc = new DOMParser().parseFromString(text || "<root></root>", "application/xml");
      if (doc.querySelector("parsererror")) return [{ label: "Notes", content: (text || "").trim() }];
      const root = doc.documentElement;
      const sections = [];
      for (const child of Array.from(root.children)){
        sections.push({ label: TemplateEngine.humanizeVarName(child.tagName), content: (child.textContent || "").trim() });
      }
      if (!sections.length && root.textContent.trim()) sections.push({ label: TemplateEngine.humanizeVarName(root.tagName), content: root.textContent.trim() });
      return sections.length ? sections : [{ label: "Notes", content: (text || "").trim() }];
    } catch(e){
      return [{ label: "Notes", content: (text || "").trim() }];
    }
  },

  extractSections(text, fromFormat){
    if (fromFormat === "json") return FormatConverter._sectionsFromJSON(text);
    if (fromFormat === "xml") return FormatConverter._sectionsFromXML(text);
    if (fromFormat === "markdown") return FormatConverter._sectionsFromMarkdown(text);
    return FormatConverter._sectionsFromText(text);
  },

  // ---- rendering: sections -> format ----
  _slugify(label){
    return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
  },

  toText(sections){
    return sections.map(s => `${s.label}:\n${s.content}`).join("\n\n");
  },
  toMarkdown(sections){
    return sections.map(s => `## ${s.label}\n${s.content}`).join("\n\n");
  },
  toJSON(sections){
    const obj = {};
    for (const s of sections) obj[FormatConverter._slugify(s.label)] = s.content;
    return JSON.stringify(obj, null, 2);
  },
  toXML(sections){
    const body = sections.map(s => {
      const tag = FormatConverter._slugify(s.label);
      const esc = Utils.escapeHtml(s.content);
      return `  <${tag}>${esc}</${tag}>`;
    }).join("\n");
    return `<prompt>\n${body}\n</prompt>`;
  },

  // Full conversion: text in `fromFormat` -> text in `toFormat`.
  convert(text, fromFormat, toFormat){
    if (fromFormat === toFormat) return text;
    const sections = FormatConverter.extractSections(text, fromFormat);
    if (toFormat === "json") return FormatConverter.toJSON(sections);
    if (toFormat === "xml") return FormatConverter.toXML(sections);
    if (toFormat === "markdown") return FormatConverter.toMarkdown(sections);
    return FormatConverter.toText(sections);
  }
};
