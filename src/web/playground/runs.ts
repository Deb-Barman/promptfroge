/** Run history for the Playground, in its own IndexedDB (newest 300 kept). Not part of backups: outputs are bulky and reproducible. */
export interface RunRecord {
  id: string; createdAt: number; promptId?: string; promptTitle: string;
  provider: string; model: string; system: string; user: string; output: string;
  ms: number; firstTokenMs: number | null; inputTokens?: number; outputTokens?: number; error?: string;
}
const DB = "promptforge-runs", MAX = 300;
let p: Promise<IDBDatabase> | null = null;
const open = () => (p ??= new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { r.result.createObjectStore("runs", { keyPath: "id" }).createIndex("createdAt", "createdAt"); };
  r.onsuccess = () => res(r.result); r.onerror = () => { p = null; rej(r.error); };
}));
export const resetRunsDbForTests = () => { p = null; };

export async function addRun(run: Omit<RunRecord, "id" | "createdAt">): Promise<RunRecord> {
  const rec: RunRecord = { ...run, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() };
  const db = await open();
  await new Promise<void>((res, rej) => { const t = db.transaction("runs", "readwrite"); t.objectStore("runs").put(rec); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  const all = await listRuns();
  if (all.length > MAX) await deleteRuns(all.slice(MAX).map(r => r.id));
  return rec;
}
export async function listRuns(): Promise<RunRecord[]> {
  const db = await open();
  const all = await new Promise<RunRecord[]>((res, rej) => { const r = db.transaction("runs").objectStore("runs").getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteRuns(ids: string[]): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => { const t = db.transaction("runs", "readwrite"); ids.forEach(i => t.objectStore("runs").delete(i)); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
export const clearRuns = async () => { const db = await open(); await new Promise<void>((res, rej) => { const t = db.transaction("runs", "readwrite"); t.objectStore("runs").clear(); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); };
