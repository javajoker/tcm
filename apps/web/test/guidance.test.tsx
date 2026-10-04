import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import type { SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

/** The typical patient of a pattern, assessed in dev (where diet and points are open). */
function saved(pattern: string, id: string): SavedAssessment {
  const draft = interview(kb, pattern);
  return toSaved(draft, engine.assess(kb, assessInputOf(draft, Date.UTC(2026, 9, 4, 12))!), { id, lang: "en" });
}
async function open(s: SavedAssessment, lang: "en" | "zh-Hant") {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  await t.persistence.putAssessment(s);
  go(`/${lang}/result/${s.id}`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  await screen.findByRole("heading", { level: 1, name: lang === "en" ? "Your result" : "評估結果" });
  return view;
}

describe("diet, acupressure and lifestyle in the result (K-11)", () => {
  const sp1 = saved("SP1", "r0123456789abcdef");
  const advice = (): ReturnType<typeof within> => within(screen.getByRole("region", { name: /^(Advice|建議)$/ }));
  /** The list item of a point or food (a point's name is also a label in its schematic). */
  const listed = (name: string): HTMLElement => advice().getAllByText(name).map((e: HTMLElement) => e.closest("li")).find((li: HTMLElement | null) => li !== null)!;

  it("a food shows its nature and flavour, and — folded — why it is suggested, its basis, cautions and citation", async () => {
    await open(sp1, "en");
    const yam = advice().getByText("山藥").closest("li")!;
    expect(within(yam).getByText(/平 · 甘/)).toBeInTheDocument();
    const why = within(yam).getByText("Why this food");
    expect(why.closest("details")).not.toHaveAttribute("open");
    await userEvent.click(why);
    expect(within(yam).getByText(/Sweet and neutral; traditionally used to support the spleen and stomach/)).toBeInTheDocument();
    expect(within(yam).getByText(/Pharmacopoeia of the People's Republic of China, 2025/)).toBeInTheDocument();
    expect(within(yam).getAllByRole("button").length).toBeGreaterThanOrEqual(1);                  // the citation chip
    const millet = advice().getByText("小米").closest("li")!;
    await userEvent.click(within(millet).getByText("Why this food"));
    expect(within(millet).getByText(/General textbook teaching \(draft, not yet reviewed\)/)).toBeInTheDocument();
  });

  it("a point shows where it is, its code and meridian, its own cautions, and one shared note on how to press", async () => {
    await open(sp1, "en");
    const point = listed("足三里");
    expect(within(point).getByText("ST36 · 胃經")).toBeInTheDocument();
    expect(within(point).getByText(/four finger-widths below the outer hollow under the kneecap/)).toBeInTheDocument();
    const figure = advice().getByRole("img", { name: /Front of the leg \(right leg\).*足三里 ST36/ });         // the schematic of the leg, with the point marked and labelled in text
    expect(within(figure.closest("figure")!).getByText("足三里")).toBeInTheDocument();
    const notes = advice().getByText("How to press").closest("details")!;
    await userEvent.click(within(notes).getByText("How to press"));
    expect(within(notes).getByText(/Press and knead with the thumb or a fingertip/)).toBeInTheDocument();
    expect(within(notes).getByText(/Stop at once if pain gets worse/)).toBeInTheDocument();
  });

  it("a point to avoid in pregnancy says so with a chip and a caution; a food with a caution has a chip too", async () => {
    await open(saved("QB1", "r1123456789abcdef"), "en");
    const point = listed("三陰交");
    expect(within(point).getByText("Not in pregnancy")).toBeInTheDocument();
    await userEvent.click(within(point).getByText("Cautions for this point"));
    expect(within(point).getByText(/Do not press this point if you are pregnant or may be pregnant/)).toBeInTheDocument();
    const dates = advice().getByText("桂圓").closest("li")!;
    expect(within(dates).getByText("Use with caution in pregnancy")).toBeInTheDocument();
  });

  it("the lifestyle line is in English on the English page and in Chinese on the Chinese page", async () => {
    const en = await open(sp1, "en");
    expect(advice().getByText("Eat at regular times, chew slowly, and take a walk after meals.")).toBeInTheDocument();
    en.unmount();
    await open(sp1, "zh-Hant");
    expect(advice().getByText("三餐規律、細嚼慢嚥、飯後散步")).toBeInTheDocument();
    expect(advice().getAllByText(/位置/).length).toBeGreaterThan(0);
  });

  it.each(["en", "zh-Hant"] as const)("has no accessibility violations (%s)", async (lang) => {
    const { container } = await open(sp1, lang);
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
