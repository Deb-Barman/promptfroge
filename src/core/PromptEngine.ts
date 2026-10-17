// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { Utils } from "./Utils";
import { CONFIG } from "./CONFIG";
import { TemplateEngine } from "./TemplateEngine";

/* ============================================================================
   PROMPT ENGINE — source of truth for prompts/templates/snippets, backed by
   StorageManager but kept mirrored in memory so the UI, SuggestionEngine, and
   SearchEngine can read synchronously without round-tripping to IndexedDB on
   every keystroke. All mutations go through here so the mirror never drifts.
   ============================================================================ */
export class PromptEngine {
  declare storage: any;
  declare prompts: Map<string, any>;
  declare templates: Map<string, any>;
  declare snippets: Map<string, any>;
  declare customPatterns: Map<string, any>;
  declare chains: Map<string, any>;
  declare savedSearches: Map<string, any>;
  declare groups: Map<string, any>;
  declare builderStructures: Map<string, any>;
  declare listeners: Set<(kind: string, record: any) => void>;
  constructor(storage){
    this.storage = storage;
    this.prompts = new Map();
    this.templates = new Map();
    this.snippets = new Map();
    this.customPatterns = new Map();
    this.chains = new Map();
    this.savedSearches = new Map();
    this.groups = new Map();
    this.builderStructures = new Map();
    this.listeners = new Set();
  }

  async load(){
    const [prompts, templates, snippets, customPatterns, chains, savedSearches, groups, builderStructures] = await Promise.all([
      this.storage.getAll("prompts"),
      this.storage.getAll("templates"),
      this.storage.getAll("snippets"),
      this.storage.getAll("customPatterns"),
      this.storage.getAll("chains"),
      this.storage.getAll("savedSearches"),
      this.storage.getAll("groups"),
      this.storage.getAll("builderStructures")
    ]);
    // FIX (deviation from the original, see docs/ARCHITECTURE.md):
    // load() used to only *add* to the in-memory maps. After a "replace" import
    // or a backup restore, records that no longer exist in storage stayed
    // visible (and could be re-saved) until the next launch. Rebuild instead.
    [this.prompts, this.templates, this.snippets, this.customPatterns, this.chains, this.savedSearches, this.groups, this.builderStructures]
      .forEach(m => m.clear());
    prompts.forEach(p => this.prompts.set(p.id, p));
    templates.forEach(t => this.templates.set(t.id, t));
    snippets.forEach(s => this.snippets.set(s.id, s));
    customPatterns.forEach(p => this.customPatterns.set(p.id, p));
    chains.forEach(c => this.chains.set(c.id, c));
    savedSearches.forEach(s => this.savedSearches.set(s.id, s));
    groups.forEach(g => this.groups.set(g.id, g));
    builderStructures.forEach(s => this.builderStructures.set(s.id, s));

    // Built-in shortcuts are no longer seeded — a snippets table empty for
    // legitimate reasons (the user deleted everything on purpose) used to
    // look identical to "never seeded yet" and silently re-seeded the 5
    // defaults right back on the next load. Any that already exist from
    // an earlier version get removed once here rather than left to keep
    // reappearing after every deletion.
    const existingBuiltins = Array.from(this.snippets.values()).filter(s => s.builtin);
    for (const b of existingBuiltins){
      this.snippets.delete(b.id);
      await this.storage.delete("snippets", b.id);
    }
  }

  onChange(fn){ this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _notify(kind, record){ this.listeners.forEach(fn => { try { fn(kind, record); } catch(e){ console.error(e); } }); }

  /* ---------------- Prompts ---------------- */
  listPrompts({ includeArchived = false } = {}){
    const all = Array.from(this.prompts.values());
    return includeArchived ? all : all.filter(p => !p.archived);
  }
  getPrompt(id){ return this.prompts.get(id) || null; }

  // Scans every prompt body for [[Title]] references (inserted via the
  // editor's @ trigger) and resolves them against current prompt titles —
  // resolved at read time rather than stored as a separate relational
  // table, so renaming a prompt's title doesn't leave stale foreign keys
  // anywhere; a link just stops resolving until the [[...]] text is
  // updated to match, exactly like a wiki-link would. Case-insensitive
  // match, since title casing shouldn't be why a link silently breaks.
  buildLinkGraph(){
    const prompts = this.listPrompts();
    const byTitleLower = new Map();
    for (const p of prompts){
      const key = (p.title || "Untitled prompt").toLowerCase();
      if (!byTitleLower.has(key)) byTitleLower.set(key, []);
      byTitleLower.get(key).push(p);
    }
    const nodes = prompts.map(p => ({ id: p.id, title: p.title || "Untitled prompt", updatedAt: p.updatedAt }));
    const edges = [];
    const brokenLinks = [];
    const linkRe = /\[\[([^\]]+)\]\]/g;
    for (const p of prompts){
      const body = p.body || "";
      let m;
      linkRe.lastIndex = 0;
      while ((m = linkRe.exec(body))){
        const targetTitle = m[1].trim();
        const matches = byTitleLower.get(targetTitle.toLowerCase());
        if (matches && matches.length){
          // A title collision (two prompts sharing a name) links to
          // whichever matching prompt was created first — deterministic
          // rather than arbitrary, and avoidable by renaming one of them.
          const target = matches.slice().sort((a,b) => a.createdAt - b.createdAt)[0];
          if (target.id !== p.id) edges.push({ source: p.id, target: target.id });
        } else {
          brokenLinks.push({ sourceId: p.id, sourceTitle: p.title || "Untitled prompt", targetTitle });
        }
      }
    }
    return { nodes, edges, brokenLinks };
  }

  newPromptSkeleton(overrides = {}){
    const now = Date.now();
    return {
      id: Utils.uid("pr"),
      title: "",
      body: "",
      category: "custom",
      tags: [],
      favorite: false,
      pinned: false,
      archived: false,
      blocks: null,          // populated when authored via Builder
      format: "text",        // "text" | "json" | "xml" | "markdown"
      currentVersion: 1,
      status: "draft",       // "draft" | "review" | "production"
      useCount: 0,            // incremented each time this prompt is opened in the editor
      bestOf: false,          // "proud of this one" — distinct from favorite (favorite = used often)
      needsRevisit: null,     // { note: string, flaggedAt: number } | null — "parked, come back to this"
      edgeCaseChecks: {},     // { [checklistItemId]: true } — which edge cases have been reviewed for this prompt
      createdAt: now,
      updatedAt: now,
      ...overrides
    };
  }

  async savePrompt(prompt){
    prompt.title = Utils.sanitizeText(prompt.title || "").slice(0, 200);
    prompt.body = Utils.sanitizeText(prompt.body || "");
    prompt.updatedAt = Date.now();
    if (!prompt.createdAt) prompt.createdAt = prompt.updatedAt;
    if (!Array.isArray(prompt.tags)) prompt.tags = [];
    this.prompts.set(prompt.id, prompt);
    await this.storage.put("prompts", prompt);
    this._notify("prompt:save", prompt);
    return prompt;
  }

  async deletePrompt(id){
    this.prompts.delete(id);
    await this.storage.delete("prompts", id);
    // cascade: versions + history entries tied to this prompt are orphaned
    // data otherwise — clean them up so storage doesn't grow unbounded.
    const [versions, history] = await Promise.all([this.storage.getAll("versions"), this.storage.getAll("history")]);
    for (const v of versions) if (v.promptId === id) await this.storage.delete("versions", v.id);
    for (const h of history) if (h.promptId === id) await this.storage.delete("history", h.id);
    this._notify("prompt:delete", { id });
  }

  async duplicatePrompt(id){
    const src = this.getPrompt(id);
    if (!src) return null;
    const copy = { ...src, id: Utils.uid("pr"), title: (src.title || "Untitled") + " (copy)", pinned: false, createdAt: Date.now(), updatedAt: Date.now(), currentVersion: 1 };
    return this.savePrompt(copy);
  }

  async toggleFavorite(id){
    const p = this.getPrompt(id); if (!p) return;
    p.favorite = !p.favorite;
    return this.savePrompt(p);
  }
  async togglePin(id){
    const p = this.getPrompt(id); if (!p) return;
    p.pinned = !p.pinned;
    return this.savePrompt(p);
  }
  async toggleArchive(id){
    const p = this.getPrompt(id); if (!p) return;
    p.archived = !p.archived;
    return this.savePrompt(p);
  }
  async toggleBestOf(id){
    const p = this.getPrompt(id); if (!p) return;
    p.bestOf = !p.bestOf;
    return this.savePrompt(p);
  }
  async setStatus(id, status){
    const p = this.getPrompt(id); if (!p) return;
    if (!CONFIG.PROMPT_STATUSES.some(s => s.id === status)) return;
    p.status = status;
    return this.savePrompt(p);
  }
  async setNeedsRevisit(id, note){
    const p = this.getPrompt(id); if (!p) return;
    p.needsRevisit = { note: Utils.sanitizeText(note || "").slice(0, 300), flaggedAt: Date.now() };
    return this.savePrompt(p);
  }
  async clearNeedsRevisit(id){
    const p = this.getPrompt(id); if (!p) return;
    p.needsRevisit = null;
    return this.savePrompt(p);
  }
  async setEdgeCaseCheck(id, checkId, checked){
    const p = this.getPrompt(id); if (!p) return;
    if (!p.edgeCaseChecks) p.edgeCaseChecks = {};
    if (checked) p.edgeCaseChecks[checkId] = true;
    else delete p.edgeCaseChecks[checkId];
    return this.savePrompt(p);
  }
  // Tracks how often a prompt is actually opened in the editor — a signal
  // distinct from favorite (a deliberate, manual flag) that surfaces which
  // prompts genuinely get reused day-to-day without the user having to
  // remember to favorite them. Deliberately does NOT bump updatedAt or
  // call the full savePrompt() pipeline (which would re-sanitize/re-stamp
  // the whole object just to increment a counter) — writes directly.
  async incrementUseCount(id){
    const p = this.getPrompt(id); if (!p) return;
    p.useCount = (p.useCount || 0) + 1;
    this.prompts.set(p.id, p);
    await this.storage.put("prompts", p);
  }

  /* ---------------- Bulk operations ----------------
     Applied across a set of ids at once — for the "same 5-step edit
     across a dozen prompts" workflow. Each of these just loops the
     existing single-prompt method so the same validation/sanitization
     path is reused rather than duplicated. */
  async bulkArchive(ids, archived = true){
    for (const id of ids){
      const p = this.getPrompt(id); if (!p) continue;
      p.archived = archived;
      await this.savePrompt(p);
    }
  }
  async bulkDelete(ids){
    for (const id of ids) await this.deletePrompt(id);
  }
  async bulkAddTag(ids, tag){
    const clean = Utils.sanitizeText(tag || "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
    if (!clean) return;
    for (const id of ids){
      const p = this.getPrompt(id); if (!p) continue;
      if (!Array.isArray(p.tags)) p.tags = [];
      if (!p.tags.includes(clean)) p.tags.push(clean);
      await this.savePrompt(p);
    }
  }
  async bulkSetCategory(ids, category){
    if (!CONFIG.CATEGORIES.some(c => c.id === category)) return;
    for (const id of ids){
      const p = this.getPrompt(id); if (!p) continue;
      p.category = category;
      await this.savePrompt(p);
    }
  }

  /* ---------------- Templates ---------------- */
  listTemplates(){ return Array.from(this.templates.values()); }
  getTemplate(id){ return this.templates.get(id) || null; }
  newTemplateSkeleton(overrides = {}){
    const now = Date.now();
    return { id: Utils.uid("tpl"), name: "", body: "", category: "custom", useCount: 0, createdAt: now, updatedAt: now, ...overrides };
  }
  async saveTemplate(tpl){
    tpl.name = Utils.sanitizeText(tpl.name || "").slice(0, 160);
    tpl.body = Utils.sanitizeText(tpl.body || "");
    tpl.updatedAt = Date.now();
    if (!tpl.createdAt) tpl.createdAt = tpl.updatedAt;
    if (typeof tpl.useCount !== "number") tpl.useCount = 0;
    this.templates.set(tpl.id, tpl);
    await this.storage.put("templates", tpl);
    this._notify("template:save", tpl);
    return tpl;
  }
  async deleteTemplate(id){
    this.templates.delete(id);
    await this.storage.delete("templates", id);
    this._notify("template:delete", { id });
  }
  async incrementTemplateUse(id){
    const t = this.getTemplate(id); if (!t) return;
    t.useCount = (t.useCount || 0) + 1;
    return this.saveTemplate(t);
  }

  /* ---------------- Snippets ---------------- */
  listSnippets(){ return Array.from(this.snippets.values()); }
  getSnippet(id){ return this.snippets.get(id) || null; }
  findSnippetByTrigger(trigger){
    const t = trigger.toLowerCase();
    return this.listSnippets().find(s => s.trigger.toLowerCase() === t) || null;
  }
  async saveSnippet(snip){
    snip.trigger = Utils.sanitizeText(snip.trigger || "").trim();
    if (!snip.trigger.startsWith("/")) snip.trigger = "/" + snip.trigger.replace(/^\/+/, "");
    // Trigger names can't contain spaces (they'd break the "/name " boundary
    // detection that ends a trigger) — convert "task role" to "task-role"
    // rather than reject it outright, since that's what someone typing a
    // natural multi-word name almost always means.
    snip.trigger = "/" + snip.trigger.slice(1).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{M}\p{N}-]/gu, "");
    snip.body = Utils.sanitizeText(snip.body || "");
    snip.updatedAt = Date.now();
    if (!snip.createdAt) snip.createdAt = snip.updatedAt;
    if (typeof snip.useCount !== "number") snip.useCount = 0;
    this.snippets.set(snip.id, snip);
    await this.storage.put("snippets", snip);
    this._notify("snippet:save", snip);
    return snip;
  }
  async deleteSnippet(id){
    this.snippets.delete(id);
    await this.storage.delete("snippets", id);
    this._notify("snippet:delete", { id });
  }
  async incrementSnippetUse(id){
    const s = this.getSnippet(id); if (!s) return;
    s.useCount = (s.useCount || 0) + 1;
    return this.saveSnippet(s);
  }

  /* ---------------- Custom Patterns ---------------- */
  listCustomPatterns(){ return Array.from(this.customPatterns.values()); }
  getCustomPattern(id){ return this.customPatterns.get(id) || null; }
  newCustomPatternSkeleton(overrides = {}){
    const now = Date.now();
    return {
      id: Utils.uid("cpat"), name: "", category: "Custom", purpose: "", when: "",
      template: "", example: "", variables: [], useCount: 0, createdAt: now, updatedAt: now, ...overrides
    };
  }
  async saveCustomPattern(pat){
    pat.name = Utils.sanitizeText(pat.name || "").slice(0, 120);
    pat.category = Utils.sanitizeText(pat.category || "Custom").slice(0, 40);
    pat.purpose = Utils.sanitizeText(pat.purpose || "");
    pat.when = Utils.sanitizeText(pat.when || "");
    pat.template = Utils.sanitizeText(pat.template || "");
    pat.example = Utils.sanitizeText(pat.example || "");
    pat.variables = TemplateEngine.extractVariables(pat.template);
    pat.updatedAt = Date.now();
    if (!pat.createdAt) pat.createdAt = pat.updatedAt;
    if (typeof pat.useCount !== "number") pat.useCount = 0;
    this.customPatterns.set(pat.id, pat);
    await this.storage.put("customPatterns", pat);
    this._notify("customPattern:save", pat);
    return pat;
  }
  async deleteCustomPattern(id){
    this.customPatterns.delete(id);
    await this.storage.delete("customPatterns", id);
    this._notify("customPattern:delete", { id });
  }

  /* ---------------- Groups (long-press "Add to Group" on cards) ----------
     A group is scoped to one "kind" (library | templates | patterns) —
     grouping is a within-section organizing tool, matching how the
     long-press gesture is triggered from within one grid at a time.
     memberIds holds prompt/template/pattern ids for that kind. */
  listGroups(kind){
    const all = Array.from(this.groups.values());
    return (kind ? all.filter(g => g.kind === kind) : all).sort((a,b) => a.name.localeCompare(b.name));
  }
  getGroup(id){ return this.groups.get(id) || null; }
  groupForMember(kind, memberId){
    for (const g of this.groups.values()){
      if (g.kind === kind && g.memberIds.includes(memberId)) return g;
    }
    return null;
  }
  newGroupSkeleton(kind, overrides = {}){
    const now = Date.now();
    return { id: Utils.uid("grp"), kind, name: "", color: CONFIG.GROUP_COLORS[this.groups.size % CONFIG.GROUP_COLORS.length], memberIds: [], createdAt: now, updatedAt: now, ...overrides };
  }
  async saveGroup(group){
    group.name = Utils.sanitizeText(group.name || "").slice(0, 60);
    group.updatedAt = Date.now();
    if (!group.createdAt) group.createdAt = group.updatedAt;
    if (!Array.isArray(group.memberIds)) group.memberIds = [];
    this.groups.set(group.id, group);
    await this.storage.put("groups", group);
    this._notify("group:save", group);
    return group;
  }
  async deleteGroup(id){
    this.groups.delete(id);
    await this.storage.delete("groups", id);
    this._notify("group:delete", { id });
  }
  // Adds memberId to targetGroupId's group and removes it from any other
  // group of the same kind first — a card belongs to at most one group at a
  // time, which keeps the "which group is this card in" chip on each card
  // unambiguous rather than needing a multi-badge display.
  async assignToGroup(kind, memberId, targetGroupId){
    for (const g of this.groups.values()){
      if (g.kind === kind && g.memberIds.includes(memberId) && g.id !== targetGroupId){
        g.memberIds = g.memberIds.filter(id => id !== memberId);
        await this.saveGroup(g);
      }
    }
    if (targetGroupId){
      const target = this.getGroup(targetGroupId);
      if (target && !target.memberIds.includes(memberId)){
        target.memberIds.push(memberId);
        await this.saveGroup(target);
      }
    }
  }
  // Same one-group-per-card assignment as assignToGroup, applied to many
  // members in one pass — used by the Library/Templates/Patterns "select
  // multiple → Add to group" bulk action, so selecting 20 cards and
  // grouping them doesn't mean 20 separate saves triggered one at a time
  // from the UI layer.
  async assignManyToGroup(kind, memberIds, targetGroupId){
    for (const g of this.groups.values()){
      if (g.kind !== kind || g.id === targetGroupId) continue;
      const before = g.memberIds.length;
      g.memberIds = g.memberIds.filter(id => !memberIds.includes(id));
      if (g.memberIds.length !== before) await this.saveGroup(g);
    }
    if (targetGroupId){
      const target = this.getGroup(targetGroupId);
      if (target){
        let changed = false;
        for (const id of memberIds){
          if (!target.memberIds.includes(id)){ target.memberIds.push(id); changed = true; }
        }
        if (changed) await this.saveGroup(target);
      }
    }
  }
  async removeFromAllGroups(kind, memberId){
    for (const g of this.groups.values()){
      if (g.kind === kind && g.memberIds.includes(memberId)){
        g.memberIds = g.memberIds.filter(id => id !== memberId);
        await this.saveGroup(g);
      }
    }
  }
  async removeManyFromAllGroups(kind, memberIds){
    for (const g of this.groups.values()){
      if (g.kind !== kind) continue;
      const before = g.memberIds.length;
      g.memberIds = g.memberIds.filter(id => !memberIds.includes(id));
      if (g.memberIds.length !== before) await this.saveGroup(g);
    }
  }

  /* ---------------- Visual Builder structure presets ---------------------
     A saved structure is just a name + an ordered list of block
     definitions (built-in BLOCK_TYPES id, or a custom label/color like the
     canvas's own "add your own section"). Applying one to the canvas
     replaces the current blocks with fresh copies — never a live
     reference, since editing text in one applied instance should never
     retroactively change the saved preset. */
  listBuilderStructures(){
    // Built-ins first (in their defined order), then the person's own,
    // newest first — mirrors how Patterns lists built-in before custom.
    const custom = Array.from(this.builderStructures.values()).sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
    return [...CONFIG.BUILDER_STRUCTURES, ...custom];
  }
  getBuilderStructure(id){
    return CONFIG.BUILDER_STRUCTURES.find(s => s.id === id) || this.builderStructures.get(id) || null;
  }
  newBuilderStructureSkeleton(overrides = {}){
    const now = Date.now();
    return { id: Utils.uid("struct"), name: "", blocks: [], builtin: false, createdAt: now, updatedAt: now, ...overrides };
  }
  async saveBuilderStructure(structure){
    structure.name = Utils.sanitizeText(structure.name || "").slice(0, 80);
    structure.updatedAt = Date.now();
    if (!structure.createdAt) structure.createdAt = structure.updatedAt;
    if (!Array.isArray(structure.blocks)) structure.blocks = [];
    structure.builtin = false; // only CONFIG.BUILDER_STRUCTURES entries are ever builtin
    this.builderStructures.set(structure.id, structure);
    await this.storage.put("builderStructures", structure);
    this._notify("builderStructure:save", structure);
    return structure;
  }
  async deleteBuilderStructure(id){
    // Built-ins live in CONFIG, not the store — nothing to delete there;
    // guard so a stray delete call on a built-in id is a harmless no-op
    // rather than needing the caller to check first.
    if (!this.builderStructures.has(id)) return;
    this.builderStructures.delete(id);
    await this.storage.delete("builderStructures", id);
    this._notify("builderStructure:delete", { id });
  }

  async incrementCustomPatternUse(id){
    const p = this.getCustomPattern(id); if (!p) return;
    p.useCount = (p.useCount || 0) + 1;
    return this.saveCustomPattern(p);
  }

  /* ---------------- Chains ----------------
     A chain is a planning artifact: an ordered list of steps, each pointing
     at a saved prompt by id plus a free-text note on what that step's
     output feeds into next. This is intentionally NOT an execution engine —
     nothing here calls any model or API; it's a way to lay out a multi-step
     workflow (prompt A's output -> prompt B's input -> ...) so a builder
     can plan and document it, consistent with the app's fully offline scope. */
  listChains(){ return Array.from(this.chains.values()).sort((a,b) => b.updatedAt - a.updatedAt); }
  getChain(id){ return this.chains.get(id) || null; }
  newChainSkeleton(overrides = {}){
    const now = Date.now();
    return { id: Utils.uid("chain"), name: "", description: "", steps: [], createdAt: now, updatedAt: now, ...overrides };
  }
  async saveChain(chain){
    chain.name = Utils.sanitizeText(chain.name || "").slice(0, 120);
    chain.description = Utils.sanitizeText(chain.description || "").slice(0, 500);
    chain.steps = (chain.steps || []).map(s => ({
      id: s.id || Utils.uid("step"),
      promptId: s.promptId || null,
      note: Utils.sanitizeText(s.note || "").slice(0, 300)
    }));
    chain.updatedAt = Date.now();
    if (!chain.createdAt) chain.createdAt = chain.updatedAt;
    this.chains.set(chain.id, chain);
    await this.storage.put("chains", chain);
    this._notify("chain:save", chain);
    return chain;
  }
  async deleteChain(id){
    this.chains.delete(id);
    await this.storage.delete("chains", id);
    this._notify("chain:delete", { id });
  }

  /* ---------------- Saved Searches ----------------
     A saved search is a named snapshot of a Library filter combination
     (query text + category + tag + favorites-only + sort) the user can
     re-apply with one click instead of re-entering the same filters. */
  listSavedSearches(){ return Array.from(this.savedSearches.values()).sort((a,b) => b.createdAt - a.createdAt); }
  getSavedSearch(id){ return this.savedSearches.get(id) || null; }
  async saveSavedSearch(search){
    search.id = search.id || Utils.uid("search");
    search.name = Utils.sanitizeText(search.name || "").slice(0, 80);
    search.createdAt = search.createdAt || Date.now();
    this.savedSearches.set(search.id, search);
    await this.storage.put("savedSearches", search);
    this._notify("savedSearch:save", search);
    return search;
  }
  async deleteSavedSearch(id){
    this.savedSearches.delete(id);
    await this.storage.delete("savedSearches", id);
    this._notify("savedSearch:delete", { id });
  }
}
