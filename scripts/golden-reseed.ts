// Re-derives the findings of the golden seed cases (the typical patient of each pattern, G-0001…G-0023) from the current question bank.
//   node scripts/golden-reseed.ts          # prints which cases would change
//   node scripts/golden-reseed.ts --write  # rewrites them
// Those cases are mechanical (their `notes` say so): the findings are what the simulated typical patient answers in the adaptive inquiry, so when the bank or the pattern
// weights change the same procedure has to be run again — otherwise the seeds describe an inquiry that no longer exists. Only synthetic cases titled "typical patient of <id>" are
// touched, and only their `input.findings`; the expectations, the split and every practitioner-agreed case are left alone. Run it after `pnpm generate:kb-types` and the parity export.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dev } from "../packages/engine/test/kbs.ts";
import { interviewOf } from "../packages/engine/test/vignettes.ts";

const DIR = join(import.meta.dirname, "..", "packages", "engine", "test", "golden");
const FINDINGS = /("findings": \{\n)([\s\S]*?)(\n    \})/;

/** One finding per line, the way the existing files are written. */
function render(findings: Record<string, { state: string; severity?: string }>): string {
  return Object.entries(findings).map(([id, f]) => `      ${JSON.stringify(id)}: ${JSON.stringify(f)}`).join(",\n");
}

if (import.meta.main) {
  const write = process.argv.includes("--write");
  let changed = 0, seeds = 0;
  for (const file of readdirSync(DIR).filter((f) => /^G-\d+\.json$/.test(f)).sort()) {
    const path = join(DIR, file);
    const text = readFileSync(path, "utf8");
    const c = JSON.parse(text) as { title: string; authoredBy: string };
    const m = /^typical patient of ([A-Z]{2}\d) /.exec(c.title);
    if (!m || c.authoredBy !== "synthetic") continue;
    seeds++;
    const next = text.replace(FINDINGS, (_all, head: string, _body: string, tail: string) => head + render(interviewOf(dev, m[1]!).findings as Record<string, { state: string; severity?: string }>) + tail);
    if (next === text) continue;
    changed++;
    console.log(`${write ? "rewrote" : "would rewrite"} ${file} (${m[1]})`);
    if (write) writeFileSync(path, next);
  }
  console.log(`${seeds} seed cases, ${changed} ${write ? "rewritten" : "out of date"}`);
}
