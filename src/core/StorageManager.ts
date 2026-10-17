// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "./CONFIG";

/* ============================================================================
   STORAGE MANAGER — IndexedDB for records, localStorage for settings
   ============================================================================ */
export class StorageManager {
  declare db: IDBDatabase | null;
  declare available: boolean;
  declare lsAvailable: boolean;
  declare degradedReason: string | null;
  declare tabId: string;
  declare safetyNet: ((reason: string) => Promise<void>) | null;
  declare lastImportSkipped: number;
  constructor(){
    this.db = null;
    this.available = true;
    this.lsAvailable = true;
    // Why persistence is degraded (null = healthy). The UI shows this instead of
    // silently presenting an empty library — see init().
    this.degradedReason = null;
    this._listeners = new Map();
    this.tabId = Math.random().toString(36).slice(2, 10);
    this.safetyNet = null;          // async (reason) => void — set by the web layer to snapshot before destructive ops
    this._channel = null;
    this._testLocalStorage();
    this._openChannel();
  }

  /* ---- tiny event emitter: "write" (local), "remote" (another tab wrote), "degraded", "quota", "versionchange" ---- */
  on(evt, fn){
    if (!this._listeners.has(evt)) this._listeners.set(evt, new Set());
    this._listeners.get(evt).add(fn);
    return () => this._listeners.get(evt).delete(fn);
  }
  _emit(evt, detail){
    const set = this._listeners.get(evt);
    if (set) set.forEach(fn => { try { fn(detail); } catch(e){ console.error(e); } });
  }

  /* ---- cross-tab sync. Two tabs on the same origin share one IndexedDB; without this each
     tab keeps its own in-memory copy and the last save silently wins. ---- */
  _openChannel(){
    if (typeof BroadcastChannel === "undefined") return;
    try {
      this._channel = new BroadcastChannel("promptforge-sync");
      this._channel.onmessage = (e) => {
        const m = e.data;
        if (!m || m.from === this.tabId || m.t !== "write") return;
        this._emit("remote", m);
      };
    } catch(e){ this._channel = null; }
  }
  _announce(store, id){
    this._emit("write", { store, id });
    if (this._channel){ try { this._channel.postMessage({ t: "write", from: this.tabId, store, id, at: Date.now() }); } catch(e){} }
  }
  _degrade(reason){
    this.degradedReason = reason;
    this._emit("degraded", reason);
  }
  _handleWriteError(err){
    const name = err && (err.name || (err.target && err.target.error && err.target.error.name));
    if (name === "QuotaExceededError") this._emit("quota", err);
    else this._emit("error", err);
  }

  _testLocalStorage(){
    try {
      const k = "__pf_test__";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
    } catch(e){ this.lsAvailable = false; }
  }

  async init(){
    if (!("indexedDB" in window)){ this.available = false; this._degrade("indexeddb-unavailable"); return false; }
    try {
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
        let blockedTimer = null;
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          CONFIG.STORES.forEach(name => {
            if (!db.objectStoreNames.contains(name)){
              const store = db.createObjectStore(name, { keyPath: "id" });
              store.createIndex("updatedAt", "updatedAt", { unique: false });
              if (name === "prompts"){
                store.createIndex("category", "category", { unique: false });
                store.createIndex("favorite", "favorite", { unique: false });
                store.createIndex("archived", "archived", { unique: false });
              }
              if (name === "versions") store.createIndex("promptId", "promptId", { unique: false });
              if (name === "history") store.createIndex("promptId", "promptId", { unique: false });
              if (name === "groups") store.createIndex("kind", "kind", { unique: false });
            }
          });
        };
        req.onsuccess = (e) => { clearTimeout(blockedTimer); resolve(e.target.result); };
        req.onerror = () => { clearTimeout(blockedTimer); reject(req.error); };
        // Another tab still has an older version of the database open. The original code
        // rejected immediately here, which dropped into the empty localStorage fallback and
        // made the whole library look wiped. Keep waiting instead (the other tab gets a
        // versionchange event below and closes its connection); give up only after 10 s.
        req.onblocked = () => {
          this._emit("blocked", true);
          clearTimeout(blockedTimer);
          blockedTimer = setTimeout(() => reject(new Error("IndexedDB upgrade blocked by another open Prompt Forge tab")), 10000);
        };
      });
      // If a newer tab upgrades the schema, release our connection so it is never blocked.
      this.db.onversionchange = () => {
        try { this.db.close(); } catch(e){}
        this.db = null;
        this.available = false;
        this._degrade("versionchange");
        this._emit("versionchange", true);
      };
      this.db.onclose = () => { this.db = null; this.available = false; this._degrade("closed"); };
      return true;
    } catch(e){
      console.error("IndexedDB init failed, falling back to localStorage-only mode:", e);
      this.available = false;
      this._degrade(/blocked/i.test(String(e && e.message)) ? "blocked" : "indexeddb-failed");
      return false;
    }
  }

  _tx(store, mode){
    return this.db.transaction(store, mode).objectStore(store);
  }

  async put(store, record){
    if (!this.available){ const r = await this._lsPut(store, record); this._announce(store, record && record.id); return r; }
    return new Promise((resolve, reject) => {
      let req;
      try { req = this._tx(store, "readwrite").put(record); }
      catch(err){ this._handleWriteError(err); reject(err); return; }
      req.onsuccess = () => { this._announce(store, record && record.id); resolve(record); };
      req.onerror = () => { this._handleWriteError(req.error); reject(req.error); };
    });
  }

  async get(store, id){
    if (!this.available) return this._lsGet(store, id);
    return new Promise((resolve, reject) => {
      const req = this._tx(store, "readonly").get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAll(store){
    if (!this.available) return this._lsGetAll(store);
    return new Promise((resolve, reject) => {
      const req = this._tx(store, "readonly").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(store, id){
    if (!this.available){ const r = await this._lsDelete(store, id); this._announce(store, id); return r; }
    return new Promise((resolve, reject) => {
      const req = this._tx(store, "readwrite").delete(id);
      req.onsuccess = () => { this._announce(store, id); resolve(true); };
      req.onerror = () => reject(req.error);
    });
  }

  async clearStore(store){
    // Bulk deletion is the one thing a person can't undo — take a safety snapshot first
    // (the web layer wires this to the Backups ring; it is throttled so "clear all" = one snapshot).
    if (this.safetyNet){ try { await this.safetyNet("before-clear-" + store); } catch(e){ console.warn("safety snapshot failed", e); } }
    if (!this.available){ const r = await this._lsClear(store); this._announce(store, null); return r; }
    return new Promise((resolve, reject) => {
      const req = this._tx(store, "readwrite").clear();
      req.onsuccess = () => { this._announce(store, null); resolve(true); };
      req.onerror = () => reject(req.error);
    });
  }

  /* ---- localStorage fallback path (used only if IndexedDB is unavailable,
     e.g. private browsing in some browsers). Mirrors the same async API
     so callers never need to know which backend is active. ---- */
  _lsKey(store){ return CONFIG.LS_PREFIX + "store_" + store; }
  _lsReadStore(store){
    try { return JSON.parse(localStorage.getItem(this._lsKey(store)) || "{}"); }
    catch(e){ return {}; }
  }
  _lsWriteStore(store, obj){
    try { localStorage.setItem(this._lsKey(store), JSON.stringify(obj)); return true; }
    catch(e){ console.error("localStorage write failed", e); this._handleWriteError(e); return false; }
  }
  async _lsPut(store, record){
    const o = this._lsReadStore(store); o[record.id] = record;
    // Throw instead of pretending the save worked — the editor shows an error and keeps the draft.
    if (!this._lsWriteStore(store, o)) throw new Error("Could not save: browser storage is full or unavailable.");
    return record;
  }
  async _lsGet(store, id){ const o = this._lsReadStore(store); return o[id] || null; }
  async _lsGetAll(store){ const o = this._lsReadStore(store); return Object.values(o); }
  async _lsDelete(store, id){ const o = this._lsReadStore(store); delete o[id]; this._lsWriteStore(store, o); return true; }
  async _lsClear(store){ this._lsWriteStore(store, {}); return true; }

  /* ---- settings: always localStorage, small key/value pairs ---- */
  getSetting(key, fallback){
    if (!this.lsAvailable) return fallback;
    try {
      const raw = localStorage.getItem(CONFIG.LS_PREFIX + "setting_" + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch(e){ return fallback; }
  }
  setSetting(key, value){
    if (!this.lsAvailable) return false;
    try { localStorage.setItem(CONFIG.LS_PREFIX + "setting_" + key, JSON.stringify(value)); return true; }
    catch(e){ console.error("setSetting failed", e); return false; }
  }
  // Removes every persisted setting (appSettings, customModels,
  // challengeProgress, theme, etc.) — everything saved via setSetting()
  // above, which lives in its own "pf_setting_*" localStorage namespace
  // completely separate from the IndexedDB object stores that
  // clearStore()/clearAll() operate on. "Clear everything" needs both:
  // clearing only the stores left every setting behind (custom models,
  // uiScale, theme, onboarding flags, ...) even though the prompts and
  // templates were gone, which is what made it look like nothing had
  // actually been cleared.
  clearAllSettings(){
    if (!this.lsAvailable) return;
    const prefix = CONFIG.LS_PREFIX + "setting_";
    const keys = [];
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  }

  // The set of localStorage-backed settings worth carrying in a full JSON
  // backup. Deliberately NOT everything getSetting() has ever stored —
  // per-device UI prefs like editor font size or which onboarding screens
  // were dismissed shouldn't travel with a backup restored on a different
  // browser/device, but a prompt engineer's actual model roster and default
  // model choice are real data, not device chrome.
  async exportAll(){
    const dump = {};
    for (const store of CONFIG.STORES) dump[store] = await this.getAll(store);
    // appSettings only contributes the couple of fields listed in
    // BACKUP_SETTING_KEYS — see the comment there for why the rest of the
    // per-device UI prefs are left out of a portable backup.
    const appSettings = this.getSetting("appSettings", {});
    dump._settings = {};
    for (const key of CONFIG.BACKUP_SETTING_KEYS){
      if (key === "customModels"){ dump._settings.customModels = this.getSetting("customModels", []); continue; }
      if (key in appSettings) dump._settings[key] = appSettings[key];
    }
    dump._meta = { exportedAt: Date.now(), version: CONFIG.DB_VERSION, app: "prompt-forge" };
    return dump;
  }

  /* ---- import hardening ---------------------------------------------------------------
     A backup/share file is untrusted input. Records are validated and normalised so that a
     hand-edited or corrupted file can't crash a view (title as an object, tags as a string,
     updatedAt "yesterday") or smuggle prototype-pollution keys. */
  static _scrub(v, depth = 0){
    if (depth > 12) return null;
    if (Array.isArray(v)) return v.slice(0, 5000).map(x => StorageManager._scrub(x, depth + 1));
    if (v && typeof v === "object"){
      const o = {};
      for (const k of Object.keys(v)){
        if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
        o[k] = StorageManager._scrub(v[k], depth + 1);
      }
      return o;
    }
    return v;
  }
  static _normalizeRecord(store, rec){
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) return null;
    if (typeof rec.id !== "string" || !rec.id || rec.id.length > 200) return null;
    const r = StorageManager._scrub(rec);
    const TEXT = ["title","name","body","template","purpose","when","example","note","description","trigger","category","kind","label","query","format","status","color","promptId"];
    for (const k of TEXT){
      if (k in r && r[k] != null && typeof r[k] !== "string") r[k] = (typeof r[k] === "object") ? "" : String(r[k]);
      if (k in r && r[k] == null) r[k] = "";
    }
    for (const k of ["tags","memberIds","steps","blocks","variables"]){
      if (k in r && !Array.isArray(r[k])) r[k] = [];
    }
    if (Array.isArray(r.tags)) r.tags = r.tags.filter(t => typeof t === "string" || typeof t === "number").map(String);
    if (Array.isArray(r.memberIds)) r.memberIds = r.memberIds.filter(t => typeof t === "string");
    const now = Date.now();
    for (const k of ["createdAt","updatedAt"]){
      const n = Number(r[k]);
      r[k] = Number.isFinite(n) && n > 0 ? n : now;
    }
    if (store === "versions"){
      const n = Number(r.versionNum);
      r.versionNum = Number.isFinite(n) && n > 0 ? n : 1;
    }
    return r;
  }

  // mode: "merge" keeps existing records and adds/overwrites by id; "replace" wipes first.
  // All stores are written inside ONE IndexedDB transaction, so a restore either fully
  // succeeds or changes nothing (the original cleared each store and then wrote records one
  // transaction at a time — an interruption mid-way left the library half-empty).
  async importAll(dump, mode){
    if (!dump || typeof dump !== "object" || Array.isArray(dump)) throw new Error("That file isn't a Prompt Forge backup.");
    const clean = {};
    let skipped = 0;
    for (const store of CONFIG.STORES){
      if (!Array.isArray(dump[store])) continue;
      clean[store] = [];
      for (const rec of dump[store]){
        const r = StorageManager._normalizeRecord(store, rec);
        if (r) clean[store].push(r); else skipped++;
      }
    }
    const names = Object.keys(clean);
    if (mode === "replace" && this.safetyNet){ try { await this.safetyNet("before-replace-import"); } catch(e){ console.warn("safety snapshot failed", e); } }

    if (names.length){
      if (this.available){
        await new Promise((resolve, reject) => {
          const tx = this.db.transaction(names, "readwrite");
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => { this._handleWriteError(tx.error); reject(tx.error); };
          tx.onabort = () => { this._handleWriteError(tx.error); reject(tx.error || new Error("Import aborted — nothing was changed.")); };
          try {
            for (const name of names){
              const os = tx.objectStore(name);
              if (mode === "replace") os.clear();
              for (const r of clean[name]) os.put(r);
            }
          } catch(err){
            // A synchronous failure (e.g. a value that can't be structured-cloned) must abort the
            // transaction explicitly — otherwise whatever was queued before it still commits.
            try { tx.abort(); } catch(e){}
            reject(err);
          }
        });
      } else {
        for (const name of names){
          const o = mode === "replace" ? {} : this._lsReadStore(name);
          for (const r of clean[name]) o[r.id] = r;
          if (!this._lsWriteStore(name, o)) throw new Error("Import failed: browser storage is full.");
        }
      }
      for (const name of names) this._announce(name, null);
    }

    // Restore the settings a backup can carry (see BACKUP_SETTING_KEYS).
    // customModels always merges by id rather than being wiped even in
    // "replace" mode for the stores above — replacing a device's entire
    // model roster because one backup file didn't happen to define a model
    // someone was actively using would be a surprising, silent loss.
    if (dump._settings && typeof dump._settings === "object"){
      const st = StorageManager._scrub(dump._settings);
      if (Array.isArray(st.customModels)){
        const existing = mode === "replace" ? [] : this.getSetting("customModels", []);
        const byId = new Map(existing.map(m => [m.id, m]));
        for (const m of st.customModels) if (m && typeof m.id === "string" && m.id) byId.set(m.id, m);
        this.setSetting("customModels", Array.from(byId.values()));
      }
      const appSettings = this.getSetting("appSettings", {});
      for (const key of ["selectedModel", "scoringProfile"]){
        if (typeof st[key] === "string") appSettings[key] = st[key];
      }
      this.setSetting("appSettings", appSettings);
      if (st.challengeProgress && typeof st.challengeProgress === "object" && !Array.isArray(st.challengeProgress)){
        const existing = mode === "replace" ? {} : this.getSetting("challengeProgress", {});
        this.setSetting("challengeProgress", { ...existing, ...st.challengeProgress });
      }
    }
    this.lastImportSkipped = skipped;
    return true;
  }

  estimateUsage(){
    if (navigator.storage && navigator.storage.estimate){
      return navigator.storage.estimate();
    }
    return Promise.resolve(null);
  }
}
