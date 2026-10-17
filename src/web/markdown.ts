/** Prompt <-> Markdown (with YAML front-matter) for Git-friendly vault export and multi-file import. */

export interface MdPrompt {
  title: string; body: string; tags: string[]; category: string; format: string;
  id?: string; status?: string; favorite?: boolean;
}

export function slugify(s: string, fallback = "untitled"): string {
  const slug = String(s || "").toLowerCase().normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");
  return slug || fallback;
}

const q = (v: string) => JSON.stringify(v);   // JSON strings are valid YAML double-quoted scalars

export function promptToMarkdown(p: { id?: string; title?: string; body?: string; tags?: string[]; category?: string; format?: string; status?: string; favorite?: boolean; createdAt?: number; updatedAt?: number }): string {
  const lines = ["---", `title: ${q(p.title || "Untitled prompt")}`];
  if (p.id) lines.push(`id: ${q(p.id)}`);
  lines.push(`category: ${q(p.category || "custom")}`);
  lines.push(`tags: [${(p.tags || []).map(q).join(", ")}]`);
  lines.push(`format: ${q(p.format || "text")}`);
  if (p.status) lines.push(`status: ${q(p.status)}`);
  if (p.favorite) lines.push("favorite: true");
  if (p.createdAt) lines.push(`created: ${q(new Date(p.createdAt).toISOString())}`);
  if (p.updatedAt) lines.push(`updated: ${q(new Date(p.updatedAt).toISOString())}`);
  lines.push("---", "", p.body || "");
  return lines.join("\n").replace(/\n*$/, "\n");
}

function scalar(v: string): string | boolean | string[] {
  const t = v.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1).trim();
    if (!inner) return [];
    const out: string[] = []; let cur = ""; let inQ = false; let esc = false;
    for (const ch of inner) {
      if (esc) { cur += ch; esc = false; continue; }
      if (ch === "\\" && inQ) { cur += ch; esc = true; continue; }
      if (ch === '"') { inQ = !inQ; cur += ch; continue; }
      if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(x => unquote(x.trim())).filter(Boolean);
  }
  return unquote(t);
}
function unquote(t: string): string {
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) { try { return JSON.parse(t); } catch { return t.slice(1, -1); } }
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

export function parseMarkdown(text: string, filename = ""): MdPrompt {
  const src = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const base = filename.replace(/^.*[\\/]/, "").replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]+/g, " ").trim();
  let meta: Record<string, string | boolean | string[]> = {};
  let body = src;
  const fm = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src);
  if (fm) {
    body = src.slice(fm[0].length).replace(/^\n/, "");
    let listKey: string | null = null;
    for (const line of fm[1].split("\n")) {
      const li = /^\s+-\s+(.*)$/.exec(line);
      if (li && listKey) { (meta[listKey] as string[]).push(unquote(li[1].trim())); continue; }
      const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
      if (!kv) { listKey = null; continue; }
      if (kv[2].trim() === "") { meta[kv[1]] = []; listKey = kv[1]; } else { meta[kv[1]] = scalar(kv[2]); listKey = null; }
    }
  }
  const s = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : "");
  const h1 = /^#\s+(.+)$/m.exec(body);
  const title = (s("title") || (h1 ? h1[1].trim() : "") || base || "Imported prompt").slice(0, 200);
  const tags = Array.isArray(meta.tags) ? (meta.tags as string[]).map(t => String(t).trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean).slice(0, 20) : [];
  return { title, body: body.replace(/\n+$/, "\n").replace(/^\n+/, ""), tags, category: s("category") || "custom", format: s("format") || "text", id: s("id") || undefined, status: s("status") || undefined, favorite: meta.favorite === true };
}

export interface VaultFile { name: string; data: string }

/** Builds the file list for a Markdown vault: prompts/<category>/<slug>.md, templates/, snippets.md, README, JSON backup. */
export function buildVault(data: {
  prompts: any[]; templates: any[]; snippets: any[]; backupJson?: string;
}): VaultFile[] {
  const files: VaultFile[] = [];
  const used = new Set<string>();
  const unique = (dir: string, slug: string) => {
    let name = `${dir}/${slug}.md`, n = 2;
    while (used.has(name.toLowerCase())) name = `${dir}/${slug}-${n++}.md`;
    used.add(name.toLowerCase());
    return name;
  };
  for (const p of data.prompts) files.push({ name: unique(`prompts/${slugify(p.category, "uncategorized")}`, slugify(p.title, "untitled")), data: promptToMarkdown(p) });
  for (const t of data.templates) files.push({ name: unique("templates", slugify(t.name, "template")), data: promptToMarkdown({ id: t.id, title: t.name, body: t.body, category: t.category, createdAt: t.createdAt, updatedAt: t.updatedAt }) });
  if (data.snippets.length) {
    files.push({ name: "snippets.md", data: "# Snippets\n\n" + data.snippets.map(s => `## ${s.trigger}\n\n\`\`\`\n${s.body}\n\`\`\`\n`).join("\n") });
  }
  files.push({ name: "README.md", data: `# Prompt Forge vault\n\nExported ${new Date().toISOString()}.\n\n- \`prompts/<category>/*.md\` — one file per prompt, YAML front-matter + the prompt text exactly as written.\n- \`templates/*.md\` — templates.\n- \`prompt-forge-backup.json\` — complete backup (history, versions, chains, groups…). Use *Restore from file* to bring it back.\n\nDrop this folder in Git or Obsidian. To import the Markdown files again use *Workspace → Data → Import Markdown / ZIP*.\n` });
  if (data.backupJson) files.push({ name: "prompt-forge-backup.json", data: data.backupJson });
  return files;
}
