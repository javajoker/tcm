// @vitest-environment node
// The backup engine (docs/post-mvp/design/backup-and-data-lock.md §3, §7; task PM-07): the file, the validating importer, the replay check, the plan and the one-transaction write.
import * as engine from "@tcm/engine";
import { ENGINE_VERSION } from "@tcm/engine";
import { indexKnowledgeBase, type KnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { currentOf, makeReplay } from "../src/app/backupReplay.ts";
import {
  applyPlan, backupFileName, buildBackup, canonicalJson, checkDocument, DEFAULT_SELECTION, LIMITS, planImport, prepareImport, readBackup, serializeBackup, sha256Hex, validateAssessment, validateDraft, validatePrefs,
  type BackupDocument, type ImportContext, type Prepared, type Stamps,
} from "../src/storage/backup/index.ts";
import { createMemoryDb, openIndexedDb } from "../src/storage/db.ts";
import { createPersistence } from "../src/storage/persistence.ts";
import { DEFAULT_PREFS, type Draft, type Prefs, type SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment } from "./helpers.tsx";
import { interview } from "./interview.ts";

/** A JSON shape the tests damage on purpose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the tests reach into and break arbitrary parts of a record
type Loose = Record<string, any>;
const dev = indexKnowledgeBase(rawChunksFromDisk("dev"));
const release = indexKnowledgeBase(rawChunksFromDisk("release"));
const NOW = Date.UTC(2026, 9, 5, 12);

const stampsOf = (kb: KnowledgeBase): Stamps => ({ appVersion: "test-build", kbVersion: kb.version, engineVersion: ENGINE_VERSION, profile: kb.profile });
function record(kb: KnowledgeBase, patternId: string, id: string, at: number, over: Partial<Draft> = {}): SavedAssessment {
  const draft = { ...interview(kb, patternId), ...over };
  return toSaved(draft, engine.assess(kb, assessInputOf(draft, at)!), { id, lang: "en" });
}
const histories = (kb: KnowledgeBase, prefix = "r"): SavedAssessment[] => ["SP1", "LG1", "KD2", "HT1", "LV3", "SP6"].map((p, i) => record(kb, p, `${prefix}${i}00000${p.toLowerCase()}`, NOW - (6 - i) * 86_400_000 * 9));
const context = (kb: KnowledgeBase, profile: "release" | "dev" = kb.profile as "release" | "dev", over: Partial<ImportContext> = {}): ImportContext => ({ profile, current: currentOf(kb, ENGINE_VERSION), replay: makeReplay(kb, engine), now: NOW + 1000, ...over });
const prefs: Prefs = { ...DEFAULT_PREFS, lang: "zh-Hans", theme: "dark", textScale: 1.15, region: "TW", autoAdvance: false, disclaimerAck: { version: "v1", at: 5 }, langOfferDismissed: true, rememberBirthDefault: true };
const backupOf = async (kb: KnowledgeBase, items: SavedAssessment[], draft: Draft | null = null, selection = DEFAULT_SELECTION): Promise<BackupDocument> => buildBackup({ assessments: items, draft, prefs }, selection, stampsOf(kb), NOW);
const read = async (doc: BackupDocument): Promise<BackupDocument> => { const r = await readBackup(serializeBackup(doc)); if (r.kind !== "backup") throw new Error(`not a backup: ${JSON.stringify(r)}`); return r.document; };
const records = histories(dev);

describe("canonical form and checksum", () => {
  it("equal values give the same text whatever order they were built in", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }, null], z: undefined })).toBe('{"a":[{"c":3,"d":2},null],"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(/finite/);
    expect(canonicalJson("中醫")).toBe('"中醫"');
  });
  it("SHA-256 matches the published vectors", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("the file", () => {
  it("holds what was chosen, with a checksum, the versions of its maker and the storage schema; the same inputs give the same file", async () => {
    const a = await backupOf(dev, records);
    expect(a).toMatchObject({ format: "tcm-backup", version: 1, createdAt: "2026-10-05T12:00:00Z", exportedFrom: stampsOf(dev), storage: { assessment: 1, draft: 1 }, contents: { assessments: 6, draft: false, prefs: true, birth: false } });
    expect(a.checksum).toEqual({ alg: "SHA-256", of: "payload", value: await sha256Hex(canonicalJson(a.payload)) });
    expect(serializeBackup(a)).toBe(serializeBackup(await backupOf(dev, [...records].reverse())));          // sorted: the order they were listed in does not matter
    expect(a.payload.assessments.map((e) => e.v)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(backupFileName(NOW)).toBe("tcm-backup-2026-10-05.json");
    expect(backupFileName(NOW, true)).toBe("tcm-backup-2026-10-05.encrypted.json");
  });

  it("carries the preferences that travel — language, theme, text size, region, auto-advance — and not the disclaimer acknowledgement or the one-time flags", async () => {
    const doc = await backupOf(dev, []);
    expect(doc.payload.prefs).toEqual({ lang: "zh-Hans", theme: "dark", textScale: 1.15, region: "TW", autoAdvance: false });
    expect(JSON.stringify(doc)).not.toMatch(/disclaimerAck|langOfferDismissed|rememberBirthDefault/);
    expect((await backupOf(dev, [], null, { ...DEFAULT_SELECTION, prefs: false })).payload.prefs).toBeNull();
  });

  it("includes the unfinished assessment only when asked, and birth data only where the person kept it", async () => {
    const draft = { ...interview(dev, "SP1"), birth: { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male" as const, timeZone: "Asia/Shanghai", longitude: 121.47 }, rememberBirth: false };
    expect((await backupOf(dev, [], draft)).payload.draft).toBeNull();
    const withDraft = await backupOf(dev, [], draft, { ...DEFAULT_SELECTION, draft: true });
    expect(withDraft.contents).toMatchObject({ draft: true, birth: false });                              // not remembered: the birth moment is not stored, so not exported
    expect(JSON.stringify(withDraft)).not.toContain("1990");
    const remembered = await backupOf(dev, [], { ...draft, rememberBirth: true }, { ...DEFAULT_SELECTION, draft: true });
    expect(remembered.contents.birth).toBe(true);
    const kept = record(dev, "SP1", "rbirth0000001", NOW, { birth: draft.birth, rememberBirth: true });
    expect((await backupOf(dev, [kept])).contents.birth).toBe(true);
  });

  it("a selection of ids includes exactly those", async () => {
    const doc = await backupOf(dev, records, null, { assessments: [records[1]!.id, records[4]!.id], draft: false, prefs: false });
    expect(doc.contents.assessments).toBe(2);
    expect(doc.payload.assessments.map((e) => (e.data as SavedAssessment).id).sort()).toEqual([records[1]!.id, records[4]!.id].sort());
  });
});

describe("reading: size, parse, identify, integrity", () => {
  it("reads back what it wrote", async () => {
    const doc = await backupOf(dev, records);
    const r = await readBackup(serializeBackup(doc));
    expect(r.kind).toBe("backup");
    if (r.kind === "backup") expect(r.document).toEqual(doc);
  });

  it("refuses what is not a backup, in plain codes", async () => {
    const code = async (text: string, size?: number): Promise<string> => { const r = await readBackup(text, size); return r.kind === "error" ? r.error.code : r.kind; };
    expect(await code("{}", LIMITS.fileBytes + 1)).toBe("too-large");
    expect(await code("not json")).toBe("not-json");
    expect(await code("")).toBe("not-json");
    expect(await code("[1,2]")).toBe("not-backup");
    expect(await code("null")).toBe("not-backup");
    expect(await code('{"format":"tcm-inputs","version":1}')).toBe("not-backup");
    expect(await code('{"format":"tcm-backup"}')).toBe("malformed");
    const good = JSON.parse(serializeBackup(await backupOf(dev, records)));
    const variant = async (change: (d: Record<string, unknown>) => void): Promise<string> => { const d = structuredClone(good); change(d); return code(JSON.stringify(d)); };
    expect(await variant((d) => { d["version"] = 2; })).toBe("newer-version");
    expect(await variant((d) => { d["version"] = "1"; })).toBe("malformed");
    expect(await variant((d) => { (d["storage"] as Record<string, number>)["assessment"] = 2; })).toBe("newer-storage");
    expect(await variant((d) => { (d["storage"] as Record<string, number>)["draft"] = 9; })).toBe("newer-storage");
    expect(await variant((d) => { delete d["storage"]; })).toBe("malformed");
    expect(await variant((d) => { d["payload"] = {}; })).toBe("malformed");
    expect(await variant((d) => { delete d["checksum"]; })).toBe("malformed");
    expect(await variant((d) => { d["exportedFrom"] = 3; })).toBe("malformed");
    expect(await variant((d) => { (d["payload"] as { assessments: unknown[] })["assessments"] = Array.from({ length: LIMITS.records + 1 }, () => ({})); })).toBe("too-many-records");
  });

  it("a changed byte of the payload, a dropped record or a truncated file is damaged or not JSON — never accepted", async () => {
    const text = serializeBackup(await backupOf(dev, records));
    const good = JSON.parse(text);
    const damaged = structuredClone(good);
    (damaged.payload.assessments[0].data as { userNote?: string }).userNote = "edited";
    expect(await readBackup(JSON.stringify(damaged))).toMatchObject({ kind: "error", error: { code: "damaged" } });
    const fewer = structuredClone(good);
    fewer.payload.assessments.pop();
    expect(await readBackup(JSON.stringify(fewer))).toMatchObject({ kind: "error", error: { code: "damaged" } });
    for (const cut of [text.length - 2, text.length - 40, Math.floor(text.length / 2), 10]) expect((await readBackup(text.slice(0, cut))).kind).toBe("error");
    expect((await readBackup(text.trimEnd())).kind).toBe("backup");                                       // only the final line break gone: still the same file
  });

  it("an encrypted file is recognised for the step that opens it, and its newer version refused", async () => {
    expect(await readBackup('{"format":"tcm-backup-encrypted","version":1,"x":1}')).toMatchObject({ kind: "encrypted" });
    expect(await readBackup('{"format":"tcm-backup-encrypted","version":7}')).toMatchObject({ kind: "error", error: { code: "newer-version" } });
    expect(await readBackup('{"format":"tcm-backup-encrypted","version":"1"}')).toMatchObject({ kind: "error", error: { code: "malformed" } });
  });

  it("the document inside an encrypted file goes through the same checks", async () => {
    const doc = JSON.parse(serializeBackup(await backupOf(dev, records)));
    expect((await checkDocument(doc)).kind).toBe("backup");
    doc.checksum.value = "0".repeat(64);
    expect(await checkDocument(doc)).toMatchObject({ kind: "error", error: { code: "damaged" } });
  });
});

describe("validating a record", () => {
  const clean = records[0]!;

  it("passes a record this app made unchanged: a fresh value, deep-equal, sharing nothing with the original", () => {
    const v = validateAssessment(JSON.parse(JSON.stringify(clean)));
    expect(v.ok).toBe(true);
    if (v.ok) { expect(v.value).toEqual(clean); expect(v.value).not.toBe(clean); expect(v.value.input).not.toBe(clean.input); }
  });

  it("drops what it does not know, and refuses a known field with a wrong value, naming it", () => {
    const withExtra = JSON.parse(JSON.stringify(clean));
    withExtra.surprise = { x: 1 };
    withExtra.input.subject.surprise = "y";
    const ok = validateAssessment(withExtra);
    expect(ok.ok && "surprise" in ok.value).toBe(false);
    expect(ok.ok && "surprise" in ok.value.input.subject).toBe(false);

    const refuse = (change: (r: Loose) => void, reason: RegExp): void => {
      const r = JSON.parse(JSON.stringify(clean));
      change(r);
      const v = validateAssessment(r);
      expect(v.ok, String(reason)).toBe(false);
      if (!v.ok) expect(v.reason).toMatch(reason);
    };
    refuse((r) => { r.id = "../etc"; }, /id is not valid/);
    refuse((r) => { r.id = 5; }, /the id/);
    refuse((r) => { r.createdAt = "yesterday"; }, /the time/);
    refuse((r) => { r.createdAt = -5; }, /the time/);
    refuse((r) => { r.lang = "fr"; }, /language/);
    refuse((r) => { r.kbVersion = ""; }, /empty|knowledge-base version/);
    refuse((r) => { r.input.subject.sex = "other"; }, /sex/);
    refuse((r) => { r.input.subject.ageYears = 400; }, /age/);
    refuse((r) => { r.input.subject.medications = ["anticoagulant", "poison"]; }, /medication class/);
    refuse((r) => { r.input.subject.allergies = Array.from({ length: LIMITS.names + 1 }, () => "x"); }, /allergies/);
    refuse((r) => { r.input.subject.allergies = ["x".repeat(LIMITS.name + 1)]; }, /allergies/);
    refuse((r) => { r.input.findings = { "S_<script>": { state: "present" } }; }, /finding id/);
    refuse((r) => { r.input.findings = { S_X: { state: "maybe" } }; }, /state/);
    refuse((r) => { r.input.findings = { S_X: { state: "present", severity: "huge" } }; }, /severity/);
    refuse((r) => { r.input.context = { course: "forever" }; }, /course/);
    refuse((r) => { r.input.screening.answers = { RF_A_X: "perhaps" }; }, /red-flag answer/);
    refuse((r) => { r.input.birth = { year: 1990 }; }, /birth/);
    refuse((r) => { r.result = {}; }, /result/);
    refuse((r) => { r.result.meta.kbVersion = "another"; }, /does not carry the stamps/);
    refuse((r) => { r.result.meta.computedAt += 1; }, /does not carry the stamps/);
    refuse((r) => { r.userNote = "n".repeat(LIMITS.note + 1); }, /the note/);
    refuse((r) => { r.feedback = { f: "great" }; }, /feedback mark/);
    refuse((r) => { r.imported = { at: 1 }; }, /import mark/);
    refuse((r) => { r.input = null; }, /inputs/);
  });

  it("never lets a prototype-bearing key, a control character, a deep nesting or a huge value through", () => {
    for (const poison of ['{"__proto__":{"polluted":true}}', '{"constructor":{"prototype":{"polluted":true}}}']) {
      const r = JSON.parse(JSON.stringify(clean));
      r.result.extra = JSON.parse(poison);
      expect(validateAssessment(r).ok, poison).toBe(false);
      const s = JSON.parse(JSON.stringify(clean));
      s.input.subject = JSON.parse(poison);
      expect(validateAssessment(s).ok, poison).toBe(false);
    }
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    const control = JSON.parse(JSON.stringify(clean));
    control.userNote = "hello\u0000world";
    expect(validateAssessment(control).ok).toBe(false);
    const deep = JSON.parse(JSON.stringify(clean));
    let node = deep.result;
    for (let i = 0; i < LIMITS.depth + 5; i++) { node.deeper = {}; node = node.deeper; }
    expect(validateAssessment(deep)).toMatchObject({ ok: false, reason: expect.stringMatching(/nested too deeply/) });
    const huge = JSON.parse(JSON.stringify(clean));
    huge.result.trace = Array.from({ length: LIMITS.list + 1 }, () => 0);
    expect(validateAssessment(huge).ok).toBe(false);
    const long = JSON.parse(JSON.stringify(clean));
    long.result.note = "x".repeat(LIMITS.string + 1);
    expect(validateAssessment(long).ok).toBe(false);
    expect(validateAssessment(null).ok).toBe(false);
    expect(validateAssessment("string").ok).toBe(false);
    expect(validateAssessment([]).ok).toBe(false);
  });

  it("a text a person typed stays text: markup in a note or an allergy is kept as the characters it is", () => {
    const r = JSON.parse(JSON.stringify(clean));
    r.userNote = "<img src=x onerror=alert(1)>";
    r.input.subject.allergies = ["<b>花生</b>"];
    const v = validateAssessment(r);
    expect(v.ok && v.value.userNote).toBe("<img src=x onerror=alert(1)>");
    expect(v.ok && v.value.input.subject.allergies).toEqual(["<b>花生</b>"]);
  });

  it("validates a draft (its birth data only when remembered) and the preferences (nothing but the five that travel)", () => {
    const draft = { ...interview(dev, "LG1"), rememberBirth: true, birth: { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "female" as const, timeZone: "Asia/Taipei", longitude: 121.5 } };
    const v = validateDraft(JSON.parse(JSON.stringify(draft)));
    expect(v.ok && v.value).toEqual(draft);
    expect(validateDraft({ ...JSON.parse(JSON.stringify(draft)), rememberBirth: false })).toMatchObject({ ok: true, value: { rememberBirth: false } });
    expect((validateDraft({ ...JSON.parse(JSON.stringify(draft)), rememberBirth: false }) as { value: Draft }).value.birth).toBeUndefined();
    expect(validateDraft({ ...JSON.parse(JSON.stringify(draft)), position: { route: "https://evil.example/" } }).ok).toBe(false);
    expect(validateDraft({ ...JSON.parse(JSON.stringify(draft)), position: { route: "//evil.example" } }).ok).toBe(false);
    expect(validateDraft({}).ok).toBe(false);
    expect(validatePrefs({ lang: "en", theme: "light", textScale: 1.3, region: "HK", autoAdvance: true, evil: 1 })).toEqual({ ok: true, value: { lang: "en", theme: "light", textScale: 1.3, region: "HK", autoAdvance: true } });
    for (const bad of [{ theme: "neon", textScale: 1, autoAdvance: true }, { theme: "dark", textScale: 2, autoAdvance: true }, { theme: "dark", textScale: 1, autoAdvance: "yes" }, { theme: "dark", textScale: 1, autoAdvance: true, region: "tw" }, { theme: "dark", textScale: 1, autoAdvance: true, lang: "xx" }]) expect(validatePrefs(bad).ok, JSON.stringify(bad)).toBe(false);
  });
});

describe("the importer: refusing, proving, labelling", () => {
  const prepare = async (items: SavedAssessment[], ctx: ImportContext, mutate: (d: BackupDocument) => BackupDocument = (d) => d): Promise<Prepared> => prepareImport(mutate(await read(await backupOf(dev, items))), ctx);

  it("a record made by this version from its answers is proved genuine and arrives without a mark", async () => {
    const p = await prepare(records, context(dev));
    expect(p.rejected).toEqual([]);
    expect(p.records.map((r) => r.checked)).toEqual(Array(records.length).fill("verified"));
    expect(p.records.map((r) => r.saved).sort((a, b) => a.createdAt - b.createdAt)).toEqual([...records].sort((a, b) => a.createdAt - b.createdAt));
    expect(p.records.every((r) => r.saved.imported === undefined)).toBe(true);
  });

  it("a record whose result was altered — one score, one suppressed item, one word of the verdict — is rejected as not following from its answers", async () => {
    const tamper = (change: (r: SavedAssessment) => void) => async (d: BackupDocument): Promise<BackupDocument> => {
      const clone = structuredClone(d) as unknown as { payload: { assessments: { data: SavedAssessment }[] } };
      change(clone.payload.assessments[0]!.data);
      return { ...clone, checksum: { ...d.checksum, value: await sha256Hex(canonicalJson(clone.payload)) } } as unknown as BackupDocument;
    };
    for (const change of [
      (r: SavedAssessment) => { const holder = r.result.patterns[0] as unknown as Record<string, unknown>; const key = Object.keys(holder).find((k) => typeof holder[k] === "number" && !Number.isInteger(holder[k]))!; holder[key] = (holder[key] as number) + 0.01; },
      (r: SavedAssessment) => { (r.result.verdict as unknown as { status: string }).status = "established-x"; },
      (r: SavedAssessment) => { (r.result.panel.bagang as { coldHeat: number }).coldHeat += 0.5; },
      (r: SavedAssessment) => { (r.result as unknown as { suppressed: unknown[] }).suppressed = []; (r.result as unknown as { trace: unknown[] }).trace = []; },
    ]) {
      const doc = await tamper(change)(await read(await backupOf(dev, records)));
      const p = prepareImport(doc, context(dev));
      expect(p.rejected.map((x) => x.reason)).toEqual(["altered"]);
      expect(p.records).toHaveLength(records.length - 1);
    }
  });

  it("an answer changed behind a result's back (the result no longer follows) is rejected too", async () => {
    const doc = structuredClone(await read(await backupOf(dev, records))) as unknown as { payload: { assessments: { data: SavedAssessment }[] }; checksum: { value: string } };
    const first = doc.payload.assessments[0]!.data;
    const some = Object.keys(first.input.findings).find((k) => first.input.findings[k]!.state === "present")!;
    (first.input.findings as Record<string, { state: string }>)[some] = { state: "absent" };
    doc.checksum.value = await sha256Hex(canonicalJson(doc.payload));
    expect(prepareImport(doc as unknown as BackupDocument, context(dev)).rejected.map((x) => x.reason)).toEqual(["altered"]);
  });

  it("a record made by another version is kept as saved and marked Imported with its makers' versions; it is never recomputed", async () => {
    let n = 0;
    const other = (change: (r: SavedAssessment) => SavedAssessment): SavedAssessment => ({ ...change(JSON.parse(JSON.stringify(records[0]!))), id: `rother${n++}00000001` });
    const olderEngine = other((r) => ({ ...r, engineVersion: "0.0.1", result: { ...r.result, meta: { ...r.result.meta, engineVersion: "0.0.1" } } }));
    const olderKb = other((r) => ({ ...r, kbVersion: "an-older-knowledge-base", result: { ...r.result, meta: { ...r.result.meta, kbVersion: "an-older-knowledge-base" } } }));
    const otherParams = other((r) => ({ ...r, paramsFingerprint: "deadbeef", result: { ...r.result, meta: { ...r.result.meta, paramsFingerprint: "deadbeef" } } }));
    const p = await prepare([olderEngine, otherParams], context(dev));
    expect(p.rejected).toEqual([]);
    expect(p.records.map((r) => r.checked)).toEqual(["unchecked", "unchecked"]);
    for (const r of p.records) expect(r.saved.imported).toEqual({ at: NOW + 1000, from: { appVersion: r.saved.appVersion, kbVersion: r.saved.kbVersion, engineVersion: r.saved.engineVersion, profile: "dev" } });
    expect(p.records.find((r) => r.saved.engineVersion === "0.0.1")!.saved.result).toEqual(olderEngine.result);                 // as saved
    const older = await prepare([olderKb], context(dev));
    expect(older.records[0]!.saved.imported?.from.kbVersion).toBe("an-older-knowledge-base");
  });

  it("a result that used a birth moment the person did not keep cannot be made again, so it is labelled, not refused", async () => {
    const draft = { ...interview(dev, "SP1"), birth: { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male" as const, timeZone: "Asia/Shanghai", longitude: 121.47 }, rememberBirth: false };
    const saved = toSaved(draft, engine.assess(dev, assessInputOf(draft, NOW)!), { id: "rnobirth000001", lang: "en" });
    expect(saved.input.birth).toBeUndefined();
    expect(saved.result.reference).not.toBeNull();
    const p = await prepare([saved], context(dev));
    expect(p.rejected).toEqual([]);
    expect(p.records[0]!.checked).toBe("unchecked");
    const kept = record(dev, "SP1", "rbirth0000002", NOW, { birth: draft.birth, rememberBirth: true });
    expect((await prepare([kept], context(dev))).records[0]!.checked).toBe("verified");               // the moment is kept, so the result is proved
  });

  it("a release build refuses what a development build made; a development build accepts both", async () => {
    const relRecords = histories(release, "x").slice(0, 2);
    const doc = await read(await buildBackup({ assessments: [...records.slice(0, 2), ...relRecords], draft: null, prefs }, DEFAULT_SELECTION, stampsOf(dev), NOW));
    const asRelease = prepareImport(doc, context(release, "release"));
    expect(asRelease.rejected.map((r) => r.reason)).toEqual(["development-build", "development-build"]);
    expect(asRelease.records).toHaveLength(2);
    expect(asRelease.records.every((r) => r.saved.profile === "release")).toBe(true);
    const asDev = prepareImport(doc, context(dev, "dev"));
    expect(asDev.rejected).toEqual([]);
    expect(asDev.records).toHaveLength(4);
  });

  it("a file that holds an id twice keeps the first and lists the second", async () => {
    const doc = await read(await backupOf(dev, [records[0]!]));
    const twice = { ...doc, payload: { ...doc.payload, assessments: [...doc.payload.assessments, ...doc.payload.assessments] } };
    const p = prepareImport(twice as BackupDocument, context(dev));
    expect(p.records).toHaveLength(1);
    expect(p.rejected).toEqual([{ id: records[0]!.id, reason: "duplicate", detail: expect.any(String) }]);
  });

  it("an invalid record is listed with its reason and the rest go on; the draft and the preferences are checked on their own", async () => {
    const doc = structuredClone(await read(await backupOf(dev, records, interview(dev, "SP1"), { ...DEFAULT_SELECTION, draft: true }))) as unknown as BackupDocument & { payload: { assessments: { v: number; data: Record<string, unknown> }[]; draft: { v: number; data: Record<string, unknown> }; prefs: Record<string, unknown> } };
    doc.payload.assessments[1]!.data["lang"] = "xx";
    doc.payload.assessments[2]!.v = 99;
    doc.payload.draft.data["position"] = { route: "http://evil" };
    (doc.payload.prefs as Record<string, unknown>)["theme"] = "neon";
    const p = prepareImport(doc, context(dev));
    expect(p.records).toHaveLength(records.length - 2);
    expect(p.rejected.map((r) => r.reason)).toEqual(["invalid", "invalid"]);
    expect(p.rejected[0]!.detail).toMatch(/language/);
    expect(p.rejected[1]!.detail).toMatch(/cannot read/);
    expect(p.draft).toBeNull();
    expect(p.draftRejected).toMatch(/route/);
    expect(p.prefs).toBeNull();
    expect(p.prefsRejected).toMatch(/theme/);
  });
});

describe("the plan and the choice", () => {
  const prepared = async (items: SavedAssessment[] = records, draft: Draft | null = null): Promise<Prepared> => prepareImport(await read(await backupOf(dev, items, draft, { ...DEFAULT_SELECTION, draft: draft !== null })), context(dev));
  let counter = 0;
  const newId = (): string => `fresh${counter++}0000`;

  it("each record is new, identical (skipped silently) or different (the same id, other content)", async () => {
    const p = await prepared();
    const here = [records[0]!, { ...records[1]!, userNote: "mine" }, records[2]!];
    const plan = planImport(p, here);
    expect(plan.items.map((i) => `${i.record.saved.id.slice(0, 2)}:${i.status}`).sort()).toEqual(["r0:identical", "r1:differs", "r2:identical", "r3:new", "r4:new", "r5:new"]);
    expect(plan.counts).toEqual({ new: 3, identical: 2, differs: 1 });
    expect(plan.range).toEqual({ from: Math.min(...[1, 3, 4, 5].map((i) => records[i]!.createdAt)), to: Math.max(...[1, 3, 4, 5].map((i) => records[i]!.createdAt)) });
    expect(planImport(p, records).counts).toEqual({ new: 0, identical: 6, differs: 0 });
    expect(planImport(p, records).range).toBeNull();
  });

  it("a record imported before is identical to the same record in the file: the mark does not make it different", async () => {
    const marked = { ...records[0]!, imported: { at: 1, from: { appVersion: "a", kbVersion: "b", engineVersion: "c", profile: "dev" } } };
    expect(planImport(await prepared([records[0]!]), [marked]).counts).toEqual({ new: 0, identical: 1, differs: 0 });
  });

  it("writes only what is new; identical records are not written", async () => {
    const p = await prepared();
    const plan = planImport(p, records.slice(0, 2));
    const applied = applyPlan(plan, p, { conflict: "skip", includeDraft: false, includePrefs: false }, newId, new Set(records.slice(0, 2).map((r) => r.id)));
    expect(applied.writes.map((w) => w.key).sort()).toEqual(records.slice(2).map((r) => r.id).sort());
    expect(applied).toMatchObject({ added: 4, replaced: 0, keptBoth: 0, skipped: 0, prefs: null });
    expect(applied.writes.every((w) => w.store === "assessments" && w.value.v === 1)).toBe(true);
  });

  it("the three conflict choices: skip, keep both under a new id, replace only if the imported one is newer", async () => {
    const p = await prepared([records[1]!, records[2]!]);
    const newer = { ...records[1]!, createdAt: records[1]!.createdAt - 1000, result: { ...records[1]!.result, meta: { ...records[1]!.result.meta, computedAt: records[1]!.createdAt - 1000 } }, userNote: "older here" };   // here: the older copy
    const older = { ...records[2]!, createdAt: records[2]!.createdAt + 1000, userNote: "newer here" };                                                                                                           // here: the newer copy
    const here = [newer, older];
    const plan = planImport(p, here);
    expect(plan.counts).toEqual({ new: 0, identical: 0, differs: 2 });
    const ids = new Set(here.map((r) => r.id));
    expect(applyPlan(plan, p, { conflict: "skip", includeDraft: false, includePrefs: false }, newId, ids)).toMatchObject({ writes: [], skipped: 2 });
    const replace = applyPlan(plan, p, { conflict: "replace-newer", includeDraft: false, includePrefs: false }, newId, ids);
    expect(replace).toMatchObject({ replaced: 1, skipped: 1 });
    expect(replace.writes.map((w) => w.key)).toEqual([records[1]!.id]);
    const both = applyPlan(plan, p, { conflict: "keep-both", includeDraft: false, includePrefs: false }, newId, ids);
    expect(both).toMatchObject({ keptBoth: 2, replaced: 0 });
    const newKeys = both.writes.map((w) => w.key);
    expect(new Set(newKeys).size).toBe(2);
    expect(newKeys.some((k) => ids.has(k))).toBe(false);
    for (const w of both.writes) expect((w.value.data as SavedAssessment).id).toBe(w.key);                 // the record carries its new id
  });

  it("a new id that is already in use is never chosen", async () => {
    const p = await prepared([records[1]!]);
    const plan = planImport(p, [{ ...records[1]!, userNote: "x" }]);
    const taken = new Set([records[1]!.id, "taken00000001", "taken00000002"]);
    const queue = ["taken00000001", "taken00000002", "free000000001"];
    const applied = applyPlan(plan, p, { conflict: "keep-both", includeDraft: false, includePrefs: false }, () => queue.shift()!, taken);
    expect(applied.writes.map((w) => w.key)).toEqual(["free000000001"]);
  });

  it("the unfinished assessment is written only when chosen; the preferences are handed back for the caller to apply", async () => {
    const draft = interview(dev, "SP1");
    const p = await prepared([], draft);
    const plan = planImport(p, []);
    expect(applyPlan(plan, p, { conflict: "skip", includeDraft: false, includePrefs: false }, newId, new Set()).writes).toEqual([]);
    const chosen = applyPlan(plan, p, { conflict: "skip", includeDraft: true, includePrefs: true }, newId, new Set());
    expect(chosen.writes).toEqual([{ store: "drafts", key: "current", value: { v: 1, data: draft } }]);
    expect(chosen.prefs).toEqual({ lang: "zh-Hans", theme: "dark", textScale: 1.15, region: "TW", autoAdvance: false });
  });
});

describe("export → import into an empty store gives the same history", () => {
  it("round trip: every record deep-equal, in the same order, the draft and the preferences with them", async () => {
    const draft = interview(dev, "KD2");
    const doc = await read(await backupOf(dev, records, draft, { ...DEFAULT_SELECTION, draft: true }));
    const prep = prepareImport(doc, context(dev));
    const fresh = createPersistence(fakeEnvironment());
    const plan = planImport(prep, await fresh.listAssessments());
    const applied = applyPlan(plan, prep, { conflict: "skip", includeDraft: true, includePrefs: true }, () => "unused", new Set());
    expect(await fresh.applyWrites(applied.writes)).toBe(true);
    expect(await fresh.listAssessments()).toEqual([...records].sort((a, b) => b.createdAt - a.createdAt));
    expect((await fresh.loadDraft())).toEqual(draft);
    expect(applied.prefs).toEqual({ lang: "zh-Hans", theme: "dark", textScale: 1.15, region: "TW", autoAdvance: false });
    // importing the same file again changes nothing
    const again = planImport(prep, await fresh.listAssessments());
    expect(again.counts).toEqual({ new: 0, identical: records.length, differs: 0 });
    expect(applyPlan(again, prep, { conflict: "skip", includeDraft: false, includePrefs: false }, () => "x", new Set()).writes).toEqual([]);
  });

  it("property: histories of many shapes survive the round trip (every pattern, with notes and feedback, with and without remembered birth)", async () => {
    const patterns = [...dev.patterns].map((p) => p.id).slice(0, 23);
    const items = patterns.map((id, i) => {
      const r = record(dev, id, `p${String(i).padStart(2, "0")}000000${id.toLowerCase()}`, NOW - i * 3_600_000);
      return { ...r, ...(i % 3 === 0 ? { userNote: `note ${i} <b>bold</b> 中文` } : {}), ...(i % 4 === 0 ? { feedback: { [r.result.patterns[0]!.id]: "match" as const } } : {}) } as SavedAssessment;
    });
    const doc = await read(await backupOf(dev, items));
    const prep = prepareImport(doc, context(dev));
    expect(prep.rejected).toEqual([]);
    const fresh = createPersistence(fakeEnvironment());
    expect(await fresh.applyWrites(applyPlan(planImport(prep, []), prep, { conflict: "skip", includeDraft: false, includePrefs: false }, () => "x", new Set()).writes)).toBe(true);
    expect(await fresh.listAssessments()).toEqual([...items].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1)));
  }, 60_000);
});

describe("never a partial write", () => {
  const writes = (n: number) => Array.from({ length: n }, (_, i) => ({ store: "assessments" as const, key: `k${i}`, value: { v: 1, data: { i } } }));

  it("the in-memory database applies a batch whole, or not at all when one value cannot be stored", async () => {
    const db = createMemoryDb();
    await db.put("assessments", "before", { v: 1, data: {} });
    await expect(db.batch([...writes(3), { store: "assessments", key: "boom", value: { v: 1, data: () => 1 } }])).rejects.toThrow();
    expect((await db.getAll("assessments")).length).toBe(1);
    await db.batch([...writes(3), { store: "assessments", key: "before", delete: true }]);
    expect((await db.getAll("assessments")).length).toBe(3);
  });

  it("IndexedDB aborts the whole transaction when a value in the middle cannot be stored: the earlier writes are not committed", async () => {
    const env = fakeEnvironment();
    const db = await openIndexedDb(env.indexedDB!);
    const bad = [...writes(3), { store: "assessments" as const, key: "boom", value: { v: 1, data: () => 1 } }, ...writes(2).map((w) => ({ ...w, key: `late${w.key}` }))];
    await expect(db.batch(bad)).rejects.toThrow();
    expect(await db.getAll("assessments")).toEqual([]);
    await db.batch([...writes(2), { store: "drafts", key: "current", value: { v: 1, data: {} } }]);
    expect((await db.getAll("assessments")).length).toBe(2);
    expect((await db.getAll("drafts")).length).toBe(1);
  });

  it("the persistence layer says so — false, nothing changed — when storage cannot take the writes", async () => {
    const p = createPersistence(fakeEnvironment());
    await p.putAssessment(records[0]!);
    expect(await p.applyWrites([...writes(2).map((w) => ({ ...w, store: "assessments" as const })), { store: "assessments", key: "boom", value: { v: 1, data: () => 1 } }])).toBe(false);
    expect((await p.listAssessments()).map((a) => a.id)).toEqual([records[0]!.id]);
  });
});

// A small deterministic generator, so a failure can be reproduced.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe("fuzz: damaged and polluted files never throw, never write, never pollute", () => {
  it("random bytes, random JSON, truncations and byte flips of a real file", async () => {
    const r = rng(20261005);
    const text = serializeBackup(await backupOf(dev, records.slice(0, 3)));
    const ctx = context(dev);
    let accepted = 0, refused = 0;
    const seen = async (candidate: string): Promise<void> => {
      const res = await readBackup(candidate);
      if (res.kind !== "backup") { refused++; return; }
      const p = prepareImport(res.document, ctx);                              // must not throw whatever the content
      planImport(p, []);
      accepted++;
    };
    for (let i = 0; i < 300; i++) await seen(String.fromCharCode(...Array.from({ length: 1 + Math.floor(r() * 200) }, () => Math.floor(r() * 256))));
    for (let i = 0; i < 300; i++) await seen(JSON.stringify(randomJson(r, 0)));
    for (let i = 0; i < 300; i++) await seen(text.slice(0, Math.floor(r() * text.length)));
    for (let i = 0; i < 400; i++) { const at = Math.floor(r() * text.length); await seen(text.slice(0, at) + String.fromCharCode(32 + Math.floor(r() * 90)) + text.slice(at + 1)); }
    expect(refused).toBeGreaterThan(900);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")).toBe(false);
    void accepted;
  }, 120_000);

  it("a valid file whose records are damaged one field at a time: the damaged record is listed and refused (or kept as it is if the field is free), the others arrive, nothing throws", async () => {
    const r = rng(77);
    const base = JSON.parse(serializeBackup(await backupOf(dev, records.slice(0, 3)))) as { payload: { assessments: { v: number; data: unknown }[] }; checksum: { value: string } };
    const ctx = context(dev);
    let rejectedRuns = 0;
    for (let i = 0; i < 300; i++) {
      const doc = structuredClone(base);
      const target = doc.payload.assessments[Math.floor(r() * 3)]!.data;
      mutate(target, r);
      doc.checksum.value = await sha256Hex(canonicalJson(doc.payload));
      const res = await checkDocument(doc as unknown as Record<string, unknown>);
      expect(res.kind).toBe("backup");
      if (res.kind !== "backup") continue;
      const p = prepareImport(res.document, ctx);
      expect(p.records.length + p.rejected.length).toBe(3);
      if (p.rejected.length > 0) rejectedRuns++;
      for (const rec of p.records) expect(validateAssessment(rec.saved).ok).toBe(true);                   // whatever got in is itself valid
    }
    expect(rejectedRuns).toBeGreaterThan(100);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  }, 120_000);

  it("polluting keys at every depth are refused", async () => {
    const base = JSON.parse(serializeBackup(await backupOf(dev, records.slice(0, 1)))) as { payload: { assessments: { data: Loose }[] }; checksum: { value: string } };
    const places: ((d: Loose) => Loose)[] = [(d) => d, (d) => d.input, (d) => d.input.subject, (d) => d.input.findings, (d) => d.result, (d) => d.result.meta, (d) => d.result.panel];
    for (const place of places) for (const key of ["__proto__", "constructor", "prototype"]) {
      const doc = structuredClone(base);
      const holder = place(doc.payload.assessments[0]!.data);
      Object.defineProperty(holder, key, { value: { polluted: true }, enumerable: true, configurable: true, writable: true });
      doc.checksum.value = await sha256Hex(canonicalJson(doc.payload));
      const res = await checkDocument(doc as unknown as Record<string, unknown>);
      if (res.kind !== "backup") continue;
      expect(prepareImport(res.document, context(dev)).records, `${key} in ${place.toString()}`).toEqual([]);
    }
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  }, 60_000);
});

function randomJson(r: () => number, depth: number): unknown {
  const pick = Math.floor(r() * (depth > 4 ? 5 : 8));
  switch (pick) {
    case 0: return null;
    case 1: return r() < 0.5;
    case 2: return Math.floor(r() * 1e6) - 5e5;
    case 3: return "x".repeat(Math.floor(r() * 30));
    case 4: return r() * 1e12;
    case 5: return Array.from({ length: Math.floor(r() * 4) }, () => randomJson(r, depth + 1));
    default: {
      const o: Record<string, unknown> = {};
      for (const k of ["format", "version", "payload", "assessments", "checksum", "storage", "id", "data", "v", "__proto__", "constructor"].filter(() => r() < 0.4)) Object.defineProperty(o, k, { value: randomJson(r, depth + 1), enumerable: true, writable: true, configurable: true });
      return o;
    }
  }
}

/** Damage one thing somewhere in a record: change a value's type, delete a key, or add a polluting one. */
function mutate(node: unknown, r: () => number): void {
  const paths: { parent: Record<string, unknown> | unknown[]; key: string | number }[] = [];
  const walk = (v: unknown, depth: number): void => {
    if (depth > 5 || typeof v !== "object" || v === null) return;
    for (const k of Object.keys(v)) { paths.push({ parent: v as Record<string, unknown>, key: k }); walk((v as Record<string, unknown>)[k], depth + 1); }
  };
  walk(node, 0);
  const { parent, key } = paths[Math.floor(r() * paths.length)]!;
  const how = Math.floor(r() * 5);
  const p = parent as Record<string | number, unknown>;
  if (how === 0) delete p[key];
  else if (how === 1) p[key] = "damaged";
  else if (how === 2) p[key] = -1e9;
  else if (how === 3) p[key] = null;
  else p[key] = { nested: [1, 2, 3] };
}
