// The catalogs as the bundler writes them (task PM-58): every catalog file, rebuilt from the shared keys and its list, is the object its JSON holds; a file whose keys differ is
// written as it is; and the written form is smaller than the JSON it replaces.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { CATALOG_FILE, fileOfId, keysFileOf, keysId, keysModule, listId, listModule, messageList, zip } from "./catalog-modules.ts";

const I18N = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "src", "i18n");
const LANGS = ["zh-Hant", "en", "zh-Hans"];
const files = LANGS.flatMap((lang) => readdirSync(join(I18N, lang)).filter((f) => f.endsWith(".json")).map((f) => join(I18N, lang, f)));
const json = (file: string): Record<string, unknown> => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
const gz = (s: string): number => gzipSync(s, { level: 9 }).length;

test("every catalog file is a catalog file, and its keys are those of the Traditional Chinese file of its namespace", () => {
  assert.equal(files.length, 51, "seventeen namespaces in three languages (the herb handbook's among them, which no build imports)");
  for (const f of files) {
    assert.match(f, CATALOG_FILE);
    assert.equal(keysFileOf(f), join(I18N, "zh-Hant", f.split(/[\\/]/).at(-1)!));
  }
  assert.throws(() => keysFileOf("/tmp/other.json"), /not a catalog file/);
});

test("every catalog file rebuilt from the shared keys and its list is the object its JSON holds, keys in the same order", () => {
  for (const f of files) {
    const list = messageList(f);
    assert.ok(list !== null, `${f}: its keys are the namespace's, in order (check-i18n checks the parity)`);
    const rebuilt = zip(Object.keys(json(keysFileOf(f))), list);
    assert.deepEqual(rebuilt, json(f), f);
    assert.deepEqual(Object.keys(rebuilt), Object.keys(json(f)), f);
  }
});

test("the module of a file imports the keys and holds only the messages; the keys module holds only the keys", () => {
  const f = join(I18N, "en", "safety.json");
  const code = listModule(f);
  assert.match(code, /^import keys from "\\u0000tcm-catalog-keys:.*zh-Hant[\\/]+safety\.json\.js";/);
  assert.ok(!code.includes("safety.notice"), "no key in a language's module");
  assert.ok(code.includes(JSON.stringify(json(f)["safety.action.acknowledge"])));
  const keys = keysModule(keysFileOf(f));
  assert.ok(keys.includes("\"safety.action.acknowledge\"") && !keys.includes(String(json(f)["safety.action.acknowledge"])));
});

test("a module's id names its file and does not end in .json", () => {
  const f = join(I18N, "en", "safety.json");
  for (const id of [listId(f), keysId(keysFileOf(f))]) {
    assert.ok(id.startsWith("\0") && id.endsWith(".json.js"), id);
  }
  assert.equal(fileOfId(listId(f)), f);
  assert.equal(fileOfId(keysId(keysFileOf(f))), keysFileOf(f));
});

test("a file whose keys are not its namespace's, in order, is written as it is", () => {
  const dir = mkdtempSync(join(tmpdir(), "catalogs-"));
  try {
    for (const lang of ["zh-Hant", "en"]) mkdirSync(join(dir, "src", "i18n", lang), { recursive: true });
    writeFileSync(join(dir, "src", "i18n", "zh-Hant", "x.json"), JSON.stringify({ a: "甲", b: "乙" }));
    writeFileSync(join(dir, "src", "i18n", "en", "x.json"), JSON.stringify({ b: "B", a: "A" }));
    const en = join(dir, "src", "i18n", "en", "x.json");
    assert.equal(messageList(en), null);
    assert.equal(listModule(en), `export default ${JSON.stringify({ b: "B", a: "A" })};\n`);
    assert.deepEqual(messageList(join(dir, "src", "i18n", "zh-Hant", "x.json")), ["甲", "乙"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the keys written once and the lists are smaller than three catalogs that each repeat every key", () => {
  // as a chunk holds them: every namespace, one language after the other (the import paths are resolved away by the bundler)
  const namespaces = readdirSync(join(I18N, "zh-Hant"));
  const before = gz(LANGS.flatMap((lang) => namespaces.map((ns) => JSON.stringify(json(join(I18N, lang, ns))))).join("\n"));
  const after = gz([...namespaces.map((ns) => JSON.stringify(Object.keys(json(join(I18N, "zh-Hant", ns))))), ...LANGS.flatMap((lang) => namespaces.map((ns) => JSON.stringify(messageList(join(I18N, lang, ns)))))].join("\n"));
  assert.ok(after < before * 0.85, `${after} B against ${before} B gzip`);
});
