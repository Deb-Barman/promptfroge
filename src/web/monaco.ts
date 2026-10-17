import { loader } from "@monaco-editor/react";
// Core editor only (no bundled language packs / TS & JSON workers): keeps the installer lean.
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/editor.all";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

/* Monaco runs entirely from the app bundle — no CDN, works offline. */
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};
loader.config({ monaco });

export const PF_LANG = "promptforge";
let registered = false;

/** Prompt-aware language: {{variables}}, markdown headings, <xml-tags>, [BLOCK] headers, bullets. */
export function registerPromptLanguage(): void {
  if (registered) return;
  registered = true;
  monaco.languages.register({ id: PF_LANG });
  monaco.languages.setMonarchTokensProvider(PF_LANG, {
    tokenizer: {
      root: [
        [/\{\{[^}\n]*\}\}/, "variable"],
        [/^#{1,6}\s.*$/, "keyword"],
        [/^\s*\[[A-Z][A-Z0-9 _\-/]*\]\s*$/, "type"],
        [/<\/?[A-Za-z][\w\-]*>/, "tag"],
        [/^\s*(?:[-*]|\d+[.)])\s/, "number"],
        [/"[^"\n]*"/, "string"],
        [/`[^`\n]*`/, "string"],
        [/\b(?:MUST|NEVER|ALWAYS|DO NOT|ONLY|IMPORTANT)\b/, "keyword.control"],
      ],
    },
  });
  monaco.editor.defineTheme("pf-dark", {
    base: "vs-dark", inherit: true,
    rules: [
      { token: "variable", foreground: "E8B04B", fontStyle: "bold" },
      { token: "keyword", foreground: "6AA9FF", fontStyle: "bold" },
      { token: "keyword.control", foreground: "F26D6D" },
      { token: "type", foreground: "B28CFF" },
      { token: "tag", foreground: "5FD39A" },
      { token: "number", foreground: "E8B04B" },
      { token: "string", foreground: "9CC6A6" },
    ],
    colors: { "editor.background": "#0F1216", "editorLineNumber.foreground": "#4A5260", "editor.lineHighlightBackground": "#171B21", "editorGutter.background": "#0F1216" },
  });
  monaco.editor.defineTheme("pf-light", {
    base: "vs", inherit: true,
    rules: [
      { token: "variable", foreground: "B7791F", fontStyle: "bold" },
      { token: "keyword", foreground: "1D5FD1", fontStyle: "bold" },
      { token: "keyword.control", foreground: "C0392B" },
      { token: "type", foreground: "6B3FD4" },
      { token: "tag", foreground: "1E8E5A" },
      { token: "number", foreground: "B7791F" },
      { token: "string", foreground: "2F7D4F" },
    ],
    colors: { "editor.background": "#FFFFFF", "editorLineNumber.foreground": "#9AA3B0" },
  });
}

export const currentMonacoTheme = (): string => (document.body.dataset.theme === "light" ? "pf-light" : "pf-dark");
