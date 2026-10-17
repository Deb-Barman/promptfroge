# Audit — what was wrong, what was missing, what changed

Method: ran the project (typecheck, 21 tests, build), stripped `@ts-nocheck` in a scratch copy to surface latent errors,
wrote **probe tests** for suspected bugs, and only listed a bug here if a probe reproduced it. Every fix has a regression test.

## Bugs found and fixed

| # | Severity | Problem (reproduced) | Fix |
|---|---|---|---|
| 1 | **Critical** | `sanitizeText()` ran on every save and deleted everything between `<` and `>`: `<role>You are…</role>` → `You are…`; `If a < b and c > d` → `If a  d`; HTML in code fences vanished. In a *prompt IDE* with an XML-wrap feature this silently destroyed prompts, templates, snippets and patterns (the original HTML had the same bug). | Sanitizer now only removes control characters / lone surrogates and normalises CRLF. Safety comes from **escaping on output** (proved by a fuzz test that injects 4 XSS payloads into every field of every store and renders every view and modal) plus the CSP. *Text already stripped by older versions can't be recovered.* |
| 2 | High | Tokeniser was `[a-z0-9]` only. Bengali/Hindi/Arabic/CJK text produced **zero tokens**: related-prompt and suggestion engines saw nothing, `café` became `caf`; duplicate-sentence detection normalised every non-Latin sentence to `""`, so **every Bengali sentence was reported as a duplicate** of the first; sentence splitting ignored `।` and `。`; snippet triggers like `/ভূমিকা` were reduced to `/`; `{{নাম}}` variables weren't recognised. | Unicode-aware tokenising/normalisation (`\p{L}\p{M}\p{N}`), danda/CJK sentence boundaries, Unicode triggers and variable names. |
| 3 | High | If another tab held an older DB version, `onblocked` rejected immediately and the app fell back to an **empty localStorage store** — the library looked wiped. | Waits (10 s) for the other tab to release; tabs close their connection on `versionchange`; failures raise a persistent banner instead of a silent empty library. |
| 4 | High | `importAll` cleared each store then wrote records one transaction at a time — an interruption left a half-restored library. Imports accepted anything (`title` as an object, `tags` as a string, `__proto__` keys) and could crash views later. | One IndexedDB transaction for all stores (all-or-nothing, explicitly aborted on error); every record validated/normalised; prototype keys stripped; skipped count reported. *My first version of this had a half-commit bug that the rollback test caught.* |
| 5 | High | Two tabs = two in-memory copies; last save silently won. | `BroadcastChannel` sync; remote changes reload the library; if you're mid-edit you get a warning instead of an overwrite. |
| 6 | Medium | "Clear all data", replace-imports and restores were irreversible. | Automatic **safety snapshot** (throttled to one per burst) before any bulk delete / replace; listed under Backups. |
| 7 | Medium | A failed save (quota) left "Saving…" forever with no message. | Error toast + "Not saved" indicator + persistent banner offering Backups. localStorage fallback no longer fails silently. |
| 8 | Medium | Closing a tab (or backgrounding a phone browser) within the autosave delay lost the last keystrokes. | Flush on `pagehide` / `visibilitychange`. |
| 9 | Low | `hasUnfilledVariables` used a shared `/g` regex → same input returned `true, false, true…` on consecutive calls. | Non-global regex. |
| 10 | Low | `timeAgo` rounded: 59.6 min → "60m ago", 23.7 h → "24h ago". | `floor`. |

**Checked and found sound:** output escaping (no XSS found in any view/modal), the tokenizer (exact cl100k counts), the 12 views and 27 argument-free modals, parity with the original.

## Missing → added
Web platform (PWA/offline, CSP, Vercel config, launch scripts) · API Playground · share links · backup ring + folder sync · Markdown/ZIP vault import/export · storage-health UI · cross-tab sync · accessible dialogs (focus trap/restore, skip link, reduced motion) · web shortcuts and palette commands · mobile-safe top bar.

## Not done / not verified — please read
* **Real provider APIs were not called** (no keys here). Request building and stream parsing for OpenAI-style, Anthropic and Gemini are unit-tested against recorded-shape streams, and the full Playground flow was exercised end-to-end in Chromium against a local mock SSE server. Model names change often — use **List** to ask your provider.
* **Verified in headless Chromium only** (Electron 33). Firefox/Safari untested. Folder sync (File System Access picker), the install prompt, and share-sheet need a human click and were **not** exercised; the code is feature-detected and degrades to "Unsupported".
* Chrome may ask for "local network access" permission when a *deployed* site calls `http://localhost` (Ollama).
* The original view layer is still imperative `innerHTML` code with `@ts-nocheck` (kept deliberately: it is what guarantees 1:1 behaviour). Converting views to React one by one is the sensible next step, with the parity + fuzz tests as the safety net.
* Data is per browser profile **and per address** (localhost vs your Vercel URL). Back up before clearing browser data.
