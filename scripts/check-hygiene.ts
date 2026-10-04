// Repository hygiene (task R-06): the community files exist and agree with CONTRIBUTING — the PR template carries the same checklist, the issue templates keep health data out,
// SECURITY.md and the issue-form link point at the same private channel, CODEOWNERS lists paths that exist, the changelog has its Unreleased section.
//   node scripts/check-hygiene.ts [--root <dir>]     exit 0 = clean, 1 = problems (listed)
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED = ["NOTICE", "data/README.md", "SECURITY.md", "CHANGELOG.md", "CONTRIBUTING.md", "LICENSE", ".github/CODEOWNERS", ".github/pull_request_template.md", ".github/ISSUE_TEMPLATE/config.yml", ".github/ISSUE_TEMPLATE/bug_report.md", ".github/ISSUE_TEMPLATE/safety_report.md"];
const read = (root: string, p: string): string => readFileSync(join(root, p), "utf8");
const checklistOf = (text: string): string[] => [...text.matchAll(/^- \[ \] (.+)$/gm)].map((m) => m[1]!.trim());

export function checkHygiene(rootDir: string): string[] {
  const root = resolve(rootDir);
  const out: string[] = [];
  for (const f of REQUIRED) if (!existsSync(join(root, f))) out.push(`${f} is missing`);
  if (out.length > 0) return out;

  // 1. the PR template is CONTRIBUTING §7
  const contributing = read(root, "CONTRIBUTING.md");
  const section = /## 7\. PR checklist\n([\s\S]*?)\n## /.exec(contributing)?.[1];
  if (section === undefined) out.push("CONTRIBUTING.md has no \"## 7. PR checklist\" section");
  else {
    const want = checklistOf(section), have = checklistOf(read(root, ".github/pull_request_template.md"));
    for (const w of want) if (!have.includes(w)) out.push(`the PR template lacks the checklist item "${w}" of CONTRIBUTING §7`);
    for (const h of have) if (!want.includes(h)) out.push(`the PR template has "${h}", which CONTRIBUTING §7 does not`);
  }

  // 2. issue templates: health data stays out; the safety template says it is public
  for (const f of [".github/ISSUE_TEMPLATE/bug_report.md", ".github/ISSUE_TEMPLATE/safety_report.md"]) {
    const t = read(root, f);
    if (!/^---\nname: .+\nabout: .+\ntitle: .*\nlabels: .+\n---/m.test(t)) out.push(`${f} has no complete front matter (name, about, title, labels)`);
    if (!/personal health information/i.test(t)) out.push(`${f} does not tell the reporter to leave out personal health information`);
  }
  if (!/public/i.test(read(root, ".github/ISSUE_TEMPLATE/safety_report.md"))) out.push("the safety report template does not say that the issue is public");
  if (!/blank_issues_enabled:\s*false/.test(read(root, ".github/ISSUE_TEMPLATE/config.yml"))) out.push("config.yml allows blank issues");

  // 3. one private channel, named the same way in both places
  const url = /https:\/\/github\.com\/[^\s)>]+\/security\/advisories\/new/.exec(read(root, "SECURITY.md"))?.[0];
  if (url === undefined) out.push("SECURITY.md does not give the private vulnerability-reporting address");
  else if (!read(root, ".github/ISSUE_TEMPLATE/config.yml").includes(url)) out.push("config.yml does not link to the address in SECURITY.md");
  if (!/Do not open a public issue/i.test(read(root, "SECURITY.md"))) out.push("SECURITY.md does not say not to open a public issue");

  // 4. CODEOWNERS: every listed path exists, every line has an owner
  for (const line of read(root, ".github/CODEOWNERS").split("\n")) {
    const l = line.trim();
    if (l === "" || l.startsWith("#")) continue;
    const [path, ...owners] = l.split(/\s+/);
    if (owners.length === 0 || !owners.every((o) => o.startsWith("@"))) out.push(`CODEOWNERS: "${l}" has no owner`);
    if (path !== "*" && !existsSync(join(root, path!.replace(/^\//, "")))) out.push(`CODEOWNERS lists ${path}, which does not exist`);
  }

  // 5. the licence notice names what the data is derived from, and the data README points to it
  const notice = read(root, "NOTICE");
  for (const needed of ["TCM-Library", "MIT", "Permission is hereby granted", "Apache License", "public domain", "Pharmacopoeia"]) if (!notice.includes(needed)) out.push(`NOTICE does not mention "${needed}"`);
  if (!/NOTICE/.test(read(root, "data/README.md"))) out.push("data/README.md does not refer to NOTICE (the licence statement)");

  // 6. the changelog
  if (!/^## Unreleased$/m.test(read(root, "CHANGELOG.md"))) out.push("CHANGELOG.md has no \"## Unreleased\" section");
  return out;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const root = args.includes("--root") ? args[args.indexOf("--root") + 1]! : join(dirname(fileURLToPath(import.meta.url)), "..");
  const problems = checkHygiene(root);
  for (const p of problems) console.error(`✗ ${p}`);
  console.log(problems.length === 0 ? "check-hygiene: clean" : `check-hygiene: ${problems.length} problem(s)`);
  process.exit(problems.length === 0 ? 0 : 1);
}
