// The English rendering of the Chinese-only prose (K-13): present everywhere the UI shows that prose, recorded as a machine draft, and free of Chinese.
import assert from "node:assert/strict";
import { test } from "node:test";
import { indexKnowledgeBase } from "../src/index.ts";
import { rawChunksFromDisk } from "../node/fromDisk.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("release"));
const dev = indexKnowledgeBase(rawChunksFromDisk("dev"));
const HAN = /[㐀-鿿]/;

test("every pattern has an English principle and tongue/pulse note, a machine-draft status, and no Chinese in them", () => {
  for (const p of kb.patterns) {
    assert.ok(p.principle_en.length > 8 && p.tongue_pulse_note_en.length > 8, p.id);
    assert.equal(p.en_status, "machine-draft", `${p.id}: nothing is reviewed before the linguistic review`);
    assert.ok(!HAN.test(p.principle_en) && !HAN.test(p.tongue_pulse_note_en), `${p.id}: Chinese in the English`);
  }
});

test("every formula has English principle, rationale and one caution per Chinese caution", () => {
  for (const f of [...kb.formulas.values(), ...dev.formulas.values()]) {
    assert.ok(f.principle_en && f.rationale_en.length > 60, f.id);
    assert.equal(f.cautions_en.length, f.cautions.length, `${f.id}: cautions`);
    assert.equal(f.en_status, "machine-draft");
    for (const t of [f.principle_en, f.rationale_en, ...f.cautions_en]) assert.ok(!HAN.test(t), `${f.id}: Chinese in the English`);
  }
});

test("the general regimen has an English text with the draft status", () => {
  assert.ok(kb.treatment.general.text_en.length > 100);
  assert.equal(kb.treatment.general.en_status, "machine-draft");
});

test("the English keeps what the cautions say about pregnancy and the one dangerous substitution", () => {
  const f = dev.formulas;
  assert.match(f.get("F_XUEFU")!.cautions_en.join(" "), /Forbidden in pregnancy/);
  assert.match(f.get("F_SHENQI")!.cautions_en.join(" "), /forbidden in pregnancy/);
  assert.match(f.get("F_GANLU")!.cautions_en.join(" "), /never guanmutong, which contains aristolochic acid/);
  assert.match(f.get("F_LONGDAN")!.cautions_en.join(" "), /never guanmutong/);
  assert.match(f.get("F_TIANWANG")!.rationale_en, /mercury/);
  assert.match(f.get("F_XUEFU")!.cautions_en.join(" "), /anticoagulant/);
});
