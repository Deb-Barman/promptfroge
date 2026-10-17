/**
 * Optional folder sync via the File System Access API (Chromium browsers: Chrome, Edge, Brave, Opera).
 * The user links a folder once; snapshots are then also written there as plain JSON, so the data lives
 * in a normal folder you can put in OneDrive / Dropbox / Git. Permission must be re-granted after the
 * browser restarts (a browser rule) — we never prompt without a click.
 */
import { forgetHandle, loadHandle, saveHandle } from "./backups";

type Perm = "granted" | "prompt" | "denied";
interface DirHandle {
  name: string;
  queryPermission(o: { mode: "readwrite" }): Promise<Perm>;
  requestPermission(o: { mode: "readwrite" }): Promise<Perm>;
  getFileHandle(name: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }>;
}

export const folderSyncSupported = (): boolean => typeof window !== "undefined" && "showDirectoryPicker" in window;

export async function linkFolder(): Promise<string> {
  const h = await (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker({ id: "promptforge", mode: "readwrite", startIn: "documents" });
  await saveHandle(h);
  return h.name;
}
export async function linkedFolder(): Promise<{ name: string; permission: Perm } | null> {
  const h = (await loadHandle()) as DirHandle | null;
  if (!h) return null;
  try { return { name: h.name, permission: await h.queryPermission({ mode: "readwrite" }) }; } catch { return { name: h.name, permission: "prompt" }; }
}
/** Must be called from a click handler. */
export async function reconnectFolder(): Promise<boolean> {
  const h = (await loadHandle()) as DirHandle | null;
  if (!h) return false;
  return (await h.requestPermission({ mode: "readwrite" })) === "granted";
}
export const unlinkFolder = forgetHandle;

/** Writes `prompt-forge-latest.json` and a per-day file. Returns false (silently) if not linked/permitted. */
export async function writeToFolder(json: string): Promise<boolean> {
  const h = (await loadHandle()) as DirHandle | null;
  if (!h) return false;
  try {
    if ((await h.queryPermission({ mode: "readwrite" })) !== "granted") return false;
    for (const name of ["prompt-forge-latest.json", `prompt-forge-${new Date().toISOString().slice(0, 10)}.json`]) {
      const f = await h.getFileHandle(name, { create: true });
      const w = await f.createWritable();
      await w.write(json); await w.close();
    }
    return true;
  } catch { return false; }
}
