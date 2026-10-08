// The study reference in the app (PM-53, PM-54; docs/post-mvp/design/prescription-model.md §7.4): who reads with it — nobody, those who declare a role with the attestation, or every reader
// unless they choose to be a general reader (`dose_display`, PD-30) —, the knowledge base of the role (the reference merged in), what a result made with it holds and how it is shown, the
// note that the quantities are for study and as an aid to a practitioner only, the fallback when the reference cannot come, and backups.
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { createI18n } from "@tcm/i18n";
import { indexKnowledgeBase, type KnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { afterEach, describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { makeReplay } from "../src/app/backupReplay.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { attachPrescription } from "../src/app/prescription.ts";
import { ROLE_STATEMENT_VERSION, declaredOf, defaultRoleOf, effectiveRole } from "../src/app/role.ts";
import { catalogs, type MessageKey } from "../src/i18n/catalogs.ts";
import { prescriptionSection } from "../src/prescription/summary.ts";
import { backupPrefs } from "../src/storage/backup/format.ts";
import { prepareImport } from "../src/storage/backup/plan.ts";
import { validateAssessment, validatePrefs } from "../src/storage/backup/validate.ts";
import { parsePrefs } from "../src/storage/prefs.ts";
import { DEFAULT_PREFS, type Draft, type SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";

const everyone = indexKnowledgeBase(rawChunksFromDisk("release"));                                       // the closed beta as it ships: every reader, unless they choose otherwise
const declaring = indexKnowledgeBase(rawChunksFromDisk("release", { dose_display: "roles" }));          // only those who declare a role
const nobody = indexKnowledgeBase(rawChunksFromDisk("release", { dose_display: "off" }));               // the study reference is not served
const pub = indexKnowledgeBase(rawChunksFromDisk("release", undefined, false));                         // a public release before the reviews: no reference
const learnerKb = await everyone.forRole("learner");
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });
const ROLE = { role: "learner", at: 5, version: ROLE_STATEMENT_VERSION } as const;
const GENERAL = { role: "general", at: 5, version: ROLE_STATEMENT_VERSION } as const;
const NOW = 1_700_000_000_000;
const tEn = createI18n<MessageKey>(catalogs, "en");

const save = (kb: KnowledgeBase, d: Draft, id: string): SavedAssessment => toSaved(d, engine.assess(kb, assessInputOf(d, NOW)!), { id, lang: "en", role: kb.role });

async function open(path: string, kb: KnowledgeBase, prefs: object = {}, records: readonly SavedAssessment[] = [], lang: "en" | "zh-Hant" = "en", load: Loaded | (() => Promise<Loaded>) = { kb, engine }, draft?: Draft) {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang, ...prefs }));
  const t = testStore(env);
  for (const r of records) await t.persistence.putAssessment(r);
  if (draft !== undefined) {
    t.store.getState().startDraft();
    t.store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, position: { route: path } }));
  }
  go(`/${lang}${path}`);
  const view = renderApp(t.store, typeof load === "function" ? load : () => Promise.resolve(load));
  await act(async () => { await Promise.resolve(); });
  return { ...view, ...t };
}

describe("who reads with the study reference — where only those who declare a role do (dose_display roles)", () => {
  it("a general reader by default; a learner is asked to attest first; the attestation is the safety policy's; one choice withdraws it", async () => {
    const { store } = await open("/settings", declaring);
    const card = within(await screen.findByRole("region", { name: "Who is reading" }));
    expect(card.getByRole("radio", { name: "General reader" })).toBeChecked();
    expect(card.getByText(/not a check of qualifications/)).toBeInTheDocument();
    await userEvent.click(card.getByRole("radio", { name: "Studying Chinese medicine" }));
    const dialog = within(screen.getByRole("dialog", { name: "For study and clinical reference" }));
    expect(dialog.getByText(/a licensed practitioner examines the person and decides; do not take or give medicine on its strength/)).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(card.getByRole("radio", { name: "General reader" })).toBeChecked();
    expect(store.getState().prefs.role).toBeUndefined();
    await userEvent.click(card.getByRole("radio", { name: "Studying Chinese medicine" }));
    await userEvent.click(screen.getByRole("button", { name: "I understand — read in this role" }));
    expect(store.getState().prefs.role).toMatchObject({ role: "learner", version: ROLE_STATEMENT_VERSION });
    expect(await screen.findByTestId("role-on")).toHaveTextContent("Learner mode");
    await userEvent.click(within(await screen.findByRole("region", { name: "Who is reading" })).getByRole("radio", { name: "General reader" }));
    expect(store.getState().prefs.role).toMatchObject({ role: "general" });
    expect(screen.queryByTestId("role-on")).toBeNull();
  });

  it("the landing page offers it once; put aside, or once chosen, it is not offered again", async () => {
    const { store, unmount } = await open("/", declaring);
    const offer = within(await screen.findByRole("region", { name: "Studying Chinese medicine, or a practitioner?" }));
    expect(offer.getByRole("link", { name: "Choose a reading role" })).toHaveAttribute("href", "/en/settings#settings-role");
    await userEvent.click(offer.getByRole("button", { name: "No, thanks" }));
    expect(store.getState().prefs.roleOffered).toBe(true);
    expect(screen.queryByRole("region", { name: "Studying Chinese medicine, or a practitioner?" })).toBeNull();
    unmount();
    await open("/", declaring, { role: ROLE });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: "Studying Chinese medicine, or a practitioner?" })).toBeNull();
  });

  it("a general reader's results have no study reference; a declared learner's have it", async () => {
    expect(declaring.role).toBeNull();
    expect(defaultRoleOf(declaring)).toBeNull();
    expect(effectiveRole(null, declaring)).toBeNull();
    expect(effectiveRole("learner", declaring)).toBe("learner");
  });
});

describe("who reads with the study reference — where every reader does unless they choose otherwise (dose_display all, the default)", () => {
  it("the Settings card says so: the learner is the default, nothing is asked, and no chip crowds the header", async () => {
    const { store } = await open("/settings", everyone);
    const card = within(await screen.findByRole("region", { name: "Who is reading" }));
    expect(card.getByText(/The study reference is on by default/)).toBeInTheDocument();
    expect(card.getByRole("radio", { name: "Studying Chinese medicine" })).toBeChecked();
    expect(card.getByText(/You have not chosen: the default applies/)).toBeInTheDocument();
    expect(card.queryByText(/not a check of qualifications/)).toBeNull();
    expect(screen.queryByTestId("role-on")).toBeNull();
    expect(store.getState().prefs.role).toBeUndefined();
    expect(screen.queryByRole("region", { name: "Studying Chinese medicine, or a practitioner?" })).toBeNull();
  });

  it("choosing General reader is one switch: it is remembered, nothing is fetched afterwards, and results already made stay as they were", async () => {
    const { store, unmount } = await open("/settings", everyone);
    const card = within(await screen.findByRole("region", { name: "Who is reading" }));
    await userEvent.click(card.getByRole("radio", { name: "General reader (no quantities)" }));
    expect(store.getState().prefs.role).toMatchObject({ role: "general", version: ROLE_STATEMENT_VERSION });
    expect(card.getByRole("radio", { name: "General reader (no quantities)" })).toBeChecked();
    expect(card.queryByText(/You have not chosen/)).toBeNull();
    expect(card.getByText(/Results already made stay as they were/)).toBeInTheDocument();
    unmount();
    await open("/settings", everyone, { role: GENERAL });
    expect(within(await screen.findByRole("region", { name: "Who is reading" })).getByRole("radio", { name: "General reader (no quantities)" })).toBeChecked();
  });

  it("a practitioner is asked to attest; a learner (the default) is not", async () => {
    const { store } = await open("/settings", everyone, { role: GENERAL });
    const card = within(await screen.findByRole("region", { name: "Who is reading" }));
    await userEvent.click(card.getByRole("radio", { name: "Practitioner" }));
    expect(screen.getByRole("dialog", { name: "For study and clinical reference" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "I understand — read in this role" }));
    expect(store.getState().prefs.role).toMatchObject({ role: "practitioner" });
    expect(await screen.findByTestId("role-on")).toHaveTextContent("Practitioner mode");
  });

  it("when the reference cannot come the general knowledge base is used; the card and the review say so, and Try again asks once more", async () => {
    const raw = rawChunksFromDisk("release");
    let fail = true;
    const flaky = indexKnowledgeBase({ ...raw, reference: { roles: ["learner", "practitioner"], load: () => (fail ? Promise.reject(new Error("offline")) : Promise.resolve(learnerRef())) } });
    const first = await open("/settings", flaky);
    const card = within(await screen.findByRole("region", { name: "Who is reading" }));
    expect(await card.findByText(/The study reference cannot be loaded right now/)).toBeInTheDocument();
    expect(screen.queryByTestId("role-on")).toBeNull();
    fail = false;
    first.unmount();
    // a fresh page, the connection back
    const again = indexKnowledgeBase({ ...raw, reference: { roles: ["learner", "practitioner"], load: () => Promise.resolve(learnerRef()) } });
    await open("/settings", again);
    expect(within(await screen.findByRole("region", { name: "Who is reading" })).queryByText(/cannot be loaded/)).toBeNull();
  });
});

function learnerRef() {
  return (rawChunksFromDisk("release").reference!.load() as Promise<never>);
}

describe("no study reference served", () => {
  it("no card where the build serves nobody: a public release before the reviews, the off setting, and development (it reaches L3 for everyone)", async () => {
    for (const kb of [pub, nobody, indexKnowledgeBase(rawChunksFromDisk("dev"))]) {
      const a = await open("/settings", kb);
      await screen.findByRole("heading", { level: 1 });
      expect(screen.queryByRole("region", { name: "Who is reading" })).toBeNull();
      a.unmount();
    }
    expect(defaultRoleOf(pub)).toBeNull();
    expect(defaultRoleOf(nobody)).toBeNull();
  });
});

describe("results made with the study reference", () => {
  it("the role's knowledge base: L3 for an adult — amounts, every tier, a plan made with the record and stamped with the role; L0 for a pregnant reader", async () => {
    const adult = save(learnerKb, interview(learnerKb, "SP1"), "ro11111111111111");
    expect(adult.role).toBe("learner");
    expect(adult.result.policy.level).toBe("L3");
    expect(adult.result.recommendations.formulas.some((f) => f.composition.some((r) => r.typicalG !== undefined))).toBe(true);
    const planned = await attachPrescription(learnerKb, adult);
    expect(planned.prescription).toBeDefined();
    const general = save(everyone, interview(everyone, "SP1"), "ro22222222222222");
    expect(general.role).toBeUndefined();
    expect(general.result.policy.level).toBe("L1");
    expect(await attachPrescription(everyone, general)).toBe(general);
    const pregnant = interview(learnerKb, "SP1");
    const p = save(learnerKb, { ...pregnant, subject: { ...pregnant.subject, sex: "female", pregnancy: "yes", lactating: false } }, "ro33333333333333");
    expect(p.result.policy.level).toBe("L0");
  });

  it("running the review: by default a result is made with the study reference — stamped, with its plan; a reader who chose General reader gets neither", async () => {
    const draft = interview(everyone, "SP1");
    const a = await open("/review", everyone, {}, [], "en", { kb: everyone, engine }, draft);
    await userEvent.click(await screen.findByRole("button", { name: /Get my result/ }));
    await waitFor(() => expect(window.location.pathname).toMatch(/\/en\/result\/.+/));
    const made = await a.persistence.getAssessment(window.location.pathname.split("/").pop()!);
    expect(made?.role).toBe("learner");
    expect(made?.result.policy.level).toBe("L3");
    expect(made?.prescription).toBeDefined();
    a.unmount();
    go("/");
    const b = await open("/review", everyone, { role: GENERAL }, [], "en", { kb: everyone, engine }, draft);
    await userEvent.click(await screen.findByRole("button", { name: /Get my result/ }));
    await waitFor(() => expect(window.location.pathname).toMatch(/\/en\/result\/.+/));
    const plain = await b.persistence.getAssessment(window.location.pathname.split("/").pop()!);
    expect(plain?.role).toBeUndefined();
    expect(plain?.result.policy.level).toBe("L1");
    expect(plain?.prescription).toBeUndefined();
  });

  it("the result says it was made with the study reference; the formula page shows the amounts and the plan — each with the note that they are for study and as an aid to a practitioner only", async () => {
    const saved = await attachPrescription(learnerKb, save(learnerKb, interview(learnerKb, "SP1"), "ro44444444444444"));
    const note = tEn.t("safety.notice.amounts.text");
    expect(note).toMatch(/for study and as an aid to a practitioner only/);
    const a = await open(`/result/${saved.id}`, everyone, {}, [saved]);
    expect(await screen.findByTestId("result-role")).toHaveTextContent("made with the study reference");
    a.unmount();
    await open(`/result/${saved.id}/formula/${saved.prescription!.base.formula}`, everyone, {}, [saved]);
    const plan = within(await screen.findByRole("region", { name: "Medication plan (for study and clinical reference)" }));
    expect(plan.getAllByText(/^\d+(\.\d+)? g$/).length).toBeGreaterThan(0);
    expect(plan.getByText(note)).toBeInTheDocument();
    const composition = within(screen.getByRole("region", { name: "Composition" }));
    expect(composition.getByText(note)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Amount" })).toBeInTheDocument();
    expect(screen.getAllByTestId("amounts-note").length).toBe(2);
  });

  it("the Learn formula page shows the note beside its quantities; a general reader's page has neither", async () => {
    const note = tEn.t("safety.notice.amounts.text");
    const a = await open("/learn/formulas/F_SIJUNZI", everyone);
    await screen.findByRole("heading", { level: 1 });
    expect(await screen.findByText(note)).toBeInTheDocument();
    expect(screen.getAllByText(/^about \d+(\.\d+)? g$/).length).toBeGreaterThan(0);
    a.unmount();
    await open("/learn/formulas/F_SIJUNZI", everyone, { role: GENERAL });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(note)).toBeNull();
    expect(screen.queryAllByText(/^about \d+(\.\d+)? g$/)).toEqual([]);
  });

  it("the practitioner summary: the plan's section opens with the note, in the text copy too", async () => {
    const saved = await attachPrescription(learnerKb, save(learnerKb, interview(learnerKb, "SP1"), "ro44444444444445"));
    const s = prescriptionSection(saved, learnerKb, tEn)!;
    expect(s.title).toBe("Medication plan (for study and clinical reference)");
    expect(s.items![0]).toBe(tEn.t("safety.notice.amounts.text"));
    expect(s.items![1]).toMatch(/^Starting from /);
  });

  it("a result made with the study reference is shown as it was made to a general reader too — a formula only the study reference reaches has its page", async () => {
    const saved = ["EX1", "EX2", "SP2", "KD2", "LV1", "QB2"].map((p, i) => save(learnerKb, interview(learnerKb, p), `ro5555555555555${i}`))
      .find((s) => [...s.result.recommendations.formulas, ...s.result.recommendations.studyOnly].some((f) => !everyone.formulas.has(f.id)))!;
    const only = [...saved.result.recommendations.formulas, ...saved.result.recommendations.studyOnly].find((f) => !everyone.formulas.has(f.id))!;
    expect(only.tier === "B" || only.tier === "C").toBe(true);
    await open(`/result/${saved.id}/formula/${only.id}`, declaring, {}, [saved]);
    expect(await screen.findByRole("heading", { level: 1, name: new RegExp(learnerKb.formulas.get(only.id)!.name["zh-Hant"]) })).toBeInTheDocument();
  });
});

describe("the choice as data", () => {
  it("is read back only when well formed, and only the current attestation counts for a role", () => {
    expect(parsePrefs(JSON.stringify({ role: ROLE })).role).toEqual(ROLE);
    expect(parsePrefs(JSON.stringify({ role: GENERAL })).role).toEqual(GENERAL);
    for (const role of [{ ...ROLE, role: "doctor" }, { ...ROLE, at: "5" }, { role: "learner" }, "learner"]) expect(parsePrefs(JSON.stringify({ role })).role).toBeUndefined();
    expect(declaredOf({ ...DEFAULT_PREFS, role: ROLE })).toBe("learner");
    expect(declaredOf({ ...DEFAULT_PREFS, role: GENERAL })).toBe("general");
    expect(declaredOf({ ...DEFAULT_PREFS, role: { ...ROLE, version: "2026-01-01" } })).toBeNull();
    expect(declaredOf(DEFAULT_PREFS)).toBeNull();
  });

  it("the default and the choice: nothing chosen is the build's default; General reader hides it; a role is the role", () => {
    expect(defaultRoleOf(everyone)).toBe("learner");
    expect(effectiveRole(null, everyone)).toBe("learner");
    expect(effectiveRole("general", everyone)).toBeNull();
    expect(effectiveRole("practitioner", everyone)).toBe("practitioner");
    expect(effectiveRole(null, declaring)).toBeNull();
  });

  it("travels in a backup with the settings — a role or the choice to be a general reader; a record made with the study reference keeps it, with its plan", async () => {
    for (const choice of [ROLE, GENERAL]) {
      const prefs = backupPrefs({ ...DEFAULT_PREFS, role: choice });
      expect(prefs.role).toEqual(choice);
      expect(validatePrefs(prefs)).toEqual({ ok: true, value: prefs });
    }
    const saved = await attachPrescription(learnerKb, save(learnerKb, interview(learnerKb, "SP1"), "ro66666666666666"));
    const v = validateAssessment(JSON.parse(JSON.stringify(saved)));
    expect(v.ok && v.value.role).toBe("learner");
    expect(v.ok && v.value.prescription).toBeDefined();
  });

  it("a build that serves the study reference replays such a record with it; one that serves none refuses it", async () => {
    const saved = save(learnerKb, interview(learnerKb, "SP1"), "ro77777777777777");
    const document = { format: "tcm-backup", version: 1, createdAt: "2026-10-08T00:00:00Z", exportedFrom: { appVersion: "local", kbVersion: everyone.version, engineVersion: engine.ENGINE_VERSION, profile: "release" },
      storage: { assessment: 1, draft: 1 }, contents: { assessments: 1, draft: false, prefs: false, birth: false }, checksum: { alg: "SHA-256", of: "payload", value: "" },
      payload: { assessments: [{ v: 1, data: saved }], draft: null, prefs: null } } as never;
    const current = { engineVersion: engine.ENGINE_VERSION, kbVersion: everyone.version, profile: "release" as const };
    const served = prepareImport(document, { profile: "release", current, replay: makeReplay((s) => (s.role === "learner" ? learnerKb : everyone), engine), roles: everyone.roles, now: NOW });
    expect(served.rejected).toEqual([]);
    expect(served.records.map((r) => r.checked)).toEqual(["verified"]);
    const refused = prepareImport(document, { profile: "release", current, replay: makeReplay(everyone, engine), roles: [], now: NOW });
    expect(refused.rejected.map((r) => r.reason)).toEqual(["role"]);
  });
});
