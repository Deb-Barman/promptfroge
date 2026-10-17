import { describe, expect, it } from "vitest";
import { Analyzer } from "../src/core/Analyzer";
import { CONFIG } from "../src/core/CONFIG";
import { DuplicateFinder } from "../src/core/DuplicateFinder";
import { PromptEngine } from "../src/core/PromptEngine";
import { RealTokenizer } from "../src/core/RealTokenizer";
import { SecurityScanner } from "../src/core/SecurityScanner";
import { StorageManager } from "../src/core/StorageManager";
import { TemplateEngine } from "../src/core/TemplateEngine";
import { Validator } from "../src/core/Validator";

describe("RealTokenizer (cl100k_base, exact BPE)", () => {
  it("matches tiktoken reference counts", async () => {
    await RealTokenizer.warm();
    expect(RealTokenizer.isReady()).toBe(true);
    expect(RealTokenizer.countTokens("hello world")).toBe(2);
    expect(RealTokenizer.countTokens("tiktoken is great!")).toBe(6);
    expect(RealTokenizer.countTokens("")).toBe(0);
  });
});

describe("TemplateEngine", () => {
  it("extracts and renders {{variables}}", () => {
    const body = "Hello {{name}}, summarize {{topic}} in {{count}} bullets.";
    expect(TemplateEngine.extractVariables(body).sort()).toEqual(["count", "name", "topic"]);
    expect(TemplateEngine.render(body, { name: "Deb", topic: "RAG", count: "3" })).toBe("Hello Deb, summarize RAG in 3 bullets.");
    expect(TemplateEngine.hasUnfilledVariables(body)).toBe(true);
  });
});

describe("Analyzer", () => {
  it("scores a structured prompt higher than a vague one", () => {
    const good = Analyzer.analyze("You are a senior data analyst. Task: summarize the attached report for executives. Context: Q3 results. Output format: 5 bullet points. Constraints: do not speculate; max 120 words. Example: - Revenue up 4%.", "advanced");
    const bad = Analyzer.analyze("make it better", "advanced");
    expect(good.overall).toBeGreaterThan(bad.overall);
    expect(good.issues.length).toBeLessThan(bad.issues.length + 1);
    expect(Object.keys(good.scores)).toContain("clarity");
  });
});

describe("SecurityScanner / Validator / DuplicateFinder", () => {
  it("flags credentials", () => {
    const f = SecurityScanner.scan("key = sk-" + "a".repeat(40) + " and AKIAABCDEFGHIJKLMNOP");
    expect(f.length).toBeGreaterThan(0);
  });
  it("validates JSON", () => {
    expect(Validator.validate('{"a":1}', "json").valid).toBe(true);
    expect(Validator.validate("{bad", "json").valid).toBe(false);
  });
  it("clusters near-duplicates", () => {
    const base = "Write a friendly onboarding email for new customers explaining the dashboard and how to invite teammates";
    const clusters = DuplicateFinder.findClusters([
      { id: "a", title: "A", body: base }, { id: "b", title: "B", body: base + " today" }, { id: "c", title: "C", body: "Explain quantum tunnelling to a ten year old" },
    ], 0.55);
    expect(clusters.length).toBe(1);
  });
});

describe("CONFIG", () => {
  it("ships the full built-in catalogues", () => {
    for (const k of ["MODELS", "SECURITY_PATTERNS"]) expect((CONFIG as any)[k]?.length).toBeGreaterThan(0);
    expect(Object.keys(CONFIG).length).toBeGreaterThanOrEqual(20);
  });
});

describe("StorageManager + PromptEngine (IndexedDB)", () => {
  it("round-trips a full backup (exportAll -> importAll replace)", async () => {
    const storage = new StorageManager();
    await storage.init();
    const pe = new PromptEngine(storage);
    await pe.load();
    const p = pe.newPromptSkeleton({ title: "Backup test", body: "Hello {{who}}" });
    await pe.savePrompt(p);
    expect(pe.getPrompt(p.id)?.title).toBe("Backup test");

    const dump = JSON.parse(JSON.stringify(await storage.exportAll()));
    expect(JSON.stringify(dump)).toContain("Backup test");

    // replace mode into a clean engine brings the prompt back
    await storage.importAll({ ...dump, prompts: [] }, "replace");
    await pe.load();
    expect(pe.getPrompt(p.id)).toBeNull();
    await storage.importAll(dump, "replace");
    await pe.load();
    expect(pe.getPrompt(p.id)?.title).toBe("Backup test");
  });

  it("supports favorite / pin / archive toggles", async () => {
    const storage = new StorageManager();
    await storage.init();
    const pe = new PromptEngine(storage);
    await pe.load();
    const p = pe.newPromptSkeleton({ title: "Toggles", body: "x" });
    await pe.savePrompt(p);
    await pe.toggleFavorite(p.id); await pe.togglePin(p.id); await pe.toggleArchive(p.id);
    const got = pe.getPrompt(p.id);
    expect([got.favorite, got.pinned, got.archived]).toEqual([true, true, true]);
    expect(pe.listPrompts().some((x: any) => x.id === p.id)).toBe(false); // archived hidden by default
    expect(pe.listPrompts({ includeArchived: true }).some((x: any) => x.id === p.id)).toBe(true);
  });
});
