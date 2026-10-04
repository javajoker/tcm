// Build the knowledge-base chunks of one profile into a directory (tech spec §5, T9, T12).
//   node scripts/bundle-data.ts --profile release --out apps/web/dist/kb [--overrides overrides.json]
//   env: APP_PROFILE (default "release"), APP_OVERRIDES (path to an override JSON; may only restrict — see packages/kb/src/bundle.ts)
// Output: manifest.json (never cached) + content-hashed chunk files (immutable). Fails when a chunk exceeds its gzip budget.
// The Vite config imports `writeBundle` so the dev server and the build use exactly this code.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { buildChunks, type Reach } from "../packages/kb/src/bundle.ts";
import { readDataFiles } from "../packages/kb/node/fromDisk.ts";
import type { ChunkRef, Manifest, ProfileName } from "../packages/kb/src/types.ts";

/** Gzip budgets per chunk in bytes (tech spec §5.2) — the release budgets; the dev profile carries every tier and the herb records and gets half as much again. */
export const BUDGET_GZ = { core: 60 * 1024, formulas: 30 * 1024, herbs: 25 * 1024, citations: 15 * 1024, guidance: 20 * 1024, cities: 25 * 1024 } as const;

export const DEV_BUDGET_FACTOR = 1.5;

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

export interface WriteBundleOptions {
  readonly profile: ProfileName;
  readonly out: string;
  /** Path of a build-time override file (restrict only). */
  readonly overridesPath?: string | undefined;
}

export interface WriteBundleResult {
  readonly manifest: Manifest;
  readonly reach: Reach;
  readonly formulas: number;
  readonly herbRecords: number;
  readonly report: string[];
  readonly overBudget: string[];
}

export function writeBundle(opts: WriteBundleOptions): WriteBundleResult {
  const { profile } = opts;
  const out = resolve(opts.out);
  const overrides = opts.overridesPath ? (JSON.parse(readFileSync(resolve(opts.overridesPath), "utf8")) as unknown) : undefined;
  const { chunks, reach } = buildChunks(readDataFiles(), { profile, overrides, version: "pending" });

  const serialized: Record<string, string> = {
    core: JSON.stringify(chunks.core),
    formulas: JSON.stringify(chunks.formulas),
    citations: JSON.stringify(chunks.citations),
    guidance: JSON.stringify(chunks.guidance),
    cities: JSON.stringify(chunks.cities),
    ...(chunks.herbs ? { herbs: JSON.stringify(chunks.herbs) } : {}),
  };

  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) if (f.endsWith(".json")) rmSync(join(out, f));

  const refs: Record<string, ChunkRef> = {};
  const overBudget: string[] = [];
  const report: string[] = [];
  for (const [name, body] of Object.entries(serialized)) {
    const hash = sha256(body);
    const file = `${name}.${hash.slice(0, 10)}.json`;
    writeFileSync(join(out, file), body);
    const gz = gzipSync(body, { level: 9 }).length;
    refs[name] = { file, sha256: hash, bytes: Buffer.byteLength(body) };
    const budget = BUDGET_GZ[name as keyof typeof BUDGET_GZ] * (profile === "dev" ? DEV_BUDGET_FACTOR : 1);
    report.push(`  ${name.padEnd(10)} ${(Buffer.byteLength(body) / 1024).toFixed(1).padStart(7)} KB  gzip ${(gz / 1024).toFixed(1).padStart(6)} KB  (budget ${(budget / 1024).toFixed(0)} KB)`);
    if (gz > budget) overBudget.push(`${name}: ${(gz / 1024).toFixed(1)} KB gzip exceeds the ${(budget / 1024).toFixed(0)} KB budget`);
  }

  const version = sha256([profile, chunks.schemaVersion, ...Object.values(refs).map((r) => r.sha256)].join("|")).slice(0, 12);
  const manifest: Manifest = {
    schema: chunks.schemaVersion, version, profile,
    chunks: { core: refs.core!, formulas: refs.formulas!, citations: refs.citations!, guidance: refs.guidance!, cities: refs.cities!, ...(refs.herbs ? { herbs: refs.herbs } : {}) },
  };
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { manifest, reach, formulas: chunks.formulas.items.length, herbRecords: chunks.herbs ? chunks.herbs.items.length : 0, report, overBudget };
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
  console.log(`kb bundle ${r.manifest.version} — profile ${profile}, max level ${r.reach.maxLevel}, ${r.formulas} formulas, ${r.herbRecords} herb records → ${out}`);
  console.log(r.report.join("\n"));
  if (r.overBudget.length) {
    console.error(`BUDGET EXCEEDED:\n - ${r.overBudget.join("\n - ")}`);
    process.exit(1);
  }
}
