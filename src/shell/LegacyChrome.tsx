import { memo } from "react";

/**
 * Static application chrome — top bar, navigation rail, status bar and overlay
 * roots. The markup (ids, classes, ARIA, SVG icons) is the original design,
 * rendered once by React. The workspace <main> is intentionally empty: view
 * content is owned by the UIManager view layer and must never be reconciled
 * by React (it mutates the DOM directly), hence `memo` with no props.
 */
function LegacyChromeImpl() {
  return (
    <>
    <div id="app" className="app" aria-live="polite">
    
      {/* ============ TOP BAR ============ */}
      <header className="topbar" role="banner">
        <div className="topbar-left">
          <button className="icon-btn topbar-nav-toggle" id="navToggleBtn" aria-label="Toggle navigation" title="Toggle navigation">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2.5 5h13M2.5 9h13M2.5 13h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          <div className="brand" id="brandHome" role="button" tabIndex={0} aria-label="Prompt Forge — go to dashboard">
            <svg className="brand-mark" width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="7" fill="var(--bg-3)"/>
              <path d="M8 22 L14 10 L20 22 M10.5 17 H17.5" stroke="var(--accent-amber)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="24" cy="9" r="2.1" fill="var(--accent-blue)"/>
            </svg>
            <span className="brand-word">Prompt<b>Forge</b></span>
          </div>
        </div>
    
        <button className="palette-trigger" id="paletteTriggerBtn" aria-label="Open command palette">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6.2" cy="6.2" r="4.6" stroke="currentColor" strokeWidth="1.4"/><path d="M9.7 9.7 L13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          <span>Jump to&hellip;</span>
          <kbd>Ctrl K</kbd>
        </button>
    
        <div className="topbar-right">
          <span className="save-indicator" id="saveIndicator" aria-live="polite"></span>
          <button className="icon-btn" id="themeToggleBtn" aria-label="Toggle light and dark theme" title="Toggle theme">
            <svg id="themeIconSun" width="17" height="17" viewBox="0 0 17 17" fill="none"><circle cx="8.5" cy="8.5" r="3.4" stroke="currentColor" strokeWidth="1.4"/><path d="M8.5 1.2v2M8.5 13.8v2M1.2 8.5h2M13.8 8.5h2M3.5 3.5l1.4 1.4M12.1 12.1l1.4 1.4M13.5 3.5l-1.4 1.4M4.9 12.1l-1.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            <svg id="themeIconMoon" width="17" height="17" viewBox="0 0 17 17" fill="none" style={{ display: 'none' }}><path d="M14.5 10.2a6 6 0 1 1-6.7-8.4 5 5 0 0 0 6.7 8.4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
          </button>
          <button className="icon-btn" id="exportQuickBtn" aria-label="Export data" title="Export">
            <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M8.5 1.5v9M5 7l3.5 3.5L12 7M2.5 13v1.5A1 1 0 0 0 3.5 15.5h10a1 1 0 0 0 1-1V13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </header>
    
      <div className="shell">
        {/* ============ ICON RAIL / SIDEBAR NAV ============ */}
        <nav className="rail" id="railNav" role="navigation" aria-label="Primary">
          <button className="rail-item" data-view="dashboard" aria-current="page">
            <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><rect x="2.5" y="2.5" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.4"/><rect x="10.5" y="2.5" width="6" height="9.5" rx="1.3" stroke="currentColor" strokeWidth="1.4"/><rect x="2.5" y="10.5" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.4"/></svg>
            <span>Dashboard</span>
          </button>
          <button className="rail-item" data-view="editor">
            <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><path d="M12.2 2.8 16.2 6.8 6.4 16.6 2 17l0.4-4.4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
            <span>Editor</span>
          </button>
          <button className="rail-item" data-view="builder">
            <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><rect x="2.5" y="3" width="14" height="3.4" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="2.5" y="7.8" width="14" height="3.4" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="2.5" y="12.6" width="9" height="3.4" rx="1" stroke="currentColor" strokeWidth="1.4"/></svg>
            <span>Builder</span>
          </button>
          <button className="rail-item" data-view="library">
            <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><path d="M3 3.5h4.2a2 2 0 0 1 1.8 1.1 2 2 0 0 1 1.8-1.1H15v11h-4.2a2 2 0 0 0-1.8 1.1A2 2 0 0 0 7.2 14.5H3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M9 4.9v9.6" stroke="currentColor" strokeWidth="1.4"/></svg>
            <span>Library</span>
          </button>
          <button className="rail-item" data-view="compare">
            <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><rect x="2.3" y="3" width="6.2" height="13" rx="1.3" stroke="currentColor" strokeWidth="1.4"/><rect x="10.5" y="3" width="6.2" height="13" rx="1.3" stroke="currentColor" strokeWidth="1.4"/><path d="M9.5 6.5v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="0.5 2.3"/></svg>
            <span>Compare</span>
          </button>
          <button className="rail-item" data-view="templates">
            <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><rect x="2.5" y="2.5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M2.5 7.3h14M7 7.3v9.2" stroke="currentColor" strokeWidth="1.4"/></svg>
            <span>Templates</span>
          </button>
          <button className="rail-item" data-view="patterns">
            <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><circle cx="5.5" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.4"/><circle cx="13.5" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.4"/><circle cx="9.5" cy="13.2" r="2.6" stroke="currentColor" strokeWidth="1.4"/></svg>
            <span>Patterns</span>
          </button>
          <button className="rail-item" data-view="chains">
            <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><circle cx="4.5" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.4"/><circle cx="9.5" cy="9.5" r="2.2" stroke="currentColor" strokeWidth="1.4"/><circle cx="14.5" cy="14" r="2.2" stroke="currentColor" strokeWidth="1.4"/><path d="M6.2 6.4 7.8 8M11.2 11 12.8 12.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            <span>Chains</span>
          </button>
          <button className="rail-item" data-view="history">
            <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><path d="M9.5 5v4.7l3.3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M3.3 6.9A6.5 6.5 0 1 1 3 11" stroke="currentColor" strokeWidth="1.4"/><path d="M3.3 3.3v3.6h3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>History</span>
          </button>
          <button className="rail-item" data-view="analytics">
            <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><path d="M3 16V9.5M9.5 16V3M16 16v-6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
            <span>Analytics</span>
          </button>
          <button className="rail-item" data-view="learn">
            <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><path d="M9.5 3 2 6.6l7.5 3.6 7.5-3.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M5.3 8.4v3.9c0 1 1.9 2.4 4.2 2.4s4.2-1.4 4.2-2.4V8.4" stroke="currentColor" strokeWidth="1.4"/></svg>
            <span>Learn</span>
          </button>
          <div className="rail-spacer"></div>
          <button className="rail-item" data-view="settings">
            <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><circle cx="9.5" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M9.5 2.8v1.6M9.5 14.1v1.6M16.2 9.5h-1.6M4.4 9.5H2.8M14.4 4.6l-1.1 1.1M5.7 13.3l-1.1 1.1M14.4 14.4l-1.1-1.1M5.7 5.7 4.6 4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            <span>Settings</span>
          </button>
        </nav>
    
        {/* ============ MAIN WORKSPACE ============ */}
        <main className="workspace" id="workspace" tabIndex={-1}>
          {/* Views injected here by UIManager.renderView() */}
        </main>
        <div className="rail-scrim" id="railScrim"></div>
      </div>
    
      {/* ============ STATUS BAR ============ */}
      <footer className="statusbar" role="contentinfo">
        <div className="status-left">
          <span className="status-chip" id="statusView">Dashboard</span>
          <span className="status-sep">&middot;</span>
          <span id="statusWordCount">0 words</span>
          <span className="status-sep">&middot;</span>
          <span id="statusCharCount">0 chars</span>
        </div>
        <div className="status-right">
          <span id="statusStorage" className="status-muted">Local storage ready</span>
          <span className="status-sep">&middot;</span>
          <span id="statusClock" className="status-muted"></span>
        </div>
      </footer>
    
    </div>
    
    {/* ============ OVERLAYS: toasts, modals, palette live outside #app ============ */}
    <div id="toastStack" className="toast-stack" aria-live="assertive" aria-atomic="false"></div>
    <div id="modalRoot"></div>
    <div id="paletteRoot"></div>
    </>
  );
}

export const LegacyChrome = memo(LegacyChromeImpl);
