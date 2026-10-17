// @ts-nocheck
/* Ported verbatim from PromptForge.html (see tools/extract-legacy.mjs).
   Logic is unchanged; incremental typing is tracked in docs/ARCHITECTURE.md. */

/* ============================================================================
   CONFIG — static reference data
   ============================================================================ */
export const CONFIG = {
  DB_NAME: "promptForgeDB",
  DB_VERSION: 6,
  // "groups" backs the long-press "Add to Group" feature in Library,
  // Templates, and Pattern Library — one shared store rather than a
  // groupId field bolted onto three different entity schemas, since a
  // group is really its own thing (name, color) with members that can span
  // kinds. See GroupManager below.
  // "builderStructures" backs the Visual Builder's saved structure presets
  // (e.g. "Basic: Role+Context+Action+Style", "Image: Character+
  // Background+Style") — a named, ordered list of block definitions a
  // person can apply to the canvas in one click instead of dragging each
  // block in by hand every time.
  STORES: ["prompts", "templates", "snippets", "history", "versions", "customPatterns", "chains", "savedSearches", "groups", "builderStructures"],
  LS_PREFIX: "pf_",

  // Palette cycled through for new groups (Library/Templates/Patterns
  // long-press grouping) so each group gets a visually distinct chip
  // without anyone having to pick a color for every group they make.
  GROUP_COLORS: ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6"],

  // Which localStorage-backed settings a full JSON backup carries. See the
  // comment on StorageManager.exportAll() for why this is a short,
  // deliberate list rather than "everything" — per-device UI prefs
  // shouldn't travel with a backup restored on a different browser.
  BACKUP_SETTING_KEYS: ["customModels", "selectedModel", "scoringProfile", "challengeProgress"],

  EDITOR_FONTS: [
    { id: "jetbrains", label: "JetBrains Mono", stack: '"JetBrains Mono","SF Mono","Cascadia Code",Consolas,monospace' },
    { id: "fira", label: "Fira Code", stack: '"Fira Code","JetBrains Mono","SF Mono",monospace' },
    { id: "system", label: "System Monospace", stack: 'ui-monospace,"SF Mono",Consolas,monospace' },
    { id: "ibm", label: "IBM Plex Mono", stack: '"IBM Plex Mono","JetBrains Mono",monospace' }
  ],
  // The language/syntax the PROMPT ITSELF is authored in — drives editor
  // highlighting + validation. Distinct from OUTPUT_FORMAT_HINTS below, which
  // is a default hint for what the AI's RESPONSE should look like.
  PROMPT_FORMATS: [
    { id: "text", label: "Text", short: "TXT" },
    { id: "json", label: "JSON", short: "JSON" },
    { id: "xml", label: "XML", short: "XML" },
    { id: "markdown", label: "Markdown", short: "MD" }
  ],
  OUTPUT_FORMAT_HINTS: [
    { id: "none", label: "No default" },
    { id: "prose", label: "Prose / paragraphs" },
    { id: "bullets", label: "Bullet list" },
    { id: "json", label: "JSON" },
    { id: "markdown", label: "Markdown" },
    { id: "table", label: "Table" },
    { id: "code", label: "Code only" }
  ],
  AUTOSAVE_INTERVALS: [
    { id: "500", label: "Fast (0.5s)" },
    { id: "900", label: "Normal (0.9s)" },
    { id: "2000", label: "Relaxed (2s)" },
    { id: "5000", label: "Slow (5s)" }
  ],
  VERSION_RETENTION: [
    { id: "10", label: "Last 10 versions" },
    { id: "25", label: "Last 25 versions" },
    { id: "50", label: "Last 50 versions" },
    { id: "0", label: "Unlimited" }
  ],
  SHORTCUTS: [
    { keys: "Ctrl K", desc: "Open command palette" },
    { keys: "Ctrl Space", desc: "Trigger suggestions" },
    { keys: "Tab / Enter", desc: "Accept suggestion" },
    { keys: "Ctrl F", desc: "Find & replace in editor" },
    { keys: "Ctrl S", desc: "Save current prompt" },
    { keys: "Ctrl +/-", desc: "Zoom editor text" },
    { keys: "Ctrl Z", desc: "Undo (in editor text)" },
    { keys: "Ctrl Shift Z", desc: "Redo (in editor text)" },
    { keys: "Alt N", desc: "Quick Capture" },
    { keys: "?", desc: "Show this shortcut list" },
    { keys: "Esc", desc: "Close popup / modal / palette" },
    { keys: "↑ / ↓", desc: "Navigate suggestions or palette" }
  ],

  CATEGORIES: [
    { id: "inbox", label: "Inbox", cls: "cat-inbox", color: "var(--text-tertiary)" },
    { id: "coding", label: "Coding", cls: "cat-coding", color: "var(--accent-green)" },
    { id: "python", label: "Python", cls: "cat-python", color: "#4FC3D9" },
    { id: "web", label: "Web Development", cls: "cat-web", color: "var(--accent-blue)" },
    { id: "ai", label: "AI", cls: "cat-ai", color: "var(--accent-violet)" },
    { id: "research", label: "Research", cls: "cat-research", color: "#D97BD0" },
    { id: "education", label: "Education", cls: "cat-education", color: "#7FB3E0" },
    { id: "content", label: "Content Creation", cls: "cat-content", color: "var(--accent-amber)" },
    { id: "image", label: "Image Generation", cls: "cat-image", color: "#E58A5A" },
    { id: "video", label: "Video Generation", cls: "cat-video", color: "var(--accent-red)" },
    { id: "productivity", label: "Productivity", cls: "cat-productivity", color: "#C9A15A" },
    { id: "business", label: "Business", cls: "cat-business", color: "#9B7FE0" },
    { id: "custom", label: "Custom", cls: "cat-custom", color: "var(--text-tertiary)" }
  ],

  // Prompt lifecycle status — distinct from archived (archived = "not in
  // active use"), this tracks WHERE a prompt is in going from idea to
  // production use, so "which of these am I actually shipping right now"
  // has an answer instead of a title-prefix hack.
  PROMPT_STATUSES: [
    { id: "draft", label: "Draft", color: "var(--text-tertiary)" },
    { id: "review", label: "Review", color: "var(--accent-amber)" },
    { id: "production", label: "Production", color: "var(--accent-green)" }
  ],

  // Block types used by Builder, Template blocks, and the Prompt-DNA strand.
  // Order here defines default strand order and default builder sequence.
  BLOCK_TYPES: [
    { id: "role", label: "Role", color: "var(--dna-role)", placeholder: "You are an expert ..." },
    { id: "context", label: "Context", color: "var(--dna-context)", placeholder: "Background the model needs to know..." },
    { id: "objective", label: "Objective", color: "var(--dna-objective)", placeholder: "The overall goal of this task..." },
    { id: "task", label: "Task", color: "var(--dna-task)", placeholder: "What exactly should be done..." },
    { id: "instructions", label: "Instructions", color: "var(--dna-instructions)", placeholder: "Step-by-step guidance..." },
    { id: "constraints", label: "Constraints", color: "var(--dna-constraints)", placeholder: "Limits, rules, things to avoid..." },
    { id: "examples", label: "Examples", color: "var(--dna-examples)", placeholder: "Sample input/output pairs..." },
    { id: "input", label: "Input", color: "var(--dna-input)", placeholder: "The data or content to work from..." },
    { id: "output", label: "Output Format", color: "var(--dna-output)", placeholder: "Exact shape of the expected reply..." },
    { id: "evaluation", label: "Evaluation Criteria", color: "var(--dna-evaluation)", placeholder: "How success will be judged..." },
    { id: "edgecases", label: "Edge Cases", color: "var(--dna-edgecases)", placeholder: "Unusual situations to handle..." }
  ],

  DEFAULT_BUILDER_ORDER: ["role", "context", "objective", "task", "constraints", "output"],

  // Built-in Visual Builder structure presets — shown alongside any the
  // person saves themselves. "blocks" entries reference a built-in
  // BLOCK_TYPES id directly, or carry their own label/color for a
  // structure-specific section (e.g. "Character") that has no matching
  // built-in type — the same shape a custom block already uses.
  BUILDER_STRUCTURES: [
    { id: "struct_basic", name: "Basic (Role + Context + Action + Style)", builtin: true, blocks: [
      { type: "role" }, { type: "context" }, { type: "task", label: "Action" }, { type: "custom_style", label: "Style", color: "var(--accent-violet)" }
    ]},
    { id: "struct_image", name: "Image (Character + Background + Style)", builtin: true, blocks: [
      { type: "custom_character", label: "Character", color: "var(--accent-blue)" },
      { type: "custom_background", label: "Background", color: "var(--accent-green)" },
      { type: "custom_style", label: "Style", color: "var(--accent-violet)" }
    ]},
    { id: "struct_rtf", name: "RTF (Role + Task + Format)", builtin: true, blocks: [
      { type: "role" }, { type: "task" }, { type: "output", label: "Format" }
    ]},
    { id: "struct_costar", name: "CO-STAR (Context + Objective + Style + Tone + Audience + Response)", builtin: true, blocks: [
      { type: "context" }, { type: "objective" }, { type: "custom_style", label: "Style", color: "var(--accent-violet)" },
      { type: "custom_tone", label: "Tone", color: "var(--accent-amber)" }, { type: "custom_audience", label: "Audience", color: "var(--accent-blue)" },
      { type: "output", label: "Response" }
    ]},
    { id: "struct_full", name: "Full spec (Role + Context + Objective + Task + Constraints + Examples + Output + Edge cases)", builtin: true, blocks: [
      { type: "role" }, { type: "context" }, { type: "objective" }, { type: "task" }, { type: "constraints" }, { type: "examples" }, { type: "output" }, { type: "edgecases" }
    ]}
  ],

  DEFAULT_SNIPPETS: [
    { trigger: "/role", body: "You are an expert {{domain}} with deep experience in {{specialty}}." },
    { trigger: "/context", body: "Context: {{relevant_background}}" },
    { trigger: "/constraints", body: "Constraints:\n- {{constraint_1}}\n- {{constraint_2}}" },
    { trigger: "/output", body: "Output format: {{format_description}}" },
    { trigger: "/review", body: "Before finishing, review your answer for accuracy, completeness, and adherence to the constraints above." }
  ],

  SECURITY_PATTERNS: [
    { id: "openai_key", label: "OpenAI-style API key", re: /\bsk-[A-Za-z0-9]{20,}\b/g },
    { id: "anthropic_key", label: "Anthropic-style API key", re: /\bsk-ant-[A-Za-z0-9-]{20,}\b/g },
    { id: "aws_key", label: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/g },
    { id: "generic_token", label: "Generic bearer token", re: /\b(?:token|bearer)[\s:=]+[A-Za-z0-9._-]{16,}\b/gi },
    { id: "private_key", label: "Private key block", re: /-----BEGIN(?: RSA| OPENSSH| EC)? PRIVATE KEY-----/g },
    { id: "password_field", label: "Inline password", re: /\bpassword\s*[:=]\s*\S{4,}/gi },
    { id: "jwt", label: "JWT-looking token", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
    { id: "basic_auth_url", label: "Credentials in URL", re: /\b\w+:\/\/[^\/\s:]+:[^\/\s@]+@[^\s]+/g },
    { id: "generic_secret", label: "Generic secret-looking string", re: /\b(?:secret|apikey|api_key)[\s:=]+[A-Za-z0-9._-]{12,}\b/gi }
  ],

  // Risk-linter cue phrases — separate from SECURITY_PATTERNS (which finds
  // credentials). These flag jailbreak-adjacent / policy-risk phrasing so
  // someone shipping a prompt to production can review it before it goes
  // out, the same way a code linter flags an unused variable: a prompt for
  // review, never a moral judgment about the author.
  RISK_PATTERNS: [
    { id: "ignore_instructions", label: "Instruction-override phrasing", re: /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|rules?|prompts?)\b/i, detail: "Phrasing like this is a common jailbreak pattern — if this prompt will run against user input, an attacker can use the same phrasing against your own system prompt." },
    { id: "no_restrictions", label: "\"No restrictions\" framing", re: /\b(?:no|without|remove|bypass|disable)\s+(?:any\s+)?(?:restrictions?|filters?|limitations?|guardrails?|safety\s+measures?)\b/i, detail: "Asking a model to operate with no restrictions tends to produce unpredictable output and may violate the target model's usage policy." },
    { id: "roleplay_override", label: "Persona-override framing", re: /\b(?:pretend|act as if)\s+you\s+(?:have no|don't have any|are not)\s+(?:restrictions?|rules?|guidelines?|filters?)\b/i, detail: "Framing a persona as free of the model's normal guidelines is a known jailbreak pattern and is unreliable even when it appears to work." },
    { id: "hide_reasoning", label: "\"Don't reveal\" framing on safety", re: /\b(?:don'?t|never)\s+(?:mention|reveal|disclose)\s+(?:that\s+)?(?:you'?re|you\s+are)\s+(?:an?\s+)?(?:ai|artificial intelligence|language model|bot)\b/i, detail: "Instructing a model to hide that it's an AI can violate disclosure requirements in some jurisdictions and platform policies." },
    { id: "unfiltered_output", label: "\"Unfiltered\" / \"uncensored\" framing", re: /\b(?:completely\s+)?(?:unfiltered|uncensored|unrestricted)\s+(?:response|answer|output|mode)\b/i, detail: "This framing is closely associated with jailbreak prompt templates and may cause the target model to refuse or behave unpredictably." },
    { id: "always_comply", label: "Absolute-compliance framing", re: /\byou\s+(?:must|will)\s+always\s+(?:comply|obey|agree|do (?:what|whatever) i say)\b/i, detail: "Absolute-compliance instructions read as adversarial to most model safety training and rarely produce the intended effect." }
  ],

  // Static per-model reference data — token/cost estimation, context limits,
  // and prompting idioms. Purely local reference tables; nothing here ever
  // triggers a network call. Token estimates are heuristics (chars-per-token
  // ratios calibrated to each tokenizer family's typical English-text
  // behavior), not exact tokenizer output — always labeled as such in the UI.
  // tokenizer: "cl100k" means RealTokenizer (exact, real BPE) backs this
  // model; "estimate" means no public embeddable tokenizer exists for this
  // vendor, so the chars-per-token heuristic below is used and always
  // labeled as an estimate in the UI. This list is the built-in seed set —
  // Settings → Model & Tokens lets a person add further custom models,
  // which always use the estimate path (only OpenAI's tokenizer ships here).
  MODELS: [
    { id: "claude", label: "Claude (Anthropic)", vendor: "Anthropic", group: "Claude", charsPerToken: 3.6, contextWindow: 200000, priceIn: 3.00, priceOut: 15.00, priceNote: "Sonnet-class pricing, per 1M tokens", idiomKey: "claude", tokenizer: "estimate" },
    { id: "gpt4o", label: "GPT-4o (OpenAI)", vendor: "OpenAI", group: "GPT", charsPerToken: 4.0, contextWindow: 128000, priceIn: 2.50, priceOut: 10.00, priceNote: "per 1M tokens", idiomKey: "openai", tokenizer: "cl100k" },
    { id: "gpt4", label: "GPT-4 Turbo (OpenAI)", vendor: "OpenAI", group: "GPT", charsPerToken: 4.0, contextWindow: 128000, priceIn: 10.00, priceOut: 30.00, priceNote: "per 1M tokens", idiomKey: "openai", tokenizer: "cl100k" },
    { id: "gemini", label: "Gemini 1.5 Pro (Google)", vendor: "Google", group: "Gemini", charsPerToken: 4.0, contextWindow: 1000000, priceIn: 1.25, priceOut: 5.00, priceNote: "per 1M tokens, ≤128K prompt tier", idiomKey: "gemini", tokenizer: "estimate" },
    { id: "llama", label: "Llama 3 (local / OpenRouter)", vendor: "Meta / self-hosted", group: "Llama", charsPerToken: 3.8, contextWindow: 128000, priceIn: 0, priceOut: 0, priceNote: "free if self-hosted (Ollama); varies on hosted routers", idiomKey: "generic", tokenizer: "estimate" },
    { id: "generic", label: "Generic / unspecified", vendor: "—", group: "Other", charsPerToken: 4.0, contextWindow: 32000, priceIn: 0, priceOut: 0, priceNote: "no specific pricing", idiomKey: "generic", tokenizer: "estimate" }
  ],

  // Per-idiom prompting guidance, shown in the Model Guide reference panel
  // and used to power the "Wrap in XML tags" transform for Claude-style prompts.
  MODEL_IDIOMS: {
    claude: {
      label: "Claude (Anthropic)",
      comparative: "Tends to follow implied structure well even without an explicit \"respond in JSON\" instruction — but still benefits most from XML-tagged sections on longer prompts.",
      tips: [
        "Structure long prompts with XML tags (<role>, <context>, <instructions>) — Claude is trained to track XML boundaries precisely.",
        "State the task before background context if the task is short; state context first if it's long and the task is a single line.",
        "Ask explicitly for step-by-step reasoning when a task benefits from it — Claude does not always show its work unprompted.",
        "Use a dedicated <output_format> or 'Output format:' section rather than folding format instructions into the task sentence.",
        "For multi-shot examples, wrap each in its own tag (<example>...</example>) rather than a numbered list."
      ]
    },
    openai: {
      label: "GPT-4 / GPT-4o (OpenAI)",
      comparative: "Tends to need explicit output-format instructions more than Claude does — an implied format is more likely to be interpreted loosely.",
      tips: [
        "Put stable behavioral instructions in the system message; put the actual task/content in the user message.",
        "Markdown headers (## Section) are a reliable structural signal for GPT-family models.",
        "Few-shot examples work well as a plain numbered list directly in the prompt body.",
        "Explicit output-format instructions (\"Respond only in JSON\") are followed more reliably than implied formatting.",
        "For long documents, put the document first and the instruction last — recency helps GPT-family models attend to the actual ask."
      ]
    },
    gemini: {
      label: "Gemini (Google)",
      comparative: "With a much larger context window than most peers, the practical limit is usually response length getting longer than intended, not running out of room for reference material.",
      tips: [
        "Gemini responds well to clearly labeled sections (Role:, Task:, Constraints:) similar to plain-text structuring.",
        "Very large context windows make it reasonable to include full reference documents inline rather than summarizing them first.",
        "Being explicit about the desired response length helps — Gemini can default to longer answers than requested.",
        "Multi-turn few-shot examples benefit from an explicit 'Example N:' label per turn."
      ]
    },
    generic: {
      label: "General / model-agnostic",
      comparative: "The safest default when a prompt needs to run against more than one provider — plain labeled sections are understood reasonably well everywhere, even if no single model's idioms are being specifically leveraged.",
      tips: [
        "Label every section explicitly (Role:, Context:, Task:, Constraints:, Output:) — labeled sections are the most portable structure across models.",
        "Avoid relying on a specific model's quirks if the prompt needs to run against multiple providers.",
        "Keep instructions and content clearly separated so swapping models doesn't require restructuring.",
        "Test format-sensitive prompts (strict JSON, exact word counts) against the actual target model — adherence varies by provider."
      ]
    }
  },

  // Selectable weighting profiles for Analyzer's overall score. "default"
  // matches the original fixed weights exactly (same numbers), so choosing
  // no profile is bit-for-bit identical to the pre-upgrade behavior.
  SCORING_PROFILES: [
    { id: "default", label: "Balanced (default)", weights: { clarity: 0.18, context: 0.12, specificity: 0.14, structure: 0.20, constraints: 0.14, output: 0.16, ambiguity: 0.06 } },
    { id: "json_api", label: "JSON / API output", weights: { clarity: 0.12, context: 0.08, specificity: 0.16, structure: 0.18, constraints: 0.14, output: 0.28, ambiguity: 0.04 } },
    { id: "creative", label: "Creative writing", weights: { clarity: 0.16, context: 0.20, specificity: 0.20, structure: 0.10, constraints: 0.10, output: 0.10, ambiguity: 0.14 } },
    { id: "chatbot", label: "Chatbot / persona", weights: { clarity: 0.20, context: 0.18, specificity: 0.10, structure: 0.22, constraints: 0.16, output: 0.08, ambiguity: 0.06 } },
    { id: "extraction", label: "Data extraction", weights: { clarity: 0.14, context: 0.08, specificity: 0.22, structure: 0.16, constraints: 0.16, output: 0.22, ambiguity: 0.02 } }
  ],

  LEARN_TIPS: [
    "Define the target audience so the model calibrates vocabulary and depth correctly.",
    "Specify the expected output format — a list, a table, JSON, prose — don't leave it implicit.",
    "Add explicit constraints: length limits, tone, things to avoid, or a required structure.",
    "Give the model a role when domain expertise matters — it shapes vocabulary and judgment calls.",
    "State the objective before the task: what should be true when this is done well?",
    "Use concrete examples for anything with a specific style or format you want matched.",
    "Break multi-step work into numbered instructions rather than one dense paragraph.",
    "Call out edge cases up front — empty input, conflicting data, out-of-scope requests.",
    "Separate context (background facts) from instructions (what to do) — mixing them causes ambiguity.",
    "Define evaluation criteria for open-ended tasks so 'good' has a concrete meaning.",
    "Avoid vague verbs like 'improve' or 'handle' without saying what improved/handled means.",
    "Keep one instruction per sentence — dense multi-clause sentences hide requirements.",
    "If a prompt is reused often, turn it into a template with {{variables}} instead of copy-pasting.",
    "Show, don't just tell — a single good example often out-performs a paragraph of description.",
    "Re-read your prompt as if you had zero context on the task. What would you have to guess?"
  ],

  CHALLENGES: [
    { id: "c1", level: "beginner", title: "Add a role", prompt: "Write me a workout plan.", task: "Rewrite this prompt to include a specific expert role for the model to adopt.", checkKeywords: ["you are", "act as", "expert", "certified", "trainer"] },
    { id: "c2", level: "beginner", title: "Specify output format", prompt: "Summarize this article.", task: "Rewrite this prompt to explicitly state the desired output format (length, structure).", checkKeywords: ["format", "bullet", "words", "paragraph", "table", "list"] },
    { id: "c3", level: "beginner", title: "Add constraints", prompt: "Write a product description.", task: "Rewrite this prompt to add at least two explicit constraints (tone, length, things to avoid).", checkKeywords: ["tone", "words", "avoid", "must", "should", "limit"] },
    { id: "c4", level: "intermediate", title: "Structure a vague prompt", prompt: "Make a website.", task: "Rewrite this into a structured prompt with Role, Context, Task, and Output Format sections.", checkKeywords: ["role", "context", "task", "output"] },
    { id: "c5", level: "intermediate", title: "Build a few-shot prompt", prompt: "Classify this text as positive or negative.", task: "Rewrite this as a few-shot prompt with at least two labeled examples before the actual task.", checkKeywords: ["example", "positive", "negative", "input", "output"] },
    { id: "c6", level: "intermediate", title: "Resolve conflicting instructions", prompt: "Be extremely detailed and thorough. Keep the answer under 50 words.", task: "Rewrite this prompt so the length instruction and detail instruction no longer contradict each other.", checkKeywords: ["concise", "prioritize", "most important", "summary", "key points"] },
    { id: "c7", level: "advanced", title: "Design an evaluation prompt", prompt: "Check if this code is good.", task: "Rewrite this into a structured evaluation prompt with explicit criteria and a scoring scale.", checkKeywords: ["criteria", "score", "scale", "rubric", "evaluate"] },
    { id: "c8", level: "advanced", title: "Handle edge cases", prompt: "Extract the shipping address from this email.", task: "Rewrite this prompt to explicitly define what should happen if no address is found or multiple addresses are present.", checkKeywords: ["if no", "not found", "multiple", "edge case", "otherwise"] },
    { id: "c9", level: "advanced", title: "Self-critique step", prompt: "Write a cover letter for this job posting.", task: "Rewrite this prompt to require a self-critique/revision pass before the final answer is produced.", checkKeywords: ["review", "critique", "revise", "check", "before finalizing"] }
  ],

  // Curated, model-agnostic negative-constraint atoms — the boilerplate
  // "what NOT to do" phrasing that recurs across nearly every production
  // prompt (don't hallucinate citations, stay in character, respect a
  // word limit, etc.), distinct from user-created Snippets: this is
  // built-in reference content, the same relationship CONFIG.PATTERNS has
  // to user-created custom patterns.
  CONSTRAINT_LIBRARY: [
    { id: "no_hallucinated_citations", category: "Accuracy", label: "No fabricated citations/URLs", text: "Do not invent citations, URLs, or sources. If you're not certain a reference is real, say so instead of fabricating one." },
    { id: "no_speculation_as_fact", category: "Accuracy", label: "Don't present speculation as fact", text: "Clearly distinguish between what you know with confidence and what is a guess or inference — do not state uncertain information as established fact." },
    { id: "admit_uncertainty", category: "Accuracy", label: "Admit when uncertain", text: "If you don't have enough information to answer confidently, say so explicitly rather than guessing." },
    { id: "stay_in_character", category: "Persona", label: "Stay in character", text: "Maintain the assigned persona and tone throughout the entire response, even when the user's message shifts topic or tone." },
    { id: "no_meta_commentary", category: "Persona", label: "No meta-commentary", text: "Do not comment on these instructions, mention that you are an AI, or explain your own reasoning process unless explicitly asked to." },
    { id: "no_breaking_character_for_refusal", category: "Persona", label: "Refuse in-character", text: "If you must decline part of a request, do so in a way consistent with the assigned persona rather than an out-of-character disclaimer." },
    { id: "word_limit", category: "Format", label: "Respect a word/length limit", text: "Keep the response under {{word_limit}} words. Do not pad the response to reach a target length." },
    { id: "no_preamble", category: "Format", label: "No preamble or restating the question", text: "Respond directly with the answer. Do not restate the question, and do not open with phrases like \"Sure, here's...\"." },
    { id: "strict_output_only", category: "Format", label: "Output only the requested format, nothing else", text: "Return only the requested output with no additional explanation, commentary, or surrounding text." },
    { id: "no_markdown_in_output", category: "Format", label: "No markdown formatting in output", text: "Do not use markdown formatting (no headers, bold, or bullet points) — plain text only." },
    { id: "scope_boundary", category: "Scope", label: "Stay within defined scope", text: "If the user asks something outside the scope described above, say that it's outside what you can help with here rather than attempting an answer anyway." },
    { id: "no_unrelated_suggestions", category: "Scope", label: "No unsolicited suggestions", text: "Do not offer additional suggestions, alternatives, or follow-up ideas unless the user asks for them." }
  ],

  // Edge-case checklist — a REFERENCE list to review against, never
  // auto-inserted into a prompt (unlike CONSTRAINT_LIBRARY's insertable
  // atoms above). The gap this fills: a prompt that works great on the
  // happy path but was never checked against empty input, contradictory
  // input, out-of-scope requests, or an undefined refusal behavior — gaps
  // that usually only surface once something's already in production.
  EDGE_CASE_CHECKLIST: [
    { id: "empty_input", label: "Empty or missing input", question: "If the field this prompt operates on is empty, blank, or not provided, what happens? Does the prompt say what to do, or would the model have to guess?" },
    { id: "contradictory_input", label: "Contradictory or conflicting input", question: "If the input contains two things that conflict with each other, does the prompt say which should take priority, or would the model have to pick arbitrarily?" },
    { id: "out_of_scope", label: "Out-of-scope request", question: "If the user asks for something outside what this prompt is meant to handle, does it say to decline or redirect — or would the model attempt an answer anyway?" },
    { id: "refusal_behavior", label: "Refusal / can't-comply behavior", question: "If the model genuinely can't or shouldn't do what's asked, does the prompt specify HOW to say so — tone, format, whether to explain why?" },
    { id: "ambiguous_input", label: "Ambiguous input", question: "If the input could reasonably be read two different ways, does the prompt say whether to ask for clarification, pick the most likely reading, or cover both?" },
    { id: "extreme_length", label: "Unusually long or short input", question: "If the input is far longer or shorter than a typical case, does the prompt still produce a sensible result, or does it implicitly assume a certain input size?" },
    { id: "wrong_format_input", label: "Input in an unexpected format", question: "If the input arrives in a different shape than expected (e.g. plain text when structured data was assumed), does the prompt handle that, or fail silently?" },
    { id: "repeated_calls", label: "Consistency across repeated calls", question: "If this prompt runs many times with similar input, does it need to produce consistent results — and if so, does it say that explicitly?" }
  ],

  PATTERNS: [
    {
      id: "role_prompt", name: "Role Prompt", category: "Foundational",
      purpose: "Anchor the model's expertise, vocabulary, and judgment by assigning it a specific persona.",
      when: "Any task where domain-specific knowledge, tone, or professional judgment matters.",
      template: "You are a {{role}} with expertise in {{domain}}. {{task}}",
      example: "You are a senior backend engineer with expertise in distributed systems. Review this service design for scalability issues.",
      variables: ["role", "domain", "task"]
    },
    {
      id: "zero_shot", name: "Zero-Shot", category: "Foundational",
      purpose: "Ask the model to perform a task directly with no examples, relying on its general knowledge.",
      when: "Simple, well-defined tasks where the desired behavior is unambiguous.",
      template: "{{instruction}}\n\nOutput format: {{output_format}}",
      example: "Translate the following sentence into French.\n\nOutput format: just the translation, no explanation.",
      variables: ["instruction", "output_format"]
    },
    {
      id: "few_shot", name: "Few-Shot", category: "Foundational",
      purpose: "Show the model a small number of labeled examples so it infers the pattern before doing the real task.",
      when: "Tasks with a specific format, style, or classification scheme that's easier to demonstrate than describe.",
      template: "Examples:\nInput: {{example_input_1}}\nOutput: {{example_output_1}}\n\nInput: {{example_input_2}}\nOutput: {{example_output_2}}\n\nNow:\nInput: {{real_input}}\nOutput:",
      example: "Input: 'This movie was incredible' -> Output: positive\nInput: 'Total waste of time' -> Output: negative\n\nInput: '{{real_input}}' -> Output:",
      variables: ["example_input_1", "example_output_1", "example_input_2", "example_output_2", "real_input"]
    },
    {
      id: "structured_output", name: "Structured Output", category: "Formatting",
      purpose: "Force a machine-parseable or strictly formatted response.",
      when: "When the output will be consumed programmatically or needs to match an exact template.",
      template: "{{task}}\n\nRespond ONLY in this exact format:\n{{format_spec}}",
      example: "Extract the key entities from this text.\n\nRespond ONLY in this exact format:\n{\"people\": [], \"organizations\": [], \"locations\": []}",
      variables: ["task", "format_spec"]
    },
    {
      id: "constraint_prompt", name: "Constraint Prompt", category: "Formatting",
      purpose: "Bound the model's output with explicit rules to prevent scope creep or unwanted style.",
      when: "When you need predictable, tightly-scoped output (length limits, forbidden topics, required tone).",
      template: "{{task}}\n\nConstraints:\n- {{constraint_1}}\n- {{constraint_2}}\n- {{constraint_3}}",
      example: "Write product copy for a running shoe.\n\nConstraints:\n- Under 60 words\n- No superlatives like 'best' or 'amazing'\n- End with a call to action",
      variables: ["task", "constraint_1", "constraint_2", "constraint_3"]
    },
    {
      id: "classification", name: "Classification", category: "Task-type",
      purpose: "Assign input to one of a fixed set of categories.",
      when: "Sentiment analysis, routing, tagging, moderation-style decisions.",
      template: "Classify the following {{input_type}} into exactly one of these categories: {{categories}}.\n\n{{input_type}}: {{input}}\n\nCategory:",
      example: "Classify the following support ticket into exactly one of these categories: Billing, Technical, Account, Other.\n\nTicket: 'I was charged twice this month.'\n\nCategory:",
      variables: ["input_type", "categories", "input"]
    },
    {
      id: "extraction", name: "Extraction", category: "Task-type",
      purpose: "Pull specific structured fields out of unstructured text.",
      when: "Parsing documents, emails, forms, or logs into usable data.",
      template: "Extract the following fields from the text below: {{fields}}.\nIf a field is not present, use null.\n\nText: {{input_text}}\n\nOutput as JSON.",
      example: "Extract: name, email, order_number.\nIf a field is not present, use null.\n\nText: '{{input_text}}'\n\nOutput as JSON.",
      variables: ["fields", "input_text"]
    },
    {
      id: "transformation", name: "Transformation", category: "Task-type",
      purpose: "Convert content from one form/style/format into another while preserving meaning.",
      when: "Rewrites, tone shifts, format conversions, translations, summarization-with-reshaping.",
      template: "Transform the following {{source_format}} into {{target_format}}, preserving all key information.\n\n{{source_format}}: {{input}}",
      example: "Transform the following bullet notes into a formal paragraph, preserving all key information.\n\nNotes: {{input}}",
      variables: ["source_format", "target_format", "input"]
    },
    {
      id: "comparison", name: "Comparison", category: "Task-type",
      purpose: "Evaluate two or more options against shared criteria.",
      when: "Decision support, product comparisons, trade-off analysis.",
      template: "Compare {{option_a}} and {{option_b}} across these criteria: {{criteria}}.\nPresent the comparison as a table, then give a one-sentence recommendation.",
      example: "Compare PostgreSQL and MongoDB across: consistency, query flexibility, horizontal scaling.\nPresent as a table, then a one-sentence recommendation.",
      variables: ["option_a", "option_b", "criteria"]
    },
    {
      id: "summarization", name: "Summarization", category: "Task-type",
      purpose: "Condense longer content into a shorter form while retaining key points.",
      when: "Long documents, meeting notes, articles, research papers.",
      template: "Summarize the following {{content_type}} in {{length_constraint}}, focusing on {{focus_area}}.\n\n{{content_type}}: {{input}}",
      example: "Summarize the following article in 3 bullet points, focusing on actionable takeaways.\n\nArticle: {{input}}",
      variables: ["content_type", "length_constraint", "focus_area", "input"]
    },
    {
      id: "reflection", name: "Reflection", category: "Reasoning",
      purpose: "Ask the model to reason about its own prior output or a given artifact before responding.",
      when: "Tasks that benefit from a 'think before answering' pass — planning, debugging, review.",
      template: "Before answering, briefly reflect: what are the key considerations for {{task}}? Then give your final answer.\n\nTask: {{task}}",
      example: "Before answering, briefly reflect: what are the key considerations for choosing a database for this app? Then give your final answer.",
      variables: ["task"]
    },
    {
      id: "self_critique", name: "Self-Critique", category: "Reasoning",
      purpose: "Have the model produce a draft, critique it, then revise — improving quality on subjective tasks.",
      when: "Writing, code review, design decisions — anything where a first pass benefits from a second look.",
      template: "{{task}}\n\nFirst draft your response. Then critique it against {{criteria}}. Then give a revised final version.",
      example: "Write a cold outreach email.\n\nFirst draft your response. Then critique it against: clarity, brevity, and a clear call to action. Then give a revised final version.",
      variables: ["task", "criteria"]
    },
    {
      id: "iterative_refinement", name: "Iterative Refinement", category: "Reasoning",
      purpose: "Explicitly request multiple passes of improvement rather than a single-shot answer.",
      when: "High-stakes or highly polished deliverables where one pass isn't enough.",
      template: "{{task}}\n\nProduce an initial version, then refine it {{n_passes}} times, briefly noting what changed each pass.",
      example: "Write a tagline for a coffee brand.\n\nProduce an initial version, then refine it 2 times, briefly noting what changed each pass.",
      variables: ["task", "n_passes"]
    },
    {
      id: "step_by_step", name: "Step-by-Step Task", category: "Reasoning",
      purpose: "Force explicit sequential reasoning or execution instead of a single dense answer.",
      when: "Multi-stage tasks, calculations, or procedures where order and intermediate state matter.",
      template: "{{task}}\n\nWork through this step by step:\n1. {{step_1}}\n2. {{step_2}}\n3. {{step_3}}",
      example: "Debug why this API call is failing.\n\nWork through step by step:\n1. Check the request payload\n2. Check auth headers\n3. Check the response error body",
      variables: ["task", "step_1", "step_2", "step_3"]
    },
    {
      id: "evaluation_prompt", name: "Evaluation Prompt", category: "Reasoning",
      purpose: "Use the model as a judge against explicit, scored criteria rather than a free-form opinion.",
      when: "Grading, QA, content moderation, comparing outputs from different sources.",
      template: "Evaluate the following {{artifact_type}} against these criteria, scoring each 1-5:\n- {{criterion_1}}\n- {{criterion_2}}\n- {{criterion_3}}\n\n{{artifact_type}}: {{input}}\n\nGive scores, then a one-sentence overall verdict.",
      example: "Evaluate the following pull request description against: clarity, completeness, risk disclosure — score each 1-5.\n\nPR description: {{input}}",
      variables: ["artifact_type", "criterion_1", "criterion_2", "criterion_3", "input"]
    }
  ]
};
