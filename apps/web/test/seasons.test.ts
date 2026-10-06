// @vitest-environment node
// How seasons are counted, in the app (docs/post-mvp/design/five-phase-extensions.md §4.2; task PM-26): the time-zone default, the preference and its backup, the stamp of a result made on another basis,
// and the proof that a southern result — like a northern one — comes out of the engine again exactly as it was made, which is what lets a backup of it be trusted.
import * as engine from "@tcm/engine";
import { ENGINE_VERSION } from "@tcm/engine";
import { indexKnowledgeBase, type KnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { currentOf, makeReplay } from "../src/app/backupReplay.ts";
import { defaultSeasons, effectiveSeasons, isSouthernZone, SOUTHERN_PREFIXES, SOUTHERN_ZONES } from "../src/app/seasons.ts";
import { backupPrefs, validateAssessment, validatePrefs } from "../src/storage/backup/index.ts";
import { trend } from "../src/screens/history/trend.ts";
import { parsePrefs, serializePrefs } from "../src/storage/prefs.ts";
import { DEFAULT_PREFS, SEASON_BASES, type SavedAssessment } from "../src/storage/types.ts";
import { interview } from "./interview.ts";

const dev = indexKnowledgeBase(rawChunksFromDisk("dev"));
const release = indexKnowledgeBase(rawChunksFromDisk("release"));
const MARCH = Date.UTC(2026, 2, 20, 12);

describe("the time zone's suggestion", () => {
  it("every named southern zone is a real IANA zone, and none is listed twice", () => {
    for (const z of SOUTHERN_ZONES) expect(() => new Intl.DateTimeFormat("en", { timeZone: z }), z).not.toThrow();
    expect(new Set(SOUTHERN_ZONES).size).toBe(SOUTHERN_ZONES.length);
  });
  it("a zone of Australia or Argentina is southern by its prefix, a listed one by its name, everything else is northern", () => {
    for (const z of ["Australia/Sydney", "Australia/Perth", "Australia/Lord_Howe", "America/Argentina/Buenos_Aires", "Pacific/Auckland", "Africa/Johannesburg", "America/Sao_Paulo", "America/Santiago"]) expect(isSouthernZone(z), z).toBe(true);
    for (const z of ["Asia/Shanghai", "Asia/Taipei", "Asia/Hong_Kong", "Europe/London", "America/New_York", "Asia/Singapore", "Asia/Jakarta", "Africa/Nairobi", "America/Bogota", "Pacific/Honolulu", "UTC"]) expect(isSouthernZone(z), z).toBe(false);
    expect(SOUTHERN_PREFIXES.every((p) => p.endsWith("/"))).toBe(true);
  });
  it("the default is the southern calendar on a southern zone and the northern one on any other or unknown zone — never `off`", () => {
    expect(defaultSeasons("Australia/Sydney")).toBe("south");
    expect(defaultSeasons("Asia/Taipei")).toBe("north");
    expect(defaultSeasons(null)).toBe("north");
    for (const z of [...SOUTHERN_ZONES, "Australia/Sydney", "Asia/Taipei", "UTC", null]) expect(["north", "south"]).toContain(defaultSeasons(z));
  });
  it("the person's choice wins over the zone, and no choice is the zone's suggestion", () => {
    expect(effectiveSeasons({}, "Australia/Sydney")).toBe("south");
    expect(effectiveSeasons({ seasons: "north" }, "Australia/Sydney")).toBe("north");
    expect(effectiveSeasons({ seasons: "off" }, "Australia/Sydney")).toBe("off");
    expect(effectiveSeasons({ seasons: "south" }, "Europe/London")).toBe("south");
    expect(effectiveSeasons({}, "Europe/London")).toBe("north");
  });
});

describe("the preference", () => {
  it("is kept when it is one of the three, and ignored when it is anything else", () => {
    for (const v of SEASON_BASES) expect(parsePrefs(serializePrefs({ ...DEFAULT_PREFS, seasons: v })).seasons).toBe(v);
    expect(parsePrefs(JSON.stringify({ theme: "dark", seasons: "equator" })).seasons).toBeUndefined();
    expect(parsePrefs(JSON.stringify({ theme: "dark", seasons: 3 })).seasons).toBeUndefined();
    expect("seasons" in parsePrefs(null)).toBe(false);
  });
  it("travels in a backup when the person chose it, and is validated when it comes back", () => {
    expect(backupPrefs({ ...DEFAULT_PREFS, seasons: "south" }).seasons).toBe("south");
    expect("seasons" in backupPrefs(DEFAULT_PREFS)).toBe(false);
    const ok = validatePrefs({ theme: "light", textScale: 1, autoAdvance: true, seasons: "off" });
    expect(ok.ok && ok.value.seasons).toBe("off");
    expect(validatePrefs({ theme: "light", textScale: 1, autoAdvance: true, seasons: "mars" }).ok).toBe(false);
    expect(validatePrefs({ theme: "light", textScale: 1, autoAdvance: true }).ok).toBe(true);
  });
});

const made = (kb: KnowledgeBase, seasons: "north" | "south" | "off" | undefined, id: string, birth = false): SavedAssessment => {
  const draft = { ...interview(kb, "SP1"), ...(birth ? { birth: { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male" as const, timeZone: "Asia/Shanghai", longitude: 121.47 }, rememberBirth: true } : {}) };
  return toSaved(draft, engine.assess(kb, assessInputOf(draft, MARCH, seasons)!), { id, lang: "en" });
};

describe("a result made on another basis", () => {
  it("is built from the draft, the time and the basis — a northern basis is not put in the input at all", () => {
    const draft = interview(dev, "SP1");
    expect(assessInputOf(draft, MARCH)!.options).toEqual({ now: MARCH, birthModule: false });
    expect(assessInputOf(draft, MARCH, "north")!.options).toEqual({ now: MARCH, birthModule: false });
    expect(assessInputOf(draft, MARCH, "south")!.options).toEqual({ now: MARCH, birthModule: false, seasons: "south" });
    expect(assessInputOf(draft, MARCH, "off")!.options).toEqual({ now: MARCH, birthModule: false, seasons: "off" });
  });
  it("carries its basis in its own stamp, and a northern result carries none", () => {
    expect(made(dev, undefined, "r0000000000000001").result.meta.seasons).toBeUndefined();
    expect(made(dev, "north", "r0000000000000002").result.meta.seasons).toBeUndefined();
    expect(made(dev, "south", "r0000000000000003").result.meta.seasons).toBe("south");
    expect(made(dev, "off", "r0000000000000004").result.meta.seasons).toBe("off");
  });
  it("is accepted by the importer when the stamp is one of the two, and refused when it is anything else", () => {
    for (const seasons of ["south", "off"] as const) expect(validateAssessment(JSON.parse(JSON.stringify(made(dev, seasons, "r0000000000000005")))).ok, seasons).toBe(true);
    expect(validateAssessment(JSON.parse(JSON.stringify(made(dev, undefined, "r0000000000000006")))).ok).toBe(true);
    const bad = JSON.parse(JSON.stringify(made(dev, "south", "r0000000000000007")));
    bad.result.meta.seasons = "north";          // the northern calendar is never stamped: a result that says so is not one this app made
    expect(validateAssessment(bad).ok).toBe(false);
    bad.result.meta.seasons = { evil: true };
    expect(validateAssessment(bad).ok).toBe(false);
  });
});

describe("proving a result genuine by making it again", () => {
  const replay = (kb: KnowledgeBase) => makeReplay(kb, engine);
  it("a northern result is proved genuine, with or without the basis named, with or without birth data", () => {
    for (const kb of [dev, release]) for (const seasons of [undefined, "north"] as const) for (const birth of [false, true]) {
      expect(replay(kb)(made(kb, seasons, "r1000000000000001", birth)), `${kb.profile} ${seasons} ${birth}`).toBe("same");
    }
  });
  it("a southern result and one with no seasons are proved genuine too — each is replayed on the basis it was made on, not on the device's", () => {
    for (const kb of [dev, release]) for (const seasons of ["south", "off"] as const) for (const birth of [false, true]) {
      expect(replay(kb)(made(kb, seasons, "r2000000000000001", birth)), `${kb.profile} ${seasons} ${birth}`).toBe("same");
    }
  });
  it("a result whose stamp was changed is no longer genuine: the basis cannot be edited away", () => {
    const s = made(dev, "south", "r3000000000000001");
    const north = { ...s, result: { ...s.result, meta: Object.fromEntries(Object.entries(s.result.meta).filter(([k]) => k !== "seasons")) } } as unknown as SavedAssessment;
    expect(replay(dev)(north)).not.toBe("same");
    const off = { ...s, result: { ...s.result, meta: { ...s.result.meta, seasons: "off" } } } as unknown as SavedAssessment;
    expect(replay(dev)(off)).not.toBe("same");
  });
  it("the stamps of a southern record agree with the engine's", () => {
    const s = made(dev, "south", "r4000000000000001");
    expect(s.paramsFingerprint).toBe(s.result.meta.paramsFingerprint);
    expect(s.paramsFingerprint.endsWith("+south")).toBe(true);
    expect(currentOf(dev, ENGINE_VERSION).profile).toBe("dev");
  });
});

describe("the trend's season marks", () => {
  it("follow each result's own basis: the season it was counted on, and none for a result that left seasons out", () => {
    const rows = [made(dev, undefined, "r5000000000000001"), made(dev, "south", "r5000000000000002"), made(dev, "off", "r5000000000000003")];
    const points = trend(rows).segments.flatMap((s) => s.points);
    const byId = new Map(points.map((p) => [p.id, p.season] as const));
    expect(byId.get("r5000000000000001")).toBe("春");          // 20 March: spring in the north
    expect(byId.get("r5000000000000002")).toBe("秋");          // … and autumn in the south
    expect(byId.get("r5000000000000003")).toBeNull();
  });
});
