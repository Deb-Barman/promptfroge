# Architecture & decisions (web edition)

## Shape
A static single-page app: `vite build` → `dist/` (HTML, JS, CSS, icons, service worker). No server code. State lives in the
browser: IndexedDB for records, localStorage for small settings, a second IndexedDB (`promptforge-backups`) for snapshots and a
third (`promptforge-runs`) for Playground history.

* **Engines** (`src/core/`) and the **view layer** (`src/ui/`) are the original code (ported mechanically from `legacy/PromptForge.html`,
  see `tools/`), with the fixes listed in `AUDIT.md`. `tests/parity.test.ts` re-parses the original on every run.
* **React** owns the app root, chrome and every *new* surface (`src/web/*`): Workspace, Playground, Share, Pro Editor, banners.
  The 12 original views still render via `innerHTML` inside `#workspace`, which React never reconciles.
* **`src/web/app.ts`** is the only glue between the two worlds: it wraps `ui._saveEditorPrompt` (error surfacing), extends
  `ui._paletteCommands`, wires storage events to cross-tab sync, auto-backup, banners and shortcuts.

## Data safety model
1. `StorageManager` emits `write` / `remote` / `degraded` / `quota` events and calls `safetyNet(reason)` before any bulk clear or replace.
2. The web layer implements the safety net with the backup ring (throttled, skipped for empty workspaces).
3. `importAll` is a single transaction; records are normalised first (`_normalizeRecord`).
4. Backups are deduplicated by a hash of the dump ignoring `exportedAt`; rotation keeps 15 auto / 12 safety / 50 manual.

## Security model
* Escape on output (`Utils.escapeHtml`) everywhere the view layer builds HTML; **fuzz-tested**. Saving no longer mutates content.
* CSP from `csp.ts`: `script-src 'self'` (no inline script), `connect-src` allow-list, `frame-ancestors 'none'`, `object-src 'none'`.
  `style-src` keeps `'unsafe-inline'` because the original views emit inline `style=` attributes.
* API keys: `sessionStorage` by default; `localStorage` only if the user opts in; never included in backups, exports or share links.
* Share links are untrusted input: strict allow-list schema, 256 KB inflate cap (decompression-bomb guard), preview as plain text, explicit accept.
* ZIP import: zip-slip paths skipped, size/file-count caps, no encrypted/ZIP64.

## Trade-offs
* `@ts-nocheck` remains on `src/core/**` and `src/ui/**`; class fields are now declared so the strict new code type-checks against them.
* Monaco (3.2 MB) is lazy-loaded and cached on first use rather than precached, so first install stays ~2 MB.
* The Playground calls providers directly from the browser (CORS). That is the only way to have no backend; the cost is that keys live in the
  browser, which is why session-only is the default and the CSP restricts where requests can go.
