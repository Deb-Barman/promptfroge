import { useEffect, useRef, type ReactNode } from "react";

interface Props { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; full?: boolean }
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible modal: Esc closes, Tab is trapped inside, focus returns to whatever opened it. */
export function Dialog({ title, onClose, children, footer, wide, full }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => { const el = ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE); el?.focus(); }, 30);
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const els = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(x => x.offsetParent !== null || x === document.activeElement);
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!ref.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", h, true);
    return () => { clearTimeout(t); window.removeEventListener("keydown", h, true); prev?.focus?.(); };
  }, [onClose]);

  const size = full ? "w-[min(1240px,98vw)] h-[min(860px,94vh)]" : wide ? "w-[min(820px,96vw)] max-h-[90vh]" : "w-[min(560px,96vw)] max-h-[90vh]";
  return (
    <div className="pf-overlay fixed inset-0 z-[9000] flex items-center justify-center bg-black/55 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`flex flex-col rounded-forge-lg border border-line bg-bg-2 text-ink shadow-pop ${size}`}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="m-0 text-[15px] font-semibold tracking-tight">{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
