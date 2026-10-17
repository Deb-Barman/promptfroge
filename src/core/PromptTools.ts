// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "./Utils";

/* ============================================================================
   PROMPT TOOLS — ten additional editor-toolbar transforms/checks. All rule-
   based and offline like the rest of the app's editor tools (Clean, Wrap
   XML, Adapt for...) — no model calls. Each returns either a transformed
   string (for one-click apply actions) or a findings array (for review-only
   actions), mirroring PromptCleaner/SecurityScanner's own split.
   ============================================================================ */
export const PromptTools = {
  // 1. SHORTEN — strips filler phrases and redundant qualifiers, merges
  // short choppy sentences. Conservative by design: only removes phrases
  // that are near-universally droppable without changing meaning, rather
  // than attempting real summarization (which would need a model).
  FILLER_PHRASES: [
    /\bplease (?:make sure to|be sure to|kindly)\b/gi,
    /\bit is important to (?:note that|remember that)\b/gi,
    /\bplease note that\b/gi, /\bkeep in mind that\b/gi,
    /\bas (?:previously|already) (?:mentioned|stated|noted)\b/gi,
    /\bfor your information\b/gi, /\bat this point in time\b/gi,
    /\bwith regard to\b/gi, /\bin terms of\b/gi,
    /\bbasically\b/gi, /\bactually\b/gi, /\bjust\b(?=\s)/gi,
    /\bvery\b(?=\s)/gi, /\breally\b(?=\s)/gi, /\bsimply\b(?=\s)/gi,
  ],
  shorten(text){
    let out = text || "";
    // Meaning-preserving substitutions run first, on the untouched original
    // sentence — "due to the fact that we need" -> "because we need" reads
    // fine; running it after blanket-stripping a phrase that shares words
    // with these (nothing does here, but future entries might) could leave
    // a dangling clause. Order matters more than it looks like it should.
    out = out
      .replace(/\bin order to\b/gi, "to")
      .replace(/\bdue to the fact that\b/gi, "because")
      .replace(/\bin the event that\b/gi, "if");
    for (const re of PromptTools.FILLER_PHRASES) out = out.replace(re, "");
    out = out
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    // Stripping a leading filler phrase can leave a sentence starting
    // lowercase ("In order to..." -> "to..."). Re-capitalize the first
    // letter after start-of-text and after sentence-ending punctuation.
    out = out.replace(/(^|[.!?]\s+)([a-z])/g, (m, pre, letter) => pre + letter.toUpperCase());
    return out;
  },

  // 2. BULLETIFY — turns a prose paragraph into a bulleted list by
  // splitting on sentence boundaries and imperative-verb starts. Skips
  // text that's already list-like (starts with -, *, or a number).
  bulletify(text){
    const lines = (text || "").split("\n");
    const out = [];
    for (const line of lines){
      const trimmed = line.trim();
      if (!trimmed || /^(?:[-*•]|\d+[.)])\s/.test(trimmed) || /:$/.test(trimmed)){
        out.push(line);
        continue;
      }
      const sentences = trimmed.split(Utils.SENTENCE_SPLIT).filter(s => s.trim());
      if (sentences.length >= 2){
        for (const s of sentences) out.push(`- ${s.trim()}`);
      } else {
        out.push(line);
      }
    }
    return out.join("\n");
  },

  // 3. CHAIN-OF-THOUGHT SCAFFOLD — appends a reasoning-steps instruction.
  // Model-aware phrasing: Claude/GPT respond well to explicit "show your
  // work" framing; kept as one shared block since the difference is
  // marginal enough not to warrant per-model branching like Adapt for...
  chainOfThoughtBlock(){
    return "\n\nBefore giving your final answer, think through the problem step by step. Show your reasoning, then clearly mark your final answer (e.g. with \"Final answer:\").";
  },

  // 4. TABLE-IFY — converts a bulleted/numbered list into a Markdown table
  // skeleton. Best-effort: uses the first colon-separated segment of each
  // item as column 1, the rest as column 2 — works well for "Label: value"
  // style lists, degrades gracefully (single-column table) otherwise.
  tableify(text){
    const lines = (text || "").split("\n");
    const items = lines
      .map(l => l.trim())
      .filter(l => /^(?:[-*•]|\d+[.)])\s/.test(l))
      .map(l => l.replace(/^(?:[-*•]|\d+[.)])\s/, ""));
    if (items.length < 2) return null; // nothing list-like to convert
    const hasColon = items.every(i => i.includes(":"));
    if (hasColon){
      const rows = items.map(i => {
        const idx = i.indexOf(":");
        return [i.slice(0, idx).trim(), i.slice(idx + 1).trim()];
      });
      return "| Item | Detail |\n|---|---|\n" + rows.map(r => `| ${r[0]} | ${r[1]} |`).join("\n");
    }
    return "| Item |\n|---|\n" + items.map(i => `| ${i} |`).join("\n");
  },

  // 5. TONE SHIFT — light phrasing substitution toward a target register.
  // Word/phrase-level only (no restructuring) — same honesty as Clean's
  // "mechanical fixes only" scope, so it never claims to fully rewrite.
  TONE_MAPS: {
    formal: [[/\bcan't\b/gi,"cannot"],[/\bdon't\b/gi,"do not"],[/\bwon't\b/gi,"will not"],[/\bit's\b/gi,"it is"],[/\byou're\b/gi,"you are"],[/\bwe're\b/gi,"we are"],[/\bI'm\b/gi,"I am"],[/\bgonna\b/gi,"going to"],[/\bkind of\b/gi,"somewhat"],[/\ba lot of\b/gi,"a substantial amount of"],[/\bstart\b/gi,"commence"]],
    casual: [[/\bcannot\b/gi,"can't"],[/\bdo not\b/gi,"don't"],[/\bwill not\b/gi,"won't"],[/\bit is\b/gi,"it's"],[/\butilize\b/gi,"use"],[/\bapproximately\b/gi,"about"],[/\badditional\b/gi,"more"],[/\bpurchase\b/gi,"buy"]],
    persuasive: [[/\bcan\b/gi,"can absolutely"],[/\bgood\b/gi,"outstanding"],[/\bwill\b/gi,"will definitely"],[/\bimportant\b/gi,"essential"],[/\bshould\b/gi,"need to"]],
    neutral: [[/\bawesome\b/gi,"good"],[/\bamazing\b/gi,"notable"],[/\bcan absolutely\b/gi,"can"],[/\bwill definitely\b/gi,"will"],[/\bdefinitely\b/gi,""],[/\bobviously\b/gi,""],[/\bclearly\b/gi,""]]
  },
  toneShift(text, tone){
    let out = text || "";
    const map = PromptTools.TONE_MAPS[tone] || [];
    for (const [re, replacement] of map) out = out.replace(re, replacement);
    out = out.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
    // Same fix as shorten(): a swapped-out leading word can leave a
    // sentence starting lowercase; restore capitalization at sentence
    // starts so the result reads as proper prose, not a diff artifact.
    out = out.replace(/(^|[.!?]\s+)([a-z])/g, (m, pre, letter) => pre + letter.toUpperCase());
    return out;
  },

  // 6. PERSONA LIBRARY — curated Role-block openers for common expert
  // framings, inserted at cursor/start rather than appended, since a Role
  // block belongs at the top of a prompt by convention (see CUES.role).
  PERSONAS: [
    { id: "swe", label: "Senior Software Engineer", text: "You are a senior software engineer with deep expertise in writing clean, maintainable, well-tested code." },
    { id: "analyst", label: "Financial Analyst", text: "You are a financial analyst who explains numbers clearly, shows your work, and flags key assumptions and risks." },
    { id: "teacher", label: "Patient Teacher", text: "You are a patient, encouraging teacher who explains concepts step by step, checks for understanding, and adapts to the learner's level." },
    { id: "editor", label: "Meticulous Editor", text: "You are a meticulous editor who improves clarity and correctness while preserving the author's voice and intent." },
    { id: "pm", label: "Product Manager", text: "You are an experienced product manager who thinks in terms of user needs, tradeoffs, and measurable outcomes." },
    { id: "lawyer", label: "Contract Reviewer", text: "You are a contract reviewer who identifies risks, ambiguous terms, and missing protections in plain language." },
    { id: "researcher", label: "Research Analyst", text: "You are a careful research analyst who distinguishes established facts from speculation and cites sources of uncertainty." },
    { id: "coach", label: "Constructive Critic", text: "You are a constructive critic who gives specific, actionable feedback — what works, what doesn't, and exactly how to improve it." }
  ],

  // 7. AMBIGUITY SCAN — flags pronouns/demonstratives that may lack a
  // clear antecedent (heuristic: pronoun near the start of a sentence
  // with no preceding noun-like word in the same sentence). Distinct
  // from Analyzer's vague-VOCABULARY check (stuff/things/handle) — this
  // is about vague REFERENCE, not vague word choice.
  scanAmbiguity(text){
    const sentences = (text || "").split(Utils.SENTENCE_SPLIT).filter(s => s.trim());
    const findings = [];
    const leadingPronoun = /^(?:it|this|that|these|those|they)\b/i;
    sentences.forEach((s, i) => {
      const trimmed = s.trim();
      if (leadingPronoun.test(trimmed)){
        findings.push({ sentence: trimmed.slice(0, 80), index: i });
      }
    });
    return findings;
  },

  // 8. ADVERSARIAL PATTERN SCAN — flags phrasing commonly associated with
  // prompt-injection or jailbreak attempts, so someone building a prompt
  // that WRAPS untrusted user input can catch if their own template
  // accidentally contains susceptible phrasing. Distinct from Security
  // Check (which scans for LEAKED SECRETS, not injection-prone phrasing).
  ADVERSARIAL_PATTERNS: [
    { id: "ignore_prev", re: /\bignore (?:all |any )?(?:previous|prior|above) instructions?\b/i, label: "\"Ignore previous instructions\" phrasing" },
    { id: "pretend_no_rules", re: /\bpretend (?:you have no|there are no) (?:rules|restrictions|guidelines)\b/i, label: "\"Pretend you have no rules\" phrasing" },
    { id: "dan_style", re: /\bdo anything now\b|\bDAN mode\b/i, label: "\"Do Anything Now\" / DAN-style jailbreak phrasing" },
    { id: "reveal_system", re: /\breveal (?:your |the )?(?:system prompt|hidden instructions|initial prompt)\b/i, label: "Request to reveal system/hidden prompt" },
    { id: "hide_ai", re: /\b(?:don'?t|never) (?:mention|reveal|disclose) (?:that )?you'?re (?:an? )?(?:ai|language model|bot)\b/i, label: "Instruction to hide AI disclosure" },
    { id: "roleplay_unrestricted", re: /\bunrestricted (?:mode|version|ai)\b/i, label: "\"Unrestricted mode\" framing" }
  ],
  scanAdversarial(text){
    const raw = text || "";
    const findings = [];
    for (const pat of PromptTools.ADVERSARIAL_PATTERNS){
      if (pat.re.test(raw)) findings.push({ id: pat.id, label: pat.label });
    }
    return findings;
  },

  // 9. AUDIENCE FRAMING — one-click "explain for this audience" line,
  // inserted near an Output/Format section if one exists, else appended.
  AUDIENCES: [
    { id: "five", label: "a total beginner (ELI5)", text: "Explain your answer as if for a total beginner with no prior background — avoid jargon, or define it when first used." },
    { id: "exec", label: "a busy executive", text: "Write for a busy executive: lead with the bottom line, keep it brief, and back it with only the most essential detail." },
    { id: "expert", label: "a domain expert", text: "Write for an expert in this field — you can use precise technical terminology without defining it." },
    { id: "student", label: "a student learning the topic", text: "Explain as if teaching a student who is learning this topic for the first time — define key terms and build up gradually." }
  ],

  // 10. INTERNAL REDUNDANCY FINDER — flags sentences that repeat within
  // THIS prompt's own body (near-duplicate phrasing), distinct from
  // Library's cross-prompt duplicate detector which compares different
  // saved prompts against each other.
  findInternalRedundancy(text){
    const sentences = (text || "").split(Utils.SENTENCE_SPLIT).map(s => s.trim()).filter(s => s.length > 8);
    const findings = [];
    const seen = [];
    for (const s of sentences){
      const norm = Utils.normalizeForCompare(s).trim();
      const dup = seen.find(prior => {
        if (Math.abs(prior.norm.length - norm.length) > Math.max(prior.norm.length, norm.length) * 0.3) return false;
        const aTokens = new Set(prior.norm.split(/\s+/));
        const bTokens = new Set(norm.split(/\s+/));
        const overlap = [...aTokens].filter(t => bTokens.has(t)).length;
        return overlap / Math.max(aTokens.size, bTokens.size, 1) > 0.75;
      });
      if (dup && !findings.some(f => f.a === dup.text)) findings.push({ a: dup.text, b: s });
      seen.push({ norm, text: s });
    }
    return findings;
  }
};
