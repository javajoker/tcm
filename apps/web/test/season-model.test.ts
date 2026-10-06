// @vitest-environment node
// The season model, declared (docs/post-mvp/design/five-phase-extensions.md §7; task PM-29), in the app's logic: a release declares one model and offers no switch, the development profile can try the other, a
// result made with it is stamped and starts a series of its own, a saved result is proved genuine on the model in its stamp, and the way the season was counted is told at the foot of the practitioner summary
// and in the summary file — which, with its schema, stays valid.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as engine from "@tcm/engine";
import { createI18n } from "@tcm/i18n";
import { indexKnowledgeBase, type KnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { makeReplay } from "../src/app/backupReplay.ts";
import { effectiveSeasonModel } from "../src/app/seasons.ts";
import { catalogs, type MessageKey } from "../src/i18n/catalogs.ts";
import { summaryData } from "../src/screens/result/summaryData.ts";
import { defaultOptions, summaryFile } from "../src/screens/result/summaryFile.ts";
import { seasonsSentence } from "../src/screens/result/summaryModel.ts";
import { backupPrefs, validatePrefs } from "../src/storage/backup/index.ts";
import { parsePrefs, serializePrefs } from "../src/storage/prefs.ts";
import { DEFAULT_PREFS, SEASON_MODELS, type SavedAssessment } from "../src/storage/types.ts";
import { interview } from "./interview.ts";

const dev = indexKnowledgeBase(rawChunksFromDisk("dev"));
const release = indexKnowledgeBase(rawChunksFromDisk("release"));
const JULY = Date.UTC(2026, 6, 10, 12);          // 長夏 has begun; the days of 土 before 立秋 have not
const NOW = Date.UTC(2026, 9, 5, 12);
const tOf = (lang: "en" | "zh-Hant") => createI18n<MessageKey>({ ...catalogs, "zh-Hans": {} }, lang);
const GENERATED = join(import.meta.dirname, ".generated", "summaries");

const made = (kb: KnowledgeBase, id: string, seasons?: "south" | "off", model?: "changxia" | "tuwang18", at = JULY): SavedAssessment => {
  const draft = interview(kb, "SP1");
  return toSaved(draft, engine.assess(kb, assessInputOf(draft, at, seasons, model)!), { id, lang: "en" });
};

describe("which model is in force", () => {
  it("a release declares the first model, whatever the preferences say; the development profile uses the one chosen there", () => {
    for (const model of SEASON_MODELS) expect(effectiveSeasonModel({ seasonModel: model }, false), `release, ${model}`).toBe("changxia");
    expect(effectiveSeasonModel({}, false)).toBe("changxia");
    expect(effectiveSeasonModel({}, true)).toBe("changxia");
    expect(effectiveSeasonModel({ seasonModel: "tuwang18" }, true)).toBe("tuwang18");
    expect(effectiveSeasonModel({ seasonModel: "changxia" }, true)).toBe("changxia");
  });
  it("the preference is kept when it is one of the two and ignored otherwise", () => {
    for (const v of SEASON_MODELS) expect(parsePrefs(serializePrefs({ ...DEFAULT_PREFS, seasonModel: v })).seasonModel).toBe(v);
    expect(parsePrefs(JSON.stringify({ theme: "dark", seasonModel: "tuwang" })).seasonModel).toBeUndefined();
    expect("seasonModel" in parsePrefs(null)).toBe(false);
  });
  it("it never travels in a backup, and a backup that carries one does not bring it in", () => {
    expect("seasonModel" in backupPrefs({ ...DEFAULT_PREFS, seasonModel: "tuwang18" })).toBe(false);
    const v = validatePrefs({ theme: "light", textScale: 1, autoAdvance: true, seasonModel: "tuwang18" });
    expect(v.ok && "seasonModel" in v.value).toBe(false);
  });
});

describe("a result made with the other model", () => {
  it("is built from the draft with the model only when it is not the default", () => {
    const draft = interview(dev, "SP1");
    expect(assessInputOf(draft, NOW)!.options).toEqual({ now: NOW, birthModule: false });
    expect(assessInputOf(draft, NOW, undefined, "changxia")!.options).toEqual({ now: NOW, birthModule: false });
    expect(assessInputOf(draft, NOW, undefined, "tuwang18")!.options).toEqual({ now: NOW, birthModule: false, seasonModel: "tuwang18" });
    expect(assessInputOf(draft, NOW, "south", "tuwang18")!.options).toEqual({ now: NOW, birthModule: false, seasons: "south", seasonModel: "tuwang18" });
  });
  it("is stamped, and its parameter stamp ends with the model, so it starts a series of its own", () => {
    const a = made(dev, "r0000000000000001");
    const b = made(dev, "r0000000000000002", undefined, "tuwang18");
    expect([a.seasonModel, b.seasonModel]).toEqual(["changxia", "tuwang18"]);
    expect(a.paramsFingerprint.endsWith("+tuwang18")).toBe(false);
    expect(b.paramsFingerprint).toBe(`${a.paramsFingerprint}+tuwang18`);
    expect(b.paramsFingerprint).toBe(b.result.meta.paramsFingerprint);
  });
});

describe("proving a result genuine by making it again", () => {
  const replay = (kb: KnowledgeBase) => makeReplay(kb, engine);
  it("a result of the other model is replayed on it, in both profiles — not on the one this device would use", () => {
    for (const kb of [dev, release]) for (const seasons of [undefined, "south", "off"] as const) {
      expect(replay(kb)(made(kb, "r1000000000000001", seasons, "tuwang18")), `${kb.profile} ${seasons}`).toBe("same");
      expect(replay(kb)(made(kb, "r1000000000000002", seasons)), `${kb.profile} ${seasons}, the default`).toBe("same");
    }
  });
  it("a result whose model was changed afterwards is no longer genuine: the model cannot be edited away", () => {
    const s = made(dev, "r2000000000000001", undefined, "tuwang18");
    const other = { ...s, seasonModel: "changxia", result: { ...s.result, meta: { ...s.result.meta, seasonModel: "changxia" } } } as unknown as SavedAssessment;
    expect(replay(dev)(other)).not.toBe("same");
  });
});

describe("how the season was counted, told at the foot of the summary", () => {
  const en = tOf("en");
  it("names the model and the basis in each of the cases", () => {
    expect(seasonsSentence(made(dev, "r3000000000000001"), en)).toBe("Seasons: late summer counted as a season of its own (northern calendar).");
    expect(seasonsSentence(made(dev, "r3000000000000002", undefined, "tuwang18"), en)).toBe("Seasons: the earth phase on the last 18 days before each change of season (northern calendar).");
    expect(seasonsSentence(made(dev, "r3000000000000003", "south"), en)).toBe("Seasons: late summer counted as a season of its own (southern hemisphere).");
    expect(seasonsSentence(made(dev, "r3000000000000004", "off"), en)).toBe("Seasons were left out of this result.");
  });
  it("is in Traditional Chinese too", () => {
    const zh = tOf("zh-Hant");
    expect(seasonsSentence(made(dev, "r3000000000000005"), zh)).toBe("時令：長夏單獨算作一個季節（北半球曆法）。");
    expect(seasonsSentence(made(dev, "r3000000000000006", "off"), zh)).toBe("此結果未計入季節。");
  });
  it("is empty for a result with no five-phase reference", () => {
    const s = made(dev, "r3000000000000007");
    expect(seasonsSentence({ ...s, result: { ...s.result, reference: null } }, en)).toBe("");
  });
});

describe("the summary file", () => {
  const file = (kb: KnowledgeBase, saved: SavedAssessment) => summaryFile(summaryData(saved, kb), saved, kb, defaultOptions(NOW, "en"), tOf);
  const from = (f: Record<string, unknown>): Record<string, string> => f["exportedFrom"] as Record<string, string>;

  it("says which model the season was counted by, and the basis when it is not the northern calendar; and it stays inside its schema", () => {
    mkdirSync(GENERATED, { recursive: true });
    const cases: [string, SavedAssessment, Record<string, string>][] = [
      ["default", made(dev, "r4000000000000001"), { seasonModel: "changxia" }],
      ["other-model", made(dev, "r4000000000000002", undefined, "tuwang18"), { seasonModel: "tuwang18" }],
      ["south", made(dev, "r4000000000000003", "south"), { seasonModel: "changxia", seasons: "south" }],
      ["south-other-model", made(dev, "r4000000000000004", "south", "tuwang18"), { seasonModel: "tuwang18", seasons: "south" }],
      ["no-seasons", made(dev, "r4000000000000005", "off"), { seasons: "off" }],
    ];
    for (const [label, saved, want] of cases) {
      const f = file(dev, saved);
      const e = from(f);
      expect({ seasonModel: e["seasonModel"], seasons: e["seasons"] }, label).toEqual({ seasonModel: undefined, seasons: undefined, ...want });
      expect(Object.keys(e).sort(), label).toEqual(["appVersion", "engineVersion", "kbVersion", "paramsFingerprint", "profile", ...Object.keys(want)].sort());
      writeFileSync(join(GENERATED, `season-${label}.json`), `${JSON.stringify(f, null, 2)}\n`);          // the Python schema test validates every file written here
    }
  });
  it("a release file says the same, and a result with no reference says nothing about seasons", () => {
    expect(from(file(release, made(release, "r4000000000000006")))["seasonModel"]).toBe("changxia");
    const s = made(dev, "r4000000000000007");
    const none = from(file(dev, { ...s, result: { ...s.result, reference: null } }));
    expect(none["seasonModel"]).toBeUndefined();
    expect(none["seasons"]).toBeUndefined();
  });
});
