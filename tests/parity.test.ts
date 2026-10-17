/**
 * Feature-parity guard. Parses the ORIGINAL single-file app (legacy/PromptForge.html)
 * with the TypeScript compiler and proves the desktop port still contains
 * everything it did: every module, every UI method, every data-action handler,
 * every CONFIG catalogue, the stylesheet and the tokenizer vocabulary.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/core/CONFIG";
import { UIManager } from "../src/ui/UIManager";
import { LegacyChrome } from "../src/shell/LegacyChrome";

const html = fs.readFileSync(path.resolve("legacy/PromptForge.html"), "utf8");
const js = html.slice(html.indexOf("<script>", html.indexOf('id="cl100kVocabData"')) + 8, html.lastIndexOf("</script>"));
const sf = ts.createSourceFile("legacy.js", js, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

const topLevel = sf.statements.flatMap(st =>
  ts.isVariableStatement(st) ? [st.declarationList.declarations[0].name.getText()]
    : ts.isClassDeclaration(st) && st.name ? [st.name.text] : []);
const uiClass = sf.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === "UIManager") as ts.ClassDeclaration;
const uiMembers = uiClass.members.map(m => (m.kind === ts.SyntaxKind.Constructor ? "constructor" : m.name!.getText()));

const sourceFiles = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
  d.isDirectory() ? sourceFiles(path.join(dir, d.name)) : /\.(ts|tsx)$/.test(d.name) ? [path.join(dir, d.name)] : []);

describe("parity with the original PromptForge.html", () => {
  it("ports every top-level module (one file each)", () => {
    const missing = topLevel.filter(n => n !== "UIManager" && !["core", "ui"].some(d => fs.existsSync(`src/${d}/${n}.ts`)));
    expect(missing).toEqual([]);
    expect(topLevel.length).toBeGreaterThanOrEqual(28);
  });

  it("keeps every UIManager method (none dropped, none renamed)", () => {
    const proto = Object.getOwnPropertyNames(UIManager.prototype);
    const missing = uiMembers.filter(m => m !== "constructor" && !proto.includes(m));
    expect(missing).toEqual([]);
    expect(uiMembers.length).toBeGreaterThanOrEqual(215);
  });

  it("keeps every data-action handler", () => {
    const cases = (src: string) => new Set([...src.matchAll(/case "([a-z0-9-]+)"/g)].map(m => m[1]));
    const original = cases(js.slice(js.indexOf("class UIManager")));
    const ported = cases(sourceFiles("src/ui").map(f => fs.readFileSync(f, "utf8")).join("\n"));
    const missing = [...original].filter(c => !ported.has(c));
    expect(missing).toEqual([]);
    expect(original.size).toBeGreaterThanOrEqual(160);
  });

  it("keeps every CONFIG catalogue", async () => {
    const decl = sf.statements.find(s => ts.isVariableStatement(s) && s.declarationList.declarations[0].name.getText() === "CONFIG") as ts.VariableStatement;
    const obj = decl.declarationList.declarations[0].initializer as ts.ObjectLiteralExpression;
    const keys = obj.properties.map(p => p.name!.getText());
    expect(Object.keys(CONFIG).sort()).toEqual([...keys].sort());
    expect(keys.length).toBeGreaterThanOrEqual(22);
  });

  it("keeps the stylesheet and tokenizer vocabulary byte-identical", () => {
    const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
    expect(sha(fs.readFileSync("src/styles/legacy.css", "utf8").trim())).toBe(sha(css.trim()));
    const v0 = html.indexOf('id="cl100kVocabData">') + 'id="cl100kVocabData">'.length;
    const vocab = html.slice(v0, html.indexOf("</script>", v0)).trim();
    expect(sha(fs.readFileSync("src/assets/cl100k_vocab.b64.txt", "utf8").trim())).toBe(sha(vocab));
  });

  it("renders every element id the original chrome defined", () => {
    const start = html.indexOf('<div id="app"');
    const origIds = [...html.slice(start, html.indexOf("<script", start)).matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    const ported = renderToStaticMarkup(createElement(LegacyChrome));
    const missing = origIds.filter(id => !ported.includes(`id="${id}"`));
    expect(missing).toEqual([]);
    expect(origIds.length).toBeGreaterThanOrEqual(20);
  });
});
