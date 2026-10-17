import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/legacy.css";
import "./styles/web.css";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { useBanners } from "./web/dialogs";

// Deliberately not <StrictMode>: the view layer owns real DOM and storage
// connections, and StrictMode's dev-only double-mount would initialise it twice.
createRoot(document.getElementById("root")!).render(<App />);

// Offline support + update prompt (production builds only; the dev server has no service worker).
if (import.meta.env.PROD) {
  const update = registerSW({
    onNeedRefresh() {
      useBanners.getState().push({ id: "update", tone: "info", text: "A new version of Prompt Forge is ready.", action: { label: "Update now", run: () => void update(true) } });
    },
    onOfflineReady() {
      useBanners.getState().push({ id: "offline", tone: "info", text: "Ready to work offline — Prompt Forge is now cached on this device." });
      setTimeout(() => useBanners.getState().dismiss("offline"), 6000);
    },
  });
}
