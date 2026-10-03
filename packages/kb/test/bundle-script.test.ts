// Integration: scripts/bundle-data.ts writes a bundle that loadKnowledgeBase can load, for both profiles.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadKnowledgeBase } from "../src/index.ts";
import type { Manifest } from "../src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function bundle(args: string[]): { dir: string; manifest: Manifest; stdout: string } {
  const dir = mkdtempSync(join(tmpdir(), "kb-"));
  const stdout = execFileSync("node", [join(root, "scripts", "bundle-data.ts"), "--out", dir, ...args], { encoding: "utf8" });
  return { dir, manifest: JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Manifest, stdout };
}

const fsFetch = (dir: string): typeof fetch => (async (url: string) => {
  try {
    return new Response(readFileSync(join(dir, url.split("/").pop()!)));
  } catch {
    return new Response("missing", { status: 404 });
  }
}) as unknown as typeof fetch;

test("release bundle loads through the real loader and respects the budgets", async () => {
  const { dir, manifest, stdout } = bundle(["--profile", "release"]);
  assert.equal(manifest.profile, "release");
  assert.equal(manifest.chunks.herbs, undefined);
  assert.match(stdout, /profile release, max level L1, 20 formulas, 0 herb records/);
  const kb = await loadKnowledgeBase({ baseUrl: "/kb", fetch: fsFetch(dir) });
  assert.equal(kb.version, manifest.version);
  assert.equal(kb.profile, "release");
  assert.equal(kb.herbs, null);
  assert.equal(kb.formulas.size, 20);
});

test("dev bundle includes herb records and everything reachable", async () => {
  const { dir, manifest } = bundle(["--profile", "dev"]);
  assert.ok(manifest.chunks.herbs);
  const kb = await loadKnowledgeBase({ baseUrl: "/kb", fetch: fsFetch(dir) });
  assert.equal(kb.profile, "dev");
  assert.equal(kb.formulas.size, 33);
  assert.equal(kb.herbs?.size, 94);
});

test("chunk files are content-hashed and the manifest version depends on the content", () => {
  const a = bundle(["--profile", "release"]);
  const b = bundle(["--profile", "release"]);
  assert.equal(a.manifest.version, b.manifest.version, "deterministic");
  assert.notEqual(a.manifest.version, bundle(["--profile", "dev"]).manifest.version);
  for (const ref of Object.values(a.manifest.chunks)) assert.match(ref.file, /^[a-z]+\.[0-9a-f]{10}\.json$/);
  assert.ok(readdirSync(a.dir).includes("manifest.json"));
});

test("a restricting override file is applied and a loosening one fails the build", () => {
  const dir = mkdtempSync(join(tmpdir(), "ov-"));
  const ok = join(dir, "ok.json");
  writeFileSync(ok, JSON.stringify({ features: { show_acupoints: false } }));
  assert.match(bundle(["--profile", "release", "--overrides", ok]).stdout, /profile release/);
  const bad = join(dir, "bad.json");
  writeFileSync(bad, JSON.stringify({ population: { adult: { level: "L3" } } }));
  assert.throws(() => bundle(["--profile", "release", "--overrides", bad]), /would raise/);
});
