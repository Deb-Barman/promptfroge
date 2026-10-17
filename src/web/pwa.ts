/** Install-to-desktop/home-screen support (Chrome, Edge, Android; Safari uses Share → Add to Home Screen). */
interface BIPEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
let deferred: BIPEvent | null = null;
const subs = new Set<() => void>();

export function captureInstallPrompt(): () => void {
  const onBip = (e: Event) => { e.preventDefault(); deferred = e as BIPEvent; subs.forEach(f => f()); };
  const onInstalled = () => { deferred = null; subs.forEach(f => f()); };
  window.addEventListener("beforeinstallprompt", onBip);
  window.addEventListener("appinstalled", onInstalled);
  return () => { window.removeEventListener("beforeinstallprompt", onBip); window.removeEventListener("appinstalled", onInstalled); };
}
export const canInstall = (): boolean => deferred !== null;
export const onInstallChange = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const d = deferred; deferred = null;
  await d.prompt();
  const { outcome } = await d.userChoice;
  subs.forEach(f => f());
  return outcome === "accepted";
}
export const isStandalone = (): boolean => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
