// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "./CONFIG";

/* ============================================================================
   RISK LINTER — flags jailbreak-adjacent / policy-risk phrasing in the
   USER'S OWN prompt drafts, distinct from SecurityScanner (which finds
   leaked credentials). This is a proactive linter for someone building
   prompts that will run against user input in production: the same
   phrasing an attacker might inject is worth flagging in your own draft
   before it ships, exactly like a code linter flags a risky pattern
   without passing judgment on the author's intent.
   ============================================================================ */
export const RiskLinter = {
  scan(text){
    if (!text) return [];
    const findings = [];
    for (const pat of CONFIG.RISK_PATTERNS){
      if (pat.re.test(text)) findings.push({ id: pat.id, label: pat.label, detail: pat.detail });
    }
    return findings;
  },

  // Injection-surface check — distinct from scan() above (which flags
  // jailbreak-adjacent phrasing in the AUTHOR's own wording). This instead
  // looks at prompts that will interpolate USER-SUPPLIED input (a
  // {{variable}}, or phrasing like "the following text:") and flags a
  // missing structural boundary around that content — an unfenced splice
  // point is exactly what lets injected text in that field be read as
  // instructions rather than data. Purely a structural heuristic, not a
  // guarantee of safety; framed as a prompt to double-check, not a verdict.
  checkInjectionSurface(text){
    if (!text || !text.trim()) return [];
    const findings = [];

    const referencesUserInput = /\b(?:the following (?:text|input|content|message|document)|user'?s? (?:input|message|question|request)|below:?\s*$)/im.test(text)
      || /\{\{\s*(?:user_input|input|user_text|user_message|content|text)\s*\}\}/i.test(text);
    if (!referencesUserInput) return findings;

    // Structural delimiters that clearly fence off interpolated content:
    // XML-style tags, triple backticks/quotes, or a standalone "---" rule.
    const hasDelimiter = /<[a-z_]+>[\s\S]*<\/[a-z_]+>/i.test(text)
      || /```/.test(text)
      || /"""/.test(text)
      || /^-{3,}\s*$/m.test(text);

    if (!hasDelimiter){
      findings.push({
        id: "unfenced_user_input",
        label: "User input isn't clearly delimited",
        detail: "This prompt appears to reference user-supplied content without a structural boundary (like <user_input>…</user_input>, a fenced ``` block, or a --- separator). Without one, text inside that content could be read as additional instructions rather than data to process."
      });
    }
    return findings;
  }
};
