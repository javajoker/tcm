// The practitioner reference skill as it ships (PM-65): built into a temporary folder, then checked as Claude meets it — the instructions with their counts, the references,
// the licence and the notice, the package's layout — and its script run as the skill runs it: the report in both languages, and the answers for a case that does not read
// and for one that lacks a safety fact. The pipeline itself is tested against the app in apps/web/test/practitioner.test.ts.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { buildSkill, SKILL, SOURCE, type SkillBuild } from "./build-skill.ts";

let out: string;
let built: SkillBuild;
before(async () => { out = mkdtempSync(join(tmpdir(), "skill-")); built = await buildSkill({ out, build: "test" }); });
after(() => rmSync(out, { recursive: true, force: true }));

const read = (rel: string): string => readFileSync(join(built.dir, rel), "utf8");
const run = (args: readonly string[], input?: string): { code: number | null; stdout: string; stderr: string } => {
  const r = spawnSync(process.execPath, [join(built.dir, "scripts", "reference.mjs"), ...args], { encoding: "utf8", ...(input !== undefined ? { input } : {}) });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};

test("the instructions as Claude loads them: valid frontmatter, the counts of the knowledge base filled in, every file they name present", () => {
  const md = read("SKILL.md");
  const front = /^---\n([\s\S]*?)\n---\n/.exec(md)![1]!;
  const field = (k: string): string => new RegExp(`^${k}: (.+)$`, "m").exec(front)?.[1] ?? "";
  assert.equal(field("name"), SKILL);
  assert.match(SKILL, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  const description = field("description");
  assert.ok(description.length > 200 && description.length <= 1024, "a description Claude can trigger on, within the limit");
  assert.doesNotMatch(description, /[<>]/);
  assert.deepEqual(Object.keys(Object.fromEntries(front.split("\n").map((l) => [l.split(":")[0], 1]))).sort(), ["compatibility", "description", "license", "name"]);
  assert.doesNotMatch(md, /\{\{/, "the counts are filled in");
  assert.match(md, /holds \*\*\d+ patterns and \d+ formulas\*\*/);
  for (const f of ["references/vocabulary.md", "references/case-format.md", "assets/example-case.json", "scripts/reference.mjs", "LICENSE", "NOTICE"]) assert.ok(read(f).length > 0, f);
  for (const f of md.match(/`(references|assets|scripts)\/[^`]+`/g) ?? []) assert.ok(read(f.slice(1, -1).split(" ")[0]!).length > 0, `${f} is named and present`);
  assert.equal(read("references/case-format.md"), readFileSync(join(SOURCE, "references", "case-format.md"), "utf8"));
});

test("the package: the folder at the root of a zip, without the evals", () => {
  const names = execFileSync("python3", ["-c", "import sys, zipfile; print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))", built.skill], { encoding: "utf8" }).trim().split("\n").sort();
  assert.deepEqual(names, ["LICENSE", "NOTICE", "SKILL.md", "assets/example-case.json", "references/case-format.md", "references/vocabulary.md", "scripts/kb.json", "scripts/reference.mjs"].map((f) => `${SKILL}/${f}`));
  assert.ok(built.bytes.skill < 1024 * 1024, "under a megabyte packed");
});

test("the script reads its knowledge base in the practitioner's role and names its build", () => {
  const v = JSON.parse(run(["--version"]).stdout) as { build: string; kb: string; role: string; profile: string };
  assert.deepEqual({ build: v.build, role: v.role, profile: v.profile }, { build: "test", role: "practitioner", profile: "release" });
  assert.equal(v.kb, built.kb);
  assert.match(v.kb, /^skill-[0-9a-f]{12}$/);
  assert.equal(run(["--vocabulary"]).stdout, read("references/vocabulary.md"), "the vocabulary is the script's own");
});

test("the example case: the report in Chinese and in English, with the formula and its grams", () => {
  const example = join(built.dir, "assets", "example-case.json");
  const zh = run([example]);
  assert.equal(zh.code, 0, zh.stderr);
  assert.match(zh.stdout, /^# 中醫參考方藥（供醫師核對）/);
  assert.match(zh.stdout, /## 參考方：參苓白朮散/);
  assert.match(zh.stdout, /\| 君 \| 人參 \| \d+(\.5)? 克 \| 3–9 克 \|/);
  const en = run([example, "--lang", "en"]);
  assert.equal(en.code, 0);
  assert.match(en.stdout, /^# TCM reference formula/);
  assert.match(en.stdout, /\| 君 Sovereign \| Ginseng \(人參\) \|/);
  assert.doesNotMatch(en.stdout, /\byou(r)?\b/i);
  const data = JSON.parse(run([example, "--json"]).stdout) as { status: string; level: string; plan: { composition: unknown[] }; report: string };
  assert.equal(data.status, "ok");
  assert.equal(data.level, "L3");
  assert.equal(data.report, zh.stdout);
});

test("a case that does not read answers with exit 2 and the errors; one that lacks a safety fact with exit 3 and what to ask", () => {
  const bad = run(["-"], JSON.stringify({ person: { age: 45, sex: "female" }, findings: { S_FATIGU: "present" } }));
  assert.equal(bad.code, 2);
  assert.deepEqual((JSON.parse(bad.stdout) as { errors: { path: string; suggest?: string[] }[] }).errors[0], { path: "findings/S_FATIGU", message: "not a symptom of the inquiry", suggest: ["S_FATIGUE"] });
  assert.equal(run(["-"], "not json").code, 2);
  const short = run(["-"], JSON.stringify({ person: { age: 45, sex: "female" }, findings: { S_FATIGUE: "present" } }));
  assert.equal(short.code, 3);
  assert.deepEqual(JSON.parse(short.stdout), { status: "incomplete", errors: [], missing: ["pregnancy", "lactating", "medications", "allergies", "conditions"] });
  assert.equal(run([]).code, 1);
});
