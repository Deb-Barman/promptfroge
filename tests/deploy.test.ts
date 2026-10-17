import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { CSP } from "../csp";

const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
const header = (key: string) => vercel.headers.flatMap((h: any) => h.headers).find((h: any) => h.key === key)?.value;

describe("Vercel deployment config", () => {
  it("is a pure static Vite build", () => {
    expect(vercel.framework).toBe("vite"); expect(vercel.outputDirectory).toBe("dist"); expect(vercel.buildCommand).toBe("npm run build");
    expect(vercel.rewrites).toBeUndefined();      // no server routes, no functions
    expect(existsSync("api")).toBe(false);        // no backend directory
  });
  it("serves exactly the CSP defined in csp.ts (dev preview and production can't drift)", () => { expect(header("Content-Security-Policy")).toBe(CSP); });
  it("forbids inline/third-party script and framing", () => {
    expect(CSP).toMatch(/script-src 'self'(;|$)/); expect(CSP).not.toMatch(/script-src[^;]*unsafe/);
    expect(CSP).toContain("frame-ancestors 'none'"); expect(CSP).toContain("object-src 'none'");
  });
  it("keeps the service worker and HTML fresh while hashing assets forever", () => {
    const rules = vercel.headers as any[];
    expect(rules.find(r => r.source.includes("sw\\.js")).headers[0].value).toContain("must-revalidate");
    expect(rules.find(r => r.source.startsWith("/assets")).headers[0].value).toContain("immutable");
  });
  it("has the PWA icon files the manifest points at", () => {
    for (const f of ["icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png"]) expect(existsSync(`public/icons/${f}`)).toBe(true);
  });
});
