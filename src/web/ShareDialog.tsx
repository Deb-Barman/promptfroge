import { useEffect, useMemo, useState } from "react";
import type { AppContext } from "../app/bootstrap";
import { CONFIG } from "../core/CONFIG";
import { Dialog } from "./Dialog";
import { useDialogs, useIncoming } from "./dialogs";
import { buildShareUrl, decodeShare, SOFT_URL_LIMIT, type SharePayload } from "./share";
import { downloadBytes } from "./ops";
import { promptToMarkdown, slugify } from "./markdown";

/** Create a share link for the prompt in the editor. The prompt travels inside the URL hash — no server involved. */
export default function ShareDialog({ ctx }: { ctx: AppContext }) {
  const close = useDialogs(s => s.close);
  const { ui, promptEngine: pe } = ctx;
  const ed = ui.state.editor;
  const saved = ed.promptId ? pe.getPrompt(ed.promptId) : null;
  const [withTitle, setWithTitle] = useState(true);
  const [withTags, setWithTags] = useState(true);
  const [link, setLink] = useState<{ url: string; length: number; tooLong: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const base = useMemo(() => ({ title: withTitle ? ed.title : "", body: ed.body as string, tags: withTags ? (saved?.tags ?? []) : [], category: saved?.category ?? "custom", format: ed.format || "text" }), [withTitle, withTags, ed.title, ed.body, ed.format, saved]);
  useEffect(() => { let live = true; buildShareUrl(base).then(l => live && setLink(l)).catch(() => live && setLink(null)); return () => { live = false; }; }, [base]);

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { (document.getElementById("shareUrl") as HTMLTextAreaElement | null)?.select(); }
  };
  return (
    <Dialog title="Share prompt as a link" onClose={close}
      footer={<>
        {"share" in navigator && link && <button className="btn btn-secondary" onClick={() => void navigator.share({ title: ed.title || "Prompt", url: link.url }).catch(() => undefined)}>Share…</button>}
        <button className="btn btn-secondary" onClick={() => downloadBytes(`${slugify(ed.title)}.md`, promptToMarkdown({ ...base, id: undefined }), "text/markdown")}>Download .md</button>
        <button className="btn btn-primary" data-autofocus onClick={copy} disabled={!link}>{copied ? "Copied ✓" : "Copy link"}</button>
      </>}>
      <div className="space-y-4 p-5 text-[13px]">
        <p className="m-0 leading-relaxed text-ink-2">The whole prompt is packed <b>inside the link itself</b> (after the <code>#</code>). Nothing is uploaded; browsers never send that part to any server. Whoever opens it sees a preview and chooses whether to import it.</p>
        <div className="flex gap-5">
          <label className="flex items-center gap-2"><input type="checkbox" checked={withTitle} onChange={e => setWithTitle(e.target.checked)} /> Include title</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={withTags} onChange={e => setWithTags(e.target.checked)} disabled={!saved?.tags?.length} /> Include tags</label>
        </div>
        <textarea id="shareUrl" readOnly rows={5} value={link?.url ?? "Preparing…"} className="pf-input h-auto w-full resize-none py-2 font-mono text-[11px] leading-snug" onFocus={e => e.currentTarget.select()} aria-label="Share link" />
        <div className="flex items-center justify-between text-[12px] text-ink-3">
          <span>{link ? `${link.length.toLocaleString()} characters` : ""}</span>
          {link?.tooLong && <span role="alert" className="text-amber-forge">Long link (over {SOFT_URL_LIMIT.toLocaleString()}). Some chat apps may cut it — use “Download .md” instead.</span>}
        </div>
        <p className="m-0 text-[12px] text-ink-3">Tip: anyone can read a shared prompt, so don't share ones that contain secrets or private data.</p>
      </div>
    </Dialog>
  );
}

/** Opened automatically when the page is loaded with #share=… — never imports without confirmation. */
export function IncomingShareDialog({ ctx }: { ctx: AppContext }) {
  const token = useIncoming(s => s.token);
  const set = useIncoming(s => s.set);
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [error, setError] = useState("");
  const { ui, promptEngine: pe } = ctx;
  useEffect(() => { setPayload(null); setError(""); if (!token) return; let live = true; decodeShare(token).then(p => live && setPayload(p)).catch(e => live && setError((e as Error).message)); return () => { live = false; }; }, [token]);
  if (!token) return null;
  const dismiss = () => set(null);
  const dupe = payload ? pe.listPrompts({ includeArchived: true }).some((p: any) => p.title === payload.title && p.body === payload.body) : false;
  const save = async (open: boolean) => {
    if (!payload) return;
    const cats = new Set<string>(CONFIG.CATEGORIES.map((c: { id: string }) => c.id));
    const p = await pe.savePrompt(pe.newPromptSkeleton({ title: payload.title || "Shared prompt", body: payload.body, tags: payload.tags, category: cats.has(payload.category) ? payload.category : "custom", format: payload.format }));
    ctx.suggestionEngine.rebuildFromCorpus();
    dismiss();
    if (open) { ui._loadPromptIntoEditor(p.id); ui.navigate("editor"); } else ui.renderView();
    ui.toast("Added to your library.", "success");
  };
  return (
    <Dialog wide title="Someone shared a prompt with you" onClose={dismiss}
      footer={payload ? <>
        <button className="btn btn-ghost" onClick={dismiss}>Dismiss</button>
        <button className="btn btn-secondary" onClick={() => void save(false)} disabled={dupe}>{dupe ? "Already in your library" : "Save to library"}</button>
        <button className="btn btn-primary" data-autofocus onClick={() => void save(true)}>Save & open in editor</button>
      </> : <button className="btn btn-primary" data-autofocus onClick={dismiss}>Close</button>}>
      <div className="p-5 text-[13px]">
        {error && <p role="alert" className="m-0 text-red-forge">{error}</p>}
        {!payload && !error && <p className="m-0 text-ink-3">Opening…</p>}
        {payload && (<>
          <div className="mb-1 text-[15px] font-semibold">{payload.title || "Untitled prompt"}</div>
          <div className="mb-3 flex flex-wrap gap-1.5 text-[11px] text-ink-3">
            <span className="rounded bg-bg-3 px-1.5 py-0.5">{payload.category}</span><span className="rounded bg-bg-3 px-1.5 py-0.5">{payload.format}</span>
            {payload.tags.map(t => <span key={t} className="rounded bg-bg-3 px-1.5 py-0.5">#{t}</span>)}
          </div>
          <p className="mb-2 mt-0 text-[12px] text-ink-3">Review the text below — it is shown as plain text and nothing has been imported yet.</p>
          <pre className="m-0 max-h-[46vh] overflow-auto whitespace-pre-wrap break-words rounded-forge border border-line bg-bg-3 p-3 font-mono text-[12px] leading-relaxed">{payload.body}</pre>
        </>)}
      </div>
    </Dialog>
  );
}
