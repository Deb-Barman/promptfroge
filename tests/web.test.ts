import { describe, expect, it, beforeEach } from "vitest";
import { webcrypto } from "node:crypto";
import * as nodeStreams from "node:stream/web";
import { decodeShare, encodeShare, buildShareUrl, extractShareToken, normalizeShare, bytesToB64url, deflateRaw, SOFT_URL_LIMIT } from "../src/web/share";
import { crc32, unzip, zipStore } from "../src/web/zip";
import { buildVault, parseMarkdown, promptToMarkdown, slugify } from "../src/web/markdown";
import { addSnapshot, deleteSnapshot, getSnapshotJson, kindOf, listSnapshots, makeSafetyNet, resetBackupDbForTests } from "../src/web/backups";

// jsdom doesn't expose Node's web streams / crypto; Chromium has all of them.
for (const k of ["CompressionStream", "DecompressionStream", "TransformStream", "ReadableStream", "WritableStream"]) (globalThis as any)[k] ??= (nodeStreams as any)[k];
if (!(globalThis as any).crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

describe("share links", () => {
  it("round-trips Unicode prompts through the URL hash", async () => {
    const p = { title: "কোড রিভিউ 🚀", body: "<role>তুমি একজন রিভিউয়ার</role>\nIf a < b and c > d {{name}}", tags: ["a", "b"], category: "coding", format: "xml" };
    const { url, tooLong } = await buildShareUrl(p, "https://app.example/");
    expect(url.startsWith("https://app.example/#share=1.")).toBe(true);
    expect(tooLong).toBe(false);
    const back = await decodeShare(extractShareToken(new URL(url).hash)!);
    expect(back).toMatchObject({ v: 1, k: "prompt", ...p });
  });
  it("compresses (a repetitive 20 KB prompt fits far under the URL limit)", async () => {
    const { length } = await buildShareUrl({ body: "Always cite sources. ".repeat(1000) }, "https://x.y/");
    expect(length).toBeLessThan(SOFT_URL_LIMIT);
  });
  it("flags oversize links", async () => {
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff).toString(36);
    const body = Array.from({ length: 4000 }, rnd).join(" ");
    expect((await buildShareUrl({ body }, "https://x.y/")).tooLong).toBe(true);
  });
  it("rejects garbage, truncated links and an empty prompt", async () => {
    await expect(decodeShare("nope")).rejects.toThrow(/damaged/);
    const t = await encodeShare({ body: "hello world" });
    await expect(decodeShare(t.slice(0, -6))).rejects.toThrow(/damaged/);
    expect(() => normalizeShare({ body: "   " })).toThrow(/empty/);
    expect(() => normalizeShare(null)).toThrow();
  });
  it("blocks decompression bombs", async () => {
    const bomb = await deflateRaw(new TextEncoder().encode(JSON.stringify({ body: "A".repeat(5_000_000) })));
    await expect(decodeShare("1." + bytesToB64url(bomb))).rejects.toThrow(/too large/);
  });
  it("drops unknown fields and clamps values (untrusted input)", () => {
    const n = normalizeShare({ body: "x", evil: "<img>", __proto__: { p: 1 }, format: "exe", tags: ["ok", 5, { a: 1 }], category: "c".repeat(100) });
    expect(Object.keys(n).sort()).toEqual(["body", "category", "format", "k", "tags", "title", "v"]);
    expect(n.format).toBe("text"); expect(n.tags).toEqual(["ok"]); expect(n.category.length).toBe(40);
  });
  it("only recognises #share=<token> hashes", () => {
    expect(extractShareToken("#share=1.abc_-")).toBe("1.abc_-");
    expect(extractShareToken("#share=<script>")).toBeNull();
    expect(extractShareToken("#other")).toBeNull();
  });
});

describe("zip", () => {
  const files = [
    { name: "prompts/coding/হ্যালো.md", data: "# হ্যালো\nbody ✓" },
    { name: "a.txt", data: "hello" },
    { name: "empty.md", data: "" },
  ];
  it("computes the standard CRC-32", () => { expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926); });
  it("round-trips through our own reader, preserving UTF-8 names", async () => {
    const out = await unzip(zipStore(files));
    expect(out.map(o => o.name)).toEqual(files.map(f => f.name));
    expect(new TextDecoder().decode(out[0].data)).toBe("# হ্যালো\nbody ✓");
  });
  it("is readable by the real `unzip` tool (valid CRCs and directory)", async () => {
    const { writeFileSync, mkdtempSync, readFileSync } = await import("node:fs");
    const { execFileSync } = await import("node:child_process");
    const dir = mkdtempSync("/tmp/pfzip-");
    writeFileSync(`${dir}/t.zip`, zipStore(files));
    const listing = execFileSync("unzip", ["-t", `${dir}/t.zip`]).toString();
    expect(listing).toMatch(/No errors detected/);
    execFileSync("unzip", ["-q", `${dir}/t.zip`, "a.txt", "-d", dir]);
    expect(readFileSync(`${dir}/a.txt`, "utf8")).toBe("hello");
  });
  it("reads deflate entries produced by the real `zip` tool", async () => {
    const { writeFileSync, mkdtempSync, readFileSync } = await import("node:fs");
    const { execFileSync } = await import("node:child_process");
    const dir = mkdtempSync("/tmp/pfzip2-");
    writeFileSync(`${dir}/note.md`, "repeat repeat repeat repeat ".repeat(50));
    execFileSync("zip", ["-q", "-j", `${dir}/z.zip`, `${dir}/note.md`]);
    const out = await unzip(new Uint8Array(readFileSync(`${dir}/z.zip`)));
    expect(new TextDecoder().decode(out[0].data)).toBe("repeat repeat repeat repeat ".repeat(50));
  });
  it("rejects non-zips, path traversal and oversize entries", async () => {
    await expect(unzip(new TextEncoder().encode("not a zip at all, sorry"))).rejects.toThrow(/valid ZIP/);
    const evil = await unzip(zipStore([{ name: "../../etc/passwd", data: "x" }, { name: "ok.md", data: "y" }]));
    expect(evil.map(e => e.name)).toEqual(["ok.md"]);
    await expect(unzip(zipStore([{ name: "big.md", data: "x".repeat(2000) }]), { maxFileBytes: 1000 })).rejects.toThrow(/larger than/);
  });
});

describe("markdown vault", () => {
  it("slugifies in any script", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("কোড রিভিউ")).toBe("কোড-রিভিউ");
    expect(slugify("???")).toBe("untitled");
  });
  it("round-trips a prompt through front-matter, preserving the body byte-for-byte", () => {
    const p = { id: "pr_1", title: 'Tricky: "quotes" & colons', body: "---\nnot front matter\n---\n<role>x</role>\na < b\n\n\ttabbed", tags: ["x y", "z"], category: "coding", format: "markdown", status: "production", favorite: true, createdAt: 1700000000000, updatedAt: 1700000001000 };
    const back = parseMarkdown(promptToMarkdown(p), "x.md");
    expect(back).toMatchObject({ title: p.title, id: "pr_1", category: "coding", format: "markdown", status: "production", favorite: true });
    expect(back.body.trimEnd()).toBe(p.body);
    expect(back.tags).toEqual(["x-y", "z"]);
  });
  it("imports plain markdown without front-matter (title from H1 or filename)", () => {
    expect(parseMarkdown("# My prompt\n\nDo the thing.", "whatever.md").title).toBe("My prompt");
    expect(parseMarkdown("Just text", "code-review_helper.txt").title).toBe("code review helper");
  });
  it("parses block-style YAML lists and CRLF files", () => {
    const m = parseMarkdown("---\r\ntitle: T\r\ntags:\r\n  - a\r\n  - b\r\n---\r\nBody\r\n", "t.md");
    expect(m.tags).toEqual(["a", "b"]); expect(m.body).toBe("Body\n");
  });
  it("de-duplicates file names inside the vault", () => {
    const v = buildVault({ prompts: [{ title: "Same", category: "x", body: "1" }, { title: "Same", category: "x", body: "2" }], templates: [], snippets: [{ trigger: "/hi", body: "yo" }], backupJson: "{}" });
    const names = v.map(f => f.name);
    expect(names).toContain("prompts/x/same.md"); expect(names).toContain("prompts/x/same-2.md");
    expect(names).toEqual(expect.arrayContaining(["README.md", "snippets.md", "prompt-forge-backup.json"]));
  });
});

describe("backup ring", () => {
  beforeEach(() => { resetBackupDbForTests(); });
  const dump = (n: number) => JSON.stringify({ prompts: Array.from({ length: n }, (_, i) => ({ id: "p" + i })), _meta: { exportedAt: Date.now() } });
  it("stores, lists, reads back and deletes snapshots", async () => {
    const m = await addSnapshot(dump(3), "manual");
    expect(m).toBeTruthy(); expect(m!.counts.prompts).toBe(3); expect(m!.kind).toBe("manual");
    expect(JSON.parse((await getSnapshotJson(m!.id))!).prompts.length).toBe(3);
    await deleteSnapshot(m!.id);
    expect((await listSnapshots()).some(s => s.id === m!.id)).toBe(false);
  });
  it("skips a snapshot identical to the previous one (ignoring export time)", async () => {
    expect(await addSnapshot(dump(5), "auto")).toBeTruthy();
    await new Promise(r => setTimeout(r, 5));
    expect(await addSnapshot(dump(5), "auto")).toBeNull();
    expect(await addSnapshot(dump(6), "auto")).toBeTruthy();
  });
  it("rotates automatic snapshots but keeps manual and safety ones", async () => {
    for (let i = 0; i < 7; i++) await addSnapshot(dump(10 + i), "auto", { keepAuto: 5 });
    const manual = await addSnapshot(dump(99), "manual");
    const all = await listSnapshots();
    expect(all.filter(s => s.kind === "auto").length).toBe(5);
    expect(all.some(s => s.id === manual!.id)).toBe(true);
    expect(kindOf("before-clear-prompts")).toBe("safety");
  });
  it("safety net is throttled and ignores empty workspaces", async () => {
    let calls = 0;
    const net = makeSafetyNet(async () => { calls++; return dump(2); }, 60000);
    const before = (await listSnapshots()).filter(s => s.kind === "safety").length;
    await net("before-clear-prompts"); await net("before-clear-versions"); await net("before-clear-groups");
    expect(calls).toBe(1);
    expect((await listSnapshots()).filter(s => s.kind === "safety").length).toBe(before + 1);
    const empty = makeSafetyNet(async () => JSON.stringify({ prompts: [], templates: [] }), 0);
    await empty("before-clear-all");
    expect((await listSnapshots()).filter(s => s.kind === "safety").length).toBe(before + 1);
  });
});
