import { AnalyticsEngine } from "../core/AnalyticsEngine";
import { PromptEngine } from "../core/PromptEngine";
import { SearchEngine } from "../core/SearchEngine";
import { StorageManager } from "../core/StorageManager";
import { SuggestionEngine } from "../core/SuggestionEngine";
import { VersionManager } from "../core/VersionManager";
import { UIManager } from "../ui/UIManager";

export interface AppContext {
  storage: StorageManager;
  promptEngine: PromptEngine;
  suggestionEngine: SuggestionEngine;
  versionManager: VersionManager;
  searchEngine: SearchEngine;
  analyticsEngine: AnalyticsEngine;
  ui: UIManager;
}

let booting: Promise<AppContext> | null = null;

/**
 * Wires the engine graph and starts the view layer. This is the original
 * PromptForge bootstrap, preserved step for step (including the two
 * monkey-patches for History detail and "New Prompt" metadata), but exposed as
 * an idempotent function so React can call it once after the chrome mounts.
 */
export function bootstrapApp(): Promise<AppContext> {
  if (booting) return booting;
  booting = (async () => {
    const storage = new StorageManager();
    await storage.init();

    const promptEngine = new PromptEngine(storage);
    await promptEngine.load();

    const suggestionEngine = new SuggestionEngine(promptEngine);
    suggestionEngine.rebuildFromCorpus();

    const versionManager = new VersionManager(storage, promptEngine);
    const searchEngine = new SearchEngine(promptEngine);
    const analyticsEngine = new AnalyticsEngine(promptEngine, suggestionEngine);

    const ui = new UIManager({ storage, promptEngine, suggestionEngine, versionManager, searchEngine, analyticsEngine });

    // Keep the suggestion model warm as prompts/templates/snippets change elsewhere.
    promptEngine.onChange((_kind: string, record: { body?: string; updatedAt?: number } | null) => {
      if (record && record.body) suggestionEngine.learnFromText(record.body, record.updatedAt || Date.now());
    });

    // History view needs its detail pane populated after navigation lands.
    const originalNavigate = ui.navigate.bind(ui);
    ui.navigate = function (view: string) {
      originalNavigate(view);
      if (view === "history" && ui._activeHistoryPromptId) ui._renderHistoryDetail(ui._activeHistoryPromptId);
    };

    // Apply metadata queued by the "New Prompt" modal the first time the draft is saved.
    const originalSavePrompt = promptEngine.savePrompt.bind(promptEngine);
    promptEngine.savePrompt = function (prompt: any) {
      if (ui._pendingNewPromptMeta && ui.state.editor.promptId === prompt.id) {
        prompt.category = ui._pendingNewPromptMeta.category || prompt.category;
        prompt.tags = ui._pendingNewPromptMeta.tags && ui._pendingNewPromptMeta.tags.length ? ui._pendingNewPromptMeta.tags : prompt.tags;
        ui._pendingNewPromptMeta = null;
      }
      return originalSavePrompt(prompt);
    };

    ui.init();
    if (!(storage as unknown as { available?: boolean }).available) {
      setTimeout(() => ui.toast("Persistent storage isn't available — using a smaller local fallback.", "warn", 6000), 400);
    }

    const ctx: AppContext = { storage, promptEngine, suggestionEngine, versionManager, searchEngine, analyticsEngine, ui };
    // Handy for power users / debugging; nothing here touches a network.
    (window as unknown as { PromptForge: AppContext }).PromptForge = ctx;
    return ctx;
  })();
  return booting;
}
