import { useBanners } from "./dialogs";

/** Persistent, accessible notices for things the person must not miss (storage problems, updates). */
export function Banners() {
  const items = useBanners(s => s.items);
  const dismiss = useBanners(s => s.dismiss);
  if (!items.length) return null;
  const tone = { error: "border-red-forge", warn: "border-amber-forge", info: "border-blue-forge" } as const;
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-[8500] flex w-[min(640px,94vw)] -translate-x-1/2 flex-col gap-2">
      {items.map(b => (
        <div key={b.id} role={b.tone === "error" ? "alert" : "status"} className={`pointer-events-auto flex items-center gap-3 rounded-forge-lg border bg-bg-2 px-4 py-3 text-[13px] text-ink shadow-pop ${tone[b.tone]}`}>
          <span className="min-w-0 flex-1 leading-snug">{b.text}</span>
          {b.action && <button className="btn btn-primary btn-sm shrink-0" onClick={b.action.run}>{b.action.label}</button>}
          <button className="icon-btn shrink-0" aria-label="Dismiss" onClick={() => dismiss(b.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}
