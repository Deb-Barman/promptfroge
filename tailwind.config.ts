import type { Config } from "tailwindcss";

// Tailwind powers the *new* desktop-shell components (React). The legacy view
// markup keeps its own token-based stylesheet (src/styles/legacy.css), so we
// map those same CSS variables into Tailwind's theme: shell and views share one
// design language and flip together when the theme changes.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },           // legacy.css owns the reset
  theme: {
    extend: {
      colors: {
        bg: { 1: "var(--bg-1)", 2: "var(--bg-2)", 3: "var(--bg-3)", 4: "var(--bg-4, var(--bg-3))" },
        line: { DEFAULT: "var(--border)", subtle: "var(--border-subtle)" },
        ink: { DEFAULT: "var(--text-primary)", 2: "var(--text-secondary)", 3: "var(--text-tertiary)" },
        amber: { forge: "var(--accent-amber)" },
        blue: { forge: "var(--accent-blue)" },
        green: { forge: "var(--accent-green)" },
        red: { forge: "var(--accent-red)" },
        violet: { forge: "var(--accent-violet)" },
      },
      fontFamily: { ui: ["var(--font-ui)"], mono: ["var(--font-mono)"] },
      borderRadius: { forge: "var(--r-md)", "forge-lg": "var(--r-lg)" },
      boxShadow: { pop: "0 18px 50px rgba(0,0,0,.45)" },
    },
  },
  plugins: [],
} satisfies Config;
