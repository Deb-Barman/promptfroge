import { useCallback, useEffect, useRef, useState } from "react";
import type { AppContext } from "../app/bootstrap";
import { Dialog } from "./Dialog";
import { useDialogs, type WorkspaceTab } from "./dialogs";
import { addSnapshot, deleteSnapshot, getSnapshotJson, listSnapshots, type SnapshotMeta } from "./backups";
import { autoSnapshot, createBackupJson, downloadBytes, exportVaultZip, importTextFiles, restoreFromDump, stamp, type ImportReport } from "./ops";
import { getWebSettings, setWebSettings, type WebSettings } from "./settings";
import { folderSyncSupported, linkFolder, linkedFolder, reconnectFolder, unlinkFolder } from "./folderSync";
import { canInstall, isStandalone, onInstallChange, promptInstall } from "./pwa";

const TABS: Array<[WorkspaceTab, string]> = [["general", "Storage"], ["backups", "Backups"], ["data", "Import & export"], ["about", "About"]];
const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);
const when = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const Row = ({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 border-b border-line-subtle py-3 last:border-0">
    <div className="min-w-0"><div className="text-[13px] font-medium">{label}</div>{desc && <div className="mt-0.5 text-[12px] leading-snug text-ink-3">{desc}</div>}</div>
    <div className="shrink-0">{children}</div>
  </div>
);
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-5"><h3 className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{title}</h3>{children}</section>
);

export default function WorkspaceDialog({ ctx }: { ctx: AppContext }) {
  const close = useDialogs(s => s.close);
  const initial = useDialogs(s => s.tab);
  const [tab, setTab] = useState<WorkspaceTab>(initial);
  return (
    <Dialog wide title="Workspace" onClose={close}>
      <div role="tablist" aria-label="Workspace sections" className="flex gap-1 border-b border-line px-4 pt-3 pb-2">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`pf-tab ${tab === id ? "is-active" : ""}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="p-5">
        {tab === "general" && <General ctx={ctx} />}
        {tab === "backups" && <Backups ctx={ctx} />}
        {tab === "data" && <Data ctx={ctx} onDone={close} />}
        {tab === "about" && <About />}
      </div>
    </Dialog>
  );
}

function General({ ctx }: { ctx: AppContext }) {
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [, bump] = useState(0);
  useEffect(() => onInstallChange(() => bump(n => n + 1)), []);
  useEffect(() => {
    void navigator.storage?.estimate?.().then(e => e && setEst({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);
  const { storage, promptEngine: pe } = ctx;
  const counts: Array<[string, number]> = [["Prompts", pe.prompts.size], ["Templates", pe.templates.size], ["Snippets", pe.snippets.size], ["Patterns", pe.customPatterns.size], ["Chains", pe.chains.size], ["Groups", pe.groups.size]];
  const pct = est && est.quota ? Math.max(0.5, (est.usage / est.quota) * 100) : 0;
  return (
    <>
      <Section title="Where your data lives">
        <Row label="Storage engine" desc="Everything is stored inside this browser profile (IndexedDB). There is no server and no account.">
          <span className={`font-mono text-[12px] ${storage.available ? "text-green-forge" : "text-red-forge"}`}>{storage.available ? "IndexedDB · healthy" : `degraded · ${storage.degradedReason ?? "fallback"}`}</span>
        </Row>
        <Row label="Space used" desc={est ? `${fmtBytes(est.usage)} of roughly ${fmtBytes(est.quota)} available to this site.` : "Your browser doesn't report usage."}>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-bg-3" aria-hidden><div className="h-full rounded-full bg-blue-forge" style={{ width: `${pct}%` }} /></div>
        </Row>
        <Row label="Protected from automatic clean-up" desc="Browsers may delete site data when disk space runs low. Asking for persistent storage prevents that.">
          {persisted ? <span className="text-[12px] text-green-forge">Protected</span> : (
            <button className="btn btn-secondary btn-sm" onClick={async () => setPersisted(await (navigator.storage?.persist?.() ?? Promise.resolve(false)))}>Protect my data</button>
          )}
        </Row>
        <Row label="Works offline" desc="After the first visit the app is cached and runs without a connection.">
          <span className="text-[12px] text-ink-2">{"serviceWorker" in navigator && navigator.serviceWorker.controller ? "Ready" : "Available after a reload on the deployed site"}</span>
        </Row>
        {!isStandalone() && (
          <Row label="Install as an app" desc="Opens in its own window, with its own icon, and works offline.">
            {canInstall() ? <button className="btn btn-primary btn-sm" onClick={() => void promptInstall()}>Install</button> : <span className="text-[12px] text-ink-3">Use your browser's menu → Install</span>}
          </Row>
        )}
      </Section>
      <Section title="Contents">
        <div className="grid grid-cols-3 gap-2">
          {counts.map(([k, n]) => (<div key={k} className="rounded-forge border border-line-subtle bg-bg-3 px-3 py-2"><div className="font-mono text-[18px] font-semibold">{n}</div><div className="text-[11px] text-ink-3">{k}</div></div>))}
        </div>
      </Section>
    </>
  );
}

function Backups({ ctx }: { ctx: AppContext }) {
  const [snaps, setSnaps] = useState<SnapshotMeta[]>([]);
  const [s, setS] = useState<WebSettings>(getWebSettings());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [folder, setFolder] = useState<{ name: string; permission: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => { try { setSnaps(await listSnapshots()); } catch { setSnaps([]); } setFolder(await linkedFolder().catch(() => null)); }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const patch = (p: Partial<WebSettings>) => { setS(setWebSettings(p)); window.dispatchEvent(new Event("pf:settings-changed")); };
  const run = async (fn: () => Promise<string>) => { setBusy(true); setMsg(null); try { setMsg({ tone: "ok", text: await fn() }); } catch (e) { setMsg({ tone: "err", text: (e as Error).message }); } finally { setBusy(false); void refresh(); } };

  const restore = (json: string, label: string) => run(async () => {
    const dump = JSON.parse(json);
    await restoreFromDump(ctx, dump);
    setConfirmId(null);
    return `Restored ${label}. A safety snapshot of what you had before was saved first.`;
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => ((await autoSnapshot(ctx, "manual")) ? "Backup saved in this browser." : "Nothing changed since the last backup."))}>Back up now</button>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(async () => { downloadBytes(`prompt-forge-backup-${stamp()}.json`, await createBackupJson(ctx), "application/json"); return "Backup file downloaded."; })}>Download JSON</button>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>Restore from file…</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
          run(async () => { const text = await f.text(); JSON.parse(text); setConfirmId("file:" + f.name); pending.current = text; return `“${f.name}” is ready — confirm below to replace your current workspace.`; });
        }} />
      </div>
      {confirmId?.startsWith("file:") && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-forge border border-line bg-bg-3 px-3 py-2.5 text-[13px]">
          <span>Replace everything with <b>{confirmId.slice(5)}</b>?</span>
          <span className="flex gap-2"><button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>Cancel</button><button className="btn btn-danger btn-sm" disabled={busy} onClick={() => restore(pending.current, confirmId.slice(5))}>Replace</button></span>
        </div>
      )}
      {msg && <div role="status" className={`mb-4 rounded-forge border px-3 py-2 text-[13px] ${msg.tone === "ok" ? "border-line text-ink-2" : "border-red-forge text-red-forge"}`}>{msg.text}</div>}

      <Section title="Automatic backups">
        <Row label="Back up automatically" desc="Snapshots are kept in a separate browser database, only when something changed. They also save when you switch away from the tab.">
          <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={s.autoBackup} onChange={e => patch({ autoBackup: e.target.checked })} /> On</label>
        </Row>
        <Row label="Every">
          <select className="pf-input" value={s.backupIntervalMin} disabled={!s.autoBackup} onChange={e => patch({ backupIntervalMin: Number(e.target.value) })} aria-label="Backup interval">{[2, 5, 10, 30, 60].map(n => <option key={n} value={n}>{n} min</option>)}</select>
        </Row>
        <Row label="Keep the newest">
          <select className="pf-input" value={s.keepAuto} onChange={e => patch({ keepAuto: Number(e.target.value) })} aria-label="Snapshots to keep">{[5, 15, 30, 60].map(n => <option key={n} value={n}>{n} snapshots</option>)}</select>
        </Row>
        {folderSyncSupported() ? (
          <Row label="Also save to a folder" desc={folder ? `Linked to “${folder.name}”${folder.permission !== "granted" ? " — click Reconnect (browsers require this after a restart)." : ""}` : "Pick a folder (e.g. inside OneDrive, Dropbox or a Git repo) and every backup is also written there as a plain .json file."}>
            {folder ? (
              <span className="flex gap-2">
                {folder.permission !== "granted" && <button className="btn btn-primary btn-sm" onClick={async () => { await reconnectFolder(); await refresh(); }}>Reconnect</button>}
                <button className="btn btn-ghost btn-sm" onClick={async () => { await unlinkFolder(); patch({ folderSync: false }); await refresh(); }}>Unlink</button>
              </span>
            ) : <button className="btn btn-secondary btn-sm" onClick={async () => { try { await linkFolder(); patch({ folderSync: true }); await refresh(); } catch { /* picker dismissed */ } }}>Choose folder…</button>}
          </Row>
        ) : <Row label="Save to a folder" desc="Not available in this browser (Chrome, Edge, Brave and Opera support it). Use Download JSON instead."><span className="text-[12px] text-ink-3">Unsupported</span></Row>}
      </Section>

      <Section title={`Snapshots (${snaps.length})`}>
        {snaps.length === 0 && <p className="m-0 py-3 text-[13px] text-ink-3">No snapshots yet. Press “Back up now”.</p>}
        <ul className="m-0 list-none p-0">
          {snaps.map(sn => (
            <li key={sn.id} className="flex items-center justify-between gap-3 border-b border-line-subtle py-2.5 last:border-0">
              <div className="min-w-0 text-[13px]">
                <div className="font-medium">{when(sn.createdAt)} <span className="ml-1 rounded bg-bg-3 px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-3">{sn.kind === "safety" ? sn.reason.replace("before-", "before ") : sn.kind}</span></div>
                <div className="text-[12px] text-ink-3">{sn.counts.prompts ?? 0} prompts · {sn.counts.templates ?? 0} templates · {fmtBytes(sn.bytes)}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {confirmId === sn.id ? (<><button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>Cancel</button><button className="btn btn-danger btn-sm" disabled={busy} onClick={async () => { const j = await getSnapshotJson(sn.id); if (j) await restore(j, when(sn.createdAt)); }}>Confirm restore</button></>) : (<>
                  <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setConfirmId(sn.id)}>Restore</button>
                  <button className="btn btn-ghost btn-sm" aria-label="Download snapshot" onClick={async () => { const j = await getSnapshotJson(sn.id); if (j) downloadBytes(`prompt-forge-${new Date(sn.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`, j, "application/json"); }}>↓</button>
                  <button className="btn btn-ghost btn-sm" aria-label="Delete snapshot" onClick={async () => { await deleteSnapshot(sn.id); await refresh(); }}>✕</button></>)}
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
const pending = { current: "" };

function Data({ ctx, onDone }: { ctx: AppContext; onDone: () => void }) {
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const { ui } = ctx;
  const later = (fn: () => void) => { onDone(); setTimeout(fn, 60); };
  return (
    <>
      <Section title="Markdown vault (Git / Obsidian friendly)">
        <Row label="Export everything as a ZIP" desc="One .md file per prompt (YAML front-matter + your exact text), templates, snippets, and a full JSON backup.">
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => { setBusy(true); try { const r = await exportVaultZip(ctx); ui.toast(`Exported ${r.files} files.`, "success"); } finally { setBusy(false); } }}>Export ZIP</button>
        </Row>
        <Row label="Import Markdown / text / ZIP" desc="Select .md or .txt files, or a vault ZIP. Front-matter is read when present; prompts identical to existing ones are skipped.">
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => ref.current?.click()}>Choose files…</button>
        </Row>
        <input ref={ref} type="file" hidden multiple accept=".md,.markdown,.txt,.zip" onChange={async e => {
          const files = Array.from(e.target.files ?? []); e.target.value = ""; if (!files.length) return;
          setBusy(true); setErr(""); setReport(null);
          try { setReport(await importTextFiles(ctx, files)); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
        }} />
        {err && <p role="alert" className="text-[13px] text-red-forge">{err}</p>}
        {report && (
          <div role="status" className="mt-2 rounded-forge border border-line bg-bg-3 px-3 py-2 text-[13px]">
            Imported <b>{report.added}</b> prompt{report.added === 1 ? "" : "s"}{report.skipped ? `, skipped ${report.skipped} duplicate/empty` : ""}.
            {report.backups > 0 && <> The ZIP also contains a JSON backup — use <i>Backups → Restore from file</i> to bring back history and settings.</>}
            {report.errors.length > 0 && <ul className="mb-0 mt-1 text-red-forge">{report.errors.map(x => <li key={x}>{x}</li>)}</ul>}
          </div>
        )}
      </Section>
      <Section title="Classic tools">
        <Row label="Export (JSON, Markdown, text, CSV, HTML)" desc="Choose exactly which items and format."><button className="btn btn-secondary btn-sm" onClick={() => later(() => ui.openExportModal())}>Open</button></Row>
        <Row label="Import from JSON" desc="Merge or replace from a Prompt Forge backup."><button className="btn btn-secondary btn-sm" onClick={() => later(() => ui.openImportModal())}>Open</button></Row>
      </Section>
    </>
  );
}

function About() {
  const keys: Array<[string, string]> = [["Ctrl K", "Command palette"], ["Alt R · Ctrl Enter", "Run prompt in Playground"], ["Alt S", "Share prompt as a link"], ["Alt M", "Monaco Pro Editor"], ["Alt B", "Backups & storage"], ["Alt N", "Quick capture"], ["Ctrl S", "Save"], ["?", "All shortcuts"]];
  return (
    <>
      <Section title="Prompt Forge — web edition">
        <p className="m-0 text-[13px] leading-relaxed text-ink-2">Version {__APP_VERSION__}. A local-first prompt IDE: no backend, no database, no account, no analytics. Your prompts live in this browser; nothing is transmitted unless you press <b>Run</b> in the Playground, which sends that one prompt to the provider <i>you</i> chose, using <i>your</i> key.</p>
      </Section>
      <Section title="Shortcuts added in the web edition">
        <div className="grid grid-cols-2 gap-x-6">
          {keys.map(([k, d]) => (<div key={k} className="flex items-center justify-between border-b border-line-subtle py-1.5 text-[13px]"><span className="text-ink-2">{d}</span><kbd className="rounded border border-line bg-bg-3 px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd></div>))}
        </div>
      </Section>
    </>
  );
}
