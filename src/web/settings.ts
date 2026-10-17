/** Web-layer preferences (kept in localStorage; never part of a backup). */
export interface WebSettings {
  autoBackup: boolean;        // periodic snapshots into the in-browser backup ring
  backupIntervalMin: number;  // minutes between automatic snapshots (only when data changed)
  keepAuto: number;           // how many automatic snapshots to keep
  folderSync: boolean;        // also write snapshots into a linked folder (File System Access API)
}
const KEY = "pf_web_settings";
const DEFAULTS: WebSettings = { autoBackup: true, backupIntervalMin: 10, keepAuto: 15, folderSync: false };

export function getWebSettings(): WebSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      autoBackup: typeof raw.autoBackup === "boolean" ? raw.autoBackup : DEFAULTS.autoBackup,
      backupIntervalMin: [2, 5, 10, 30, 60].includes(raw.backupIntervalMin) ? raw.backupIntervalMin : DEFAULTS.backupIntervalMin,
      keepAuto: [5, 15, 30, 60].includes(raw.keepAuto) ? raw.keepAuto : DEFAULTS.keepAuto,
      folderSync: raw.folderSync === true,
    };
  } catch { return { ...DEFAULTS }; }
}
export function setWebSettings(patch: Partial<WebSettings>): WebSettings {
  const next = { ...getWebSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full/unavailable */ }
  return next;
}
