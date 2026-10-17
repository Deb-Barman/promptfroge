// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "./CONFIG";

/* ============================================================================
   SECURITY SCANNER — local secret/credential detection, run before save/export.
   ============================================================================ */
export const SecurityScanner = {
  scan(text){
    if (!text) return [];
    const findings = [];
    for (const pat of CONFIG.SECURITY_PATTERNS){
      const re = new RegExp(pat.re.source, pat.re.flags.includes("g") ? pat.re.flags : pat.re.flags + "g");
      const matches = text.match(re);
      if (matches && matches.length){
        findings.push({ id: pat.id, label: pat.label, count: matches.length, sample: SecurityScanner._mask(matches[0]) });
      }
    }
    return findings;
  },
  _mask(str){
    if (str.length <= 8) return str.slice(0, 2) + "***";
    return str.slice(0, 5) + "\u2026" + str.slice(-3);
  }
};
