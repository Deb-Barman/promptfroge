import "fake-indexeddb/auto";
import { vi } from "vitest";

// jsdom gaps the view layer touches (all real in Chromium/Electron).
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
}
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as any).ResizeObserver ||= RO;
(globalThis as any).IntersectionObserver ||= RO;
Element.prototype.scrollIntoView ||= function () {};
Element.prototype.scrollTo ||= function () {};
HTMLElement.prototype.scrollTo ||= function () {};
window.scrollTo = vi.fn() as any;
(HTMLCanvasElement.prototype as any).getContext = () => null;
Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn().mockResolvedValue("") }, configurable: true });
URL.createObjectURL ||= () => "blob:test";
URL.revokeObjectURL ||= () => {};

// jsdom's Blob has no .stream(); Chromium (Electron) does. Use Node's for the tokenizer's gzip path.
import { Blob as NodeBlob } from "node:buffer";
(globalThis as any).Blob = NodeBlob;
