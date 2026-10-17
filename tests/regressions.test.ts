import { describe, expect, it } from "vitest";
import { Utils } from "../src/core/Utils";
import { StorageManager } from "../src/core/StorageManager";
import { PromptEngine } from "../src/core/PromptEngine";
import { PromptCleaner } from "../src/core/PromptCleaner";
import { PromptTools } from "../src/core/PromptTools";
import { SearchEngine } from "../src/core/SearchEngine";

async function engine() {
  const s = new StorageManager(); await s.init();
  const pe = new PromptEngine(s); await pe.load();
  return { s, pe };
}

describe("data integrity: saving never rewrites prompt content", () => {
  it("keeps XML tags, HTML samples and comparison operators in prompts, templates, snippets and patterns", async () => {
    const { s, pe } = await engine();
    const body = "<role>You are a reviewer</role>\nIf a < b and c > d, flag it.\n```html\n<div class=\"x\">hi</div>\n```";
    const p = await pe.savePrompt(pe.newPromptSkeleton({ title: "Use <context> tags", body }));
    expect((await s.get("prompts", p.id)).body).toBe(body);
    expect(p.title).toBe("Use <context> tags");
    const t = await pe.saveTemplate(pe.newTemplateSkeleton({ name: "t", body }));
    expect(t.body).toBe(body);
    const sn = await pe.saveSnippet({ id: "s1", trigger: "/x", body });
    expect(sn.body).toBe(body);
    const pat = await pe.saveCustomPattern(pe.newCustomPatternSkeleton({ name: "p", template: body }));
    expect(pat.template).toBe(body);
  });
  it("still removes control characters and normalises CRLF", () => {
    expect(Utils.sanitizeText("a\u0000b\r\nc\rd\u0007")).toBe("ab\nc\nd");
  });
});

describe("non-Latin text (Bengali, Hindi, Arabic, CJK, accents)", () => {
  const bn = "তুমি একজন অভিজ্ঞ কোড রিভিউয়ার। কোডটি যত্ন সহকারে পড়ো। ঝুঁকিগুলো তালিকাভুক্ত করো।";
  it("tokenises every script", () => {
    expect(Utils.tokenize("café déjà-vu")).toEqual(["café", "déjà-vu"]);
    expect(Utils.tokenize(bn).length).toBeGreaterThanOrEqual(10);
    expect(Utils.tokenize("你好 世界 привет")).toEqual(["你好", "世界", "привет"]);
  });
  it("does not report different Bengali sentences as duplicates", () => {
    expect(PromptCleaner.inspect(bn).filter((f: any) => f.type === "duplicate_sentence")).toEqual([]);
    expect(PromptTools.findInternalRedundancy(bn)).toEqual([]);
  });
  it("still detects a genuinely repeated Bengali sentence", () => {
    const rep = "কোডটি যত্ন সহকারে পড়ো। অন্য কিছু লেখো। কোডটি যত্ন সহকারে পড়ো।";
    expect(PromptCleaner.inspect(rep).some((f: any) => f.type === "duplicate_sentence")).toBe(true);
  });
  it("splits sentences on the danda and CJK full stop", () => {
    expect(bn.split(Utils.SENTENCE_SPLIT).length).toBe(3);
    expect("一。二。三。".split(Utils.SENTENCE_SPLIT).filter(Boolean).length).toBe(3);
  });
  it("finds Bengali prompts by multi-word search and keeps Unicode snippet triggers", async () => {
    const { pe } = await engine();
    await pe.savePrompt(pe.newPromptSkeleton({ title: "কোড রিভিউ", body: bn }));
    const hits = new SearchEngine(pe).search("কোড রিভিউয়ার অভিজ্ঞ");
    expect(hits.length).toBe(1);
    const sn = await pe.saveSnippet({ id: "bn1", trigger: "/ভূমিকা", body: "x" });
    expect(sn.trigger).toBe("/ভূমিকা");
  });
});

describe("timeAgo", () => {
  it("never rounds up to the next unit", () => {
    const now = Date.now();
    expect(Utils.timeAgo(now - 59.6 * 60000)).toBe("59m ago");
    expect(Utils.timeAgo(now - 23.7 * 3600000)).toBe("23h ago");
  });
});

describe("storage hardening", () => {
  it("restores atomically and normalises malformed records instead of crashing views later", async () => {
    const { s, pe } = await engine();
    await pe.savePrompt(pe.newPromptSkeleton({ title: "keep me", body: "x" }));
    const evil = JSON.parse('{"prompts":[{"id":"ok1","title":{"a":1},"body":42,"tags":"nope","updatedAt":"yesterday","__proto__":{"polluted":true}},{"id":{"bad":1}},null,"str",{"title":"no id"}],"_settings":{"customModels":[{"id":"m1","label":"M"},{"label":"no id"}]}}');
    await s.importAll(evil, "replace");
    await pe.load();
    const all = pe.listPrompts({ includeArchived: true });
    expect(all.map((p: any) => p.id)).toEqual(["ok1"]);
    expect(typeof all[0].title).toBe("string");
    expect(all[0].body).toBe("42");
    expect(Array.isArray(all[0].tags)).toBe(true);
    expect(Number.isFinite(all[0].updatedAt)).toBe(true);
    expect(({} as any).polluted).toBeUndefined();
    expect(s.lastImportSkipped).toBe(4);
    expect(s.getSetting("customModels", []).map((m: any) => m.id)).toEqual(["m1"]);
  });
  it("rolls the whole import back if any write fails (nothing half-restored)", async () => {
    const { s, pe } = await engine();
    await s.importAll({ prompts: [{ id: "a", title: "A" }, { id: "b", title: "B" }] }, "replace");
    // a value IndexedDB cannot structured-clone aborts the transaction
    const bad = { prompts: [{ id: "c", title: "C" }, { id: "d", title: "D", fn: () => 1 }] };
    const real = StorageManager._scrub;
    (StorageManager as any)._scrub = (v: any) => v; // bypass scrub so the function reaches IndexedDB
    await expect(s.importAll(bad, "replace")).rejects.toBeTruthy();
    (StorageManager as any)._scrub = real;
    expect(((await s.getAll("prompts")) as any[]).map((p: any) => p.id).sort()).toEqual(["a", "b"]);
  });
  it("announces writes and takes a safety snapshot before clearing", async () => {
    const { s, pe } = await engine();
    const seen: string[] = []; const reasons: string[] = [];
    s.on("write", (d: any) => seen.push(d.store));
    s.safetyNet = async (r: string) => { reasons.push(r); };
    await pe.savePrompt(pe.newPromptSkeleton({ title: "w" }));
    await s.clearStore("prompts");
    expect(seen).toContain("prompts");
    expect(reasons).toEqual(["before-clear-prompts"]);
  });
});

describe("template variables", () => {
  it("accepts names in any script and renders them", async () => {
    const { TemplateEngine } = await import("../src/core/TemplateEngine");
    expect(TemplateEngine.extractVariables("Hello {{নাম}}, you are {{age=30}} and {{city}}")).toEqual(["নাম", "age", "city"]);
    expect(TemplateEngine.render("Hi {{নাম}}!", { "নাম": "দেব" })).toBe("Hi দেব!");
  });
  it("hasUnfilledVariables is stable across repeated calls (shared /g regex used to alternate true/false)", async () => {
    const { TemplateEngine } = await import("../src/core/TemplateEngine");
    const t = "needs {{x}}";
    expect([1, 2, 3, 4].map(() => TemplateEngine.hasUnfilledVariables(t))).toEqual([true, true, true, true]);
    expect(TemplateEngine.hasUnfilledVariables("nothing here")).toBe(false);
  });
});
