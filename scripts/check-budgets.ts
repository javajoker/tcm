// Size budgets of the built app (task Q-06, tech spec §12). Measured on the build output in gzip, the way users receive it:
//   node scripts/check-budgets.ts [--dist apps/web/dist]       exit 0 = within budget, 1 = over (listed)
// It replaces a size-limit dependency: the numbers that matter are all in the output directory. Latency budgets (LCP, TBT) are checked by Lighthouse CI (lighthouserc.json).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export interface Budgets {
  /** The JavaScript the first page needs: the entry script and what it preloads (tech spec §12: ≤ 200 KB). */
  readonly initialJs: number;
  /** Any one lazy JavaScript chunk (a screen, the engine, the five-phase module). */
  readonly lazyJsChunk: number;
  /** All JavaScript of the app together. */
  readonly totalJs: number;
  /** All CSS together. */
  readonly totalCss: number;
  /** The knowledge-base chunks a release session fetches (core, formulas, citations, guidance, herbs when shipped); the per-chunk budgets are enforced by bundle-data.ts. */
  readonly kbSession: number;
}
const KB = 1024;
export const BUDGETS: Budgets = { initialJs: 200 * KB, lazyJsChunk: 50 * KB, totalJs: 260 * KB, totalCss: 20 * KB, kbSession: 100 * KB };

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const gz = (p: string): number => gzipSync(readFileSync(p), { level: 9 }).length;
const kb = (n: number): string => `${(n / KB).toFixed(1)} KB`;

export interface Measure { readonly initialJs: number; readonly totalJs: number; readonly totalCss: number; readonly kbSession: number; readonly lazy: { readonly file: string; readonly bytes: number }[] }

export function measure(distDir: string): Measure {
  const dist = resolve(distDir);
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const initial = new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => join(dist, m[1]!)));
  const js = walk(join(dist, "assets")).filter((f) => f.endsWith(".js"));
  const css = walk(join(dist, "assets")).filter((f) => f.endsWith(".css"));
  // the entry script imports its static dependencies; they are part of the initial load even without a <link rel="modulepreload">
  const queue = [...initial];
  for (let f = queue.pop(); f !== undefined; f = queue.pop()) {
    for (const m of readFileSync(f, "utf8").matchAll(/(?:from\s*|import\s*)["']\.\/([^"']+\.js)["']/g)) {
      const dep = join(dirname(f), m[1]!);
      if (existsSync(dep) && !initial.has(dep)) { initial.add(dep); queue.push(dep); }
    }
  }
  const kbDir = join(dist, "kb");
  const kbFiles = existsSync(kbDir) ? readdirSync(kbDir).filter((f) => f.endsWith(".json") && f !== "manifest.json").map((f) => join(kbDir, f)) : [];
  return {
    initialJs: [...initial].reduce((n, f) => n + gz(f), 0), totalJs: js.reduce((n, f) => n + gz(f), 0), totalCss: css.reduce((n, f) => n + gz(f), 0),
    kbSession: kbFiles.reduce((n, f) => n + gz(f), 0), lazy: js.filter((f) => !initial.has(f)).map((f) => ({ file: f.slice(dist.length + 1), bytes: gz(f) })).sort((a, b) => b.bytes - a.bytes),
  };
}

export function checkBudgets(distDir: string, budgets: Budgets = BUDGETS): { failures: string[]; report: string[] } {
  if (!existsSync(join(resolve(distDir), "index.html"))) return { failures: [`${resolve(distDir)} has no index.html: build the release first (pnpm build)`], report: [] };
  const m = measure(distDir);
  const failures: string[] = [];
  const over = (what: string, n: number, budget: number): void => { if (n > budget) failures.push(`${what}: ${kb(n)} gzip is over the ${kb(budget)} budget`); };
  over("initial JavaScript", m.initialJs, budgets.initialJs);
  over("all JavaScript", m.totalJs, budgets.totalJs);
  over("all CSS", m.totalCss, budgets.totalCss);
  over("knowledge base per session", m.kbSession, budgets.kbSession);
  for (const c of m.lazy) over(`lazy chunk ${c.file}`, c.bytes, budgets.lazyJsChunk);
  const report = [
    `initial JS ${kb(m.initialJs)} / ${kb(budgets.initialJs)} · all JS ${kb(m.totalJs)} / ${kb(budgets.totalJs)} · CSS ${kb(m.totalCss)} / ${kb(budgets.totalCss)} · KB per session ${kb(m.kbSession)} / ${kb(budgets.kbSession)}`,
    `${m.lazy.length} lazy chunks, largest: ${m.lazy.slice(0, 3).map((c) => `${c.file.replace(/^assets\//, "")} ${kb(c.bytes)}`).join(", ")}`,
  ];
  return { failures, report };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dist = args.includes("--dist") ? args[args.indexOf("--dist") + 1]! : join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "dist");
  const { failures, report } = checkBudgets(dist);
  for (const r of report) console.log(r);
  for (const f of failures) console.error(`✗ ${f}`);
  console.log(failures.length === 0 ? "check-budgets: within budget" : `check-budgets: ${failures.length} over budget`);
  process.exit(failures.length === 0 ? 0 : 1);
}
