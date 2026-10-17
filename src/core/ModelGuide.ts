// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { TokenEstimator } from "./TokenEstimator";
import { CONFIG } from "./CONFIG";
import { FormatConverter } from "./FormatConverter";

/* ============================================================================
   MODEL GUIDE — static per-model prompting idiom reference (CONFIG.MODEL_IDIOMS)
   plus the "wrap sections in XML tags" transform for Claude-style prompts.
   The transform reuses FormatConverter's existing section-extraction so it
   stays consistent with how the app already understands prompt structure.
   ============================================================================ */
export const ModelGuide = {
  idiomsFor(modelId){
    const model = TokenEstimator.getModel(modelId);
    return CONFIG.MODEL_IDIOMS[model.idiomKey] || CONFIG.MODEL_IDIOMS.generic;
  },

  // Wrap detected sections in XML tags, e.g. "Role:\n...text..." becomes
  // "<role>\n...text...\n</role>". Non-destructive: caller decides whether
  // to apply the result, matching the existing format-convert confirm flow.
  wrapInXML(body, fromFormat){
    const sections = FormatConverter.extractSections(body, fromFormat || "text");
    return sections.map(s => {
      const tag = s.label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "section";
      return `<${tag}>\n${s.content}\n</${tag}>`;
    }).join("\n\n");
  },

  // "Adapt for model X" — a fuller structural port than wrapInXML alone,
  // built entirely from existing, already-tested primitives
  // (FormatConverter's section extraction + its to*() renderers) rather
  // than new bespoke rendering logic. Purely local text restructuring —
  // no rewriting of the actual wording, matching the app's non-generative,
  // rule-based approach everywhere else. Non-destructive: returns the
  // adapted text for the caller to preview and confirm before applying.
  adaptForModel(body, fromFormat, modelId){
    const model = TokenEstimator.getModel(modelId);
    const sections = FormatConverter.extractSections(body, fromFormat || "text");
    if (!sections.length) return body;

    if (model.idiomKey === "claude"){
      // Claude idiom: XML-tag structuring, constraints placed early
      // (directly after Role/Context) rather than buried at the end,
      // since Claude is trained to track XML section boundaries and
      // benefits from constraints being visible before the task detail.
      const reordered = ModelGuide._moveSectionsEarly(sections, ["constraints", "constraint"]);
      return reordered.map(s => {
        const tag = s.label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "section";
        return `<${tag}>\n${s.content}\n</${tag}>`;
      }).join("\n\n");
    }

    if (model.idiomKey === "openai"){
      // GPT idiom: markdown headers are a reliable structural signal, and
      // a Role section maps naturally onto a "System" framing since these
      // models draw a stronger line between system-level instruction and
      // task content than a flat text prompt implies.
      const renamed = sections.map(s => {
        if (/^role$/i.test(s.label.trim())) return { ...s, label: "System" };
        return s;
      });
      return FormatConverter.toMarkdown(renamed);
    }

    if (model.idiomKey === "gemini"){
      // Gemini idiom: explicit labeled sections (already the app's default
      // text format) plus a leading length/scope reminder, since large
      // context windows tend to invite longer-than-needed responses.
      const hasOutput = sections.some(s => /output/i.test(s.label));
      const withReminder = hasOutput ? sections : [...sections, { label: "Output Format", content: "Keep the response focused and no longer than necessary for the task." }];
      return FormatConverter.toText(withReminder);
    }

    // Generic/Llama fallback: the app's own plain labeled-section format is
    // already the most portable structure across providers — nothing to
    // transform, just confirm section labels are present and normalized.
    return FormatConverter.toText(sections);
  },

  // Moves any section whose label matches one of `keywords` (case-
  // insensitive substring match) to just after the first section, without
  // reordering anything else. Used by the Claude adaptation to bring
  // constraints forward; kept generic in case a future idiom needs the
  // same "pull this section earlier" primitive.
  _moveSectionsEarly(sections, keywords){
    if (sections.length < 2) return sections;
    const matches = (label) => keywords.some(k => label.toLowerCase().includes(k));
    const early = [];
    const rest = [];
    sections.forEach((s, i) => {
      if (i > 0 && matches(s.label)) early.push(s); else rest.push(s);
    });
    if (!early.length) return sections;
    return [rest[0], ...early, ...rest.slice(1)];
  }
};
