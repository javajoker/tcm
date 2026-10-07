// The evaluation harness (PM-48): the committed report of the mock run is current; the pipeline's gates hold; the personas and vignettes are what they say; the gateway path over
// HTTP gives the same conversation as the mock in process; the design's lines are judged for a real provider.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { LANGS } from "../../packages/ai/src/index.ts";
import { configFrom } from "../../apps/ai-gateway/src/config.ts";
import { createGateway } from "../../apps/ai-gateway/src/gateway.ts";
import { serve } from "../../apps/ai-gateway/src/node.ts";
import { mockProvider } from "../../apps/ai-gateway/src/provider.ts";
import { converse, evaluate, failures, gatewayTurns, LINES, mockTurns, personas, render, REPORT, type Run } from "./eval.ts";
import { VIGNETTES } from "./vignettes.ts";

const run = await evaluate(mockTurns, "mock");
const traditionalOnly = (JSON.parse(readFileSync(new URL("../i18n/zh-Hans.dictionary.json", import.meta.url), "utf8")) as { _meta: { traditionalOnly: string } })._meta.traditionalOnly;

test("the committed report is what the mock run gives", () => {
  assert.equal(readFileSync(REPORT, "utf8"), render(run), "docs/ai-evaluation-mock.md is stale: run `node scripts/ai/eval.ts --write`");
});

test("the pipeline's gates hold for the mock: every red-flag vignette found, no persona's words re-open the screening, no conversation ends in an error", () => {
  assert.deepEqual(failures(run, false), []);
  for (const s of run.summaries) assert.equal(s.redFlags, 1, s.lang);
});

test("the personas: the 23 typical patients in each language, each finding said in that language; the vignettes: every red flag but the minor's", () => {
  for (const lang of LANGS) {
    const ps = personas(lang);
    assert.equal(ps.length, 23, lang);
    for (const p of ps) {
      assert.ok(p.present.length >= 3, p.id);
      for (const w of p.words.values()) {
        if (lang === "en") assert.doesNotMatch(w, /\p{Script=Han}/u, `${p.id} ${w}`);
        else assert.match(w, /\p{Script=Han}/u, `${p.id} ${w}`);
        if (lang === "zh-Hans") assert.deepEqual([...w].filter((c) => traditionalOnly.includes(c)), [], `${p.id} ${w}`);
      }
    }
  }
  assert.equal(VIGNETTES.length, 27);
  for (const v of VIGNETTES) assert.deepEqual([...v.text["zh-Hans"]].filter((c) => traditionalOnly.includes(c)), [], v.id);
});

test("over HTTP, through a gateway with the mock, a persona's conversation is the same as in process", async () => {
  const config = configFrom({ AI_SECRET: "s".repeat(40), AI_ALLOWED_ORIGINS: "http://localhost:5173", AI_TURNS_PER_MINUTE: "120" });
  const server = await serve(createGateway({ config, provider: mockProvider, now: () => Date.now(), log: () => undefined }), 0, config.limits.bodyBytes);
  after(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const p = personas("zh-Hant").find((x) => x.pattern === "SP1")!;
  const viaGateway = await converse(p, gatewayTurns(url, "http://localhost:5173", 0));
  const inProcess = await converse(p, mockTurns);
  assert.equal(viaGateway.error, null);
  assert.deepEqual({ ...viaGateway, persona: null }, { ...inProcess, persona: null });
});

test("a real provider is judged on the design's lines; the pipeline's gates hold for every provider", () => {
  const low: Run = { ...run, summaries: run.summaries.map((s) => ({ ...s, recall: LINES.recall - 0.01, precision: LINES.precision - 0.01, leading: LINES.leading - 0.01 })) };
  const f = failures(low, true);
  assert.equal(f.filter((x) => /recall .* below/.test(x)).length, 3);
  assert.equal(f.filter((x) => /precision .* below/.test(x)).length, 3);
  assert.equal(f.filter((x) => /leading pattern .* below/.test(x)).length, 3);
  assert.deepEqual(failures(low, false), [], "the lines are not judged for the mock");
  const missed: Run = { ...run, summaries: run.summaries.map((s) => ({ ...s, redFlags: 26 / 27 })) };
  assert.equal(failures(missed, false).filter((x) => /red-flag vignette/.test(x)).length, 3);
});
