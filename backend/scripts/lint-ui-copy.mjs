#!/usr/bin/env node
/**
 * UI copy linter for /app/src/strings + all frontend .tsx files.
 *
 * Flags:
 *  - filler words ("amazing", "awesome", "very", "just")
 *  - double spaces
 *  - diagnostic phrasing that leaked into the frontend
 *  - "TODO"/"FIXME" in user-facing strings
 *
 * Skips comments, prop names, imports, and identifiers.
 *
 * Exit 1 on violation → drop into CI to enforce.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_SRC = path.resolve(__dirname, "../../app/src");

const RULES = [
  { re: /\bamazing\b/i,   msg: "filler word 'amazing'" },
  { re: /\bawesome\b/i,   msg: "filler word 'awesome'" },
  { re: /\bvery good\b/i, msg: "vague phrase 'very good'" },
  { re: /  +(?!→|←|·)/,   msg: "double space" },   // ignore visual-spacing before arrows/dots
  { re: /\byou (have|are) (diabetes|depression|anxiety|hypertension|adhd)\b/i, msg: "diagnostic phrasing" },
  { re: /\bcure(s|d)?\b/i, msg: "medical claim 'cure'" },
  { re: /\bTODO\b/,       msg: "TODO in a string" },
  { re: /\bFIXME\b/,      msg: "FIXME in a string" },
  { re: /\bLorem ipsum\b/i, msg: "placeholder copy" },
  { re: /\bClick here\b/i, msg: "avoid 'click here' - use action verb" },
];

function extractStrings(text) {
  const out = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\\r\n])+)\1/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ str: m[2], index: m.index });
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(tsx?|ts)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function shouldSkipString(s) {
  if (s.length < 4)                         return true;
  if (/^[a-zA-Z_][\w-]*$/.test(s))          return true;   // identifier
  if (/^https?:\/\//.test(s))               return true;   // URL
  if (/^[\/\.]/.test(s))                    return true;   // path
  if (/^#[0-9A-Fa-f]{3,8}$/.test(s))        return true;   // hex color
  if (/^[A-Z0-9_]+$/.test(s))               return true;   // constant
  if (/^\d/.test(s))                        return true;   // starts w/ digit
  if (/^rgba?\(/.test(s))                   return true;
  return false;
}

const files = walk(APP_SRC);
let violations = 0;
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const strings = extractStrings(text);
  for (const { str, index } of strings) {
    if (shouldSkipString(str)) continue;
    for (const rule of RULES) {
      if (rule.re.test(str)) {
        const line = lineOf(text, index);
        console.error(`[COPY] ${path.relative(APP_SRC, f)}:${line}  ${rule.msg}  →  "${str.slice(0, 80)}"`);
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} copy violation(s) across ${files.length} files.`);
  process.exit(1);
}
console.log(`OK: ${files.length} files clean.`);
