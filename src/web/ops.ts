import { CONFIG } from "../core/CONFIG";
import type { AppContext } from "../app/bootstrap";
import { buildVault, parseMarkdown } from "./markdown";
import { unzip, zipStore } from "./zip";
import { addSnapshot } from "./backups";
import { getWebSettings } from "./settings";
import { writeToFolder } from "./folderSync";

export async function createBackupJson(ctx: AppContext): Promise<string> {
  return JSON.stringify(await ctx.storage.exportAll());
}

/** Full-fidelity restore (replace mode). The storage layer snapshots first via its safety net. */
export async function restoreFromDump(ctx: AppContext, dump: unknown): Promise<void> {
  const { storage, promptEngine, suggestionEngine, ui } = ctx;
  await storage.importAll(dump, "replace");
  await promptEngine.load();
  suggestionEngine.rebuildFromCorpus();
  ui._loadCustomModels?.();
  ui.renderView();
  ui._updateStatusCounts?.();
}

export function downloadBytes(name: string, data: Uint8Array | string, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const stamp = () => new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);

export async function exportVaultZip(ctx: AppContext): Promise<{ files: number }> {
  const pe = ctx.promptEngine;
  const files = buildVault({
    prompts: pe.listPrompts({ includeArchived: true }), templates: pe.listTemplates(), snippets: pe.listSnippets(),
    backupJson: await createBackupJson(ctx),
  });
  downloadBytes(`prompt-forge-vault-${stamp()}.zip`, zipStore(files.map(f => ({ name: f.name, data: f.data }))), "application/zip");
  return { files: files.length };
}

export interface ImportReport { added: number; skipped: number; errors: string[]; backups: number }

/** Imports .md / .txt / .markdown files, and ZIPs of them. Duplicates (same title and body) are skipped. */
export async function importTextFiles(ctx: AppContext, files: File[]): Promise<ImportReport> {
  const pe = ctx.promptEngine;
  const report: ImportReport = { added: 0, skipped: 0, errors: [], backups: 0 };
  const texts: Array<{ name: string; text: string }> = [];
  const dec = new TextDecoder("utf-8");
  for (const f of files) {
    try {
      if (/\.zip$/i.test(f.name)) {
        for (const e of await unzip(new Uint8Array(await f.arrayBuffer()))) {
          if (/\.(md|markdown|txt)$/i.test(e.name) && !/(^|\/)(README|snippets)\.md$/i.test(e.name)) texts.push({ name: e.name, text: dec.decode(e.data) });
          else if (/\.json$/i.test(e.name)) report.backups++;
        }
      } else if (/\.(md|markdown|txt)$/i.test(f.name)) texts.push({ name: f.name, text: await f.text() });
      else report.errors.push(`${f.name}: unsupported file type`);
    } catch (e) { report.errors.push(`${f.name}: ${(e as Error).message}`); }
  }
  const catIds = new Set<string>(CONFIG.CATEGORIES.map((c: { id: string }) => c.id));
  const existing = new Set(pe.listPrompts({ includeArchived: true }).map((p: any) => p.title + "\u0000" + p.body));
  for (const t of texts) {
    const m = parseMarkdown(t.text, t.name.split("/").pop());
    if (!m.body.trim()) { report.skipped++; continue; }
    const key = m.title + "\u0000" + m.body;
    if (existing.has(key)) { report.skipped++; continue; }
    existing.add(key);
    const cat = catIds.has(m.category.toLowerCase()) ? m.category.toLowerCase() : "custom";
    const fmt = ["text", "json", "xml", "markdown"].includes(m.format) ? m.format : "text";
    await pe.savePrompt(pe.newPromptSkeleton({ title: m.title, body: m.body, tags: m.tags, category: cat, format: fmt, favorite: m.favorite }));
    report.added++;
  }
  ctx.suggestionEngine.rebuildFromCorpus();
  ctx.ui.renderView();
  return report;
}

/** One automatic snapshot (+ optional linked-folder copy). Returns true if a new snapshot was stored. */
export async function autoSnapshot(ctx: AppContext, reason = "auto"): Promise<boolean> {
  const s = getWebSettings();
  const json = await createBackupJson(ctx);
  const meta = await addSnapshot(json, reason, { keepAuto: s.keepAuto });
  if (s.folderSync) await writeToFolder(json);
  return !!meta;
}
