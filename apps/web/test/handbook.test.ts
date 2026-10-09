// The printed herb handbook (PM-62, PM-63; scripts/print-herbs.ts) against the pages it prints: the same vocabulary tables as the herb list; for every herb in both languages the same
// words for its category, nature, flavours and channels, the same caution text, functions, formulas and source line as the page model the app builds (herbPage), and the record's flags
// marked exactly when the page states them; and for every formula the same roles and herbs, cautions, action, reasoning and tier reasons as its page (formulaPage) — all in the knowledge
// base the closed beta's default reader reads. The handbook keeps copies of the tables (a script cannot import the app); this test keeps them equal.
import { createI18n } from "@tcm/i18n";
import { describe, expect, it } from "vitest";
import { catalogs, type MessageKey } from "../src/i18n/catalogs.ts";
import { CATEGORIES, categoryLabel, channelLabel, FLAVORS, flavorLabel, herbPage, NATURES, natureLabel } from "../src/learn/herbs.ts";
import { formulaPage } from "../src/learn/pages.ts";
import type { Block, Cell, Name } from "../src/learn/types.ts";
import { ROLE_SLUG, SCHOOL_SLUG, tierReason } from "../src/screens/result/words.ts";
import * as print from "../../../scripts/print-herbs.ts";

const hb = print.handbook();
const tFor = (lang: "en" | "zh-Hant") => createI18n<MessageKey>({ ...catalogs, "zh-Hans": {} }, lang, { zh: hb.kb.zh });
/** The text of the handbook's HTML. */
const plain = (html: string): string => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const names = (blocks: readonly Block[], kind: "links" | "groups"): string[] =>
  blocks.filter((b) => b.kind === kind).flatMap((b) => ("groups" in b ? b.groups : []).flatMap((g) => g.items.map((i) => ("name" in i ? (i.name as Name) : (i as Name))["zh-Hant"])));

describe("the handbook prints what the herb pages show", () => {
  it("with the herb list's vocabulary: the categories in the textbook's order, the natures coldest first, the flavours", () => {
    expect(print.CATEGORIES).toEqual(CATEGORIES);
    expect(print.NATURES).toEqual(NATURES);
    expect(print.FLAVORS).toEqual(FLAVORS);
    expect(Object.fromEntries(print.ROLES)).toEqual(ROLE_SLUG);
    expect(hb.formulas.map((f) => f.school)).toEqual([...hb.formulas].map((f) => f.school).sort((a, b) => Object.keys(SCHOOL_SLUG).indexOf(a) - Object.keys(SCHOOL_SLUG).indexOf(b)));
  });

  for (const lang of ["zh-Hant", "en"] as const) {
    it(`for every herb, in ${lang}: the same words, caution, functions, formulas and source line as its page, and its flags`, () => {
      const t = tFor(lang);
      const w = print.wordsFor(lang);
      for (const h of hb.herbs) {
        const d = h.detail;
        const page = herbPage(hb.kb, d, t);
        const entry = plain(print.entryHtml(w, hb, h));
        const where = `${d.slug} (${lang})`;
        expect(plain(print.categoryWord(w, d.category)), where).toBe(categoryLabel(t, d.category));
        for (const n of d.nature) expect(plain(print.natureWord(w, n)), where).toBe(natureLabel(t, n));
        for (const f of d.flavors) expect(plain(print.flavorWord(w, f)), where).toBe(flavorLabel(t, f));
        for (const c of d.channels) expect(plain(print.channelWord(w, hb.kb, c)), where).toBe(channelLabel(hb.kb, t, c));
        for (const c of page.cautions) expect(entry, where).toContain(c["zh-Hant"]);
        for (const f of d.functions) expect(entry, where).toContain(f);
        expect(entry, where).toContain(page.sourceLabel);
        const formulas = page.sections.find((s) => s.id === "formulas")?.blocks ?? [];
        const used = print.formulasOf(hb.kb, d);
        expect(used.here.map((x) => x.name["zh-Hant"]), where).toEqual(names(formulas, "links"));
        expect(used.elsewhere, where).toEqual(names(formulas, "groups"));
        // the record's flags: the page states each one; the handbook marks those the record has
        const marks = print.marksOf(w, h).map(plain).join(" ");
        expect(page.flags[0], where).toBe(t.t(d.toxic ? "learn.herb.toxic" : "learn.herb.notToxic"));
        expect(marks.includes(t.t("learn.herb.mark.avoid")), where).toBe(d.pregnancy === "avoid");
        expect(marks.includes(t.t("learn.herb.mark.caution")), where).toBe(d.pregnancy === "caution");
        for (const i of d.interactions) expect(marks, where).toContain(t.t(`formula.interaction.${i}` as MessageKey));
      }
    });

    it(`for every formula, in ${lang}: the same roles and herbs, cautions, action, reasoning and tier reasons as its page`, () => {
      const t = tFor(lang);
      const w = print.wordsFor(lang);
      expect(hb.formulas.length).toBe(hb.kb.formulas.size);
      for (const f of hb.formulas) {
        const page = formulaPage(hb.kb, f.id, t)!;
        const entry = plain(print.formulaHtml(w, hb, f));
        const where = `${f.id} (${lang})`;
        const table = page.sections.find((x) => x.id === "composition")!.blocks.find((b) => b.kind === "table") as { readonly rows: readonly (readonly Cell[])[] };
        // the roles in order, each herb under the record's name the page gives it
        let at = 0;
        for (const [i, row] of table.rows.entries()) {
          const herb = (row[1] as Name)["zh-Hant"];
          const found = entry.indexOf(herb, at);
          expect(found, `${where}: ${herb}, the ${f.composition[i]!.role}, in order`).toBeGreaterThan(at - 1);
          at = found;
        }
        for (const c of page.cautions) expect(entry, where).toContain(lang === "en" ? c.en! : c["zh-Hant"]);
        expect(entry, where).toContain(lang === "en" ? f.principle_en : f.principle);
        expect(entry, where).toContain(lang === "en" ? f.rationale_en : f.rationale_zh);
        for (const r of f.tier_reasons) expect(entry, where).toContain(tierReason(t, r));
        expect(entry, where).not.toMatch(/\d+(\.\d+)? ?(g|克|錢|兩)(?![\u3400-\u9fff])/);
      }
    });
  }
});
