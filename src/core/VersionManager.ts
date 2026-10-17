// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "./Utils";

/* ============================================================================
   VERSION MANAGER — snapshot/restore/compare, keyed to a prompt's id.
   Versions are stored as their own IndexedDB records (store: "versions")
   rather than nested inside the prompt object, so history stays queryable
   and doesn't bloat every prompt read.
   ============================================================================ */
export class VersionManager {
  constructor(storage, promptEngine){
    this.storage = storage;
    this.pe = promptEngine;
  }

  async listVersions(promptId){
    const all = await this.storage.getAll("versions");
    return all.filter(v => v.promptId === promptId).sort((a, b) => a.versionNum - b.versionNum);
  }

  async createVersion(prompt, note){
    const versions = await this.listVersions(prompt.id);
    const nextNum = versions.length ? versions[versions.length - 1].versionNum + 1 : 1;
    const version = {
      id: Utils.uid("ver"), promptId: prompt.id, versionNum: nextNum,
      title: prompt.title, body: prompt.body, note: Utils.sanitizeText(note || ""),
      createdAt: Date.now()
    };
    await this.storage.put("versions", version);
    prompt.currentVersion = nextNum;
    await this.pe.savePrompt(prompt);
    await this._trimToRetentionLimit(prompt.id, versions.concat(version));
    return version;
  }

  // Version Retention setting: "0" means unlimited. Trimming removes the
  // oldest versions beyond the limit, keeping version numbers as historical
  // labels rather than renumbering — a gap in numbering just means older
  // versions were pruned, which is expected and non-destructive to what remains.
  async _trimToRetentionLimit(promptId, versions){
    const limitRaw = this.storage.getSetting("appSettings", {}).versionRetention;
    const limit = parseInt(limitRaw, 10);
    if (!limit || limit <= 0 || versions.length <= limit) return;
    const sorted = versions.slice().sort((a, b) => a.versionNum - b.versionNum);
    const toRemove = sorted.slice(0, sorted.length - limit);
    for (const v of toRemove) await this.storage.delete("versions", v.id);
  }

  async restoreVersion(promptId, versionId){
    const version = await this.storage.get("versions", versionId);
    const prompt = this.pe.getPrompt(promptId);
    if (!version || !prompt) return null;
    prompt.body = version.body;
    prompt.title = version.title;
    await this.pe.savePrompt(prompt);
    // Restoring creates a new version entry too, so the act of restoring is
    // itself recorded in history rather than silently rewriting the past.
    await this.createVersion(prompt, `Restored from v${version.versionNum}`);
    return prompt;
  }

  diff(versionA, versionB){
    return Utils.diffWords(versionA.body, versionB.body);
  }
}
