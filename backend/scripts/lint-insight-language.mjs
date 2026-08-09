#!/usr/bin/env node
/**
 * Diagnostic-language linter for insight rules.
 *
 * CLAUDE.md rule: insight text must be descriptive, never diagnostic. This
 * checks every hardcoded string in backend/src/rules/*.ts for forbidden
 * phrases, and exits non-zero if any are found so CI can block a bad merge.
 *
 * Run: node backend/scripts/lint-insight-language.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR = path.resolve(__dirname, "../src/rules");

// Phrases that make a rule sound diagnostic or causal. Case-insensitive.
const FORBIDDEN = [
  /\byour \w+ is causing\b/i,
  /\bcauses your\b/i,
  /\bdiagnos[ei]/i,
  /\bshould take\b/i,
  /\bshould stop taking\b/i,
  /\byou have (diabetes|depression|anxiety|hypertension|adhd)\b/i,
  /\bpre-?diabetic\b/i,
  /\byou need to see a doctor\b/i,
  /\bcure(s|d)?\b/i,
  /\btreat[ms]?\b/i,
  // Bare "medical advice" phrasing
  /\bthis means you (have|are)\b/i,
];

// Contexts we don't flag: line comments, negation ("isn't a diagnosis",
// "not medical advice"), and JS-side identifiers (we only care about
// user-facing strings).
function shouldSkipLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return true;
  // Negation guards — accept explicit disclaimer language.
  if (/isn'?t (a )?diagnosis/i.test(line)) return true;
  if (/not (a )?diagnosis/i.test(line)) return true;
  if (/never (a )?diagnos[ei]/i.test(line)) return true;
  if (/not medical advice/i.test(line)) return true;
  return false;
}

const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith(".ts"));
let failed = 0;
for (const f of files) {
  const full = path.join(RULES_DIR, f);
  const text = fs.readFileSync(full, "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (shouldSkipLine(lines[i])) continue;
    for (const re of FORBIDDEN) {
      if (re.test(lines[i])) {
        console.error(`[LINT] ${f}:${i + 1}  ${re.source}  →  ${lines[i].trim()}`);
        failed++;
      }
    }
  }
}
if (failed > 0) {
  console.error(`\n${failed} diagnostic-language violation(s) found.`);
  process.exit(1);
} else {
  console.log(`OK: ${files.length} rule files clean.`);
}
