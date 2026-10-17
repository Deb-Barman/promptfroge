import Editor, { DiffEditor } from "@monaco-editor/react";
import { useMemo, useRef, useState } from "react";
import type { AppContext } from "../app/bootstrap";
import { Dialog } from "./Dialog";
import { PF_LANG, currentMonacoTheme, registerPromptLanguage } from "./monaco";
import { useDialogs } from "./dialogs";

/**
 * Monaco "Pro Editor": a full-screen, VS Code-grade view of the prompt being
 * edited — multi-cursor, find/replace, folding, minimap, bracket matching,
 * a live diff against the version you opened, and {{variable}} highlighting.
 * "Apply" writes back through the legacy editor's own commit path, so
 * autosave, undo history, analysis and token meters all stay in sync.
 */
export default function ProEditorDialog({ ctx }: { ctx: AppContext }) {
  const close = useDialogs(s => s.close);
  const original = useMemo(() => String(ctx.ui.state.editor.body ?? ""), [ctx]);
  const [value, setValue] = useState(original);
  const [diff, setDiff] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [minimap, setMinimap] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const stats = useMemo(() => {
    const words = value.trim() ? value.trim().split(/\s+/).length : 0;
    const vars = new Set(value.match(/\{\{[^}\n]+\}\}/g) ?? []).size;
    return { chars: value.length, words, lines: value.split("\n").length, vars };
  }, [value]);

  const apply = () => {
    const ui = ctx.ui;
    const next = valueRef.current;
    if (next !== original) {
      ui.navigate("editor");
      const ta = document.getElementById("editorTextarea") as HTMLTextAreaElement | null;
      if (ta) { ta.value = next; ui._commitEditorTextareaChange(ta); }
      else { ui.state.editor.body = next; ui.state.editor.dirty = true; }
      ui.toast("Applied changes from Pro Editor.", "success");
    }
    close();
  };

  const opts = { fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 14, lineHeight: 22, wordWrap: wrap ? "on" : "off",
    minimap: { enabled: minimap }, scrollBeyondLastLine: false, renderWhitespace: "selection", smoothScrolling: true,
    padding: { top: 14, bottom: 14 }, bracketPairColorization: { enabled: true }, automaticLayout: true } as const;

  return (
    <Dialog full title="Pro Editor — Monaco" onClose={close}
      footer={<>
        <span className="mr-auto font-mono text-[12px] text-ink-3">{stats.words} words · {stats.chars} chars · {stats.lines} lines · {stats.vars} variables</span>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-2"><input type="checkbox" checked={wrap} onChange={e => setWrap(e.target.checked)} /> Wrap</label>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-2"><input type="checkbox" checked={minimap} onChange={e => setMinimap(e.target.checked)} /> Minimap</label>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-2"><input type="checkbox" checked={diff} onChange={e => setDiff(e.target.checked)} /> Diff vs. original</label>
        <button className="btn btn-secondary" onClick={close}>Cancel</button>
        <button className="btn btn-primary" onClick={apply}>Apply to editor</button>
      </>}>
      <div className="h-full min-h-[420px]">
        {diff ? (
          <DiffEditor height="100%" original={original} modified={value} language={PF_LANG} theme={currentMonacoTheme()}
            beforeMount={registerPromptLanguage} onMount={ed => ed.getModifiedEditor().onDidChangeModelContent(() => setValue(ed.getModifiedEditor().getValue()))}
            options={{ ...opts, renderSideBySide: true, originalEditable: false }} />
        ) : (
          <Editor height="100%" value={value} language={PF_LANG} theme={currentMonacoTheme()} beforeMount={registerPromptLanguage}
            onChange={v => setValue(v ?? "")} options={opts} />
        )}
      </div>
    </Dialog>
  );
}
