/**
 * tools/extract-legacy.mjs
 * ---------------------------------------------------------------------------
 * One-shot provenance tool: splits the original single-file PromptForge.html
 * into the module layout used by this project.
 *
 *   node tools/extract-legacy.mjs /path/to/PromptForge.html
 *
 * It uses the TypeScript compiler API (not regexes) to find declaration and
 * class-member boundaries, so no code is ever re-typed by hand.
 *   - <style>                      -> src/styles/legacy.css
 *   - cl100k vocab <script>        -> src/assets/cl100k_vocab.b64.txt
 *   - top-level declarations       -> src/core/<Name>.ts   (Dropdown -> src/ui)
 *   - UIManager class members      -> src/ui/methods/<group>.ts + UIManager.ts
 * ---------------------------------------------------------------------------
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SRC = process.argv[2];
if (!SRC) { console.error("usage: node tools/extract-legacy.mjs PromptForge.html"); process.exit(1); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = (...p) => path.join(root, "src", ...p);
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

const html = fs.readFileSync(SRC, "utf8");

/* ---------- CSS ---------- */
const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
write(out("styles", "legacy.css"), css.trim() + "\n");

/* ---------- vocab ---------- */
const vStart = html.indexOf('id="cl100kVocabData">') + 'id="cl100kVocabData">'.length;
const vEnd = html.indexOf("</script>", vStart);
write(out("assets", "cl100k_vocab.b64.txt"), html.slice(vStart, vEnd).trim() + "\n");

/* ---------- JS ---------- */
const jsOpen = html.indexOf("<script>", vEnd);
const jsClose = html.lastIndexOf("</script>");
const js = html.slice(jsOpen + 8, jsClose);
const sf = ts.createSourceFile("legacy.js", js, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);

const decls = []; // { name, kind, text, node }
for (const st of sf.statements) {
  let name = null;
  if (ts.isVariableStatement(st)) name = st.declarationList.declarations[0].name.getText();
  else if (ts.isClassDeclaration(st) || ts.isFunctionDeclaration(st)) name = st.name.text;
  decls.push({ name, node: st, text: js.slice(st.getFullStart(), st.getEnd()) });
}
const names = new Set(decls.filter(d => d.name).map(d => d.name));

function freeRefs(node, own) {
  const used = new Set();
  (function walk(n) {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isMemberName = p && ((ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isPropertyAssignment(p) && p.name === n) || (ts.isMethodDeclaration(p) && p.name === n) ||
        (ts.isPropertyDeclaration(p) && p.name === n) || (ts.isGetAccessor(p) && p.name === n) ||
        (ts.isSetAccessor(p) && p.name === n));
      if (!isMemberName && names.has(n.text) && n.text !== own) used.add(n.text);
    }
    ts.forEachChild(n, walk);
  })(node);
  return used;
}

const UI_DECLS = new Set(["Dropdown"]);
const fileFor = (name) => (UI_DECLS.has(name) ? `ui/${name}` : `core/${name}`);
const importLine = (from, fromFile, sym) => {
  const rel = path.posix.relative(path.posix.dirname(from), fromFile) || ".";
  return `import { ${sym.join(", ")} } from "${rel.startsWith(".") ? rel : "./" + rel}";`;
};

const HEADER = `// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
`;

const tokenizerPatch = (t) => t
  .replace('const b64 = document.getElementById("cl100kVocabData").textContent.trim();',
           'const b64 = (await import("../assets/cl100k_vocab.b64.txt?raw")).default.trim();');

for (const d of decls) {
  if (!d.name || d.name === "UIManager") continue;
  const file = fileFor(d.name);
  const refs = [...freeRefs(d.node, d.name)];
  const byFile = {};
  for (const r of refs) (byFile[fileFor(r)] ||= []).push(r);
  const imports = Object.entries(byFile).map(([f, syms]) => importLine(file, f, syms)).join("\n");
  let body = d.text.replace(/^\s*(?=(const|class|function|async function)\b)/m, "");
  // keep leading comments, add export keyword in front of the declaration keyword
  body = d.text.replace(/(^|\n)(const|class|function|async function) (\w+)/, (m, a, kw, nm) => `${a}export ${kw} ${nm}`);
  if (d.name === "RealTokenizer") body = tokenizerPatch(body);
  write(out(`${file}.ts`), `${HEADER}${imports ? imports + "\n\n" : "\n"}${body.trim()}\n`);
}

/* ---------- UIManager ---------- */
const uiDecl = decls.find(d => d.name === "UIManager");
const cls = uiDecl.node;
const members = cls.members.map(m => ({
  name: m.kind === ts.SyntaxKind.Constructor ? "constructor" : m.name.getText(),
  kind: ts.SyntaxKind[m.kind],
  text: js.slice(m.getFullStart(), m.getEnd()),
  node: m,
}));

const GROUPS = [
  ["constructor", "core"], ["openGroupPickerModal", "groups"], ["openCustomModelModal", "models"],
  ["_wireKeyboardShortcuts", "shell"], ["renderDashboard", "dashboard"], ["_newEditorDraft", "editor"],
  ["renderBuilder", "builder"], ["renderLibrary", "library"], ["renderTemplates", "templates"],
  ["renderPatterns", "patterns"], ["renderCompare", "compare"], ["renderChains", "chains"],
  ["openQuickCaptureModal", "onboarding"], ["renderHistory", "history"], ["renderAnalytics", "analytics"],
  ["renderSettings", "settings"], ["openImproverModal", "editorTools"], ["_collectExportableItems", "importExport"],
  ["openNewPromptModal", "promptModals"], ["_delegatedClick", "actions"],
];
const groupOf = new Array(members.length);
let gi = -1;
members.forEach((m, i) => {
  if (gi + 1 < GROUPS.length && m.name === GROUPS[gi + 1][0]) gi++;
  groupOf[i] = gi;
});
if (gi !== GROUPS.length - 1) throw new Error(`group boundary missing; matched ${gi + 1}/${GROUPS.length}`);

const importBlock = (file, refsSet) => {
  const byFile = {};
  for (const r of refsSet) (byFile[fileFor(r)] ||= []).push(r);
  return Object.entries(byFile).map(([f, syms]) => importLine(file, f, syms)).join("\n");
};

const groupFiles = [];
GROUPS.forEach(([_, g], idx) => {
  const ms = members.filter((m, i) => groupOf[i] === idx && m.name !== "constructor");
  if (!ms.length) return;
  const file = `ui/methods/${g}`;
  const refs = new Set();
  ms.forEach(m => freeRefs(m.node, "UIManager").forEach(r => refs.add(r)));
  const body = ms.map(m => m.text.replace(/^\s*\n/, "").replace(/\s+$/, "")).join(",\n\n");
  write(out(`${file}.ts`),
`${HEADER}${importBlock(file, refs)}

/** UIManager methods: ${g}. Mixed into UIManager.prototype (see ../UIManager.ts). */
export const ${g}Methods = {
${body}
};
`);
  groupFiles.push([g, file]);
});

// UIManager class shell (constructor only) + mixin wiring
const ctor = members.find(m => m.name === "constructor");
const ctorRefs = freeRefs(ctor.node, "UIManager");
const classImports = importBlock("ui/UIManager", ctorRefs);
const mixImports = groupFiles.map(([g, f]) => `import { ${g}Methods } from "./methods/${g}";`).join("\n");
write(out("ui", "UIManager.ts"),
`${HEADER}${classImports}
${mixImports}

export class UIManager {
${ctor.text.replace(/^\s*\n/, "").replace(/\s+$/, "")}
}

// The original class was a single 7,500-line body. It is split by feature into
// method groups (one file each) and mixed back in here — behaviour is identical.
export interface UIManager { [method: string]: any }
Object.assign(UIManager.prototype, ${groupFiles.map(([g]) => `${g}Methods`).join(", ")});
`);

/* ---------- report ---------- */
const report = { declarations: decls.filter(d => d.name).map(d => d.name), uiMembers: members.length,
  groups: GROUPS.map(([s, g], i) => [g, members.filter((m, j) => groupOf[j] === i).length]) };
console.log(JSON.stringify(report, null, 1));
