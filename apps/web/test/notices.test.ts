import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { createI18n, placeholdersOf, type Message } from "@tcm/i18n";
import type { NoticeId } from "@tcm/engine";
import { describe, expect, it } from "vitest";
import { entriesOf, merge, parseNoticeRows, SLUG } from "../../../scripts/sync-notices.ts";
import { catalogs, type MessageKey } from "../src/i18n/catalogs.ts";

const policy = readFileSync(resolvePath(process.cwd(), "../../docs/safety-policy.md"), "utf8");
const rows = parseNoticeRows(policy);
const zh = catalogs["zh-Hant"] as Record<string, Message>;
const en = catalogs.en as Record<string, Message>;
const noticeKeys = Object.keys(zh).filter((k) => k.startsWith("safety.notice."));

const ENGINE_NOTICES: readonly NoticeId[] = ["N-A", "N-B", "N-MINOR", "N-PREG", "N-LACT", "N-SERIOUS", "N-ELDERLY", "N-MED", "N-ALLERGY", "N-ACUTE", "N-LOWCONF", "N-CONFLICT"];
const BLOCKING: readonly NoticeId[] = ["N-A", "N-B", "N-MINOR", "N-PREG", "N-LACT", "N-SERIOUS"];
const KNOWN_PARAMS = new Set(["reason", "emergency_number", "class", "removed_or_marked", "allergen", "text"]);

describe("the notice catalogue (I-04)", () => {
  it("is exactly the wording of docs/safety-policy.md §4 in both languages (run `node scripts/sync-notices.ts` after editing the policy)", () => {
    expect(rows.length).toBeGreaterThanOrEqual(21);
    for (const [lang, dict, which] of [["zh-Hant", zh, "zh"], ["en", en, "en"]] as const) {
      const expected = merge({}, entriesOf(rows, which));
      const actual = Object.fromEntries(Object.entries(dict).filter(([k]) => k.startsWith("safety.notice.")));
      expect(actual, lang).toEqual(expected);
    }
  });

  it("every notice the engine can request has its wording; blocking ones have title and body, inline ones one text", () => {
    for (const id of ENGINE_NOTICES) {
      const slug = SLUG[id]!;
      expect(slug, id).toBeDefined();
      for (const dict of [zh, en]) {
        if (BLOCKING.includes(id)) { expect(dict[`safety.notice.${slug}.title`], id).toBeTypeOf("string"); expect(dict[`safety.notice.${slug}.body`], id).toBeTypeOf("string"); } else expect(dict[`safety.notice.${slug}.text`], id).toBeTypeOf("string");
      }
    }
  });

  it("both languages have the same keys and the same placeholders", () => {
    expect(Object.keys(en).filter((k) => k.startsWith("safety.notice.")).sort()).toEqual([...noticeKeys].sort());
    for (const k of noticeKeys) {
      const a = placeholdersOf(zh[k]!), b = placeholdersOf(en[k]!);
      expect([...b.params].sort(), k).toEqual([...a.params].sort());
      for (const p of a.params) expect(KNOWN_PARAMS.has(p), `${k}: unknown parameter {${p}}`).toBe(true);
    }
  });

  it("renders with all its parameters, leaving no placeholder behind, in both languages", () => {
    for (const lang of ["zh-Hant", "en"] as const) {
      const t = createI18n<MessageKey>(catalogs, lang);
      for (const k of noticeKeys) {
        const params = Object.fromEntries([...placeholdersOf(zh[k]!).params].map((p) => [p, `«${p}»`]));
        const out = t.t(k as MessageKey, params);
        expect(out, `${lang} ${k}`).not.toMatch(/\{[a-z_]+\}/);
        for (const p of Object.keys(params)) expect(out, `${lang} ${k} uses {${p}}`).toContain(`«${p}»`);
      }
    }
  });

  it("the blocking notices say what the app will still do (the flow continues) and never promise a diagnosis or cure", () => {
    for (const id of BLOCKING) {
      const body = en[`safety.notice.${SLUG[id]!}.body`] as string;
      expect(body, id).toMatch(/continue|keep using/i);
    }
    for (const k of noticeKeys) expect(String(en[k]), k).not.toMatch(/\b(cure[sd]?|treats? your|diagnos(es|ed) you)\b/i);
  });

  it("the action labels and the removed/marked values exist in both languages", () => {
    for (const k of ["safety.action.acknowledge", "safety.action.showNumbers", "safety.value.removed", "safety.value.marked"]) { expect(zh[k], k).toBeTypeOf("string"); expect(en[k], k).toBeTypeOf("string"); }
  });
});
