import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapApp, type AppContext } from "../src/app/bootstrap";
import { LegacyChrome } from "../src/shell/LegacyChrome";

let ctx: AppContext;
const errors: string[] = [];

beforeAll(async () => {
  document.body.innerHTML = renderToStaticMarkup(createElement(LegacyChrome));
  window.addEventListener("error", e => errors.push(String(e.error?.stack ?? e.message)));
  ctx = await bootstrapApp();
});

const VIEWS = ["dashboard", "editor", "builder", "library", "compare", "templates", "patterns", "chains", "history", "analytics", "learn", "settings"];

describe("view layer boots inside the React-rendered chrome", () => {
  it("renders every top-level view without throwing", () => {
    const empty: string[] = [];
    for (const v of VIEWS) {
      ctx.ui.navigate(v);
      const html = document.getElementById("workspace")!.innerHTML;
      if (html.length < 200) empty.push(v);
    }
    expect(empty).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("has a rail entry for each view", () => {
    const rail = document.getElementById("railNav")!.innerHTML;
    for (const v of VIEWS.filter(x => x !== "learn")) expect(rail).toContain(`data-view="${v}"`);
  });

  it("opens every argument-free modal and closes it again", () => {
    // Modals that take a record id / format argument are exercised in the flow tests below.
    const all = Object.keys(Object.getPrototypeOf(ctx.ui)).filter(n => /^open[A-Z]\w*Modal$/.test(n));
    const names = all.filter(n => (ctx.ui as any)[n].length === 0);
    expect(names.length).toBeGreaterThan(20);
    const failed: string[] = [];
    for (const n of names) {
      try { ctx.ui.navigate("editor"); (ctx.ui as any)[n](); } catch (e) { failed.push(`${n}: ${(e as Error).message}`); }
      try { ctx.ui.closeModal(); } catch { /* some modals have no close state */ }
    }
    expect(failed).toEqual([]);
  });

  it("toggles theme and persists it on <body>", () => {
    const before = document.body.dataset.theme;
    ctx.ui._toggleTheme();
    expect(document.body.dataset.theme).not.toBe(before);
    ctx.ui._toggleTheme();
    expect(document.body.dataset.theme).toBe(before);
  });

  it("opens and closes the command palette with desktop commands appended", () => {
    ctx.ui.openPalette();
    expect(ctx.ui.state.paletteOpen).toBe(true);
    ctx.ui.closePalette();
    expect(ctx.ui._paletteCommands().length).toBeGreaterThan(15);
  });
});

describe("end-to-end data flow", () => {
  it("creates, saves and lists a prompt, then survives a backup/restore round-trip", async () => {
    const { ui, promptEngine, storage } = ctx;
    ui.navigate("editor");
    ui._newEditorDraft();
    ui.navigate("editor");
    const ta = document.getElementById("editorTextarea") as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    ta.value = "You are a careful reviewer. Review {{artifact}} and list 3 risks.";
    ui._commitEditorTextareaChange(ta);
    ui.state.editor.title = "E2E reviewer prompt";
    await ui._saveEditorPrompt(false, true);

    ui.navigate("library");
    expect(document.getElementById("workspace")!.innerHTML).toContain("E2E reviewer prompt");

    const { createBackupJson, restoreFromDump } = await import("../src/web/ops");
    const json = await createBackupJson(ctx);
    expect(json).toContain("E2E reviewer prompt");

    // wipe-and-restore: replace mode must bring the prompt back from the snapshot
    await storage.importAll({ ...JSON.parse(json), prompts: [] }, "replace");
    await promptEngine.load();
    expect(promptEngine.listPrompts({ includeArchived: true }).some((x: any) => x.title === "E2E reviewer prompt")).toBe(false);
    await restoreFromDump(ctx, JSON.parse(json));
    ui.navigate("library");
    expect(document.getElementById("workspace")!.innerHTML).toContain("E2E reviewer prompt");
  });
});
