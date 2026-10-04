// The treatment guidance (K-11) as the app sees it: the core chunk carries the engine's part, the guidance chunk the texts, and the indexer merges them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { indexKnowledgeBase } from "../src/index.ts";
import { rawChunksFromDisk } from "../node/fromDisk.ts";

const raw = rawChunksFromDisk("release");
const kb = indexKnowledgeBase(raw);

test("the core chunk holds no guidance text; the guidance chunk holds all of it", () => {
  const core = raw.core.treatment as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(core).sort(), ["_meta", "acupoints", "food_pregnancy_caution", "general"], "no diet entries, acupressure notes or lifestyle lines in core");
  for (const a of Object.values(core.acupoints as Record<string, object>)) assert.deepEqual(Object.keys(a).sort(), ["code", "meridian", "pregnancy_avoid", "status"], "no location or cautions in core");
  assert.ok(Object.keys(raw.guidance.acupoints).length === Object.keys(raw.core.treatment.acupoints).length);
  assert.ok(Object.keys(raw.guidance.foods).length >= 47);
});

test("every point, food and lifestyle line a pattern refers to has bilingual text, a pregnancy flag and a status", () => {
  for (const p of kb.patterns) {
    for (const a of p.treatment.acupoints) {
      const pt = kb.treatment.acupoints[a];
      assert.ok(pt, `${p.id}: ${a}`);
      assert.ok(pt.location["zh-Hant"].length > 10 && pt.location.en.length > 10, `${a}: location in both languages`);
      assert.equal(typeof pt.pregnancy_avoid, "boolean");
      assert.equal(pt.status, "draft");
      if (pt.pregnancy_avoid) assert.ok(pt.cautions.some((c) => /pregnan/i.test(c.en) && /懷孕/.test(c["zh-Hant"])), `${a}: a pregnancy caution in both languages`);
    }
    for (const f of p.treatment.foods) {
      const food = kb.treatment.foods[f];
      assert.ok(food, `${p.id}: ${f}`);
      assert.ok(food.rationale["zh-Hant"] && food.rationale.en, `${f}: rationale in both languages`);
      assert.ok(food.nature && food.flavors.length > 0, `${f}: nature and flavours`);
      assert.equal(food.pregnancy_caution, kb.treatment.food_pregnancy_caution.includes(f), `${f}: the flag matches the list`);
      assert.ok(food.citations.length > 0 && food.citations.every((c) => kb.citation(c)), `${f}: citations resolve`);
    }
    const life = kb.treatment.lifestyle[p.id];
    assert.ok(life && life.en && life["zh-Hant"] === p.treatment.lifestyle, `${p.id}: lifestyle`);
  }
});

test("a food that is also a herb takes its nature, flavours and functions from the herb record; the others say textbook", () => {
  const yam = kb.treatment.foods["山藥"]!;
  assert.deepEqual([yam.herb, yam.basis, yam.nature, yam.flavors], ["herb-shangyao", "pharmacopoeia", "平", ["甘"]]);
  assert.deepEqual(yam.functions, ["補脾養胃", "生津益肺", "補腎澀精"]);
  assert.match(yam.rationale["zh-Hant"], /傳統功效：補脾養胃、生津益肺、補腎澀精/);
  const millet = kb.treatment.foods["小米"]!;
  assert.deepEqual([millet.herb, millet.basis, millet.functions], [null, "textbook", []]);
});

test("foods with pregnancy cautions in their herb record are flagged, including the cinnamon", () => {
  for (const name of ["薏仁", "山楂", "桂圓", "黑木耳（少量）", "少量肉桂"]) assert.equal(kb.treatment.foods[name]!.pregnancy_caution, true, name);
  assert.equal(kb.treatment.foods["山藥"]!.pregnancy_caution, false);
});

test("the general acupressure notes say how to press and when to stop, in both languages", () => {
  const a = kb.treatment.acupressure;
  assert.ok(a.how["zh-Hant"] && a.how.en && a.cautions.length >= 3);
  assert.ok(a.cautions.some((c) => /stop|Stop/.test(c.en)));
});

test("the merged view needs the guidance of every point", () => {
  const damaged = { ...raw, guidance: { ...raw.guidance, acupoints: Object.fromEntries(Object.entries(raw.guidance.acupoints).slice(1)) } };
  assert.throws(() => indexKnowledgeBase(damaged), /has no guidance text/);
});
