// Build the knowledge-base chunks of one profile into a directory (tech spec §5, T9, T12).
//   node scripts/bundle-data.ts --profile release --out apps/web/dist/kb [--overrides overrides.json]
//   env: APP_PROFILE (default "release"), APP_OVERRIDES (path to an override JSON; may only restrict — see packages/kb/src/bundle.ts)
// Output: manifest.json (never cached) + content-hashed chunk files (immutable), and the Simplified-Chinese display lists (docs/post-mvp/design/simplified-chinese.md §5.1).
// Fails when a chunk exceeds its gzip budget, or when a Chinese string of the chunks has no entry in scripts/i18n/zh-Hans.dictionary.json.
// The Vite config imports `writeBundle` so the dev server and the build use exactly this code.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { buildChunks, type Reach } from "../packages/kb/src/bundle.ts";
import { alignedList, chineseStrings, digestInput } from "../packages/kb/src/hans.ts";
import { readDataFiles } from "../packages/kb/node/fromDisk.ts";
import type { ChunkRef, HansRef, Manifest, ProfileName } from "../packages/kb/src/types.ts";

/** Gzip budgets per chunk in bytes (tech spec §5.2) — the release budgets; the dev profile carries every tier and the herb records and gets half as much again. */
export const BUDGET_GZ = {
  core: 60 * 1024, formulas: 30 * 1024, herbs: 25 * 1024, citations: 15 * 1024, guidance: 20 * 1024, cities: 25 * 1024, hansMain: 30 * 1024, hansCities: 6 * 1024,
  // the herb browser (PM-24): fetched on demand, never part of the per-session figure
  herbIndex: 36 * 1024, herbShard: 8 * 1024, hansHerbIndex: 8 * 1024, hansHerbShard: 3 * 1024,
} as const;

/** The committed Simplified display dictionary (Traditional string → Simplified string), written by `python -m scripts.i18n.build_hans`. */
export const DICTIONARY_PATH = join(import.meta.dirname, "i18n", "zh-Hans.dictionary.json");

export const DEV_BUDGET_FACTOR = 1.5;

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

export interface WriteBundleOptions {
  readonly profile: ProfileName;
  readonly out: string;
  /** Path of a build-time override file (restrict only). */
  readonly overridesPath?: string | undefined;
  /** The closed-beta draft label is on (default: APP_DRAFT_LABEL=on): draft emergency rows may ship; a public build ships only verified ones. */
  readonly draftLabel?: boolean | undefined;
  /** Path of the Simplified dictionary (default: the committed one). */
  readonly dictionaryPath?: string | undefined;
}

export interface WriteBundleResult {
  readonly manifest: Manifest;
  readonly reach: Reach;
  readonly formulas: number;
  readonly herbRecords: number;
  /** The herb browser (PM-24): how many herbs it holds and the files written (none for a build that shows no herb page). */
  readonly herbBrowser: { readonly count: number; readonly files: number } | null;
  readonly hans: { readonly main: HansRef; readonly cities: HansRef };
  readonly report: string[];
  readonly overBudget: string[];
}

export function writeBundle(opts: WriteBundleOptions): WriteBundleResult {
  const { profile } = opts;
  const out = resolve(opts.out);
  const overrides = opts.overridesPath ? (JSON.parse(readFileSync(resolve(opts.overridesPath), "utf8")) as unknown) : undefined;
  const { chunks, reach, herbFiles } = buildChunks(readDataFiles(), { profile, overrides, version: "pending", draftLabel: opts.draftLabel ?? process.env.APP_DRAFT_LABEL === "on" });

  const serialized: Record<string, string> = {
    core: JSON.stringify(chunks.core),
    formulas: JSON.stringify(chunks.formulas),
    citations: JSON.stringify(chunks.citations),
    guidance: JSON.stringify(chunks.guidance),
    cities: JSON.stringify(chunks.cities),
    ...(chunks.herbs ? { herbs: JSON.stringify(chunks.herbs) } : {}),
  };

  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) if (f.endsWith(".json") || f.endsWith(".txt")) rmSync(join(out, f));

  const refs: Record<string, ChunkRef> = {};
  const overBudget: string[] = [];
  const report: string[] = [];
  const emit = (name: string, body: string, budgetKey: keyof typeof BUDGET_GZ): ChunkRef => {
    const hash = sha256(body);
    const file = `${name}.${hash.slice(0, 10)}.json`;
    writeFileSync(join(out, file), body);
    const gz = gzipSync(body, { level: 9 }).length;
    const budget = BUDGET_GZ[budgetKey] * (profile === "dev" ? DEV_BUDGET_FACTOR : 1);
    report.push(`  ${name.padEnd(10)} ${(Buffer.byteLength(body) / 1024).toFixed(1).padStart(7)} KB  gzip ${(gz / 1024).toFixed(1).padStart(6)} KB  (budget ${(budget / 1024).toFixed(0)} KB)`);
    if (gz > budget) overBudget.push(`${name}: ${(gz / 1024).toFixed(1)} KB gzip exceeds the ${(budget / 1024).toFixed(0)} KB budget`);
    return { file, sha256: hash, bytes: Buffer.byteLength(body) };
  };
  for (const [name, body] of Object.entries(serialized)) refs[name] = emit(name, body, name as keyof typeof BUDGET_GZ);

  // the herb browser (PM-24): an index and up to sixteen shards, hash-addressed like every chunk but NOT part of the knowledge-base version (they change nothing a result says)
  const herbRefs = herbFiles === null ? null : {
    index: emit("herbs-index", JSON.stringify(herbFiles.index), "herbIndex"),
    shards: Object.fromEntries(Object.entries(herbFiles.shards).map(([key, shard]) => [key, emit(`herbs-${key}`, JSON.stringify(shard), "herbShard")])),
  };

  // the Simplified display lists: aligned with the Chinese strings of exactly these chunks. They are display only, so they are NOT part of the knowledge-base version
  // (a wording change in the dictionary must not make saved results look as if they were made with another knowledge base).
  const dictionary = (JSON.parse(readFileSync(resolve(opts.dictionaryPath ?? DICTIONARY_PATH), "utf8")) as { entries: Record<string, string> }).entries;
  const hansRef = (name: string, budgetKey: "hansMain" | "hansCities" | "hansHerbIndex" | "hansHerbShard", list: string[]): HansRef => {
    const body = alignedList(list, dictionary);
    const hash = sha256(body);
    const file = `hans-${name}.${hash.slice(0, 10)}.txt`;
    writeFileSync(join(out, file), body);
    const gz = gzipSync(body, { level: 9 }).length;
    const budget = BUDGET_GZ[budgetKey] * (profile === "dev" ? DEV_BUDGET_FACTOR : 1);
    report.push(`  ${`hans-${name}`.padEnd(10)} ${(Buffer.byteLength(body) / 1024).toFixed(1).padStart(7)} KB  gzip ${(gz / 1024).toFixed(1).padStart(6)} KB  (budget ${(budget / 1024).toFixed(0)} KB)  ${list.length} strings`);
    if (gz > budget) overBudget.push(`hans-${name}: ${(gz / 1024).toFixed(1)} KB gzip exceeds the ${(budget / 1024).toFixed(0)} KB budget`);
    return { file, sha256: hash, bytes: Buffer.byteLength(body), strings: list.length, digest: sha256(digestInput(list)) };
  };
  const hans = {
    main: hansRef("main", "hansMain", chineseStrings(chunks.core, chunks.formulas, chunks.citations, chunks.guidance, chunks.herbs ?? null)),
    cities: hansRef("cities", "hansCities", chineseStrings(chunks.cities)),
  };

  const herbHans = herbFiles === null ? null : {
    index: hansRef("herbs-index", "hansHerbIndex", chineseStrings(herbFiles.index)),
    shards: Object.fromEntries(Object.entries(herbFiles.shards).map(([key, shard]) => [key, hansRef(`herbs-${key}`, "hansHerbShard", chineseStrings(shard))])),
  };

  const version = sha256([profile, chunks.schemaVersion, ...Object.values(refs).map((r) => r.sha256)].join("|")).slice(0, 12);
  const manifest: Manifest = {
    schema: chunks.schemaVersion, version, profile,
    chunks: { core: refs.core!, formulas: refs.formulas!, citations: refs.citations!, guidance: refs.guidance!, cities: refs.cities!, ...(refs.herbs ? { herbs: refs.herbs } : {}) },
    ...(herbRefs && herbFiles ? { herbBrowser: { count: herbFiles.index.count, index: herbRefs.index, shards: herbRefs.shards } } : {}),
    variants: { "zh-Hans": { ...hans, ...(herbHans ? { herbs: herbHans } : {}) } },
  };
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { manifest, reach, formulas: chunks.formulas.items.length, herbRecords: chunks.herbs ? chunks.herbs.items.length : 0, herbBrowser: herbRefs && herbFiles ? { count: herbFiles.index.count, files: 1 + Object.keys(herbRefs.shards).length } : null, hans, report, overBudget };
}

if (import.meta.main) {
  const arg = (name: string): string | undefined => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const profile = (arg("profile") ?? process.env.APP_PROFILE ?? "release") as ProfileName;
  if (profile !== "release" && profile !== "dev") throw new Error(`unknown profile ${profile} (use release or dev)`);
  const out = resolve(arg("out") ?? "dist/kb");
  const r = writeBundle({ profile, out, overridesPath: arg("overrides") ?? process.env.APP_OVERRIDES });
  console.log(`kb bundle ${r.manifest.version} — profile ${profile}, max level ${r.reach.maxLevel}, ${r.formulas} formulas, ${r.herbRecords} herb records, ${r.herbBrowser ? `${r.herbBrowser.count} herbs in ${r.herbBrowser.files} browser files` : "no herb browser"} → ${out}`);
  console.log(r.report.join("\n"));
  if (r.overBudget.length) {
    console.error(`BUDGET EXCEEDED:\n - ${r.overBudget.join("\n - ")}`);
    process.exit(1);
  }
}
