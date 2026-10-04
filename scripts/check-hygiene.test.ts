import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { checkHygiene } from "./check-hygiene.ts";

const root = join(import.meta.dirname, "..");
const copies: string[] = [];
after(() => { for (const c of copies) rmSync(c, { recursive: true, force: true }); });

/** A private copy of the files the checker reads, to damage. */
function copy(): string {
  const dir = mkdtempSync(join(tmpdir(), "tcm-hygiene-"));
  copies.push(dir);
  for (const f of ["SECURITY.md", "CHANGELOG.md", "CONTRIBUTING.md", "LICENSE", ".github/CODEOWNERS", ".github/pull_request_template.md", ".github/ISSUE_TEMPLATE/config.yml", ".github/ISSUE_TEMPLATE/bug_report.md", ".github/ISSUE_TEMPLATE/safety_report.md"]) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    cpSync(join(root, f), join(dir, f));
  }
  for (const d of ["data", "scripts", "docs"]) mkdirSync(join(dir, d), { recursive: true });
  for (const f of ["docs/safety-policy.md", "docs/content-review.md", "docs/diagnosis-sop.zh-TW.md", "docs/privacy.md", "docs/release-process.md", "scripts/check-release.ts"]) writeFileSync(join(dir, f), "");
  mkdirSync(join(dir, "scripts/kb"), { recursive: true });
  return dir;
}
const edit = (dir: string, f: string, fn: (s: string) => string): void => writeFileSync(join(dir, f), fn(readFileSync(join(dir, f), "utf8")));

test("the repository passes", () => { assert.deepEqual(checkHygiene(root), []); });

test("a missing community file is reported", () => {
  const d = copy();
  rmSync(join(d, "SECURITY.md"));
  assert.deepEqual(checkHygiene(d), ["SECURITY.md is missing"]);
});

test("the PR template must match CONTRIBUTING §7, both ways", () => {
  const d = copy();
  edit(d, ".github/pull_request_template.md", (s) => s.replace(/- \[ \] \*\*Privacy impact:\*\*.*\n/, "- [ ] Something else\n"));
  const p = checkHygiene(d).join("\n");
  assert.match(p, /lacks the checklist item "\*\*Privacy impact:\*\*/);
  assert.match(p, /has "Something else", which CONTRIBUTING §7 does not/);
});

test("issue templates keep health data out; the safety template says it is public; blank issues stay off", () => {
  const d = copy();
  edit(d, ".github/ISSUE_TEMPLATE/bug_report.md", (s) => s.replace(/personal health information/g, "secrets"));
  edit(d, ".github/ISSUE_TEMPLATE/safety_report.md", (s) => s.replace(/public/gi, "open").replace(/^labels: .*$/m, ""));
  edit(d, ".github/ISSUE_TEMPLATE/config.yml", (s) => s.replace("false", "true"));
  const p = checkHygiene(d).join("\n");
  assert.match(p, /bug_report\.md does not tell the reporter to leave out personal health information/);
  assert.match(p, /safety_report\.md has no complete front matter/);
  assert.match(p, /does not say that the issue is public/);
  assert.match(p, /config\.yml allows blank issues/);
});

test("SECURITY.md and the issue form name the same private channel and forbid a public issue", () => {
  const d = copy();
  edit(d, ".github/ISSUE_TEMPLATE/config.yml", (s) => s.replace(/https:\/\/github\.com\/[^\s]+/, "https://example.com/report"));
  assert.match(checkHygiene(d).join("\n"), /config\.yml does not link to the address in SECURITY\.md/);
  edit(d, "SECURITY.md", (s) => s.replace("Do not open a public issue", "Open an issue").replace(/https:\/\/github\.com\/[^\s)>]+\/security\/advisories\/new/g, ""));
  const p = checkHygiene(d).join("\n");
  assert.match(p, /does not give the private vulnerability-reporting address/);
  assert.match(p, /does not say not to open a public issue/);
});

test("CODEOWNERS paths must exist and every line needs an owner; the changelog needs its Unreleased section", () => {
  const d = copy();
  writeFileSync(join(d, ".github/CODEOWNERS"), "* @a\n/nowhere/ @a\n/data/\n");
  edit(d, "CHANGELOG.md", (s) => s.replace("## Unreleased", "## 0.1.0"));
  const p = checkHygiene(d).join("\n");
  assert.match(p, /lists \/nowhere\/, which does not exist/);
  assert.match(p, /"\/data\/" has no owner/);
  assert.match(p, /no "## Unreleased" section/);
});
