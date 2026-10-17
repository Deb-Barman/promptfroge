import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppContext } from "../app/bootstrap";
import { TemplateEngine } from "../core/TemplateEngine";
import { Dialog } from "./Dialog";
import { useDialogs } from "./dialogs";
import { PROVIDERS, ProviderError, forgetAllKeys, getKey, getProvider, listModels, loadPrefs, maskKey, migrateKeys, runPrompt, savePrefs, setKey, type PlaygroundPrefs, type ProviderId, type RunResult } from "./playground/providers";
import { addRun, clearRuns, listRuns, type RunRecord } from "./playground/runs";

interface Lane {
  id: number; provider: ProviderId; model: string; baseUrl: string; keyDraft: string; models: string[];
  status: "idle" | "running" | "done" | "error"; output: string; error: string; result?: RunResult; showKey: boolean;
}
let laneSeq = 1;
const fmtMs = (n: number | null | undefined) => (n == null ? "—" : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`);

export default function PlaygroundDialog({ ctx }: { ctx: AppContext }) {
  const close = useDialogs(s => s.close);
  const { ui, promptEngine: pe } = ctx;
  const [prefs, setPrefs] = useState<PlaygroundPrefs>(() => loadPrefs());
  const [tab, setTab] = useState<"run" | "history">("run");
  const [sourceId, setSourceId] = useState<string>("__editor__");
  const prompts = useMemo(() => pe.listPrompts().slice().sort((a: any, b: any) => b.updatedAt - a.updatedAt).slice(0, 200), [pe]);
  const source = useMemo(() => {
    if (sourceId === "__editor__") { const e = ui.state.editor; return { id: e.promptId as string | null, title: (e.title as string) || "Current editor", body: (e.body as string) || "" }; }
    const p = pe.getPrompt(sourceId); return { id: sourceId, title: p?.title || "Untitled", body: p?.body || "" };
  }, [sourceId, ui, pe]);
  const specs = useMemo(() => TemplateEngine.extractVariableSpecs(source.body) as Array<{ name: string; type: string; default: string; options?: string[] }>, [source.body]);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [system, setSystem] = useState("");
  const [userOverride, setUserOverride] = useState<string | null>(null);
  const [useTemp, setUseTemp] = useState(prefs.temperature !== undefined);
  const [temp, setTemp] = useState(prefs.temperature ?? 0.7);
  const [maxTok, setMaxTok] = useState(prefs.maxTokens ? String(prefs.maxTokens) : "");
  const rendered = useMemo(() => TemplateEngine.render(source.body, vars) as string, [source.body, vars]);
  const userText = userOverride ?? rendered;
  useEffect(() => { setUserOverride(null); }, [sourceId, vars]);

  const mkLane = (p: ProviderId, model = ""): Lane => ({ id: laneSeq++, provider: p, model, baseUrl: prefs.providers[p]?.baseUrl ?? "", keyDraft: getKey(p), models: [], status: "idle", output: "", error: "", showKey: false });
  const [lanes, setLanes] = useState<Lane[]>(() => prefs.lanes.map(l => mkLane(l.provider, l.model || prefs.providers[l.provider]?.model || "")));
  const aborts = useRef<Map<number, AbortController>>(new Map());
  const patchLane = useCallback((id: number, p: Partial<Lane>) => setLanes(ls => ls.map(l => (l.id === id ? { ...l, ...p } : l))), []);

  useEffect(() => () => aborts.current.forEach(a => a.abort()), []);
  useEffect(() => {
    const next: PlaygroundPrefs = { ...prefs, temperature: useTemp ? temp : undefined, maxTokens: Number(maxTok) > 0 ? Number(maxTok) : undefined, lanes: lanes.map(l => ({ provider: l.provider, model: l.model })), providers: { ...prefs.providers } };
    for (const l of lanes) next.providers[l.provider] = { baseUrl: l.baseUrl || undefined, model: l.model || undefined };
    savePrefs(next);
  }, [lanes, useTemp, temp, maxTok]); // eslint-disable-line react-hooks/exhaustive-deps

  const runLane = useCallback(async (lane: Lane) => {
    const ac = new AbortController(); aborts.current.set(lane.id, ac);
    setKey(lane.provider, lane.keyDraft.trim(), prefs.remember);
    patchLane(lane.id, { status: "running", output: "", error: "", result: undefined });
    let acc = "";
    try {
      const res = await runPrompt({ provider: lane.provider, baseUrl: lane.baseUrl, apiKey: lane.keyDraft.trim(), model: lane.model.trim(), system, user: userText, temperature: useTemp ? temp : undefined, maxTokens: Number(maxTok) > 0 ? Number(maxTok) : undefined, signal: ac.signal }, (_c, soFar) => { acc = soFar; patchLane(lane.id, { output: soFar }); });
      patchLane(lane.id, { status: "done", result: res, output: res.text });
      void addRun({ promptId: source.id ?? undefined, promptTitle: source.title, provider: lane.provider, model: lane.model, system, user: userText, output: res.text, ms: res.ms, firstTokenMs: res.firstTokenMs, inputTokens: res.inputTokens, outputTokens: res.outputTokens }).catch(() => undefined);
    } catch (e) {
      const pe2 = e as ProviderError;
      if (pe2.kind === "aborted") patchLane(lane.id, { status: acc ? "done" : "idle", error: "" });
      else { patchLane(lane.id, { status: "error", error: pe2.message || String(e) }); void addRun({ promptId: source.id ?? undefined, promptTitle: source.title, provider: lane.provider, model: lane.model, system, user: userText, output: acc, ms: 0, firstTokenMs: null, error: pe2.message }).catch(() => undefined); }
    } finally { aborts.current.delete(lane.id); }
  }, [prefs.remember, system, userText, useTemp, temp, maxTok, source, patchLane]);

  const runAll = () => lanes.forEach(l => { if (l.status !== "running") void runLane(l); });
  const stopAll = () => aborts.current.forEach(a => a.abort());
  const anyRunning = lanes.some(l => l.status === "running");
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); if (!anyRunning) runAll(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });

  const fetchModels = async (lane: Lane) => {
    patchLane(lane.id, { error: "" });
    try { const m = await listModels(lane.provider, lane.baseUrl, lane.keyDraft.trim()); patchLane(lane.id, { models: m, model: lane.model || m[0] || "" }); if (!m.length) patchLane(lane.id, { error: "The server returned no models." }); }
    catch (e) { patchLane(lane.id, { error: (e as Error).message }); }
  };

  return (
    <Dialog full title="API Playground" onClose={close}
      footer={<>
        <span className="mr-auto text-[12px] text-ink-3">Sends this prompt only to the provider(s) you run — straight from your browser, with your own key.</span>
        <button className="btn btn-ghost" onClick={() => setTab(tab === "run" ? "history" : "run")}>{tab === "run" ? "Run history" : "Back to run"}</button>
        {anyRunning ? <button className="btn btn-danger" onClick={stopAll}>Stop</button> : <button className="btn btn-primary" onClick={runAll} disabled={tab !== "run"}>Run {lanes.length > 1 ? `all ${lanes.length}` : ""} <kbd className="ml-1 font-mono text-[10px] opacity-70">Ctrl ↵</kbd></button>}
      </>}>
      {tab === "history" ? <History onLoad={r => { setSystem(r.system); setUserOverride(r.user); setSourceId("__editor__"); setTab("run"); }} /> : (
        <div className="grid h-full min-h-[480px] grid-cols-[minmax(300px,380px)_1fr] max-[900px]:grid-cols-1">
          <div className="space-y-3 overflow-auto border-r border-line p-4 max-[900px]:border-r-0 max-[900px]:border-b">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3">Prompt
              <select className="pf-input mt-1 w-full normal-case tracking-normal" value={sourceId} onChange={e => { setSourceId(e.target.value); setVars({}); }}>
                <option value="__editor__">Current editor{ui.state.editor.title ? ` — ${ui.state.editor.title}` : ""}</option>
                {prompts.map((p: any) => <option key={p.id} value={p.id}>{p.title || "Untitled"}</option>)}
              </select>
            </label>
            {specs.length > 0 && (
              <fieldset className="m-0 rounded-forge border border-line-subtle p-3">
                <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Variables</legend>
                {specs.map(sp => (
                  <label key={sp.name} className="mb-2 block text-[12px] text-ink-2 last:mb-0">{TemplateEngine.humanizeVarName(sp.name)}
                    {sp.type === "select" ? (
                      <select className="pf-input mt-1 w-full" value={vars[sp.name] ?? sp.default} onChange={e => setVars(v => ({ ...v, [sp.name]: e.target.value }))}>{sp.options?.map(o => <option key={o}>{o}</option>)}</select>
                    ) : sp.type === "multiline" ? (
                      <textarea className="pf-input mt-1 h-auto w-full py-1.5" rows={3} placeholder={sp.default} value={vars[sp.name] ?? ""} onChange={e => setVars(v => ({ ...v, [sp.name]: e.target.value }))} />
                    ) : (
                      <input className="pf-input mt-1 w-full" type={sp.type === "number" ? "number" : "text"} placeholder={sp.default} value={vars[sp.name] ?? ""} onChange={e => setVars(v => ({ ...v, [sp.name]: e.target.value }))} />
                    )}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3">System message (optional)
              <textarea className="pf-input mt-1 h-auto w-full py-2 normal-case tracking-normal" rows={3} value={system} onChange={e => setSystem(e.target.value)} placeholder="e.g. You are a meticulous code reviewer." />
            </label>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3">Message sent
              <textarea className="pf-input mt-1 h-auto w-full py-2 font-mono text-[12px] normal-case tracking-normal" rows={9} value={userText} onChange={e => setUserOverride(e.target.value)} />
            </label>
            {TemplateEngine.hasUnfilledVariables(userText) && <p role="status" className="m-0 text-[12px] text-amber-forge">Some {"{{variables}}"} are still unfilled and will be sent as written.</p>}
            <div className="grid grid-cols-2 gap-3 text-[12px] text-ink-2">
              <label className="flex flex-col gap-1"><span className="flex items-center gap-1.5"><input type="checkbox" checked={useTemp} onChange={e => setUseTemp(e.target.checked)} /> Temperature {useTemp ? temp.toFixed(1) : "(default)"}</span>
                <input type="range" min={0} max={2} step={0.1} value={temp} disabled={!useTemp} onChange={e => setTemp(Number(e.target.value))} aria-label="Temperature" /></label>
              <label className="flex flex-col gap-1">Max output tokens<input className="pf-input" inputMode="numeric" placeholder="provider default" value={maxTok} onChange={e => setMaxTok(e.target.value.replace(/\D/g, ""))} /></label>
            </div>
            <div className="border-t border-line-subtle pt-3 text-[12px] text-ink-2">
              <label className="flex items-start gap-2"><input className="mt-0.5" type="checkbox" checked={prefs.remember} onChange={e => { migrateKeys(e.target.checked); setPrefs(p => ({ ...p, remember: e.target.checked })); savePrefs({ ...prefs, remember: e.target.checked }); }} />
                <span>Remember API keys on this device <span className="text-ink-3">(stored unencrypted in this browser; otherwise they vanish when the tab closes)</span></span></label>
              <button className="btn btn-ghost btn-sm mt-2" onClick={() => { forgetAllKeys(); setLanes(ls => ls.map(l => ({ ...l, keyDraft: "" }))); }}>Forget all keys</button>
            </div>
          </div>

          <div className="min-w-0 overflow-auto p-4">
            <div className={`grid gap-3 ${lanes.length === 1 ? "grid-cols-1" : lanes.length === 2 ? "grid-cols-2 max-[1100px]:grid-cols-1" : "grid-cols-3 max-[1300px]:grid-cols-1"}`}>
              {lanes.map((lane, i) => {
                const def = getProvider(lane.provider);
                return (
                  <section key={lane.id} aria-label={`Model ${i + 1}`} className="flex min-h-[360px] min-w-0 flex-col rounded-forge-lg border border-line bg-bg-1">
                    <div className="space-y-2 border-b border-line-subtle p-3">
                      <div className="flex gap-2">
                        <select className="pf-input min-w-0 flex-1" aria-label="Provider" value={lane.provider} onChange={e => { const p = e.target.value as ProviderId; patchLane(lane.id, { provider: p, model: prefs.providers[p]?.model ?? "", baseUrl: prefs.providers[p]?.baseUrl ?? "", keyDraft: getKey(p), models: [], error: "" }); }}>{PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
                        {lanes.length > 1 && <button className="btn btn-ghost btn-sm" aria-label="Remove this model" onClick={() => setLanes(ls => ls.filter(l => l.id !== lane.id))}>✕</button>}
                      </div>
                      <div className="flex gap-2">
                        <input className="pf-input min-w-0 flex-1 font-mono text-[12px]" list={`models-${lane.id}`} aria-label="Model" placeholder="model name" value={lane.model} onChange={e => patchLane(lane.id, { model: e.target.value })} />
                        <datalist id={`models-${lane.id}`}>{[...lane.models, ...def.modelHints].map(m => <option key={m} value={m} />)}</datalist>
                        <button className="btn btn-secondary btn-sm" onClick={() => void fetchModels(lane)} title="Ask the provider which models your key can use">List</button>
                      </div>
                      {def.editableUrl && <input className="pf-input w-full font-mono text-[12px]" aria-label="Server address" placeholder="http://localhost:11434/v1" value={lane.baseUrl || (def.id === "custom" ? "" : def.baseUrl)} onChange={e => patchLane(lane.id, { baseUrl: e.target.value })} />}
                      {(def.needsKey || def.id === "custom") && (
                        <div className="flex gap-2">
                          <input className="pf-input min-w-0 flex-1 font-mono text-[12px]" aria-label={`${def.label} API key`} type={lane.showKey ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder={`API key (${def.keyHint})`} value={lane.keyDraft} onChange={e => patchLane(lane.id, { keyDraft: e.target.value })} />
                          <button className="btn btn-ghost btn-sm" onClick={() => patchLane(lane.id, { showKey: !lane.showKey })} aria-label={lane.showKey ? "Hide key" : "Show key"}>{lane.showKey ? "Hide" : "Show"}</button>
                        </div>
                      )}
                      {!lane.showKey && lane.keyDraft && <div className="font-mono text-[10px] text-ink-3">key: {maskKey(lane.keyDraft)}</div>}
                      {def.note && <div className="text-[11px] leading-snug text-ink-3">{def.note}</div>}
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto p-3">
                      {lane.error && <p role="alert" className="m-0 mb-2 text-[12px] text-red-forge">{lane.error}</p>}
                      {lane.status === "idle" && !lane.output && !lane.error && <p className="m-0 text-[12px] text-ink-3">Output appears here.</p>}
                      <pre aria-live="polite" className="m-0 whitespace-pre-wrap break-words font-ui text-[13px] leading-relaxed">{lane.output}{lane.status === "running" && <span className="animate-pulse">▍</span>}</pre>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-line-subtle px-3 py-2 text-[11px] text-ink-3">
                      <span className="font-mono">{lane.status === "running" ? "streaming…" : lane.result ? `${fmtMs(lane.result.ms)} · first ${fmtMs(lane.result.firstTokenMs)} · ${lane.result.inputTokens ?? "?"}→${lane.result.outputTokens ?? "?"} tok` : ""}</span>
                      <span className="flex gap-1.5">
                        {lane.status === "running" ? <button className="btn btn-ghost btn-sm" onClick={() => aborts.current.get(lane.id)?.abort()}>Stop</button> : <button className="btn btn-secondary btn-sm" onClick={() => void runLane(lane)}>Run</button>}
                        <button className="btn btn-ghost btn-sm" disabled={!lane.output} onClick={() => void navigator.clipboard.writeText(lane.output)}>Copy</button>
                        <button className="btn btn-ghost btn-sm" disabled={!lane.output || lane.status === "running"} title="Save this output as a new prompt" onClick={async () => { const p = await pe.savePrompt(pe.newPromptSkeleton({ title: `${source.title} — output (${lane.model})`, body: lane.output, tags: ["playground-output"] })); ui.renderView(); ui.toast("Saved output as a new prompt.", "success"); void p; }}>Save</button>
                      </span>
                    </div>
                  </section>
                );
              })}
            </div>
            {lanes.length < 3 && <button className="btn btn-secondary mt-3" onClick={() => setLanes(ls => [...ls, mkLane(ls[ls.length - 1]?.provider ?? "openai")])}>+ Compare another model</button>}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function History({ onLoad }: { onLoad: (r: RunRecord) => void }) {
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { void listRuns().then(setRuns).catch(() => setRuns([])); }, []);
  if (!runs) return <p className="p-5 text-[13px] text-ink-3">Loading…</p>;
  return (
    <div className="p-5">
      <div className="mb-3 flex items-center justify-between"><h3 className="m-0 text-[13px] font-semibold">{runs.length} saved run{runs.length === 1 ? "" : "s"} <span className="font-normal text-ink-3">(newest 300 kept, stored only in this browser)</span></h3>
        {runs.length > 0 && <button className="btn btn-ghost btn-sm" onClick={async () => { await clearRuns(); setRuns([]); }}>Clear history</button>}</div>
      <ul className="m-0 list-none p-0">
        {runs.map(r => (
          <li key={r.id} className="border-b border-line-subtle py-2.5">
            <button className="flex w-full items-center justify-between gap-3 bg-transparent text-left text-[13px] text-ink" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
              <span className="min-w-0 truncate"><b>{r.promptTitle || "Prompt"}</b> <span className="text-ink-3">· {r.provider} · {r.model}</span>{r.error && <span className="ml-2 text-red-forge">failed</span>}</span>
              <span className="shrink-0 font-mono text-[11px] text-ink-3">{new Date(r.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {fmtMs(r.ms)}</span>
            </button>
            {open === r.id && (<div className="mt-2 space-y-2">
              {r.error && <p className="m-0 text-[12px] text-red-forge">{r.error}</p>}
              <pre className="m-0 max-h-60 overflow-auto whitespace-pre-wrap rounded-forge border border-line bg-bg-3 p-3 text-[12px]">{r.output || "(no output)"}</pre>
              <button className="btn btn-secondary btn-sm" onClick={() => onLoad(r)}>Load this prompt into the Playground</button>
            </div>)}
          </li>
        ))}
      </ul>
    </div>
  );
}
