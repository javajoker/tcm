import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { indexKnowledgeBase, loadKnowledgeBase, KbError } from "../src/index.ts";
import type { Manifest, RawKbChunks } from "../src/index.ts";
import { rawChunksFromDisk } from "../test-support/fromDisk.ts";

const raw = rawChunksFromDisk("dev");
const kb = indexKnowledgeBase(raw);

test("the real data indexes: counts and lookups", () => {
  assert.equal(kb.symptoms.size, 171);
  assert.equal(kb.patterns.length, 23);
  assert.equal(kb.questions.length, 28);
  assert.equal(kb.modules.length, 8);
  assert.equal(kb.formulas.size, 33);
  assert.equal(kb.herbs?.size, 703);
  assert.equal(kb.constitutions.length, 9);
  assert.equal(kb.redFlags.length, 28);
  assert.equal(kb.profile, "dev");
  assert.equal(kb.patternById.get("SP1")?.name["zh-Hant"], "脾氣虛");
  assert.equal(kb.formulas.get("F_SIJUNZI")?.composition[0]?.role, "君");
  assert.equal(kb.questionById.get("Q_COLD")?.core, true);
  assert.equal(kb.term("陰陽")?.en, "yin and yang");
});

test("citations resolve by id", () => {
  assert.equal(kb.citation("suwen-005-1")?.verified, true);
  assert.equal(kb.citation("no-such-quote"), undefined);
});

test("scoring parameters are available to the engine", () => {
  assert.equal(kb.params.quality.by_source.pulse, 0.5);
  assert.equal(kb.params.formula.role_weights["君"], 1);
});

test("every pattern and question reference resolves in the real bundle", () => {
  for (const p of kb.patterns) for (const f of p.formulas) assert.ok(kb.formulas.has(f), `${p.id} → ${f}`);
  for (const q of kb.questions) for (const o of q.options) for (const s of o.symptoms) assert.ok(kb.symptoms.has(s), `${q.id} → ${s}`);
});

test("duplicate ids are refused", () => {
  const dup: RawKbChunks = { ...raw, core: { ...raw.core, patterns: { ...raw.core.patterns, items: [...raw.core.patterns.items, raw.core.patterns.items[0]!] } } };
  assert.throws(() => indexKnowledgeBase(dup), (e: unknown) => e instanceof KbError && e.code === "index-invalid" && /duplicate pattern/.test(e.message));
});

test("a pattern that lists a formula missing from the bundle is refused", () => {
  const pruned: RawKbChunks = { ...raw, formulas: { items: raw.formulas.items.filter((f) => f.id !== "F_SIJUNZI") } };
  assert.throws(() => indexKnowledgeBase(pruned), (e: unknown) => e instanceof KbError && /F_SIJUNZI/.test(e.message));
});

test("a bundle without herb records indexes (release profile)", () => {
  const noHerbs: RawKbChunks = { ...raw, herbs: null };
  assert.equal(indexKnowledgeBase(noHerbs).herbs, null);
});

test("another schema version is refused", () => {
  assert.throws(() => indexKnowledgeBase({ ...raw, schemaVersion: 2 }), (e: unknown) => e instanceof KbError && e.code === "schema-mismatch");
});

// ── loader ──────────────────────────────────────────────────────────────────
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");

function serve(overrides: { manifest?: Partial<Manifest>; corrupt?: string; missing?: string } = {}) {
  const bodies: Record<string, string> = {
    "core.json": JSON.stringify(raw.core), "formulas.json": JSON.stringify(raw.formulas), "herbs.json": JSON.stringify(raw.herbs), "citations.json": JSON.stringify(raw.citations),
  };
  const ref = (file: string) => ({ file, sha256: sha(bodies[file]!), bytes: bodies[file]!.length });
  const manifest: Manifest = {
    schema: 1, version: "v-test", profile: "dev",
    chunks: { core: ref("core.json"), formulas: ref("formulas.json"), herbs: ref("herbs.json"), citations: ref("citations.json") }, ...overrides.manifest,
  };
  const requested: string[] = [];
  const fakeFetch = (async (url: string) => {
    const name = url.split("/").pop()!;
    requested.push(name);
    if (name === overrides.missing) return new Response("nope", { status: 404 });
    if (name === "manifest.json") return new Response(JSON.stringify(manifest));
    const body = name === overrides.corrupt ? bodies[name]!.replace("脾", "X") : bodies[name]!;
    return new Response(body);
  }) as unknown as typeof fetch;
  return { fakeFetch, requested };
}

test("the loader fetches the manifest and every chunk, verifies hashes and indexes", async () => {
  const { fakeFetch, requested } = serve();
  const loaded = await loadKnowledgeBase({ baseUrl: "/kb/", fetch: fakeFetch });
  assert.equal(loaded.version, "v-test");
  assert.equal(loaded.patterns.length, 23);
  assert.deepEqual([...requested].sort(), ["citations.json", "core.json", "formulas.json", "herbs.json", "manifest.json"]);
});

test("the loader refuses a schema-version mismatch before fetching any chunk", async () => {
  const { fakeFetch, requested } = serve({ manifest: { schema: 2 } });
  await assert.rejects(loadKnowledgeBase({ baseUrl: "/kb", fetch: fakeFetch }), (e: unknown) => e instanceof KbError && e.code === "schema-mismatch");
  assert.deepEqual(requested, ["manifest.json"]);
});

test("the loader detects a corrupted chunk", async () => {
  const { fakeFetch } = serve({ corrupt: "core.json" });
  await assert.rejects(loadKnowledgeBase({ baseUrl: "/kb", fetch: fakeFetch }), (e: unknown) => e instanceof KbError && e.code === "chunk-hash-mismatch");
});

test("the loader reports a missing chunk", async () => {
  const { fakeFetch } = serve({ missing: "formulas.json" });
  await assert.rejects(loadKnowledgeBase({ baseUrl: "/kb", fetch: fakeFetch }), (e: unknown) => e instanceof KbError && e.code === "chunk-missing");
});

test("the loader rejects an invalid manifest", async () => {
  const fakeFetch = (async () => new Response(JSON.stringify({ hello: "world" }))) as unknown as typeof fetch;
  await assert.rejects(loadKnowledgeBase({ baseUrl: "/kb", fetch: fakeFetch }), (e: unknown) => e instanceof KbError && e.code === "manifest-invalid");
});
