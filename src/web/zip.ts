/** Minimal ZIP reader/writer (no dependencies). Writer uses "stored" entries; reader handles stored + deflate. */
import { inflateRaw } from "./share";

export interface ZipEntry { name: string; data: Uint8Array }
const enc = new TextEncoder();
const dec = new TextDecoder();

let CRC_TABLE: Uint32Array | null = null;
export function crc32(buf: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const y = Math.max(1980, d.getFullYear());
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

/** Builds a ZIP archive. File names are stored as UTF-8 (flag bit 11), so Bengali/CJK names survive. */
export function zipStore(files: Array<{ name: string; data: Uint8Array | string; modified?: Date }>): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name.replace(/\\/g, "/").replace(/^\/+/, ""));
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const { time, date } = dosDateTime(f.modified ?? new Date());
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    const local = new Uint8Array(30 + name.length + data.length);
    local.set(new Uint8Array(lh.buffer), 0); local.set(name, 30); local.set(data, 30 + name.length);
    parts.push(local);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    const c = new Uint8Array(46 + name.length); c.set(new Uint8Array(ch.buffer), 0); c.set(name, 46);
    central.push(c);
    offset += local.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let o = 0;
  for (const p of [...parts, ...central, new Uint8Array(end.buffer)]) { out.set(p, o); o += p.length; }
  return out;
}

export interface UnzipLimits { maxFiles?: number; maxTotalBytes?: number; maxFileBytes?: number }

/** Reads a ZIP (stored or deflate). Guards against zip bombs; skips folders and unsafe paths. */
export async function unzip(buf: Uint8Array, limits: UnzipLimits = {}): Promise<ZipEntry[]> {
  const { maxFiles = 5000, maxTotalBytes = 200 * 1024 * 1024, maxFileBytes = 16 * 1024 * 1024 } = limits;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error("That file isn't a valid ZIP archive.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) throw new Error("ZIP64 archives aren't supported.");
  if (count > maxFiles) throw new Error(`The archive has more than ${maxFiles} files.`);
  const out: ZipEntry[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error("The ZIP directory is corrupted.");
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const rawName = buf.subarray(p + 46, p + 46 + nlen);
    const name = dec.decode(rawName).replace(/\\/g, "/");
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    if (name.split("/").some(seg => seg === "..") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) continue;
    if (flags & 1) throw new Error("Encrypted ZIP files aren't supported.");
    if (usize > maxFileBytes) throw new Error(`"${name}" is larger than ${Math.round(maxFileBytes / 1048576)} MB.`);
    if (lho + 30 > buf.length || dv.getUint32(lho, true) !== 0x04034b50) throw new Error("The ZIP directory is corrupted.");
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const raw = buf.subarray(start, start + csize);
    let data: Uint8Array;
    if (method === 0) data = raw;
    else if (method === 8) data = await inflateRaw(raw, maxFileBytes);
    else throw new Error(`"${name}" uses an unsupported compression method.`);
    total += data.length;
    if (total > maxTotalBytes) throw new Error("The archive expands to more than 200 MB.");
    out.push({ name, data });
  }
  return out;
}
