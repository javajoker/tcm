// Runs the golden cases (packages/engine/test/golden) and prints concordance by split (docs/test-plan.md §3.5).
//   node scripts/golden-report.ts [--held-out-detail] [--strict]
// The held-out half is shown as numbers only unless --held-out-detail is given (use it after tuning, never while tuning). --strict exits 1 when a target is missed.
import { indexKnowledgeBase } from "../packages/kb/src/indexer.ts";
import { rawChunksFromDisk } from "../packages/kb/node/fromDisk.ts";
import { evaluateCase, formatReport, missedTargets, summarize } from "../packages/engine/src/golden.ts";
import { loadGoldenCases, loadGoldenConfig } from "../packages/engine/test/golden-files.ts";

if (import.meta.main) {
  const args = process.argv.slice(2);
  const kbs = { dev: indexKnowledgeBase(rawChunksFromDisk("dev")), release: indexKnowledgeBase(rawChunksFromDisk("release")) };
  const results = loadGoldenCases().map((c) => evaluateCase(kbs, c));
  console.log(formatReport(results, { heldOutDetail: args.includes("--held-out-detail") }));
  const missed = missedTargets(summarize(results), loadGoldenConfig());
  for (const m of missed) console.log(`target missed: ${m}`);
  if (args.includes("--strict") && missed.length > 0) process.exit(1);
}
