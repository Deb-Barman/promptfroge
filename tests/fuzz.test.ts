import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapApp, type AppContext } from "../src/app/bootstrap";
import { LegacyChrome } from "../src/shell/LegacyChrome";

// Hostile-data fuzz: a backup file can carry any string in any field (importAll
// writes records straight to storage, bypassing the save-time sanitizer). The view
// layer builds HTML with template strings, so every field must be escaped on render.
let ctx: AppContext;
const errors: string[] = [];
const PAYLOADS = [
  `<img src=x onerror=alert(1) data-pwn="1">`,
  `"><svg onload=alert(1) data-pwn="2">`,
  `' autofocus onfocus='alert(1)' data-pwn='3`,
  `</textarea></script><b data-pwn="4">x</b>`,
];
const VIEWS = ["dashboard", "editor", "builder", "library", "compare", "templates", "patterns", "chains", "history", "analytics", "learn", "settings"];

function poison(v: any, n: number): any {
  if (typeof v === "string") return PAYLOADS[n % PAYLOADS.length] + v;
  if (Array.isArray(v)) return v.map(x => poison(x, n + 1));
  if (v && typeof v === "object") { const o: any = {}; for (const k of Object.keys(v)) o[k] = k === "id" || k === "promptId" ? v[k] : poison(v[k], n + 1); return o; }
  return v;
}

beforeAll(async () => {
  document.body.innerHTML = renderToStaticMarkup(createElement(LegacyChrome));
  window.addEventListener("error", e => errors.push(String(e.error?.stack ?? e.message)));
  ctx = await bootstrapApp();
});

describe("hostile imported data", () => {
  it("is escaped in every view and does not throw", async () => {
    const { promptEngine: pe, storage, ui, versionManager } = ctx;
    const p = await pe.savePrompt(pe.newPromptSkeleton({ title: "t", body: "Hello {{name}} [[Other]]", tags: ["a"], category: "custom" }));
    await pe.savePrompt(pe.newPromptSkeleton({ title: "Other", body: "x" }));
    await versionManager.createVersion(p, "note");
    await pe.saveTemplate(pe.newTemplateSkeleton({ name: "tpl", body: "Hi {{who}}" }));
    await pe.saveSnippet({ id: "sn1", trigger: "/hi", body: "hello", name: "hi", createdAt: 1, updatedAt: 1 });
    await pe.saveCustomPattern(pe.newCustomPatternSkeleton({ name: "pat", template: "T {{x}}", variables: ["x"] }));
    await pe.saveChain(pe.newChainSkeleton({ name: "c", steps: [{ id: "s1", promptId: p.id, note: "n" }] }));
    await pe.saveGroup(pe.newGroupSkeleton("prompt", { name: "g", memberIds: [p.id] }));
    await pe.saveBuilderStructure(pe.newBuilderStructureSkeleton({ name: "st", blocks: [{ type: "custom_1", label: "L", color: "red" }] }));
    await pe.saveSavedSearch({ id: "ss1", name: "s", query: "q", createdAt: 1 });
    const dump: any = await storage.exportAll();
    storage.setSetting("customModels", [{ id: "cm1", label: PAYLOADS[0], vendor: PAYLOADS[1], group: PAYLOADS[2], charsPerToken: 4, contextWindow: 1000, priceIn: 1, priceOut: 1, priceNote: PAYLOADS[3] }]);
    dump._settings.customModels = storage.getSetting("customModels", []);
    const bad: any = { _settings: dump._settings };
    for (const s of ["prompts", "templates", "snippets", "history", "versions", "customPatterns", "chains", "savedSearches", "groups", "builderStructures"]) bad[s] = poison(dump[s], 0);
    await storage.importAll(bad, "replace");
    await pe.load(); ctx.suggestionEngine.rebuildFromCorpus();
    const leaks: string[] = [];
    for (const v of VIEWS) {
      try { ui.navigate(v); } catch (e) { leaks.push(`${v} threw: ${(e as Error).message}`); continue; }
      if (document.querySelector("[data-pwn]")) leaks.push(`${v} view leaked`);
    }
    // detail screens that take an id
    try { ui.navigate("history"); ui._renderHistoryDetail?.(p.id); if (document.querySelector("[data-pwn]")) leaks.push("history detail leaked"); } catch (e) { leaks.push("history detail threw " + (e as Error).message); }
    const names = Object.keys(Object.getPrototypeOf(ui)).filter(n => /^open[A-Z]\w*Modal$/.test(n) && (ui as any)[n].length === 0);
    for (const n of names) {
      try { ui.navigate("editor"); (ui as any)[n](); if (document.querySelector("[data-pwn]")) leaks.push(`modal ${n} leaked`); } catch (e) { leaks.push(`${n} threw: ${(e as Error).message}`); }
      try { ui.closeModal(); } catch {}
    }
    ui.navigate("library");
    const lib = document.getElementById("workspace")!.innerHTML;
    expect(lib).toContain("autofocus onfocus"); // payload text really rendered (as text), so the leak check above isn't vacuous
    expect(lib).not.toMatch(/<[^>]*\sonfocus=/)
    expect(leaks).toEqual([]);
    expect(errors).toEqual([]);
  });
});
