/**
 * Content-Security-Policy for production (single source of truth; vercel.json is checked against it by tests/deploy.test.ts).
 *  - script-src 'self'          : no inline or third-party script, so injected markup can't execute
 *  - connect-src allow-list     : the app may only talk to itself, the AI providers the Playground supports, and localhost
 *                                 (Ollama / LM Studio). Add your own host here AND in vercel.json to use another endpoint.
 */
export const CONNECT_HOSTS = [
  "https://api.openai.com", "https://api.anthropic.com", "https://generativelanguage.googleapis.com",
  "https://openrouter.ai", "https://api.groq.com", "https://api.mistral.ai", "https://api.together.xyz",
  "http://localhost:*", "http://127.0.0.1:*",
];
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${CONNECT_HOSTS.join(" ")}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");
