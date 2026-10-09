// Integration: scripts/bundle-data.ts writes a bundle that loadKnowledgeBase can load, for both profiles.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { KbError, loadKnowledgeBase, shardOf } from "../src/index.ts";
import type { Manifest } from "../src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function bundle(args: string[], env: Record<string, string> = {}): { dir: string; manifest: Manifest; stdout: string } {
  const dir = mkdtempSync(join(tmpdir(), "kb-"));
  const stdout = execFileSync("node", [join(root, "scripts", "bundle-data.ts"), "--out", dir, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
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

// ── the herb browser (PM-24) ────────────────────────────────────────────────────────────────────────

/** A network over a bundle's files that records what was asked for, and can serve a file with a byte changed. */
function network(dir: string): { fetch: typeof fetch; asked: string[]; damaged: Set<string> } {
  const asked: string[] = [];
  const damaged = new Set<string>();
  const f = (async (url: string) => {
    const name = url.split("/").pop()!;
    asked.push(name);
    try {
      const bytes = readFileSync(join(dir, name));
      if (damaged.has(name)) bytes[bytes.length - 2] = bytes[bytes.length - 2]! ^ 1;
      return new Response(bytes);
    } catch { return new Response("missing", { status: 404 }); }
  }) as unknown as typeof fetch;
  return { fetch: f, asked, damaged };
}
const BETA = { APP_DRAFT_LABEL: "on" };

test("a public build has no herb browser; the closed beta and the dev build have all 703 herbs", async () => {
  const pub = bundle(["--profile", "release"], { APP_DRAFT_LABEL: "off" });
  assert.equal(pub.manifest.herbBrowser, undefined);
  assert.equal(pub.manifest.variants?.["zh-Hans"]?.herbs, undefined);
  assert.equal(readdirSync(pub.dir).filter((f) => f.includes("herbs-")).length, 0);
  assert.match(pub.stdout, /no herb browser/);
  assert.equal((await loadKnowledgeBase({ baseUrl: "/kb", fetch: network(pub.dir).fetch })).herbBrowser, null);

  for (const [profile, env] of [["release", BETA], ["dev", {}]] as const) {
    const b = bundle(["--profile", profile], env);
    assert.equal(b.manifest.herbBrowser?.count, 703, profile);
    assert.equal(Object.keys(b.manifest.herbBrowser!.shards).length, 16, profile);
    assert.match(b.stdout, /703 herbs in 17 browser files/);
    assert.ok((b.manifest.variants?.["zh-Hans"]?.herbs?.index.strings ?? 0) > 1000, "a Simplified list for the index, with its strings");
    for (const ref of [b.manifest.herbBrowser!.index, ...Object.values(b.manifest.herbBrowser!.shards)]) assert.match(ref.file, /^herbs-(index|[0-9a-f])\.[0-9a-f]{10}\.json$/);
    assert.equal((await loadKnowledgeBase({ baseUrl: "/kb", fetch: network(b.dir).fetch })).herbBrowser?.count, 703);
  }
});

test("the herb browser is not part of the knowledge-base version, so a herb page changing marks no saved result as old", () => {
  const { manifest } = bundle(["--profile", "release"], BETA);
  assert.ok(manifest.herbBrowser);
  // the version is the hash of the profile, the schema and the hashes of the chunks that results depend on (the reference for learners and practitioners among them) — recomputed
  // here without a single herb file or display list
  const expected = createHash("sha256").update([manifest.profile, manifest.schema, ...Object.values(manifest.chunks).map((r) => r.sha256), ...(manifest.reference ? [manifest.reference.sha256] : [])].join("|")).digest("hex").slice(0, 12);
  assert.equal(manifest.version, expected);
  const again = bundle(["--profile", "release"], BETA);
  assert.equal(again.manifest.version, manifest.version, "deterministic");
});

test("nothing of the herb browser is fetched with the knowledge base; a list asks for the index, a page for its one shard, each once", async () => {
  const { dir } = bundle(["--profile", "release"], BETA);
  const net = network(dir);
  const kb = await loadKnowledgeBase({ baseUrl: "/kb", fetch: net.fetch });
  assert.deepEqual(net.asked.filter((f) => f.includes("herbs-")), []);
  const rows = await kb.herbBrowser!.rows();
  assert.equal(rows.length, 703);
  assert.deepEqual(net.asked.filter((f) => f.includes("herbs-")).map((f) => f.replace(/\.[0-9a-f]{10}\.json$/, "")), ["herbs-index"]);
  const detail = await kb.herbBrowser!.detail("baibiandou");
  assert.equal(detail?.name["zh-Hant"], "白扁豆");
  assert.equal(detail?.caution, null);
  assert.deepEqual(net.asked.filter((f) => f.includes("herbs-")).map((f) => f.replace(/\.[0-9a-f]{10}\.json$/, "")), ["herbs-index", `herbs-${shardOf("baibiandou")}`]);
  await kb.herbBrowser!.detail("baibiandou");
  await kb.herbBrowser!.rows();
  assert.equal(net.asked.filter((f) => f.includes("herbs-")).length, 2, "kept once it came");
  assert.equal(await kb.herbBrowser!.detail("no-such-herb"), undefined);
});

test("a herb file that does not match its hash is refused, and asked for again later", async () => {
  const { dir } = bundle(["--profile", "release"], BETA);
  const net = network(dir);
  const kb = await loadKnowledgeBase({ baseUrl: "/kb", fetch: net.fetch });
  const shardFile = readdirSync(dir).find((f) => f.startsWith(`herbs-${shardOf("baibiandou")}.`))!;
  net.damaged.add(shardFile);
  await assert.rejects(kb.herbBrowser!.detail("baibiandou"), (e: unknown) => e instanceof KbError && e.code === "chunk-hash-mismatch");
  const indexFile = readdirSync(dir).find((f) => f.startsWith("herbs-index."))!;
  net.damaged.add(indexFile);
  await assert.rejects(kb.herbBrowser!.rows(), (e: unknown) => e instanceof KbError && e.code === "chunk-hash-mismatch");
  net.damaged.clear();
  assert.equal((await kb.herbBrowser!.detail("baibiandou"))?.slug, "baibiandou");
  assert.equal((await kb.herbBrowser!.rows()).length, 703);
});

test("a manifest whose herb entry is malformed is refused before anything is fetched", async () => {
  const { dir, manifest } = bundle(["--profile", "release"], BETA);
  const bad = { ...manifest, herbBrowser: { count: 3, index: { file: 5 }, shards: {} } };
  const net = network(dir);
  const fetched = (async (url: string) => (url.endsWith("manifest.json") ? new Response(JSON.stringify(bad)) : net.fetch(url))) as unknown as typeof fetch;
  await assert.rejects(loadKnowledgeBase({ baseUrl: "/kb", fetch: fetched }), (e: unknown) => e instanceof KbError && e.code === "manifest-invalid");
  assert.deepEqual(net.asked, []);
});

test("Simplified: a herb name gets its Simplified form once the file that holds it has come, verified against its own list", async () => {
  const { dir, manifest } = bundle(["--profile", "release"], BETA);
  const dictionary = (JSON.parse(readFileSync(join(root, "scripts", "i18n", "zh-Hans.dictionary.json"), "utf8")) as { entries: Record<string, string> }).entries;
  const herbs = (JSON.parse(readFileSync(join(root, "data", "herbs", "herbs.json"), "utf8")) as { items: { slug: string; status: string; name: { "zh-Hant": string } }[] }).items;
  const net = network(dir);
  const errors: string[] = [];
  const kb = await loadKnowledgeBase({ baseUrl: "/kb", fetch: net.fetch, script: "Hans", onDisplayError: (e) => errors.push(e.message) });
  assert.equal(kb.script, "Hans");
  const only = herbs.find((h) => h.status === "derived" && dictionary[h.name["zh-Hant"]] !== h.name["zh-Hant"] && kb.zh(h.name["zh-Hant"]) === h.name["zh-Hant"])!;
  assert.ok(only, "a herb whose name differs in Simplified and is not already known from the knowledge base");
  const simplified = dictionary[only.name["zh-Hant"]]!;
  assert.equal(kb.zh(only.name["zh-Hant"]), only.name["zh-Hant"], "not yet");
  await kb.herbBrowser!.rows();
  assert.equal(kb.zh(only.name["zh-Hant"]), simplified);
  assert.deepEqual(errors, []);
  assert.equal(net.asked.some((f) => f.startsWith("hans-herbs-index.")), true);
  const detail = await kb.herbBrowser!.detail(only.slug);
  assert.equal(detail?.name["zh-Hant"], only.name["zh-Hant"], "the data stays what it is");
  assert.equal(net.asked.some((f) => f.startsWith(`hans-herbs-${shardOf(only.slug)}.`)), true);
  assert.ok(manifest.variants?.["zh-Hans"]?.herbs?.shards[shardOf(only.slug)]);
});

test("Simplified: a herb list that does not match its chunk is reported and the names stay as they are", async () => {
  const { dir, manifest } = bundle(["--profile", "release"], BETA);
  const net = network(dir);
  const errors: string[] = [];
  const kb = await loadKnowledgeBase({ baseUrl: "/kb", fetch: net.fetch, script: "Hans", onDisplayError: (e) => errors.push(e.code) });
  net.damaged.add(manifest.variants!["zh-Hans"]!.herbs!.index.file);
  await kb.herbBrowser!.rows();
  assert.deepEqual(errors, ["chunk-hash-mismatch"]);
});

// ── the learning book (PM-43) ───────────────────────────────────────────────────────────────────────

test("a public build has no book; the closed beta and the dev build carry its twelve chapters in one file, outside the knowledge-base version", async () => {
  const pub = bundle(["--profile", "release"], { APP_DRAFT_LABEL: "off" });
  assert.equal(pub.manifest.book, undefined);
  assert.equal(readdirSync(pub.dir).filter((f) => f.startsWith("book.")).length, 0);
  assert.match(pub.stdout, /no book/);
  assert.equal((await loadKnowledgeBase({ baseUrl: "/kb", fetch: network(pub.dir).fetch })).book, null);

  for (const [profile, env] of [["release", BETA], ["dev", {}]] as const) {
    const b = bundle(["--profile", profile], env);
    assert.match(b.manifest.book?.file ?? "", /^book\.[0-9a-f]{10}\.json$/, profile);
    assert.equal(b.manifest.book?.chapters.length, 12);
    assert.equal(b.manifest.book?.chapters[0], "model");
    assert.match(b.stdout, /the book in 12 chapters/);
    const expected = createHash("sha256").update([b.manifest.profile, b.manifest.schema, ...Object.values(b.manifest.chunks).map((r) => r.sha256), ...(b.manifest.reference ? [b.manifest.reference.sha256] : [])].join("|")).digest("hex").slice(0, 12);
    assert.equal(b.manifest.version, expected, "the version is made without the book");
    assert.equal(b.manifest.variants?.["zh-Hans"] !== undefined && JSON.stringify(b.manifest.variants).includes("book"), false, "Traditional only: no Simplified list");
  }
});

test("nothing of the book is fetched with the knowledge base; opening it asks for its one file, once; a damaged file is refused and asked for again", async () => {
  const { dir, manifest } = bundle(["--profile", "release"], BETA);
  const net = network(dir);
  const kb = await loadKnowledgeBase({ baseUrl: "/kb", fetch: net.fetch, script: "Hans" });
  assert.deepEqual(net.asked.filter((f) => f.startsWith("book.")), []);
  assert.deepEqual(kb.book?.chapters, manifest.book?.chapters, "the chapters are known without a fetch");
  net.damaged.add(manifest.book!.file);
  await assert.rejects(kb.book!.get(), (e: unknown) => e instanceof KbError && e.code === "chunk-hash-mismatch");
  net.damaged.clear();
  const book = await kb.book!.get();
  assert.equal(book.chapters[1]!.title, "二、系統：平衡與回饋");
  assert.equal(kb.zh(book.chapters[1]!.title), book.chapters[1]!.title, "the book is never converted");
  await kb.book!.get();
  assert.equal(net.asked.filter((f) => f.startsWith("book.")).length, 2, "kept once it came");
});

test("a manifest whose book entry is malformed is refused before anything is fetched", async () => {
  const { dir, manifest } = bundle(["--profile", "release"], BETA);
  for (const book of [{ ...manifest.book, chapters: [] }, { ...manifest.book, chapters: ["Model"] }, { ...manifest.book, chapters: ["model", "model"] }, { chapters: ["model"] }]) {
    const net = network(dir);
    const fetched = (async (url: string) => (url.endsWith("manifest.json") ? new Response(JSON.stringify({ ...manifest, book })) : net.fetch(url))) as unknown as typeof fetch;
    await assert.rejects(loadKnowledgeBase({ baseUrl: "/kb", fetch: fetched }), (e: unknown) => e instanceof KbError && e.code === "manifest-invalid", JSON.stringify(book).slice(0, 60));
    assert.deepEqual(net.asked, []);
  }
});

test("the reference for learners and practitioners: none in a public build or the dev build; one file in the closed beta, part of the knowledge-base version, with its own Simplified list", async () => {
  for (const [env, profile] of [[{ APP_DRAFT_LABEL: "off" }, "release"], [{}, "dev"]] as const) {
    const b = bundle(["--profile", profile], env);
    assert.equal(b.manifest.reference, undefined, profile);
    assert.equal(readdirSync(b.dir).filter((f) => f.startsWith("reference.")).length, 0, profile);
    assert.match(b.stdout, /no reference/);
    assert.deepEqual((await loadKnowledgeBase({ baseUrl: "/kb", fetch: network(b.dir).fetch })).roles, [], profile);
  }
  const beta = bundle(["--profile", "release"], BETA);
  assert.match(beta.manifest.reference?.file ?? "", /^reference\.[0-9a-f]{10}\.json$/);
  assert.deepEqual(beta.manifest.reference?.roles, ["learner", "practitioner"]);
  assert.match(beta.manifest.variants?.["zh-Hans"]?.reference?.file ?? "", /^hans-reference\.[0-9a-f]{10}\.txt$/);
  assert.match(beta.stdout, /a reference for learners and practitioners \(33 formulas, 94 herb records\)/);
  const without = createHash("sha256").update([beta.manifest.profile, beta.manifest.schema, ...Object.values(beta.manifest.chunks).map((r) => r.sha256)].join("|")).digest("hex").slice(0, 12);
  assert.notEqual(beta.manifest.version, without, "the reference changes what a role's result says: it is part of the version");
  assert.equal(beta.manifest.chunks.herbs, undefined, "no herb records with the general chunks");
});

test("nothing of the reference is fetched with the knowledge base; a role asks for its file and its Simplified list once; a damaged file is refused and asked for again", async () => {
  const { dir, manifest } = bundle(["--profile", "release"], BETA);
  const net = network(dir);
  const kb = await loadKnowledgeBase({ baseUrl: "/kb", fetch: net.fetch, script: "Hans" });
  assert.deepEqual(net.asked.filter((f) => f.includes("reference")), []);
  assert.deepEqual(kb.roles, ["learner", "practitioner"], "the roles are known without a fetch");
  net.damaged.add(manifest.reference!.file);
  await assert.rejects(kb.forRole("learner"), (e: unknown) => e instanceof KbError && e.code === "chunk-hash-mismatch");
  net.damaged.clear();
  const learner = await kb.forRole("learner");
  assert.equal(learner.formulas.size, 33);
  assert.equal(learner.script, "Hans");
  const mahuang = learner.formulas.get("F_MAHUANG")!;
  assert.equal(learner.zh(mahuang.name["zh-Hant"]), "麻黄汤", "a formula only the reference holds is shown in Simplified");
  await kb.forRole("learner");
  await kb.forRole("practitioner");
  assert.equal(net.asked.filter((f) => f.startsWith("reference.")).length, 3, "the damaged try, then once per role");
  assert.equal(net.asked.filter((f) => f.startsWith("hans-reference.")).length, 2);
});

test("a manifest whose reference entry is malformed is refused before anything is fetched", async () => {
  const { dir, manifest } = bundle(["--profile", "release"], BETA);
  for (const reference of [{ ...manifest.reference, roles: [] }, { ...manifest.reference, roles: ["doctor"] }, { ...manifest.reference, roles: ["learner", "learner"] }, { roles: ["learner"] }]) {
    const net = network(dir);
    const fetched = (async (url: string) => (url.endsWith("manifest.json") ? new Response(JSON.stringify({ ...manifest, reference })) : net.fetch(url))) as unknown as typeof fetch;
    await assert.rejects(loadKnowledgeBase({ baseUrl: "/kb", fetch: fetched }), (e: unknown) => e instanceof KbError && e.code === "manifest-invalid", JSON.stringify(reference).slice(0, 60));
    assert.deepEqual(net.asked, []);
  }
});

test("APP_DOSE_DISPLAY narrows who reads with the study reference: off builds none, roles builds it and says so in the profile, a widening or an unknown value fails the build", () => {
  const off = bundle(["--profile", "release"], { ...BETA, APP_DOSE_DISPLAY: "off" });
  assert.equal(off.manifest.reference, undefined);
  assert.equal(readdirSync(off.dir).filter((f) => f.includes("reference.")).length, 0);
  assert.match(off.stdout, /no reference/);
  const roles = bundle(["--profile", "release"], { ...BETA, APP_DOSE_DISPLAY: "roles" });
  assert.ok(roles.manifest.reference);
  const core = JSON.parse(readFileSync(join(roles.dir, roles.manifest.chunks.core.file), "utf8")) as { config: { profile: { dose_display: string } } };
  assert.equal(core.config.profile.dose_display, "roles");
  const all = bundle(["--profile", "release"], { ...BETA, APP_DOSE_DISPLAY: "all" });
  assert.equal((JSON.parse(readFileSync(join(all.dir, all.manifest.chunks.core.file), "utf8")) as typeof core).config.profile.dose_display, "all");
  for (const value of ["everyone", "ALL"]) assert.throws(() => bundle(["--profile", "release"], { ...BETA, APP_DOSE_DISPLAY: value }), /invalid value/, value);
  // an empty value is no value
  assert.ok(bundle(["--profile", "release"], { ...BETA, APP_DOSE_DISPLAY: "" }).manifest.reference);
});
