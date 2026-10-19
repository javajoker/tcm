// The terms of service as documents and the licence statements (PD-36): TERMS.md and TERMS.zh-TW.md are what the app's messages give; the licence stays the Apache License 2.0;
// the NOTICE says what the product is for — study and the project's internal use — and that this is not a condition of the licence.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { staleDocuments, termsMarkdown } from "./terms.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string): string => readFileSync(join(root, f), "utf8");

test("TERMS.md and TERMS.zh-TW.md are what the messages give: the same twelve sections in both, each pointing to the other", () => {
  assert.deepEqual(staleDocuments(), [], "run `node scripts/terms.ts`");
  const en = termsMarkdown("en"), zh = termsMarkdown("zh-Hant");
  assert.equal((en.match(/^## \d+\. /gm) ?? []).length, 12);
  assert.equal((zh.match(/^## \d+\. /gm) ?? []).length, 12);
  assert.match(en, /\[繁體中文\]\(TERMS\.zh-TW\.md\)/);
  assert.match(zh, /\[English\]\(TERMS\.md\)/);
  assert.match(en, /^> \*\*Draft for legal review/m);
  assert.throws(() => termsMarkdown("en", { "terms.title": "x" }), /no message terms\.meta/);
});

test("the licence stays the Apache License 2.0; the NOTICE states the intended use without making it a condition of the licence", () => {
  const licence = read("LICENSE");
  assert.match(licence, /^\s*Apache License\s*\n\s*Version 2\.0, January 2004/);
  assert.match(licence, /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/);
  const notice = read("NOTICE");
  assert.match(notice, /INTENDED USE: FOR STUDY AND INTERNAL PROJECT USE ONLY/);
  assert.match(notice, /internal doctors, learners and candidate users/);
  assert.match(notice, /governed by the terms of service \(TERMS\.md; Traditional Chinese: TERMS\.zh-TW\.md\)/);
  assert.match(notice, /It is not a condition of the licence/);
  assert.match(notice, /section 4\(d\)/);
});
