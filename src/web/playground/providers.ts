/**
 * Playground engine — runs a prompt against a model using the user's OWN API key, straight from the
 * browser (there is no backend). Nothing is sent anywhere until the user presses Run, and only to the
 * provider they chose. Supports OpenAI-compatible APIs (OpenAI, OpenRouter, Groq, Together, Mistral,
 * LM Studio, Ollama, …), Anthropic and Google Gemini, with streaming.
 */
export type ApiKind = "openai" | "anthropic" | "gemini";
export type ProviderId = "openai" | "anthropic" | "gemini" | "openrouter" | "groq" | "mistral" | "together" | "ollama" | "lmstudio" | "custom";

export interface ProviderDef {
  id: ProviderId; label: string; kind: ApiKind; baseUrl: string;
  needsKey: boolean; local?: boolean; editableUrl?: boolean;
  keyHint: string; modelHints: string[]; note?: string;
}

// Model names change constantly, so these are only *suggestions* — "Fetch models" asks the provider itself.
export const PROVIDERS: ProviderDef[] = [
  { id: "openai", label: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", needsKey: true, keyHint: "sk-…", modelHints: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"] },
  { id: "anthropic", label: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com/v1", needsKey: true, keyHint: "sk-ant-…", modelHints: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"] },
  { id: "gemini", label: "Google Gemini", kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", needsKey: true, keyHint: "AIza…", modelHints: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  { id: "openrouter", label: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", needsKey: true, keyHint: "sk-or-…", modelHints: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4.5", "google/gemini-2.5-flash"] },
  { id: "groq", label: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", needsKey: true, keyHint: "gsk_…", modelHints: ["llama-3.3-70b-versatile"] },
  { id: "mistral", label: "Mistral", kind: "openai", baseUrl: "https://api.mistral.ai/v1", needsKey: true, keyHint: "…", modelHints: ["mistral-large-latest", "mistral-small-latest"] },
  { id: "together", label: "Together AI", kind: "openai", baseUrl: "https://api.together.xyz/v1", needsKey: true, keyHint: "…", modelHints: [] },
  { id: "ollama", label: "Ollama (local)", kind: "openai", baseUrl: "http://localhost:11434/v1", needsKey: false, local: true, editableUrl: true, keyHint: "(none)", modelHints: ["llama3.2", "qwen2.5", "mistral"], note: "Start Ollama with OLLAMA_ORIGINS set to this site's address (or * for local use) so the browser may call it." },
  { id: "lmstudio", label: "LM Studio (local)", kind: "openai", baseUrl: "http://localhost:1234/v1", needsKey: false, local: true, editableUrl: true, keyHint: "(none)", modelHints: [], note: "Enable “Serve on local network / CORS” in LM Studio's server settings." },
  { id: "custom", label: "Custom (OpenAI-compatible)", kind: "openai", baseUrl: "", needsKey: false, editableUrl: true, keyHint: "optional", modelHints: [], note: "Any server that speaks /chat/completions. On a Vercel deployment, the host must be allowed by the Content-Security-Policy in vercel.json." },
];
export const getProvider = (id: ProviderId): ProviderDef => PROVIDERS.find(p => p.id === id) ?? PROVIDERS[0];

export interface RunRequest {
  provider: ProviderId; baseUrl?: string; apiKey?: string; model: string;
  system?: string; user: string; temperature?: number; maxTokens?: number; signal?: AbortSignal;
}
export interface RunResult {
  text: string; ms: number; firstTokenMs: number | null;
  inputTokens?: number; outputTokens?: number; finishReason?: string;
}
export class ProviderError extends Error {
  constructor(message: string, public status?: number, public kind: "auth" | "model" | "rate" | "network" | "cors" | "server" | "request" | "aborted" = "request") { super(message); }
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");
const baseOf = (r: Pick<RunRequest, "provider" | "baseUrl">) => trimSlash((r.baseUrl && r.baseUrl.trim()) || getProvider(r.provider).baseUrl);

/** Pure: the HTTP request for a run. Exported so it can be unit-tested and shown to the user ("View request"). */
export function buildRequest(r: RunRequest): { url: string; init: RequestInit & { headers: Record<string, string> }; bodyObj: Record<string, unknown> } {
  const def = getProvider(r.provider);
  const base = baseOf(r);
  if (!base) throw new ProviderError("Enter the server address for this provider.", undefined, "request");
  if (!r.model.trim()) throw new ProviderError("Choose or type a model name.", undefined, "request");
  if (!r.user.trim()) throw new ProviderError("The prompt is empty.", undefined, "request");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url: string; let body: Record<string, unknown>;

  if (def.kind === "anthropic") {
    url = `${base}/messages`;
    headers["x-api-key"] = r.apiKey ?? "";
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";     // required for browser-origin calls
    body = { model: r.model, max_tokens: r.maxTokens ?? 4096, stream: true, messages: [{ role: "user", content: r.user }] };
    if (r.system?.trim()) body.system = r.system;
    if (r.temperature !== undefined) body.temperature = r.temperature;
  } else if (def.kind === "gemini") {
    url = `${base}/models/${encodeURIComponent(r.model)}:streamGenerateContent?alt=sse`;
    headers["x-goog-api-key"] = r.apiKey ?? "";                         // header, not ?key=, so keys stay out of URLs/logs
    const generationConfig: Record<string, unknown> = {};
    if (r.temperature !== undefined) generationConfig.temperature = r.temperature;
    if (r.maxTokens !== undefined) generationConfig.maxOutputTokens = r.maxTokens;
    body = { contents: [{ role: "user", parts: [{ text: r.user }] }], ...(Object.keys(generationConfig).length ? { generationConfig } : {}) };
    if (r.system?.trim()) body.systemInstruction = { parts: [{ text: r.system }] };
  } else {
    url = `${base}/chat/completions`;
    if (r.apiKey) headers.Authorization = `Bearer ${r.apiKey}`;
    const messages: Array<{ role: string; content: string }> = [];
    if (r.system?.trim()) messages.push({ role: "system", content: r.system });
    messages.push({ role: "user", content: r.user });
    body = { model: r.model, messages, stream: true, stream_options: { include_usage: true } };
    if (r.temperature !== undefined) body.temperature = r.temperature;
    // OpenAI's newer models reject max_tokens; every other compatible server expects it.
    if (r.maxTokens !== undefined) body[r.provider === "openai" ? "max_completion_tokens" : "max_tokens"] = r.maxTokens;
  }
  return { url, init: { method: "POST", headers, body: JSON.stringify(body), signal: r.signal }, bodyObj: body };
}

/** Parses a Server-Sent-Events byte stream into { event, data } records (handles chunk boundaries and CRLF). */
export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const flush = function* (block: string) {
    let event = "message"; const data: string[] = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const i = line.indexOf(":");
      const field = i < 0 ? line : line.slice(0, i);
      const val = i < 0 ? "" : line.slice(i + 1).replace(/^ /, "");
      if (field === "event") event = val; else if (field === "data") data.push(val);
    }
    if (data.length) yield { event, data: data.join("\n") };
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) { const block = buf.slice(0, idx); buf = buf.slice(idx + 2); yield* flush(block); }
    }
    buf += dec.decode();
    if (buf.trim()) yield* flush(buf);
  } finally { try { reader.releaseLock(); } catch { /* already released */ } }
}

interface Delta { text?: string; inputTokens?: number; outputTokens?: number; finish?: string; error?: string }
/** Pure: one decoded SSE JSON payload -> the bits we care about, per API dialect. */
export function extractDelta(kind: ApiKind, ev: string, o: any): Delta {
  const d: Delta = {};
  if (kind === "anthropic") {
    if (ev === "error" || o?.type === "error") d.error = o?.error?.message || "The model returned an error.";
    if (o?.type === "message_start") d.inputTokens = o.message?.usage?.input_tokens;
    if (o?.type === "content_block_delta" && o.delta?.type === "text_delta") d.text = o.delta.text;
    if (o?.type === "message_delta") { d.finish = o.delta?.stop_reason ?? undefined; d.outputTokens = o.usage?.output_tokens; }
  } else if (kind === "gemini") {
    if (o?.error) d.error = o.error.message || "The model returned an error.";
    const parts = o?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) d.text = parts.filter((p: any) => typeof p.text === "string" && !p.thought).map((p: any) => p.text).join("") || undefined;
    if (o?.candidates?.[0]?.finishReason) d.finish = o.candidates[0].finishReason;
    if (o?.usageMetadata) { d.inputTokens = o.usageMetadata.promptTokenCount; d.outputTokens = o.usageMetadata.candidatesTokenCount; }
  } else {
    if (o?.error) d.error = o.error.message || (typeof o.error === "string" ? o.error : "The model returned an error.");
    const c = o?.choices?.[0];
    if (c?.delta?.content) d.text = c.delta.content;
    if (c?.finish_reason) d.finish = c.finish_reason;
    if (o?.usage) { d.inputTokens = o.usage.prompt_tokens; d.outputTokens = o.usage.completion_tokens; }
  }
  return d;
}

/** Turns an HTTP failure into something a person can act on. */
export function friendlyError(status: number, bodyText: string, provider: ProviderId): ProviderError {
  let detail = "";
  try { const j = JSON.parse(bodyText); detail = j?.error?.message || j?.message || (typeof j?.error === "string" ? j.error : "") || ""; } catch { detail = bodyText.slice(0, 200); }
  const tail = detail ? ` — ${detail}` : "";
  if (status === 401 || status === 403) return new ProviderError(`The provider rejected the API key (${status})${tail}`, status, "auth");
  if (status === 404) return new ProviderError(`Model or endpoint not found (404)${tail}`, status, "model");
  if (status === 429) return new ProviderError(`Rate limit or quota reached (429)${tail}`, status, "rate");
  if (status >= 500) return new ProviderError(`${getProvider(provider).label} had a server error (${status})${tail}`, status, "server");
  return new ProviderError(`Request failed (${status})${tail}`, status, "request");
}
function networkError(e: unknown, provider: ProviderId): ProviderError {
  const def = getProvider(provider);
  if ((e as Error)?.name === "AbortError") return new ProviderError("Stopped.", undefined, "aborted");
  const hint = def.local
    ? `Could not reach ${def.label}. Is it running? ${def.note ?? ""}`
    : `Could not reach ${def.label}. You may be offline, or the browser blocked the request (CORS / Content-Security-Policy).`;
  return new ProviderError(hint.trim(), undefined, def.local ? "cors" : "network");
}

export async function runPrompt(r: RunRequest, onToken: (chunk: string, soFar: string) => void, fetchImpl: typeof fetch = fetch): Promise<RunResult> {
  const def = getProvider(r.provider);
  if (def.needsKey && !r.apiKey?.trim()) throw new ProviderError(`Add your ${def.label} API key first.`, undefined, "auth");
  const { url, init } = buildRequest(r);
  const t0 = performance.now();
  let res: Response;
  try { res = await fetchImpl(url, init); } catch (e) { throw networkError(e, r.provider); }
  if (!res.ok) throw friendlyError(res.status, await res.text().catch(() => ""), r.provider);
  if (!res.body) throw new ProviderError("The server returned no data.", res.status, "server");

  let text = ""; let first: number | null = null;
  const out: RunResult = { text: "", ms: 0, firstTokenMs: null };
  try {
    for await (const { event, data } of parseSSE(res.body)) {
      if (data === "[DONE]") break;
      let o: unknown;
      try { o = JSON.parse(data); } catch { continue; }
      const d = extractDelta(def.kind, event, o);
      if (d.error) throw new ProviderError(d.error, undefined, "server");
      if (d.text) { if (first === null) first = performance.now() - t0; text += d.text; onToken(d.text, text); }
      if (d.inputTokens !== undefined) out.inputTokens = d.inputTokens;
      if (d.outputTokens !== undefined) out.outputTokens = d.outputTokens;
      if (d.finish) out.finishReason = d.finish;
    }
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw networkError(e, r.provider);
  }
  out.text = text; out.ms = Math.round(performance.now() - t0); out.firstTokenMs = first === null ? null : Math.round(first);
  return out;
}

/** Asks the provider which models the key can use. */
export async function listModels(provider: ProviderId, baseUrl: string | undefined, apiKey: string | undefined, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<string[]> {
  const def = getProvider(provider);
  const base = baseOf({ provider, baseUrl });
  if (!base) throw new ProviderError("Enter the server address first.", undefined, "request");
  const headers: Record<string, string> = {};
  if (def.kind === "anthropic") { headers["x-api-key"] = apiKey ?? ""; headers["anthropic-version"] = "2023-06-01"; headers["anthropic-dangerous-direct-browser-access"] = "true"; }
  else if (def.kind === "gemini") headers["x-goog-api-key"] = apiKey ?? "";
  else if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  let res: Response;
  try { res = await fetchImpl(`${base}/models${def.kind === "anthropic" ? "?limit=100" : def.kind === "gemini" ? "?pageSize=200" : ""}`, { headers, signal }); }
  catch (e) { throw networkError(e, provider); }
  if (!res.ok) throw friendlyError(res.status, await res.text().catch(() => ""), provider);
  const j: any = await res.json().catch(() => ({}));
  let ids: string[] = [];
  if (def.kind === "gemini") ids = (j.models ?? []).filter((m: any) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent")).map((m: any) => String(m.name).replace(/^models\//, ""));
  else ids = (j.data ?? j.models ?? []).map((m: any) => String(m.id ?? m.name ?? "")).filter(Boolean);
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}

/* ---------------- credentials & preferences (local to this browser) ---------------- */
const KEYS_LS = "pf_web_keys";            // only used when the user ticks "Remember on this device"
const PREFS_LS = "pf_web_playground";
export interface ProviderPrefs { baseUrl?: string; model?: string; }
export interface PlaygroundPrefs { remember: boolean; providers: Partial<Record<ProviderId, ProviderPrefs>>; lanes: Array<{ provider: ProviderId; model: string }>; temperature?: number; maxTokens?: number }

export function loadPrefs(): PlaygroundPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_LS) || "{}");
    return { remember: p.remember === true, providers: p.providers && typeof p.providers === "object" ? p.providers : {}, lanes: Array.isArray(p.lanes) && p.lanes.length ? p.lanes.slice(0, 3) : [{ provider: "openai", model: "" }], temperature: typeof p.temperature === "number" ? p.temperature : undefined, maxTokens: typeof p.maxTokens === "number" ? p.maxTokens : undefined };
  } catch { return { remember: false, providers: {}, lanes: [{ provider: "openai", model: "" }] }; }
}
export function savePrefs(p: PlaygroundPrefs): void { try { localStorage.setItem(PREFS_LS, JSON.stringify(p)); } catch { /* full */ } }

const store = (remember: boolean): Storage => (remember ? localStorage : sessionStorage);
export function getKey(provider: ProviderId): string {
  try { return JSON.parse(sessionStorage.getItem(KEYS_LS) || "{}")[provider] || JSON.parse(localStorage.getItem(KEYS_LS) || "{}")[provider] || ""; } catch { return ""; }
}
export function setKey(provider: ProviderId, key: string, remember: boolean): void {
  for (const s of [sessionStorage, localStorage]) {
    try { const o = JSON.parse(s.getItem(KEYS_LS) || "{}"); delete o[provider]; s.setItem(KEYS_LS, JSON.stringify(o)); } catch { /* ignore */ }
  }
  if (!key) return;
  try { const s = store(remember); const o = JSON.parse(s.getItem(KEYS_LS) || "{}"); o[provider] = key; s.setItem(KEYS_LS, JSON.stringify(o)); } catch { /* ignore */ }
}
export function forgetAllKeys(): void { try { sessionStorage.removeItem(KEYS_LS); localStorage.removeItem(KEYS_LS); } catch { /* ignore */ } }
/** Moves keys between session-only and persistent storage when the "remember" toggle changes. */
export function migrateKeys(remember: boolean): void {
  const from = store(!remember), to = store(remember);
  try { const src = JSON.parse(from.getItem(KEYS_LS) || "{}"); const dst = JSON.parse(to.getItem(KEYS_LS) || "{}"); to.setItem(KEYS_LS, JSON.stringify({ ...dst, ...src })); from.removeItem(KEYS_LS); } catch { /* ignore */ }
}

/** Never show a key in the UI or in "view request": keep first 4 and last 2 characters. */
export const maskKey = (k: string): string => (k.length <= 8 ? "•".repeat(k.length) : `${k.slice(0, 4)}${"•".repeat(Math.min(12, k.length - 6))}${k.slice(-2)}`);
