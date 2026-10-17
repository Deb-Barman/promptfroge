/**
 * In-browser backup ring. Snapshots of the whole workspace are kept in their OWN IndexedDB database
 * (separate from the app data), so a failed migration, a "Clear all data", a bad import, or a corrupted
 * main store can always be rolled back. Nothing leaves the device.
 */
export type SnapshotKind = "auto" | "manual" | "safety";
export interface SnapshotMeta {
  id: string; createdAt: number; reason: string; kind: SnapshotKind;
  bytes: number; hash: string; counts: Record<string, number>;
}

const DB_NAME = "promptforge-backups";
const LIMITS: Record<SnapshotKind, number> = { auto: 15, safety: 12, manual: 50 };

let dbPromise: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("meta", { keyPath: "id" });
      db.createObjectStore("blobs");
      db.createObjectStore("handles");
    };
    req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); dbPromise = null; }; resolve(req.result); };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { dbPromise = null; reject(new Error("Backup database is blocked by another tab.")); };
  });
  return dbPromise;
}
export const resetBackupDbForTests = () => { dbPromise = null; };

function tx<T>(stores: string | string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest | void): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result: unknown;
    const r = fn(t);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result as T);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("aborted"));
  }));
}

export async function hashText(text: string): Promise<string> {
  try {
    if (globalThis.crypto?.subtle) {
      const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(d)).slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
    }
  } catch { /* fall through */ }
  let h = 0x811c9dc5;                                  // FNV-1a fallback (insecure contexts)
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return "f" + (h >>> 0).toString(16) + text.length.toString(16);
}

/** Dump minus volatile fields, so "nothing changed" is detected and identical snapshots aren't stored twice. */
function stableForHash(json: string): string {
  try { const o = JSON.parse(json); if (o && o._meta) delete o._meta.exportedAt; return JSON.stringify(o); } catch { return json; }
}

export function summarise(json: string): Record<string, number> {
  const counts: Record<string, number> = {};
  try {
    const o = JSON.parse(json);
    for (const k of Object.keys(o)) if (Array.isArray(o[k])) counts[k] = o[k].length;
    if (o._settings?.customModels?.length) counts.customModels = o._settings.customModels.length;
  } catch { /* leave empty */ }
  return counts;
}

export const kindOf = (reason: string): SnapshotKind => (reason === "manual" ? "manual" : reason.startsWith("before-") ? "safety" : "auto");

/** Stores a snapshot. Returns null when identical to the newest snapshot of the same kind (dedupe). */
export async function addSnapshot(json: string, reason: string, opts: { keepAuto?: number; force?: boolean } = {}): Promise<SnapshotMeta | null> {
  const kind = kindOf(reason);
  const hash = await hashText(stableForHash(json));
  if (!opts.force) {
    const last = (await listSnapshots()).find(s => s.kind === kind);
    if (last && last.hash === hash) return null;
  }
  const meta: SnapshotMeta = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(), reason, kind, bytes: new Blob([json]).size, hash, counts: summarise(json),
  };
  await tx(["meta", "blobs"], "readwrite", t => { t.objectStore("blobs").put(json, meta.id); t.objectStore("meta").put(meta); });
  await prune(opts.keepAuto);
  return meta;
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const all = await tx<SnapshotMeta[]>("meta", "readonly", t => t.objectStore("meta").getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function getSnapshotJson(id: string): Promise<string | null> {
  return (await tx<string | undefined>("blobs", "readonly", t => t.objectStore("blobs").get(id))) ?? null;
}
export async function deleteSnapshot(id: string): Promise<void> {
  await tx(["meta", "blobs"], "readwrite", t => { t.objectStore("meta").delete(id); t.objectStore("blobs").delete(id); });
}
async function prune(keepAuto?: number): Promise<void> {
  const all = await listSnapshots();
  const limits = { ...LIMITS, auto: keepAuto ?? LIMITS.auto };
  const drop: string[] = [];
  for (const kind of Object.keys(limits) as SnapshotKind[]) drop.push(...all.filter(s => s.kind === kind).slice(limits[kind]).map(s => s.id));
  if (drop.length) await tx(["meta", "blobs"], "readwrite", t => { for (const id of drop) { t.objectStore("meta").delete(id); t.objectStore("blobs").delete(id); } });
}

/** Directory handle persistence for folder sync (FileSystemDirectoryHandle is structured-cloneable). */
export const saveHandle = (h: unknown) => tx("handles", "readwrite", t => t.objectStore("handles").put(h, "folder"));
export const loadHandle = () => tx<unknown>("handles", "readonly", t => t.objectStore("handles").get("folder")).then(h => h ?? null);
export const forgetHandle = () => tx("handles", "readwrite", t => t.objectStore("handles").delete("folder"));

/** Safety-net factory: throttled so "Clear all data" (11 clearStore calls) produces ONE snapshot. */
export function makeSafetyNet(dump: () => Promise<string>, throttleMs = 20000) {
  let last = 0;
  return async (reason: string) => {
    if (Date.now() - last < throttleMs) return;
    last = Date.now();
    const json = await dump();
    const counts = summarise(json);
    if (!Object.entries(counts).some(([k, n]) => n > 0 && k !== "customModels")) return;   // nothing worth saving
    await addSnapshot(json, reason, { force: true });
  };
}
