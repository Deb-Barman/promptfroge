# Feature map (where each original feature lives)

Navigation aid only — the proof of completeness is `tests/parity.test.ts`.

| Area | View layer (`src/ui/methods/`) | Engines (`src/core/`) |
|---|---|---|
| Editor, autosave, undo/redo, find/replace, suggestion popup, side panel (DNA, analyzer, risks) | `editor.ts`, `editorTools.ts` | `PromptEngine`, `SuggestionEngine`, `Analyzer`, `RiskLinter`, `ReadabilityEngine` |
| Builder (block structures) | `builder.ts` | `TemplateEngine` |
| Library, search, categories, tags, favorites, archive, pinning, bulk actions, saved searches | `library.ts`, `compare.ts` | `SearchEngine`, `PromptEngine`, `DuplicateFinder` |
| Groups | `groups.ts` | `PromptEngine` |
| Templates and variables | `templates.ts` | `TemplateEngine` |
| Patterns (built-in + custom) | `patterns.ts` | `CONFIG` |
| Snippets and `/trigger` expansion | `promptModals.ts` | `SnippetManager`, `TriggerDetector` |
| Chains | `chains.ts` | `PromptEngine` |
| History, versions, diffs | `history.ts` | `VersionManager` |
| Dashboard, analytics, learn mode, challenges | `dashboard.ts`, `analytics.ts` | `AnalyticsEngine` |
| Scoring profiles, models, custom models, token/cost | `settings.ts`, `models.ts` | `ScoringProfiles`, `ModelGuide`, `TokenEstimator`, `RealTokenizer` |
| Security scan, cleaner, transforms, compose/adapt | `editorTools.ts` | `SecurityScanner`, `PromptCleaner`, `PromptTools`, `MessageComposer` |
| Import / export (JSON backup, Markdown, text, CSV, HTML) | `importExport.ts` | `JSONImporter`, `Validator`, `FormatConverter`, `StorageManager` |
| Command palette, keyboard shortcuts, themes, toasts, modals, onboarding tour | `shell.ts`, `onboarding.ts`, `actions.ts` | — |
