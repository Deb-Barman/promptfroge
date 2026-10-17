# Prompt Forge — Web edition

A local-first IDE for writing, analysing, versioning and **running** prompts.
**No backend. No database. No account.** It is a static website: it runs on your own computer at `localhost`, and deploys to Vercel as-is.

## Run it on your computer

Needs [Node.js 20+](https://nodejs.org).

| | Windows | macOS / Linux |
|---|---|---|
| Develop (hot reload, http://localhost:5173) | double-click **`start.bat`** | `./start.sh` |
| Optimised production build (http://localhost:4173) | double-click **`start-production.bat`** | `./start.sh --production` |

Or by hand: `npm install` → `npm run dev`.

## Deploy to Vercel (2 minutes, free tier is fine)

**Option A — GitHub (recommended, auto-deploys on every push)**
1. Push this folder to a GitHub repository.
2. On vercel.com choose **Add New → Project**, import the repo, and press **Deploy**. Nothing to configure: `vercel.json` already sets the framework (Vite), build command and output folder.

**Option B — CLI:** `npm i -g vercel` → `vercel` → `vercel --prod`.

No environment variables, no database, no serverless functions. The security headers (CSP etc.) come from `vercel.json`.

> **Your data is per address.** Prompts live in the browser's own storage for *that* address, so `localhost:5173`, `localhost:4173` and `your-app.vercel.app` are three separate libraries. Move data between them with **Workspace → Backups → Download JSON** and **Restore from file**.

## What's new in the web edition (v2.0)

| | |
|---|---|
| **API Playground** (`Alt R` / `Ctrl Enter`) | Run the prompt in your browser with **your own key** against OpenAI, Anthropic, Gemini, OpenRouter, Groq, Mistral, Together, **Ollama / LM Studio (local, free)** or any OpenAI-compatible server. Streaming, up to 3 models side-by-side, `{{variable}}` form, latency / first-token / token usage, searchable run history. Keys stay in the tab (session) unless you tick *Remember*. |
| **Share as link** (`Alt S`) | The prompt is compressed *into the URL hash* — no server involved. Recipients get a review screen; nothing imports silently. |
| **Backups you can trust** (`Alt B`) | Automatic snapshots in a separate browser database, only when something changed; **a safety snapshot is taken automatically before any "Clear", replace-import or restore**; one-click restore; optional write-through to a folder you pick (Chrome/Edge). |
| **Multi-tab safe** | Edits in one tab appear in the others; if you're mid-edit you get a warning instead of silent overwrite. |
| **Markdown vault** | Export everything as a ZIP (one `.md` per prompt with YAML front-matter + a full JSON backup) for Git / Obsidian; import `.md` / `.txt` / ZIP back. |
| **Installable + offline (PWA)** | Install as an app; works with no connection after the first visit. |
| **Storage health** | Clear banners when storage is blocked, full or degraded (the original silently showed an empty library). Asks the browser not to evict your data. |
| **Pro Editor** (`Alt M`) | Monaco with `{{variable}}` highlighting and a live diff (kept from the desktop edition). |
| **Hardened for the web** | Strict CSP (`script-src 'self'`, no inline script, connect-src allow-list), `nosniff`, no referrer, no framing, validated imports. |

Everything from the original is intact (editor, analyzer, builder, library, templates, patterns, snippets, chains, history, analytics, learn mode, exact `cl100k_base` token counts, command palette…) — `tests/parity.test.ts` proves it against `legacy/PromptForge.html`.

**Bugs fixed** (see `docs/AUDIT.md` for evidence): saving silently deleted `<xml>` tags and `a < b` text from prompts; Bengali/Hindi/Arabic/CJK text broke search, duplicate detection and variables; silent empty library when the database was blocked; non-atomic restore; last-write-wins across tabs; no undo for "Clear all"; failed saves were invisible; last keystrokes lost when closing the tab; and more.

## Privacy

Nothing is sent anywhere until you press **Run** in the Playground, and then only that prompt goes to the provider you chose. No analytics, no telemetry, no fonts or scripts from CDNs.

## Scripts

`npm run dev` · `npm run build` (typecheck + production build → `dist/`) · `npm run preview` · `npm test` (79 tests) · `npm run check` (all three)

## Using another AI host on Vercel

The production CSP only lets the app call the hosts in `csp.ts` (OpenAI, Anthropic, Gemini, OpenRouter, Groq, Mistral, Together, localhost). To add one, add it to `CONNECT_HOSTS` in `csp.ts` **and** to the `connect-src` in `vercel.json` (`tests/deploy.test.ts` fails if they differ). Local servers need CORS enabled: Ollama → `OLLAMA_ORIGINS=*` (or your site's address); LM Studio → enable CORS in server settings.

## Layout

```
src/core/    engines (Analyzer, PromptEngine, StorageManager, TemplateEngine, …)   — original logic, hardened
src/ui/      the original view layer (UIManager + feature method groups)
src/shell/   React chrome (top bar, rail, status bar)
src/web/     web platform: backups, share links, ZIP/Markdown, Playground, Workspace dialog, PWA, sync
tests/       vitest: engines, every view, hostile-data fuzz, storage, share/zip/markdown, playground, deploy config
legacy/      the original single-file PromptForge.html (kept for the parity test)
```
