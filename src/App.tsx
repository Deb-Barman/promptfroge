import { Suspense, lazy, useEffect, useState } from "react";
import { bootstrapApp, type AppContext } from "./app/bootstrap";
import { installWeb } from "./web/app";
import { useDialogs, useIncoming } from "./web/dialogs";
import { Dialog } from "./web/Dialog";
import { Banners } from "./web/Banners";
import { LegacyChrome } from "./shell/LegacyChrome";

// Heavy, rarely-used surfaces are code-split so cold start stays fast.
const ProEditorDialog = lazy(() => import("./web/ProEditorDialog"));
const WorkspaceDialog = lazy(() => import("./web/WorkspaceDialog"));
const PlaygroundDialog = lazy(() => import("./web/PlaygroundDialog"));
const ShareDialog = lazy(() => import("./web/ShareDialog"));
const IncomingShareDialog = lazy(() => import("./web/ShareDialog").then(m => ({ default: m.IncomingShareDialog })));

export default function App() {
  const [ctx, setCtx] = useState<AppContext | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const open = useDialogs(s => s.open);
  const incoming = useIncoming(s => s.token);

  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    // The chrome is committed before effects run, so every id the view layer looks up exists by now.
    bootstrapApp()
      .then(c => { if (alive) { setCtx(c); off = installWeb(c); document.getElementById("bootSplash")?.remove(); } })
      .catch(e => { console.error(e); if (alive) setFatal(String((e as Error)?.stack ?? e)); });
    return () => { alive = false; off?.(); };
  }, []);

  return (
    <>
      <a href="#workspace" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById("workspace")?.focus(); }}>Skip to content</a>
      <LegacyChrome />
      <Banners />
      {fatal && (
        <Dialog title="Prompt Forge couldn't start" onClose={() => location.reload()}>
          <div className="p-5 text-[13px]">
            <p className="mt-0">Your data has not been touched. Try reloading; if this keeps happening, copy the details below.</p>
            <pre className="m-0 whitespace-pre-wrap font-mono text-[12px] text-red-forge">{fatal}</pre>
          </div>
        </Dialog>
      )}
      {ctx && (
        <Suspense fallback={null}>
          {open === "pro-editor" && <ProEditorDialog ctx={ctx} />}
          {open === "workspace" && <WorkspaceDialog ctx={ctx} />}
          {open === "playground" && <PlaygroundDialog ctx={ctx} />}
          {open === "share" && <ShareDialog ctx={ctx} />}
          {incoming && !open && <IncomingShareDialog ctx={ctx} />}
        </Suspense>
      )}
    </>
  );
}
