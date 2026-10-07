// Learners and practitioners in the app (PM-53; docs/post-mvp/design/prescription-model.md §7.4): the role declared with the safety policy's attestation, the knowledge base of the
// role (the reference merged in), what a result made for a role holds and how it is shown — to a general reader too —, the fallback when the reference cannot come, and backups.
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase, type KnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { afterEach, describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { makeReplay } from "../src/app/backupReplay.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { attachPrescription } from "../src/app/prescription.ts";
import { ROLE_STATEMENT_VERSION, roleOf } from "../src/app/role.ts";
import { backupPrefs } from "../src/storage/backup/format.ts";
import { prepareImport } from "../src/storage/backup/plan.ts";
import { validateAssessment, validatePrefs } from "../src/storage/backup/validate.ts";
import { parsePrefs } from "../src/storage/prefs.ts";
import { DEFAULT_PREFS, type Draft, type SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";

const beta = indexKnowledgeBase(rawChunksFromDisk("release"));                           // the closed beta: it serves the roles
const pub = indexKnowledgeBase(rawChunksFromDisk("release", undefined, false));          // a public release before the reviews: no role
const learnerKb = await beta.forRole("learner");
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });
const ROLE = { role: "learner", at: 5, version: ROLE_STATEMENT_VERSION } as const;
const NOW = 1_700_000_000_000;

const save = (kb: KnowledgeBase, d: Draft, id: string): SavedAssessment => toSaved(d, engine.assess(kb, assessInputOf(d, NOW)!), { id, lang: "en", role: kb.role });

async function open(path: string, kb: KnowledgeBase, prefs: object = {}, records: readonly SavedAssessment[] = [], lang: "en" | "zh-Hant" = "en") {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang, ...prefs }));
  const t = testStore(env);
  for (const r of records) await t.persistence.putAssessment(r);
  go(`/${lang}${path}`);
  const loaded: Loaded = { kb, engine };
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  return { ...view, store: t.store };
}

describe("the role in Settings", () => {
  it("where the build serves roles: a general reader by default; a learner is asked to attest first; the attestation is the safety policy's; one choice withdraws it", async () => {
    const { store } = await open("/settings", beta);
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
    expect(store.getState().prefs.role).toBeUndefined();
    expect(screen.queryByTestId("role-on")).toBeNull();
  });

  it("no card where the build serves no role: a public release before the reviews, and development (it reaches L3 for everyone)", async () => {
    const a = await open("/settings", pub);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: "Who is reading" })).toBeNull();
    a.unmount();
    await open("/settings", indexKnowledgeBase(rawChunksFromDisk("dev")));
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: "Who is reading" })).toBeNull();
  });

  it("the landing page offers it once; put aside, or once chosen, it is not offered again", async () => {
    const { store, unmount } = await open("/", beta);
    const offer = within(await screen.findByRole("region", { name: "Studying Chinese medicine, or a practitioner?" }));
    expect(offer.getByRole("link", { name: "Choose a reading role" })).toHaveAttribute("href", "/en/settings#settings-role");
    await userEvent.click(offer.getByRole("button", { name: "No, thanks" }));
    expect(store.getState().prefs.roleOffered).toBe(true);
    expect(screen.queryByRole("region", { name: "Studying Chinese medicine, or a practitioner?" })).toBeNull();
    unmount();
    await open("/", beta, { role: ROLE });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: "Studying Chinese medicine, or a practitioner?" })).toBeNull();
  });
});

describe("a learner's knowledge base and results", () => {
  it("the role's knowledge base: L3 for an adult — amounts, every tier, a plan made with the record and stamped with the role; L0 for a pregnant learner", async () => {
    const adult = save(learnerKb, interview(learnerKb, "SP1"), "ro11111111111111");
    expect(adult.role).toBe("learner");
    expect(adult.result.policy.level).toBe("L3");
    expect(adult.result.recommendations.formulas.some((f) => f.composition.some((r) => r.typicalG !== undefined))).toBe(true);
    const planned = await attachPrescription(learnerKb, adult);
    expect(planned.prescription).toBeDefined();
    const general = save(beta, interview(beta, "SP1"), "ro22222222222222");
    expect(general.role).toBeUndefined();
    expect(general.result.policy.level).toBe("L1");
    expect(await attachPrescription(beta, general)).toBe(general);
    const pregnant = interview(learnerKb, "SP1");
    const p = save(learnerKb, { ...pregnant, subject: { ...pregnant.subject, sex: "female", pregnancy: "yes", lactating: false } }, "ro33333333333333");
    expect(p.result.policy.level).toBe("L0");
  });

  it("the result says it was made for a learner; the formula page shows the amounts and the medication plan for study and clinical reference", async () => {
    const saved = await attachPrescription(learnerKb, save(learnerKb, interview(learnerKb, "SP1"), "ro44444444444444"));
    const a = await open(`/result/${saved.id}`, beta, { role: ROLE }, [saved]);
    expect(await screen.findByTestId("result-role")).toHaveTextContent("This result was made in the role “Studying Chinese medicine”");
    a.unmount();
    await open(`/result/${saved.id}/formula/${saved.prescription!.base.formula}`, beta, { role: ROLE }, [saved]);
    const plan = within(await screen.findByRole("region", { name: "Medication plan (for study and clinical reference)" }));
    expect(plan.getAllByText(/^\d+(\.\d+)? g$/).length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: "Amount" })).toBeInTheDocument();
  });

  it("a result made for a learner is shown as it was made to a general reader too — a formula only the role reaches has its page", async () => {
    const saved = ["EX1", "EX2", "SP2", "KD2", "LV1", "QB2"].map((p, i) => save(learnerKb, interview(learnerKb, p), `ro5555555555555${i}`))
      .find((s) => [...s.result.recommendations.formulas, ...s.result.recommendations.studyOnly].some((f) => !beta.formulas.has(f.id)))!;
    const only = [...saved.result.recommendations.formulas, ...saved.result.recommendations.studyOnly].find((f) => !beta.formulas.has(f.id))!;
    expect(only.tier === "B" || only.tier === "C").toBe(true);
    await open(`/result/${saved.id}/formula/${only.id}`, beta, {}, [saved]);
    expect(await screen.findByRole("heading", { level: 1, name: new RegExp(learnerKb.formulas.get(only.id)!.name["zh-Hant"]) })).toBeInTheDocument();
  });

  it("when the reference cannot come, the general knowledge base is used, and the header and Settings say so", async () => {
    const raw = rawChunksFromDisk("release");
    const failing = indexKnowledgeBase({ ...raw, reference: { roles: ["learner", "practitioner"], load: () => Promise.reject(new Error("offline")) } });
    await open("/settings", failing, { role: ROLE });
    expect(await screen.findByTestId("role-on")).toHaveTextContent("Learner mode (reference not loaded)");
    expect(await screen.findByText(/The reference cannot be loaded right now/)).toBeInTheDocument();
  });
});

describe("the role as data", () => {
  it("is read back only when well formed, and only the current attestation counts", () => {
    expect(parsePrefs(JSON.stringify({ role: ROLE })).role).toEqual(ROLE);
    for (const role of [{ ...ROLE, role: "doctor" }, { ...ROLE, at: "5" }, { role: "learner" }, "learner"]) expect(parsePrefs(JSON.stringify({ role })).role).toBeUndefined();
    expect(roleOf({ ...DEFAULT_PREFS, role: ROLE })).toBe("learner");
    expect(roleOf({ ...DEFAULT_PREFS, role: { ...ROLE, version: "2026-01-01" } })).toBeNull();
  });

  it("travels in a backup with the settings; a record made for a role keeps it, with its plan", async () => {
    const prefs = backupPrefs({ ...DEFAULT_PREFS, role: ROLE });
    expect(prefs.role).toEqual(ROLE);
    expect(validatePrefs(prefs)).toEqual({ ok: true, value: prefs });
    const saved = await attachPrescription(learnerKb, save(learnerKb, interview(learnerKb, "SP1"), "ro66666666666666"));
    const v = validateAssessment(JSON.parse(JSON.stringify(saved)));
    expect(v.ok && v.value.role).toBe("learner");
    expect(v.ok && v.value.prescription).toBeDefined();
  });

  it("a build that serves the roles replays a learner's record with the learner's knowledge base; one that serves none refuses it", async () => {
    const saved = save(learnerKb, interview(learnerKb, "SP1"), "ro77777777777777");
    const document = { format: "tcm-backup", version: 1, createdAt: "2026-10-08T00:00:00Z", exportedFrom: { appVersion: "local", kbVersion: beta.version, engineVersion: engine.ENGINE_VERSION, profile: "release" },
      storage: { assessment: 1, draft: 1 }, contents: { assessments: 1, draft: false, prefs: false, birth: false }, checksum: { alg: "SHA-256", of: "payload", value: "" },
      payload: { assessments: [{ v: 1, data: saved }], draft: null, prefs: null } } as never;
    const current = { engineVersion: engine.ENGINE_VERSION, kbVersion: beta.version, profile: "release" as const };
    const served = prepareImport(document, { profile: "release", current, replay: makeReplay((s) => (s.role === "learner" ? learnerKb : beta), engine), roles: beta.roles, now: NOW });
    expect(served.rejected).toEqual([]);
    expect(served.records.map((r) => r.checked)).toEqual(["verified"]);
    const refused = prepareImport(document, { profile: "release", current, replay: makeReplay(beta, engine), roles: [], now: NOW });
    expect(refused.rejected.map((r) => r.reason)).toEqual(["role"]);
  });
});
