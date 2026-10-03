import assert from "node:assert/strict";
import { test } from "node:test";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import plugin from "./no-literal-strings.js";

const linter = new Linter({ configType: "flat" });
const lint = (code) => linter.verify(code, [{
  files: ["**/*.tsx"], languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { i18n: plugin }, rules: { "i18n/no-literal-strings": "error" },
}], "x.tsx").map((m) => m.message);

test("flags Chinese and English text in JSX", () => {
  assert.equal(lint("const a = <p>你好</p>;").length, 1);
  assert.equal(lint("const a = <p>Hello <b>world</b></p>;").length, 2);
  assert.equal(lint("const a = <p>{'Hello'}</p>;").length, 1);
  assert.equal(lint("const a = <p>{`Hello`}</p>;").length, 1);
});

test("flags text-bearing attributes", () => {
  assert.equal(lint('const a = <img alt="圖" />;').length, 1);
  assert.equal(lint('const a = <button aria-label="Close" />;').length, 1);
  assert.equal(lint("const a = <input placeholder={'Search'} />;").length, 1);
  assert.equal(lint('const a = <a title="說明">{t("k")}</a>;').length, 1, "the title is text, the child is a catalog call");
});

test("allows symbols, digits, expressions, catalogs and non-text attributes", () => {
  assert.deepEqual(lint("const a = <span>·</span>;"), []);
  assert.deepEqual(lint("const a = <span>12 / 30</span>;"), []);
  assert.deepEqual(lint("const a = <span>{t('x.y')}</span>;"), []);
  assert.deepEqual(lint("const a = <span>{count}</span>;"), []);
  assert.deepEqual(lint('const a = <div className="card" data-testid="profile-badge" id="main" role="status" />;'), []);
  assert.deepEqual(lint('const a = <a href="/zh-Hant/" aria-label={label}>{t("k")}</a>;'), []);
  assert.deepEqual(lint("const a = <p>{' '}</p>;"), []);
});

test("message names the text and points at the guide", () => {
  const [m] = lint("const a = <p>你好</p>;");
  assert.match(m, /你好/);
  assert.match(m, /i18n-guide/);
});
