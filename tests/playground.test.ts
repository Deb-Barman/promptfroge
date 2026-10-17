import { describe, expect, it, beforeEach } from "vitest";
import * as nodeStreams from "node:stream/web";
import { ProviderError, buildRequest, extractDelta, friendlyError, getKey, listModels, maskKey, migrateKeys, parseSSE, runPrompt, setKey } from "../src/web/playground/providers";

for (const k of ["ReadableStream", "TextDecoderStream"]) (globalThis as any)[k] ??= (nodeStreams as any)[k];
const enc = new TextEncoder();
function sseResponse(chunks: string[], status = 200): Response {
  const rs = new nodeStreams.ReadableStream<Uint8Array>({ start(c) { for (const x of chunks) c.enqueue(enc.encode(x)); c.close(); } });
  return { ok: status < 300, status, body: rs as unknown as ReadableStream<Uint8Array>, text: async () => chunks.join(""), json: async () => JSON.parse(chunks.join("")) } as Response;
}

describe("request building", () => {
  it("OpenAI-compatible: bearer auth, system+user messages, usage in stream, max_completion_tokens only for OpenAI", () => {
    const a = buildRequest({ provider: "openai", apiKey: "sk-x", model: "gpt-x", system: "S", user: "U", maxTokens: 50 });
    expect(a.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(a.init.headers.Authorization).toBe("Bearer sk-x");
    expect(a.bodyObj).toMatchObject({ model: "gpt-x", stream: true, max_completion_tokens: 50, messages: [{ role: "system", content: "S" }, { role: "user", content: "U" }] });
    expect(a.bodyObj.temperature).toBeUndefined();                               // never sent unless the user sets it
    const g = buildRequest({ provider: "groq", apiKey: "k", model: "m", user: "U", maxTokens: 9, temperature: 0.2 });
    expect(g.bodyObj).toMatchObject({ max_tokens: 9, temperature: 0.2 }); expect(g.bodyObj.max_completion_tokens).toBeUndefined();
    expect((g.bodyObj.messages as any[]).length).toBe(1);                         // empty system prompt is omitted
  });
  it("Anthropic: browser-access header, version, required max_tokens, top-level system", () => {
    const a = buildRequest({ provider: "anthropic", apiKey: "k", model: "claude-x", system: "S", user: "U" });
    expect(a.url).toBe("https://api.anthropic.com/v1/messages");
    expect(a.init.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(a.init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(a.bodyObj).toMatchObject({ max_tokens: 4096, system: "S", messages: [{ role: "user", content: "U" }] });
  });
  it("Gemini: key goes in a header (not the URL), model is URL-encoded", () => {
    const a = buildRequest({ provider: "gemini", apiKey: "SECRET", model: "gemini-2.5-flash", system: "S", user: "U", maxTokens: 7 });
    expect(a.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse");
    expect(a.url).not.toContain("SECRET"); expect(a.init.headers["x-goog-api-key"]).toBe("SECRET");
    expect(a.bodyObj).toMatchObject({ systemInstruction: { parts: [{ text: "S" }] }, generationConfig: { maxOutputTokens: 7 } });
  });
  it("local servers need no key and honour a custom base URL", () => {
    const a = buildRequest({ provider: "ollama", model: "llama3.2", user: "hi", baseUrl: "http://127.0.0.1:11434/v1/" });
    expect(a.url).toBe("http://127.0.0.1:11434/v1/chat/completions"); expect(a.init.headers.Authorization).toBeUndefined();
  });
  it("validates before sending", () => {
    expect(() => buildRequest({ provider: "openai", model: "", user: "x" })).toThrow(/model/i);
    expect(() => buildRequest({ provider: "openai", model: "m", user: "  " })).toThrow(/empty/i);
    expect(() => buildRequest({ provider: "custom", model: "m", user: "x" })).toThrow(/address/i);
  });
});

describe("streaming", () => {
  it("parses SSE across arbitrary chunk boundaries, CRLF, comments and multi-line data", async () => {
    const raw = ": ping\r\n\r\nevent: a\r\ndata: {\"x\":1}\r\n\r\ndata: l1\ndata: l2\n\n";
    const parts = [raw.slice(0, 7), raw.slice(7, 20), raw.slice(20)];
    const got: any[] = [];
    for await (const e of parseSSE(sseResponse(parts).body!)) got.push(e);
    expect(got).toEqual([{ event: "a", data: '{"x":1}' }, { event: "message", data: "l1\nl2" }]);
  });
  it("splits a multi-byte character across chunks without corrupting it", async () => {
    const bytes = enc.encode('data: {"t":"বাংলা"}\n\n');
    const rs = new nodeStreams.ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.slice(0, 14)); c.enqueue(bytes.slice(14)); c.close(); } });
    const got: any[] = []; for await (const e of parseSSE(rs as any)) got.push(JSON.parse(e.data).t);
    expect(got).toEqual(["বাংলা"]);
  });
  it("OpenAI stream -> text, usage, finish reason, first-token time", async () => {
    const f = async () => sseResponse([
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n', 'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":2}}\n\n', "data: [DONE]\n\n"]);
    const seen: string[] = [];
    const r = await runPrompt({ provider: "openai", apiKey: "k", model: "m", user: "u" }, (c) => seen.push(c), f as any);
    expect(r).toMatchObject({ text: "Hello", inputTokens: 11, outputTokens: 2, finishReason: "stop" }); expect(seen).toEqual(["Hel", "lo"]);
    expect(r.firstTokenMs).not.toBeNull();
  });
  it("Anthropic stream", async () => {
    const f = async () => sseResponse([
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":9}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" there"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}\n\n']);
    const r = await runPrompt({ provider: "anthropic", apiKey: "k", model: "m", user: "u" }, () => {}, f as any);
    expect(r).toMatchObject({ text: "Hi there", inputTokens: 9, outputTokens: 4, finishReason: "end_turn" });
  });
  it("Gemini stream (ignores thought parts)", async () => {
    const f = async () => sseResponse([
      'data: {"candidates":[{"content":{"parts":[{"text":"hmm","thought":true},{"text":"Yo"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"!"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}\n\n']);
    const r = await runPrompt({ provider: "gemini", apiKey: "k", model: "m", user: "u" }, () => {}, f as any);
    expect(r).toMatchObject({ text: "Yo!", inputTokens: 3, outputTokens: 2, finishReason: "STOP" });
  });
  it("surfaces an in-stream error event", async () => {
    const f = async () => sseResponse(['event: error\ndata: {"type":"error","error":{"message":"Overloaded"}}\n\n']);
    await expect(runPrompt({ provider: "anthropic", apiKey: "k", model: "m", user: "u" }, () => {}, f as any)).rejects.toThrow(/Overloaded/);
  });
});

describe("errors people can act on", () => {
  it("maps HTTP statuses", () => {
    expect(friendlyError(401, '{"error":{"message":"bad key"}}', "openai")).toMatchObject({ kind: "auth" });
    expect(friendlyError(404, "", "openai").kind).toBe("model");
    expect(friendlyError(429, "", "openai").kind).toBe("rate");
    expect(friendlyError(503, "", "openai").kind).toBe("server");
    expect(friendlyError(401, '{"error":{"message":"bad key"}}', "openai").message).toContain("bad key");
  });
  it("blocks the call without a key; explains network failures (local vs cloud)", async () => {
    await expect(runPrompt({ provider: "openai", model: "m", user: "u" }, () => {})).rejects.toThrow(/API key/);
    const fail = async () => { throw new TypeError("Failed to fetch"); };
    await expect(runPrompt({ provider: "ollama", model: "m", user: "u" }, () => {}, fail as any)).rejects.toThrow(/OLLAMA_ORIGINS/);
    await expect(runPrompt({ provider: "openai", apiKey: "k", model: "m", user: "u" }, () => {}, fail as any)).rejects.toThrow(/CORS/);
  });
  it("reports a user abort distinctly", async () => {
    const fail = async () => { const e: any = new Error("x"); e.name = "AbortError"; throw e; };
    await expect(runPrompt({ provider: "openai", apiKey: "k", model: "m", user: "u" }, () => {}, fail as any)).rejects.toMatchObject({ kind: "aborted" });
  });
});

describe("model listing", () => {
  it("handles OpenAI, Gemini and Ollama-style payloads", async () => {
    const mk = (body: any) => async () => ({ ok: true, status: 200, json: async () => body, text: async () => "" }) as any;
    expect(await listModels("openai", undefined, "k", mk({ data: [{ id: "b" }, { id: "a" }, { id: "a" }] }))).toEqual(["a", "b"]);
    expect(await listModels("gemini", undefined, "k", mk({ models: [{ name: "models/g1", supportedGenerationMethods: ["generateContent"] }, { name: "models/emb", supportedGenerationMethods: ["embedContent"] }] }))).toEqual(["g1"]);
    expect(await listModels("ollama", undefined, undefined, mk({ models: [{ name: "llama3.2" }] }))).toEqual(["llama3.2"]);
  });
});

describe("API key handling", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  it("keeps keys in sessionStorage unless the user opts in to remembering", () => {
    setKey("openai", "sk-abc", false);
    expect(sessionStorage.getItem("pf_web_keys")).toContain("sk-abc"); expect(localStorage.getItem("pf_web_keys") ?? "").not.toContain("sk-abc");   // never persisted by default
    expect(getKey("openai")).toBe("sk-abc");
    migrateKeys(true);
    expect(localStorage.getItem("pf_web_keys")).toContain("sk-abc"); expect(sessionStorage.getItem("pf_web_keys") ?? "").not.toContain("sk-abc");
    setKey("openai", "", true); expect(getKey("openai")).toBe("");
  });
  it("masks keys for display", () => { expect(maskKey("sk-abcdefghijklmnop")).toMatch(/^sk-a•+op$/); expect(maskKey("abc")).toBe("•••"); });
  it("ProviderError carries a kind", () => { expect(new ProviderError("x", 1, "auth").kind).toBe("auth"); });
});
