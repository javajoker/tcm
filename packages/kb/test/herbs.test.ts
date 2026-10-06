// The herb browser's data (PM-24): who is in it, how it is encoded, where a herb lives and how the browser reads it.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildHerbBrowser, decodeRow, herbBrowser, HERB_FLAG, HERB_SHARDS, HERB_STATUS, memorySource, shardOf } from "../src/herbs.ts";
import type { Herb, HerbBrowserSource, HerbIndexChunk, HerbShardChunk } from "../src/types.ts";
import { readDataFiles } from "../node/fromDisk.ts";

const herbs = readDataFiles().herbs.items;
const find = (slug: string): Herb => herbs.find((h) => h.slug === slug)!;
const asReviewed = (h: Herb): Herb => ({ ...h, status: "reviewed" });

describe("which herbs", () => {
  test("every herb in the dev profile and in the closed beta; in a public build only those a sample review has covered — none yet, so no browser at all", () => {
    assert.equal(buildHerbBrowser(herbs, { all: true })?.index.count, 703);
    assert.equal(buildHerbBrowser(herbs, { all: false }), null);
    const some = buildHerbBrowser([...herbs.slice(0, 5), asReviewed(find("baibiandou")), asReviewed(find("aidicha"))], { all: false });
    assert.deepEqual(some?.index.rows.map((r) => r[0]).sort(), ["aidicha", "baibiandou"]);
    assert.equal(some && Object.values(some.shards).flatMap((s) => Object.values(s.items)).every((h) => h.status === "reviewed"), true);
  });

  test("an id that is not herb-<slug>, a repeated slug or an unknown status stops the build", () => {
    assert.throws(() => buildHerbBrowser([{ ...find("baibiandou"), id: "herb-other" }], { all: true }), /the id is not herb-baibiandou/);
    assert.throws(() => buildHerbBrowser([find("baibiandou"), find("baibiandou")], { all: true }), /two herbs have the slug/);
    assert.throws(() => buildHerbBrowser([{ ...find("baibiandou"), status: "approved" as Herb["status"] }], { all: true }), /unknown status/);
  });
});

describe("where a herb lives", () => {
  test("the shard is a hex digit, the same every time, and the 703 herbs fall evenly on the sixteen", () => {
    const counts = new Map<string, number>();
    for (const h of herbs) { const k = shardOf(h.slug); assert.match(k, /^[0-9a-f]$/); assert.equal(shardOf(h.slug), k); counts.set(k, (counts.get(k) ?? 0) + 1); }
    assert.equal(counts.size, HERB_SHARDS);
    for (const [k, n] of counts) assert.ok(n >= 20 && n <= 80, `shard ${k} holds ${n} of 703 (an even share is about 44)`);
  });

  test("every herb is in exactly one shard, the one its slug names, and the index lists the same herbs in the data's order", () => {
    const chunks = buildHerbBrowser(herbs, { all: true })!;
    const seen = new Set<string>();
    for (const [key, shard] of Object.entries(chunks.shards)) {
      assert.equal(shard.shard, key);
      for (const slug of Object.keys(shard.items)) { assert.equal(shardOf(slug), key); assert.ok(!seen.has(slug)); seen.add(slug); }
    }
    assert.equal(seen.size, 703);
    assert.deepEqual(chunks.index.rows.map((r) => r[0]), herbs.map((h) => h.slug));
    assert.equal(chunks.index.count, chunks.index.rows.length);
  });
});

describe("the encoding", () => {
  const chunks = buildHerbBrowser(herbs, { all: true })!;
  const rowOf = (slug: string) => decodeRow(chunks.index, chunks.index.rows.find((r) => r[0] === slug)!);

  test("a row says what a list needs, as the data says it", () => {
    const r = rowOf("baibiandou");
    assert.deepEqual({ ...r }, { slug: "baibiandou", name: { "zh-Hant": "白扁豆", en: "White hyacinth bean" }, latin: "Dolichos lablab", category: "補虛藥", nature: ["微溫"], flavors: ["甘"], channels: ["脾", "胃"],
      functions: ["健脾化濕", "和中消暑"], toxic: false, hasCaution: false, hasInteractions: false, pregnancy: "ok-unreviewed", status: "curated-draft" });
  });

  test("the flags, the pregnancy level and the status of every row are the stored ones", () => {
    for (const h of herbs) {
      const row = chunks.index.rows.find((x) => x[0] === h.slug)!;
      const r = decodeRow(chunks.index, row);
      assert.deepEqual([r.toxic, r.hasCaution, r.hasInteractions, r.pregnancy, r.status], [h.toxic, h.caution !== null, h.interactions.length > 0, h.pregnancy, h.status], h.slug);
      assert.equal(row[9], (h.toxic ? HERB_FLAG.toxic : 0) | (h.caution !== null ? HERB_FLAG.caution : 0) | (h.interactions.length > 0 ? HERB_FLAG.interactions : 0));
      assert.equal(HERB_STATUS[row[11]], h.status);
    }
    assert.ok(herbs.some((h) => h.toxic) && herbs.some((h) => h.caution !== null) && herbs.some((h) => h.interactions.length > 0), "the data has each kind of flag, so the loop proves something");
  });

  test("Chinese values are the data's own strings, never joined, so each has its Simplified form; no row carries more than three functions", () => {
    const values = new Set(herbs.flatMap((h) => [h.category, ...h.siqi, ...h.organs, ...h.functions, ...h.flavors.map((f) => f.flavor), h.name["zh-Hant"]]));
    for (const row of chunks.index.rows) {
      assert.ok(values.has(chunks.index.categories[row[4]]!));
      for (const v of [...row[5], ...row[6], ...row[7], ...row[8], row[1]]) assert.ok(values.has(v), `${row[0]}: "${v}" is not a string of the data`);
      assert.ok(row[8].length <= 3);
    }
  });

  test("a detail is self-sufficient and holds no dose, no weights and no repository path", () => {
    const d = Object.values(chunks.shards).flatMap((s) => Object.entries(s.items)).find(([slug]) => slug === "baibiandou")![1];
    assert.deepEqual(Object.keys(d).sort(), ["category", "caution", "channels", "classicalFormulas", "flavors", "functions", "interactions", "latin", "name", "nature", "pregnancy", "slug", "source", "status", "toxic"]);
    assert.deepEqual(d.source, { book: "中國藥典（2025年版）一部", entry: "baibiandou_001" });
    assert.deepEqual(d.classicalFormulas, ["參苓白朮散", "香薷散"]);
    const text = JSON.stringify(chunks);
    for (const word of ["dose_g_reference", "effects", "harms", "temperature", "commit", "TCM-Library", "reference/sources"]) assert.ok(!text.includes(`"${word}"`) && !text.includes(word + "/"), `the browser's files mention ${word}`);
  });

  test("aliases travel with the detail when a herb has them", () => {
    const aliased = herbs.find((h) => h.aliases && h.aliases.length > 0)!;
    assert.deepEqual(Object.values(chunks.shards).flatMap((s) => Object.values(s.items)).find((d) => d.slug === aliased.slug)!.aliases, aliased.aliases);
  });

  test("an index row that does not decode is a damaged chunk, not a wrong list", () => {
    const bad: HerbIndexChunk = { count: 1, categories: ["x"], rows: [["a", "甲", null, null, 7, [], [], [], [], 0, 0, 0]] };
    assert.throws(() => decodeRow(bad, bad.rows[0]!), /the row of a is not valid/);
  });
});

describe("the browser over a source", () => {
  const chunks = buildHerbBrowser(herbs, { all: true })!;
  const counting = (): { source: HerbBrowserSource; calls: string[]; failing: Set<string> } => {
    const mem = memorySource(chunks);
    const calls: string[] = [];
    const failing = new Set<string>();
    const source: HerbBrowserSource = {
      count: mem.count,
      index: () => { calls.push("index"); return failing.has("index") ? Promise.reject(new Error("offline")) : mem.index(); },
      shard: (key) => { calls.push(`shard ${key}`); return failing.has(key) ? Promise.reject(new Error("offline")) : mem.shard(key); },
    };
    return { source, calls, failing };
  };

  test("nothing is asked for until a page asks; then each file once", async () => {
    const { source, calls } = counting();
    const b = herbBrowser(source);
    assert.equal(b.count, 703);
    assert.deepEqual(calls, []);
    const [rows, rows2, cats] = await Promise.all([b.rows(), b.rows(), b.categories()]);
    assert.equal(rows.length, 703);
    assert.equal(rows, rows2);
    assert.ok(cats.includes("補虛藥"));
    assert.deepEqual(calls, ["index"]);
    const d = await b.detail("baibiandou");
    assert.equal(d?.name["zh-Hant"], "白扁豆");
    await b.detail("baibiandou");
    assert.deepEqual(calls, ["index", `shard ${shardOf("baibiandou")}`]);
  });

  test("a page opened by its address needs one shard and not the index", async () => {
    const { source, calls } = counting();
    await herbBrowser(source).detail("aidicha");
    assert.deepEqual(calls, [`shard ${shardOf("aidicha")}`]);
  });

  test("an address that is not a herb is undefined, not an error", async () => {
    const { source } = counting();
    assert.equal(await herbBrowser(source).detail("no-such-herb"), undefined);
  });

  test("a file that failed is asked for again next time, and a good one is kept", async () => {
    const { source, calls, failing } = counting();
    const b = herbBrowser(source);
    failing.add("index");
    failing.add(shardOf("baibiandou"));
    await assert.rejects(b.rows(), /offline/);
    await assert.rejects(b.detail("baibiandou"), /offline/);
    failing.clear();
    assert.equal((await b.rows()).length, 703);
    assert.equal((await b.detail("baibiandou"))?.slug, "baibiandou");
    const before = calls.length;
    await b.rows();
    await b.detail("baibiandou");
    assert.equal(calls.length, before, "kept once it came");
  });

  test("a shard with no herb is an empty one, not an error", async () => {
    const mem = memorySource({ index: chunks.index, shards: {} });
    assert.deepEqual(await mem.shard("3"), { shard: "3", items: {} } satisfies HerbShardChunk);
  });
});
