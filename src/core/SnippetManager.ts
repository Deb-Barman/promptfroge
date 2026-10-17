// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */

/* ============================================================================
   SNIPPET MANAGER — "/trigger" detection & expansion inside the editor.
   ============================================================================ */
export const SnippetManager = {
  // Find a "/word" token that ends exactly at the cursor (no trailing space
  // yet — expansion happens on Tab/Enter, matching the autocomplete UX).
  detectTrigger(textBeforeCursor){
    const m = textBeforeCursor.match(/(^|\s)(\/[a-zA-Z0-9_-]+)$/);
    return m ? m[2] : null;
  },
  matchCandidates(promptEngine, partialTrigger){
    const t = partialTrigger.toLowerCase();
    return promptEngine.listSnippets().filter(s => s.trigger.toLowerCase().startsWith(t));
  }
};
