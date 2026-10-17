import type { AppContext } from "../app/bootstrap";
import { useBanners, useDialogs, useIncoming } from "./dialogs";
import { makeSafetyNet } from "./backups";
import { autoSnapshot, createBackupJson, downloadBytes, exportVaultZip, stamp } from "./ops";
import { getWebSettings } from "./settings";
import { captureInstallPrompt, canInstall, isStandalone, promptInstall } from "./pwa";
import { extractShareToken } from "./share";

/**
 * Connects the (original) imperative view layer to the browser platform:
 * data-safety nets, cross-tab sync, auto-backup, shortcuts, palette commands, share links, install prompt.
 * Returns an unsubscribe function. Everything here is local — no network calls.
 */
export function installWeb(ctx: AppContext): () => void {
  const { ui, storage, promptEngine: pe, suggestionEngine } = ctx;
  const dialogs = useDialogs.getState();
  const banners = useBanners.getState();
  const offs: Array<() => void> = [];
  const on = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void, o?: boolean | AddEventListenerOptions) => { window.addEventListener(t, f, o); offs.push(() => window.removeEventListener(t, f, o)); };

  /* ---- 1. Safety net: any bulk delete / replace-import / restore takes a snapshot first ---- */
  storage.safetyNet = makeSafetyNet(() => createBackupJson(ctx));

  /* ---- 2. Saves that fail must say so (the original swallowed rejections and left "Saving…" stuck) ---- */
  const origSave = ui._saveEditorPrompt.bind(ui);
  ui._saveEditorPrompt = async (...args: unknown[]) => {
    try { return await origSave(...args); }
    catch (e) {
      console.error(e);
      const el = document.getElementById("saveIndicator");
      if (el) { el.className = "save-indicator"; el.textContent = "Not saved"; }
      ui.toast("Couldn't save — your text is still on screen. Download a backup, then free some browser storage.", "error", 7000);
    }
  };

  /* ---- 3. Storage health banners ---- */
  const degradedText = (r: string) => ({
    "indexeddb-unavailable": "This browser has no persistent storage (private window?). Work is kept only in a small fallback and may be lost — export a backup before closing.",
    blocked: "Another Prompt Forge tab is holding an older version of the database. Close the other tabs and reload — your data is safe, it just can't be opened yet.",
    versionchange: "Prompt Forge was updated in another tab. Reload this tab to continue.",
    closed: "The browser closed the database connection. Reload this tab to continue.",
    "indexeddb-failed": "Persistent storage failed to open. Your data is not lost, but changes may not be saved. Reload; if it persists, export a backup.",
  } as Record<string, string>)[r] ?? "Storage is degraded. Reload this tab.";
  const showDegraded = (r: string) => banners.push({ id: "storage", tone: "error", text: degradedText(r), action: { label: "Reload", run: () => location.reload() } });
  if (storage.degradedReason) showDegraded(storage.degradedReason);
  offs.push(storage.on("degraded", showDegraded));
  offs.push(storage.on("quota", () => banners.push({ id: "quota", tone: "error", text: "Browser storage is full, so new changes can't be saved. Download a backup, then delete old history or large prompts.", action: { label: "Open backups", run: () => dialogs.show("workspace", { tab: "backups" }) } })));

  /* ---- 4. Ask the browser not to evict our data (once, after the first real save) ---- */
  let persistAsked = false;
  offs.push(storage.on("write", () => {
    if (persistAsked || localStorage.getItem("pf_persist_asked")) return;
    persistAsked = true;
    try { localStorage.setItem("pf_persist_asked", "1"); } catch { /* ignore */ }
    void navigator.storage?.persist?.().catch(() => undefined);
  }));

  /* ---- 5. Cross-tab sync ---- */
  let dirtySinceBackup = false;
  offs.push(storage.on("write", () => { dirtySinceBackup = true; }));
  let remoteTimer: ReturnType<typeof setTimeout> | undefined; let warnedAt = 0; let pendingRender = false;
  offs.push(storage.on("remote", () => {
    dirtySinceBackup = true;
    clearTimeout(remoteTimer);
    remoteTimer = setTimeout(async () => {
      if (ui.state.view === "editor" && ui.state.editor.dirty) {
        if (Date.now() - warnedAt > 30000) { warnedAt = Date.now(); ui.toast("Another tab changed your data. Saving here will overwrite its version of this prompt.", "warn", 6000); }
        await pe.load();   // keep the library fresh but never touch what's being typed
        suggestionEngine.rebuildFromCorpus();
        return;
      }
      const openId = ui.state.editor.promptId;
      const before = openId ? pe.getPrompt(openId)?.updatedAt : undefined;
      await pe.load(); suggestionEngine.rebuildFromCorpus(); ui._loadCustomModels?.();
      const ae = document.activeElement as HTMLElement | null;
      const typing = !!ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable);
      const modalOpen = !!ui.modalRoot?.querySelector(".modal-overlay") || ui.state.paletteOpen;
      const editorUnchanged = ui.state.view === "editor" && (!openId || pe.getPrompt(openId)?.updatedAt === before);
      if (editorUnchanged) return;
      if (typing || modalOpen) { pendingRender = true; return; }
      ui.renderView();
    }, 350);
  }));
  const origNavigate = ui.navigate.bind(ui);
  ui.navigate = (v: string) => { pendingRender = false; return origNavigate(v); };
  void pendingRender;

  /* ---- 6. Don't lose the last keystrokes when the tab is closed or backgrounded ---- */
  const flush = () => { if (ui.state.editor.dirty) void ui._saveEditorPrompt(false, true); };
  on("pagehide", flush);
  const onVis = () => {
    if (document.visibilityState !== "hidden") return;
    flush();
    const s = getWebSettings();
    if (s.autoBackup && dirtySinceBackup) { dirtySinceBackup = false; void autoSnapshot(ctx).catch(() => { dirtySinceBackup = true; }); }
  };
  document.addEventListener("visibilitychange", onVis); offs.push(() => document.removeEventListener("visibilitychange", onVis));

  /* ---- 7. Automatic backups ---- */
  let timer: ReturnType<typeof setInterval> | undefined;
  const schedule = () => {
    clearInterval(timer);
    const s = getWebSettings();
    if (!s.autoBackup) return;
    timer = setInterval(() => {
      if (!dirtySinceBackup) return;
      dirtySinceBackup = false;
      void autoSnapshot(ctx).catch(() => { dirtySinceBackup = true; });
    }, s.backupIntervalMin * 60000);
  };
  schedule();
  on("storage", e => { if (e.key === "pf_web_settings") schedule(); });
  window.addEventListener("pf:settings-changed", schedule); offs.push(() => { window.removeEventListener("pf:settings-changed", schedule); clearInterval(timer); });

  /* ---- 8. Connectivity & install ---- */
  on("offline", () => ui.toast("You're offline — Prompt Forge keeps working. Only the API Playground needs a connection.", "info", 4500));
  on("online", () => ui.toast("Back online.", "success", 1800));
  offs.push(captureInstallPrompt());

  /* ---- 9. Share links: #share=… opens a review dialog, never imports silently ---- */
  const checkHash = () => {
    const token = extractShareToken(location.hash);
    if (!token) return;
    history.replaceState(null, "", location.pathname + location.search);
    useIncoming.getState().set(token);
  };
  checkHash();
  on("hashchange", checkHash);

  /* ---- 10. Keyboard shortcuts (Alt-based so they never fight the browser) ---- */
  const modalOpen = () => !!ui.modalRoot?.querySelector(".modal-overlay") || ui.state.paletteOpen || !!useDialogs.getState().open;
  on("keydown", e => {
    if (useDialogs.getState().open) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.altKey && !ctrl && e.code === "KeyM") { e.preventDefault(); openProEditor(); }
    else if (e.altKey && !ctrl && (e.code === "KeyR" || e.code === "KeyP")) { e.preventDefault(); openPlayground(); }
    else if (e.altKey && !ctrl && e.code === "KeyS") { e.preventDefault(); openShare(); }
    else if (e.altKey && !ctrl && e.code === "KeyB") { e.preventDefault(); dialogs.show("workspace", { tab: "backups" }); }
    else if (ctrl && !e.altKey && e.key === "Enter" && ui.state.view === "editor" && !modalOpen()) { e.preventDefault(); openPlayground(); }
  }, true);

  const hasPrompt = () => !!(ui.state.editor.body || "").trim();
  const openPlayground = () => dialogs.show("playground");
  const openShare = () => { if (!hasPrompt()) { ui.toast("Write or open a prompt first, then share it.", "info"); return; } dialogs.show("share"); };
  const openProEditor = () => { ui.navigate("editor"); dialogs.show("pro-editor"); };

  /* ---- 11. Command palette ---- */
  const original = ui._paletteCommands.bind(ui);
  ui._paletteCommands = () => [
    ...original(),
    { label: "Run prompt in Playground", meta: "Alt R", icon: "improve", action: openPlayground },
    { label: "Share prompt as link", meta: "Alt S", icon: "export", action: openShare },
    { label: "Open in Monaco Pro Editor", meta: "Alt M", icon: "improve", action: openProEditor },
    { label: "Workspace: storage, backups & data", meta: "Alt B", icon: "settings", action: () => dialogs.show("workspace") },
    { label: "Back up now", meta: "Backups", icon: "save", action: async () => { try { const added = await autoSnapshot(ctx, "manual"); ui.toast(added ? "Backup saved." : "Nothing changed since the last backup.", "success"); } catch (e) { ui.toast("Backup failed: " + (e as Error).message, "error"); } } },
    { label: "Download backup (JSON)", meta: "Backups", icon: "export", action: async () => { downloadBytes(`prompt-forge-backup-${stamp()}.json`, await createBackupJson(ctx), "application/json"); ui.toast("Backup downloaded.", "success"); } },
    { label: "Export vault (Markdown ZIP)", meta: "Data", icon: "export", action: async () => { const r = await exportVaultZip(ctx); ui.toast(`Exported ${r.files} files.`, "success"); } },
    ...(canInstall() && !isStandalone() ? [{ label: "Install Prompt Forge as an app", meta: "PWA", icon: "add", action: () => void promptInstall() }] : []),
  ];

  // Top-bar "Workspace" button (added to the legacy chrome without touching its markup contract).
  const right = document.querySelector(".topbar-right");
  if (right && !document.getElementById("workspaceBtn")) {
    const mk = (id: string, title: string, svg: string, fn: () => void) => {
      const b = document.createElement("button");
      b.className = "icon-btn"; b.id = id; b.title = title; b.setAttribute("aria-label", title); b.innerHTML = svg;
      b.addEventListener("click", fn); return b;
    };
    const play = mk("playgroundBtn", "Run in Playground (Alt R)", '<svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M5 3.2v10.6L13.6 8.5 5 3.2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>', openPlayground);
    const share = mk("shareBtn", "Share as link (Alt S)", '<svg width="17" height="17" viewBox="0 0 17 17" fill="none"><circle cx="13" cy="3.8" r="2" stroke="currentColor" stroke-width="1.4"/><circle cx="4" cy="8.5" r="2" stroke="currentColor" stroke-width="1.4"/><circle cx="13" cy="13.2" r="2" stroke="currentColor" stroke-width="1.4"/><path d="m5.8 7.6 5.4-2.9M5.8 9.4l5.4 2.9" stroke="currentColor" stroke-width="1.4"/></svg>', openShare);
    const ws = mk("workspaceBtn", "Workspace: storage, backups & data (Alt B)", '<svg width="17" height="17" viewBox="0 0 17 17" fill="none"><ellipse cx="8.5" cy="4" rx="5.5" ry="2.2" stroke="currentColor" stroke-width="1.4"/><path d="M3 4v4.5c0 1.2 2.5 2.2 5.5 2.2S14 9.7 14 8.5V4M3 8.5V13c0 1.2 2.5 2.2 5.5 2.2S14 14.2 14 13V8.5" stroke="currentColor" stroke-width="1.4"/></svg>', () => dialogs.show("workspace"));
    right.prepend(ws); right.prepend(share); right.prepend(play);
    offs.push(() => { play.remove(); share.remove(); ws.remove(); });
  }
  const live = document.getElementById("statusStorage");
  if (live && !isStandalone()) live.title = "Open Workspace (Alt B)";

  (window as unknown as { PromptForge: unknown }).PromptForge = ctx;
  return () => offs.forEach(o => o());
}
