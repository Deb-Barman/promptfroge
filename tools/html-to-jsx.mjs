// Converts the static chrome markup (topbar / rail / status bar) of the original
// HTML into a typed React component. Pure mechanical transform, reviewed by hand.
import fs from "node:fs";
const html = fs.readFileSync(process.argv[2], "utf8");
const start = html.indexOf('<div id="app"');
const end = html.indexOf("<script", start);
let m = html.slice(start, end).trim();
m = m.replace(/<!--\s*([\s\S]*?)\s*-->/g, (_, t) => `{/* ${t.replace(/\*\//g, "* /")} */}`);
const attr = { class: "className", tabindex: "tabIndex", "stroke-width": "strokeWidth", "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin", "fill-rule": "fillRule", "clip-rule": "clipRule", viewbox: "viewBox", "aria-live": "aria-live" };
for (const [a, b] of Object.entries(attr)) m = m.replace(new RegExp(`\\b${a}=`, "g"), `${b}=`);
m = m.replace(/viewBox=/g, "viewBox=");
m = m.replace(/style="display:none"/g, "style={{ display: 'none' }}");
m = m.replace(/<(div|span)([^>]*?)\/>/g, "<$1$2></$1>");
const indent = m.split("\n").map(l => "    " + l).join("\n");
fs.writeFileSync("src/shell/LegacyChrome.tsx", `import { memo } from "react";

/**
 * Static application chrome — top bar, navigation rail, status bar and overlay
 * roots. The markup (ids, classes, ARIA, SVG icons) is the original design,
 * rendered once by React. The workspace <main> is intentionally empty: view
 * content is owned by the UIManager view layer and must never be reconciled
 * by React (it mutates the DOM directly), hence \`memo\` with no props.
 */
function LegacyChromeImpl() {
  return (
    <>
${indent}
    </>
  );
}

export const LegacyChrome = memo(LegacyChromeImpl);
`);
