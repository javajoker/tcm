// The project's lint configuration refuses every way of putting a string into the page as markup, or of running one (docs/post-mvp/design/backup-and-data-lock.md §3.4, task PM-07): the importer
// treats a backup file as untrusted, and this keeps the page from being the place where that would matter. The test runs the real configuration over small samples.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Linter } from "eslint";
import config from "../../eslint.config.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const linter = new Linter({ configType: "flat", cwd: root });
// the project's own configuration, plus the browser globals the samples name (the configuration declares none: TypeScript knows them)
const withGlobals = [...config, { files: ["**/*"], languageOptions: { globals: { setTimeout: "readonly", document: "readonly" } } }];
const lint = (code, file = "apps/web/src/screens/x.tsx") => linter.verify(code, withGlobals, { filename: `${root}${file}` }).filter((m) => m.ruleId !== null || m.fatal).map((m) => `${m.ruleId ?? "parse"}: ${m.message}`);

test("refuses markup from a string, in every spelling", () => {
  for (const [code, rule] of [
    ["export const A = (p: { h: string }) => <div dangerouslySetInnerHTML={{ __html: p.h }} />;", "no-restricted-syntax"],
    ["export const f = (e: HTMLElement, h: string) => { e.innerHTML = h; };", "no-restricted-syntax"],
    ["export const f = (e: HTMLElement, h: string) => { e.outerHTML = h; };", "no-restricted-syntax"],
    ["export const f = (e: HTMLElement, h: string) => { e.insertAdjacentHTML('beforeend', h); };", "no-restricted-syntax"],
    ["export const f = (h: string) => { document.write(h); };", "no-restricted-syntax"],
    ["export const f = (h: string) => new DOMParser().parseFromString(h, 'text/html');", "no-restricted-syntax"],
    ["export const f = (h: string) => document.createRange().createContextualFragment(h);", "no-restricted-syntax"],
    ["export const f = (s: string) => eval(s);", "no-eval"],
    ["export const f = (s: string) => new Function(s);", "no-new-func"],
    ["export const f = () => setTimeout('run()', 0);", "no-implied-eval"],
  ]) assert.ok(lint(code, "apps/web/src/screens/x.tsx").some((m) => m.startsWith(rule)), code);
});

test("allows what the app does: text, refs, and DOM that is not markup", () => {
  assert.deepEqual(lint("export const A = (p: { t: string }) => <p>{p.t}</p>;"), []);
  assert.deepEqual(lint("export const f = (e: HTMLElement, t: string) => { e.textContent = t; e.setAttribute('lang', 'en'); };"), []);
  assert.deepEqual(lint("export const f = () => document.querySelector('main')?.focus();"), []);
});

test("applies to the whole web app's source, and nowhere it does not belong (tests may read the DOM they build)", () => {
  assert.ok(lint("export const f = (e: HTMLElement, h: string) => { e.innerHTML = h; };", "apps/web/src/offline/x.ts").length > 0);
  assert.ok(lint("export const f = (e: HTMLElement, h: string) => { e.innerHTML = h; };", "apps/web/src/storage/x.ts").length > 0);
});
