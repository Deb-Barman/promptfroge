/**
 * Share links — a prompt travels inside the URL hash, so there is no server, no database and no
 * account: `https://your-app/#share=1.<deflate+base64url>`. The hash is never sent to any server
 * (browsers don't transmit it), and nothing is imported until the recipient reviews and accepts it.
 */
export type ShareKind = "prompt" | "template";
export interface SharePayload {
  v: 1;
  k: ShareKind;
  title: string;
  body: string;
  tags: string[];
  category: string;
  format: string;
}

const FORMATS = ["text", "json", "xml", "markdown"];
export const MAX_DECODED_BYTES = 256 * 1024;      // decompression-bomb guard
export const SOFT_URL_LIMIT = 8000;               // most chat apps / browsers get unreliable beyond this

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type AnyStream = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };
async function pump(bytes: Uint8Array, stream: AnyStream, maxOut = Infinity): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Don't await the write before reading — large inputs would deadlock on back-pressure.
  const writing = writer.write(bytes).then(() => writer.close()).catch(() => { /* surfaced by the reader */ });
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxOut) { await reader.cancel(); throw new Error("Shared data is too large."); }
      chunks.push(value);
    }
  } finally { await writing; }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export const hasCompression = (): boolean => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
export const deflateRaw = (b: Uint8Array) => pump(b, new CompressionStream("deflate-raw") as unknown as AnyStream);
export const inflateRaw = (b: Uint8Array, max = MAX_DECODED_BYTES) => pump(b, new DecompressionStream("deflate-raw") as unknown as AnyStream, max);

const str = (v: unknown, max: number): string => (typeof v === "string" ? v : "").slice(0, max);

/** Strict allow-list validation of an untrusted payload (from a link, or a file). */
export function normalizeShare(raw: unknown): SharePayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("That link doesn't contain a prompt.");
  const r = raw as Record<string, unknown>;
  const k: ShareKind = r.k === "template" ? "template" : "prompt";
  const body = str(r.body, 200_000);
  if (!body.trim()) throw new Error("The shared prompt is empty.");
  const tags = Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string").slice(0, 20).map(t => t.slice(0, 40)) : [];
  const format = typeof r.format === "string" && FORMATS.includes(r.format) ? r.format : "text";
  return { v: 1, k, title: str(r.title, 200), body, tags, category: str(r.category, 40) || "custom", format };
}

/** `1.` = deflate-raw + base64url, `0.` = plain base64url (browsers without CompressionStream). */
export async function encodeShare(p: Partial<SharePayload> & { body: string }): Promise<string> {
  const payload = normalizeShare({ k: "prompt", ...p });
  const json = enc.encode(JSON.stringify(payload));
  if (hasCompression()) return "1." + bytesToB64url(await deflateRaw(json));
  return "0." + bytesToB64url(json);
}

export async function decodeShare(token: string): Promise<SharePayload> {
  const t = token.trim();
  const m = /^([01])\.([A-Za-z0-9_-]+)$/.exec(t);
  if (!m) throw new Error("This share link is damaged or incomplete.");
  let bytes: Uint8Array;
  try { bytes = b64urlToBytes(m[2]); } catch { throw new Error("This share link is damaged or incomplete."); }
  let jsonBytes: Uint8Array;
  if (m[1] === "1") {
    if (!hasCompression()) throw new Error("This browser can't open compressed share links — try a current Chrome, Edge, Firefox or Safari.");
    try { jsonBytes = await inflateRaw(bytes); }
    catch (e) { throw new Error((e as Error).message === "Shared data is too large." ? "Shared data is too large." : "This share link is damaged or incomplete."); }
  } else {
    if (bytes.length > MAX_DECODED_BYTES) throw new Error("Shared data is too large.");
    jsonBytes = bytes;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(dec.decode(jsonBytes)); } catch { throw new Error("This share link is damaged or incomplete."); }
  return normalizeShare(parsed);
}

export async function buildShareUrl(p: Partial<SharePayload> & { body: string }, base?: string): Promise<{ url: string; length: number; tooLong: boolean }> {
  const origin = (base ?? (typeof location !== "undefined" ? location.href : "https://promptforge.app/")).split("#")[0];
  const url = `${origin}#share=${await encodeShare(p)}`;
  return { url, length: url.length, tooLong: url.length > SOFT_URL_LIMIT };
}

/** Returns the token if the hash is `#share=<token>`, else null. */
export function extractShareToken(hash: string): string | null {
  const m = /^#share=([A-Za-z0-9._-]+)$/.exec(hash);
  return m ? m[1] : null;
}
