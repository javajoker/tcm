// The Simplified Chinese display lists (docs/post-mvp/design/simplified-chinese.md §5): the helper, the bundler that writes them and the loader that verifies them.
// The data itself is never converted: every test that loads Simplified also compares the data with the Traditional load.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { writeBundle, DICTIONARY_PATH } from "../../../scripts/bundle-data.ts";
import { alignedList, chineseStrings, digestInput, loadKnowledgeBase, newDisplay, parseAligned, type KbError, type Manifest } from "../src/index.ts";

const dictionary = (JSON.parse(readFileSync(DICTIONARY_PATH, "utf8")) as { entries: Record<string, string> }).entries;

function bundle(profile: "release" | "dev", dictionaryPath?: string): { dir: string; manifest: Manifest } {
  const dir = mkdtempSync(join(tmpdir(), "hans-"));
  const r = writeBundle({ profile, out: dir, dictionaryPath });
  return { dir, manifest: r.manifest };
}
const fsFetch = (dir: string, patch?: (name: string, body: Buffer) => Buffer): typeof fetch => (async (url: string) => {
  const name = url.split("/").pop()!;
  try {
    const body = readFileSync(join(dir, name));
    return new Response(patch ? patch(name, body) : body);
  } catch {
    return new Response("missing", { status: 404 });
  }
}) as unknown as typeof fetch;

// ── the helper ──────────────────────────────────────────────────────────────

test("chineseStrings lists the unique Chinese values and keys in code-unit order and nothing else", () => {
  const list = chineseStrings({ b: "腎", "脾": ["肝", "肝", "ascii only"], n: 3, nested: { "陰陽": "yin yang", x: "𠮷" } }, null, "心");
  assert.deepEqual(list, [...new Set(["腎", "脾", "肝", "陰陽", "𠮷", "心"])].sort());
  assert.ok(!list.includes("ascii only"));
});

test("alignedList writes the Simplified form per line, empty where nothing changes, and refuses a gap or a line break", () => {
  const list = ["腎", "脾", "陰陽"];
  assert.equal(alignedList(list, { 腎: "肾", 脾: "脾", 陰陽: "阴阳" }), "肾\n\n阴阳");
  assert.throws(() => alignedList(list, { 腎: "肾", 脾: "脾" }), /no entry/);
  assert.throws(() => alignedList(["a\nb中"], { "a\nb中": "x" }), /line break/);
  assert.throws(() => alignedList(["腎"], { 腎: "肾\n" }), /line break/);
  assert.throws(() => alignedList(["constructor中"], {}), /no entry/, "an object's own keys only");
});

test("parseAligned pairs the lists and an empty line is the string itself; a different length is refused", () => {
  const m = parseAligned(["腎", "脾", "陰陽"], "肾\n\n阴阳");
  assert.equal(m.get("腎"), "肾");
  assert.equal(m.get("脾"), "脾");
  assert.equal(m.get("陰陽"), "阴阳");
  assert.throws(() => parseAligned(["腎", "脾"], "肾"), /1 lines for 2 strings/);
});

test("traditional() turns what was typed in the display script back into the data's own strings", () => {
  const d = newDisplay();
  d.add(["人參", "乾薑", "幹薑", "脾"], "人参\n干姜\n干姜\n");
  assert.deepEqual(d.traditional("人参"), ["人參"]);
  assert.deepEqual(d.traditional("干姜"), ["乾薑", "幹薑"], "two strings of the data share a Simplified form: both are candidates");
  assert.deepEqual(d.traditional("人參"), ["人參"], "text already in the data's script stays");
  assert.deepEqual(d.traditional("脾"), ["脾"]);
  assert.deepEqual(d.traditional("never seen"), ["never seen"]);
});

test("newDisplay converts what it knows and reports Chinese it does not, never non-Chinese text", () => {
  const seen: string[] = [];
  const d = newDisplay((t) => seen.push(t));
  d.add(["腎"], "肾");
  assert.equal(d.zh("腎"), "肾");
  assert.equal(d.zh("心"), "心");
  assert.equal(d.zh("ascii"), "ascii");
  assert.deepEqual(seen, ["心"]);
});

// ── the bundler ─────────────────────────────────────────────────────────────

test("the release bundle writes display lists aligned with its chunks, outside the knowledge-base version", () => {
  const { dir, manifest } = bundle("release");
  const v = manifest.variants?.["zh-Hans"];
  assert.ok(v);
  assert.match(v.main.file, /^hans-main\.[0-9a-f]{10}\.txt$/);
  assert.match(v.cities.file, /^hans-cities\.[0-9a-f]{10}\.txt$/);
  const text = readFileSync(join(dir, v.main.file), "utf8");
  assert.equal(createHash("sha256").update(text).digest("hex"), v.main.sha256);
  assert.equal(text.split("\n").length, v.main.strings);
  // the digest is that of the Chinese strings of exactly the chunks it ships with
  const chunk = (n: "core" | "formulas" | "citations" | "guidance"): unknown => JSON.parse(readFileSync(join(dir, manifest.chunks[n].file), "utf8"));
  const list = chineseStrings(chunk("core"), chunk("formulas"), chunk("citations"), chunk("guidance"));
  assert.equal(list.length, v.main.strings);
  assert.equal(createHash("sha256").update(digestInput(list)).digest("hex"), v.main.digest);
  // editing the dictionary changes the list but not the version that saved results are stamped with
  const edited = join(mkdtempSync(join(tmpdir(), "dict-")), "d.json");
  const entries = { ...dictionary, 腎: "肾！" };
  writeFileSync(edited, JSON.stringify({ entries }));
  const again = bundle("release", edited);
  assert.equal(again.manifest.version, manifest.version);
  assert.notEqual(again.manifest.variants!["zh-Hans"]!.main.sha256, v.main.sha256);
});

test("a Chinese string without a dictionary entry stops the build", () => {
  const trimmed = join(mkdtempSync(join(tmpdir(), "dict-")), "d.json");
  const entries = { ...dictionary };
  delete entries["陰陽"];
  writeFileSync(trimmed, JSON.stringify({ entries }));
  assert.throws(() => bundle("release", trimmed), /no entry in the Simplified dictionary for "陰陽"/);
});

// ── the loader ──────────────────────────────────────────────────────────────

test("a Simplified load gives the same data and a display function; the Traditional load does not fetch the lists", async () => {
  const { dir } = bundle("release");
  const requested: string[] = [];
  const spy = (async (url: string) => { requested.push(url.split("/").pop()!); return fsFetch(dir)(url); }) as unknown as typeof fetch;
  const hant = await loadKnowledgeBase({ baseUrl: "/kb", fetch: spy });
  assert.ok(!requested.some((f) => f.startsWith("hans-")));
  assert.equal(hant.script, "Hant");
  assert.equal(hant.zh("腎"), "腎");

  const hans = await loadKnowledgeBase({ baseUrl: "/kb", fetch: fsFetch(dir), script: "Hans" });
  assert.equal(hans.script, "Hans");
  assert.equal(hans.zh("腎"), "肾");
  assert.equal(hans.zh("脾"), "脾");
  assert.equal(hans.zh("ascii"), "ascii");
  // a herb a person names in Simplified is the herb the safety rules know by its own name
  assert.deepEqual(hans.traditional("人参"), ["人參"]);
  assert.deepEqual(hant.traditional("人参"), ["人参"], "a Traditional session has no reverse lookup");
  // the engine's input is untouched: identical data, Traditional identifiers included
  assert.deepEqual(hans.patterns, hant.patterns);
  assert.deepEqual([...hans.formulas.keys()], [...hant.formulas.keys()]);
  assert.deepEqual(hans.treatment.foods, hant.treatment.foods);
  assert.deepEqual(hans.safety, hant.safety);
  // every quotation shows as its Simplified source text
  const sources = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "data", "citations.json"), "utf8")).items as { id: string; quote_source_zh_hans: string }[];
  for (const s of sources) assert.equal(hans.zh(hans.citation(s.id)!.quote_zh_hant), s.quote_source_zh_hans, s.id);
});

test("the city list brings its own display list when it is opened", async () => {
  const { dir } = bundle("release");
  const requested: string[] = [];
  const spy = (async (url: string) => { requested.push(url.split("/").pop()!); return fsFetch(dir)(url); }) as unknown as typeof fetch;
  const kb = await loadKnowledgeBase({ baseUrl: "/kb", fetch: spy, script: "Hans" });
  assert.ok(!requested.some((f) => f.startsWith("hans-cities")), "not before the picker is opened");
  const { items } = await kb.cities();
  assert.ok(requested.some((f) => f.startsWith("hans-cities")));
  const city = items.find((c) => c.zh !== undefined && dictionary[c.zh] !== c.zh);
  assert.ok(city?.zh, "some city name changes script");
  assert.equal(kb.zh(city.zh), dictionary[city.zh]);
});

test("the dev bundle's display list also covers its herb records", async () => {
  const { dir } = bundle("dev");
  const kb = await loadKnowledgeBase({ baseUrl: "/kb", fetch: fsFetch(dir), script: "Hans" });
  assert.equal(kb.script, "Hans");
  const herb = [...kb.herbs!.values()][0]!;
  assert.equal(kb.zh(herb.name["zh-Hant"]), dictionary[herb.name["zh-Hant"]]);
});

test("a missing, damaged or misaligned display list leaves the data's own script and says so", async () => {
  const { dir, manifest } = bundle("release");
  const errors: string[] = [];
  const note = (e: KbError): void => { errors.push(e.code); };

  // no list in the manifest
  const noVariants = fsFetch(dir, (name, body) => name === "manifest.json" ? Buffer.from(JSON.stringify({ ...manifest, variants: undefined })) : body);
  let kb = await loadKnowledgeBase({ baseUrl: "/kb", fetch: noVariants, script: "Hans", onDisplayError: note });
  assert.equal(kb.script, "Hant");
  assert.equal(kb.zh("腎"), "腎");

  // the list is damaged: its hash no longer matches
  const damaged = fsFetch(dir, (name, body) => name.startsWith("hans-main") ? Buffer.from(body.toString("utf8") + "x") : body);
  kb = await loadKnowledgeBase({ baseUrl: "/kb", fetch: damaged, script: "Hans", onDisplayError: note });
  assert.equal(kb.script, "Hant");

  // the list is intact but belongs to other chunks: the digest differs
  const v = manifest.variants!["zh-Hans"]!;
  const wrongDigest = fsFetch(dir, (name, body) => name === "manifest.json"
    ? Buffer.from(JSON.stringify({ ...manifest, variants: { "zh-Hans": { ...v, main: { ...v.main, digest: "0".repeat(64) } } } })) : body);
  kb = await loadKnowledgeBase({ baseUrl: "/kb", fetch: wrongDigest, script: "Hans", onDisplayError: note });
  assert.equal(kb.script, "Hant");

  assert.deepEqual(errors, ["display-missing", "chunk-hash-mismatch", "display-mismatch"]);
});
