// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */
import { CONFIG } from "./CONFIG";
import { TemplateEngine } from "./TemplateEngine";

/* ============================================================================
   MESSAGE COMPOSER — turns a flat prompt body into a structured messages[]
   array and formats it as ready-to-paste snippets (Python SDK stubs, cURL,
   raw JSON, LangChain). Purely local string templating — NOTHING here ever
   makes a network request or calls any AI model; it only formats text the
   user already wrote into the shape a given SDK/API expects, entirely
   offline, the same way the existing FormatConverter reshapes text.
   ============================================================================ */
export const MessageComposer = {
  // Split a flat body into { system, user } by pulling a detected leading
  // Role:/Context: run into the system slot and treating the rest (usually
  // Task:/Instructions:/Constraints:/Output: onward) as the user turn. Falls
  // back to putting everything in `user` with an empty system when no
  // role/context header is detected — always produces a usable split.
  splitSystemUser(body){
    const raw = body || "";
    const headerNames = ["Role", "Context"].join("|");
    const otherHeaders = CONFIG.BLOCK_TYPES.map(b => b.label).filter(l => l !== "Role" && l !== "Context").join("|");
    const splitRe = new RegExp(`^(${otherHeaders})\\s*:`, "m");
    const m = raw.match(splitRe);
    if (!m || m.index === 0){
      // No later header found, or the very first line is already a
      // non-role/context header — nothing sensible to peel off as "system".
      const roleOnly = raw.match(new RegExp(`^(?:${headerNames})\\s*:[\\s\\S]*?(?=\\n\\s*\\n|$)`, "i"));
      if (roleOnly && roleOnly.index === 0){
        const rest = raw.slice(roleOnly[0].length).trim();
        return { system: roleOnly[0].trim(), user: rest || raw.trim() };
      }
      return { system: "", user: raw.trim() };
    }
    return { system: raw.slice(0, m.index).trim(), user: raw.slice(m.index).trim() };
  },

  toMessagesArray(body){
    const { system, user } = MessageComposer.splitSystemUser(body);
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: user || body || "" });
    return messages;
  },

  // ---- snippet renderers, one per target shape ----
  toOpenAIJSON(body, modelId){
    const messages = MessageComposer.toMessagesArray(body);
    return JSON.stringify({ model: modelId || "gpt-4o", messages }, null, 2);
  },

  toAnthropicJSON(body, modelId){
    const { system, user } = MessageComposer.splitSystemUser(body);
    const payload = { model: modelId || "claude-sonnet-4-6", max_tokens: 1024, messages: [{ role: "user", content: user || body || "" }] };
    if (system) payload.system = system;
    return JSON.stringify(payload, null, 2);
  },

  toPythonAnthropic(body, modelId){
    const { system, user } = MessageComposer.splitSystemUser(body);
    const sysLine = system ? `    system=${JSON.stringify(system)},\n` : "";
    return `import anthropic\n\nclient = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env\n\nresponse = client.messages.create(\n    model=${JSON.stringify(modelId || "claude-sonnet-4-6")},\n    max_tokens=1024,\n${sysLine}    messages=[\n        {"role": "user", "content": ${JSON.stringify(user || body || "")}}\n    ]\n)\nprint(response.content[0].text)`;
  },

  toPythonOpenAI(body, modelId){
    const messages = MessageComposer.toMessagesArray(body);
    const msgLines = messages.map(m => `        {"role": ${JSON.stringify(m.role)}, "content": ${JSON.stringify(m.content)}}`).join(",\n");
    return `from openai import OpenAI\n\nclient = OpenAI()  # reads OPENAI_API_KEY from env\n\nresponse = client.chat.completions.create(\n    model=${JSON.stringify(modelId || "gpt-4o")},\n    messages=[\n${msgLines}\n    ]\n)\nprint(response.choices[0].message.content)`;
  },

  toCurl(body, modelId, vendor){
    if (vendor === "Anthropic"){
      const json = MessageComposer.toAnthropicJSON(body, modelId).replace(/'/g, "'\\''");
      return `curl https://api.anthropic.com/v1/messages \\\n  -H "x-api-key: $ANTHROPIC_API_KEY" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -H "content-type: application/json" \\\n  -d '${json}'`;
    }
    const json = MessageComposer.toOpenAIJSON(body, modelId).replace(/'/g, "'\\''");
    return `curl https://api.openai.com/v1/chat/completions \\\n  -H "Authorization: Bearer $OPENAI_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${json}'`;
  },

  toLangChain(body){
    const vars = TemplateEngine.extractVariables(body);
    const inputVarsLine = vars.length ? `input_variables=${JSON.stringify(vars)}` : "input_variables=[]";
    return `from langchain.prompts import PromptTemplate\n\ntemplate = ${JSON.stringify(body || "")}\n\nprompt = PromptTemplate(\n    ${inputVarsLine},\n    template=template\n)`;
  },

  toGeminiPython(body, modelId){
    const { system, user } = MessageComposer.splitSystemUser(body);
    const sysArg = system ? `, system_instruction=${JSON.stringify(system)}` : "";
    return `import google.generativeai as genai\n\ngenai.configure(api_key="YOUR_API_KEY")\nmodel = genai.GenerativeModel(${JSON.stringify(modelId || "gemini-1.5-pro")}${sysArg})\n\nresponse = model.generate_content(${JSON.stringify(user || body || "")})\nprint(response.text)`;
  },

  // Central dispatcher used by the UI's "Copy as..." menu.
  render(body, format, model){
    const modelId = model ? model.id : "generic";
    const vendor = model ? model.vendor : "";
    switch(format){
      case "openai_json": return MessageComposer.toOpenAIJSON(body, modelId);
      case "anthropic_json": return MessageComposer.toAnthropicJSON(body, modelId);
      case "python_anthropic": return MessageComposer.toPythonAnthropic(body, modelId);
      case "python_openai": return MessageComposer.toPythonOpenAI(body, modelId);
      case "python_gemini": return MessageComposer.toGeminiPython(body, modelId);
      case "curl": return MessageComposer.toCurl(body, modelId, vendor);
      case "langchain": return MessageComposer.toLangChain(body);
      default: return JSON.stringify(MessageComposer.toMessagesArray(body), null, 2);
    }
  }
};
