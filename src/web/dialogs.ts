import { create } from "zustand";

export type DialogId = "workspace" | "pro-editor" | "playground" | "share" | null;
export type WorkspaceTab = "general" | "backups" | "data" | "about";

interface DialogState {
  open: DialogId; tab: WorkspaceTab; payload?: string;
  show: (d: Exclude<DialogId, null>, opts?: { tab?: WorkspaceTab; payload?: string }) => void;
  close: () => void;
}
/** Tiny store so the palette, keyboard shortcuts and buttons can open React dialogs. */
export const useDialogs = create<DialogState>(set => ({
  open: null, tab: "general",
  show: (d, opts) => set({ open: d, tab: opts?.tab ?? "general", payload: opts?.payload }),
  close: () => set({ open: null, payload: undefined }),
}));

export interface BannerItem { id: string; tone: "warn" | "error" | "info"; text: string; action?: { label: string; run: () => void } }
interface BannerState { items: BannerItem[]; push: (b: BannerItem) => void; dismiss: (id: string) => void }
export const useBanners = create<BannerState>(set => ({
  items: [],
  push: b => set(s => ({ items: [...s.items.filter(x => x.id !== b.id), b] })),
  dismiss: id => set(s => ({ items: s.items.filter(x => x.id !== id) })),
}));

/** Incoming share link waiting for the person to review it. */
interface IncomingState { token: string | null; set: (t: string | null) => void }
export const useIncoming = create<IncomingState>(set => ({ token: null, set: token => set({ token }) }));
