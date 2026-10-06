import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { BUDGETS, checkBudgets, measure, type Budgets } from "./check-budgets.ts";

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const KB = 1024;
/** Incompressible bytes, so the gzip size is about the raw size. */
const blob = (kb: number): Buffer => randomBytes(kb * KB);

/** A synthetic output: an entry that imports a vendor chunk statically, lazy chunks, css, knowledge-base chunks. */
function dist(sizes: { entry?: number; vendor?: number; lazy?: number[]; css?: number; kb?: number[]; hans?: number } = {}): string {
  const d = mkdtempSync(join(tmpdir(), "tcm-budget-"));
  dirs.push(d);
  mkdirSync(join(d, "assets"), { recursive: true });
  mkdirSync(join(d, "kb"));
  writeFileSync(join(d, "index.html"), '<script type="module" src="/assets/index-aaaa1111.js"></script><link rel="stylesheet" href="/assets/index-aaaa1111.css">');
  writeFileSync(join(d, "assets", "index-aaaa1111.js"), Buffer.concat([Buffer.from('import "./vendor-bbbb2222.js";\n'), blob(sizes.entry ?? 30)]));
  writeFileSync(join(d, "assets", "vendor-bbbb2222.js"), blob(sizes.vendor ?? 40));
  (sizes.lazy ?? [5, 8]).forEach((k, i) => writeFileSync(join(d, "assets", `Screen${i}-cccc${i}.js`), blob(k)));
  writeFileSync(join(d, "assets", "index-aaaa1111.css"), blob(sizes.css ?? 4));
  (sizes.kb ?? [30, 10]).forEach((k, i) => writeFileSync(join(d, "kb", `chunk${i}.abc.json`), blob(k)));
  writeFileSync(join(d, "kb", "manifest.json"), "{}");
  if (sizes.hans !== undefined) writeFileSync(join(d, "kb", "hans-main.0123456789.txt"), blob(sizes.hans));
  return d;
}
const within = (b: number, target: number, tol = 0.1): boolean => Math.abs(b - target * KB) < target * KB * tol + 200;

test("the initial load is the entry plus what it imports; the lazy chunks are the rest; the knowledge base is counted without its manifest", () => {
  const m = measure(dist());
  assert.ok(within(m.initialJs, 70), `initial ${m.initialJs}`);
  assert.deepEqual(m.lazy.map((c) => c.file), ["assets/Screen1-cccc1.js", "assets/Screen0-cccc0.js"], "largest first, and the vendor chunk is not lazy");
  assert.ok(within(m.totalJs, 83) && within(m.totalCss, 4) && within(m.kbSession, 40));
  assert.equal(m.hansList, 0);
  assert.ok(within(measure(dist({ hans: 20 })).hansList, 20), "the display list is measured apart from the session figure");
  assert.ok(within(measure(dist({ hans: 20 })).kbSession, 40), "and is not part of it");
});

test("a build inside the budgets passes and says the numbers", () => {
  const r = checkBudgets(dist());
  assert.deepEqual(r.failures, []);
  assert.match(r.report[0]!, /initial JS \d+\.\d KB \/ 200\.0 KB/);
});

test("each budget fails on its own, naming what is over", () => {
  const cases: [Parameters<typeof dist>[0], RegExp][] = [
    [{ entry: 170, vendor: 60 }, /initial JavaScript: .* is over the 200\.0 KB budget/],
    [{ lazy: [60] }, /lazy chunk assets\/Screen0-cccc0\.js: .* over the 50\.0 KB budget/],
    [{ lazy: [45, 45, 45, 45, 45, 45, 45] }, /all JavaScript: .* over the 350\.0 KB budget/],
    [{ css: 25 }, /all CSS: .* over the 20\.0 KB budget/],
    [{ kb: [60, 60] }, /knowledge base per session: .* over the 100\.0 KB budget/],
    [{ hans: 35 }, /Simplified display list: .* over the 30\.0 KB budget/],
  ];
  for (const [sizes, re] of cases) assert.match(checkBudgets(dist(sizes)).failures.join("\n"), re);
});

test("the budgets are the ones of the tech spec, and a custom budget is honoured", () => {
  assert.deepEqual([BUDGETS.initialJs, BUDGETS.lazyJsChunk, BUDGETS.totalJs, BUDGETS.totalCss, BUDGETS.kbSession, BUDGETS.hansList], [200 * KB, 50 * KB, 350 * KB, 20 * KB, 100 * KB, 30 * KB]);
  const tight: Budgets = { ...BUDGETS, initialJs: 10 * KB };
  assert.equal(checkBudgets(dist(), tight).failures.length, 1);
});

test("a missing build is reported, not thrown", () => {
  assert.match(checkBudgets(join(tmpdir(), "nowhere-tcm")).failures[0]!, /has no index\.html/);
});
