import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { readFileSync } from "node:fs";
import { CSP } from "./csp";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Pure static build: `vite build` -> dist/ (HTML + JS + CSS). No server code, no database.
// `base: "./"` keeps every URL relative, so the same build works on Vercel, GitHub Pages or any sub-folder.
export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "Prompt Forge", short_name: "Prompt Forge",
        description: "A local-first IDE for writing, analysing, versioning and running prompts. No backend, no account.",
        start_url: "./", scope: "./", display: "standalone", orientation: "any",
        background_color: "#0b0d10", theme_color: "#0b0d10", categories: ["productivity", "developer", "utilities"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [{ name: "New prompt", short_name: "New", url: "./", icons: [{ src: "icons/icon-192.png", sizes: "192x192" }] }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        globIgnores: ["**/monaco-*.js", "**/editor.worker-*.js"],          // 4 MB editor: cached on first use instead
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [{ urlPattern: ({ url }) => /\/assets\/(monaco|editor\.worker)-.*\.js$/.test(url.pathname), handler: "CacheFirst", options: { cacheName: "pf-monaco", expiration: { maxEntries: 8 } } }],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 4000,   // Monaco + the cl100k vocabulary are intentionally large and lazy-loaded
    rollupOptions: { output: { manualChunks: { monaco: ["monaco-editor"] } } },
  },
  server: { port: 5173, strictPort: false },
  // `npm run preview` serves the production build with the same security headers Vercel applies.
  preview: { port: 4173, strictPort: false, headers: { "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } },
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
  },
} as import("vite").UserConfig & { test: unknown });
