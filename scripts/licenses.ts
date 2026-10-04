// Dependency hygiene (task R-05): the licence allow-list and the software bill of materials, from what pnpm has installed (no network).
//   node scripts/licenses.ts check                       exit 1 when a shipped dependency has a licence outside the allow-list
//   node scripts/licenses.ts report <file.md>             a table of every dependency (shipped and build-time) with its licence
//   node scripts/licenses.ts sbom <file.json>             CycloneDX 1.5 SBOM of what the web app ships (production dependencies)
// A dependency that reaches users must be under a permissive licence (`allow`); build-time tools may also use the `buildOnly` licences, because nothing of them is redistributed.
// An exception is recorded per package@version with its reason in scripts/licenses.json, never by widening the list.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface Component { readonly name: string; readonly version: string; readonly license: string; readonly homepage: string | null }
export interface Policy { readonly allow: readonly string[]; readonly buildOnly: readonly string[]; readonly exceptions: Readonly<Record<string, string>> }
export interface Finding { readonly component: Component; readonly message: string }

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const loadPolicy = (): Policy => JSON.parse(readFileSync(join(root, "scripts", "licenses.json"), "utf8")) as Policy;

/** The packages `pnpm licenses list --json` reports, flattened to one component per name and version. */
export function parsePnpm(json: string): Component[] {
  const byLicense = JSON.parse(json) as Record<string, { name: string; versions: string[]; homepage?: string }[]>;
  const out: Component[] = [];
  for (const [license, pkgs] of Object.entries(byLicense)) for (const p of pkgs) for (const version of p.versions) out.push({ name: p.name, version, license, homepage: p.homepage ?? null });
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/** The shipped (production) and the all-in components, from the workspace's installed packages. */
export function collect(): { shipped: Component[]; all: Component[] } {
  const list = (args: string[]): Component[] => parsePnpm(execFileSync("pnpm", ["licenses", "list", "--json", ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  return { shipped: list(["--filter", "@tcm/web", "--prod"]), all: list([]) };
}

/** An SPDX expression such as "(MIT OR Apache-2.0)" is acceptable when every alternative of an OR, or at least one of them, is allowed: we take the permissive reading and require one alternative. */
export function licenseAllowed(license: string, allowed: readonly string[]): boolean {
  const alternatives = license.replace(/[()]/g, "").split(/\s+OR\s+/i);
  return alternatives.some((alt) => alt.split(/\s+AND\s+/i).every((part) => allowed.includes(part.trim())));
}

export function evaluate(shipped: readonly Component[], all: readonly Component[], policy: Policy): Finding[] {
  const out: Finding[] = [];
  const excepted = (c: Component): boolean => `${c.name}@${c.version}` in policy.exceptions;
  const shippedIds = new Set(shipped.map((c) => `${c.name}@${c.version}`));
  for (const c of shipped) if (!excepted(c) && !licenseAllowed(c.license, policy.allow)) out.push({ component: c, message: `${c.name}@${c.version} is shipped under ${c.license}, which is not on the allow-list` });
  for (const c of all) {
    if (shippedIds.has(`${c.name}@${c.version}`) || excepted(c)) continue;
    if (!licenseAllowed(c.license, [...policy.allow, ...policy.buildOnly])) out.push({ component: c, message: `${c.name}@${c.version} (build-time) is under ${c.license}, which is not allowed even for build tools` });
  }
  for (const key of Object.keys(policy.exceptions)) if (!all.some((c) => `${c.name}@${c.version}` === key)) out.push({ component: { name: key, version: "", license: "", homepage: null }, message: `the exception for ${key} no longer matches an installed package: remove it` });
  return out;
}

/** CycloneDX 1.5 (JSON): the components with their package URL and licence; deterministic for a given install. */
export function toCycloneDx(components: readonly Component[], meta: { name: string; version: string }): object {
  const purl = (c: Component): string => `pkg:npm/${c.name.startsWith("@") ? `%40${c.name.slice(1)}` : c.name}@${c.version}`;
  return {
    bomFormat: "CycloneDX", specVersion: "1.5", version: 1,
    metadata: { component: { type: "application", name: meta.name, version: meta.version }, tools: { components: [{ type: "application", name: "scripts/licenses.ts" }] } },
    components: components.map((c) => ({
      type: "library", "bom-ref": purl(c), name: c.name, version: c.version, purl: purl(c),
      licenses: [/\s(OR|AND)\s/i.test(c.license) ? { expression: c.license } : { license: { id: c.license } }],
      ...(c.homepage ? { externalReferences: [{ type: "website", url: c.homepage }] } : {}),
    })),
  };
}

export function toMarkdown(shipped: readonly Component[], all: readonly Component[]): string {
  const shippedIds = new Set(shipped.map((c) => `${c.name}@${c.version}`));
  const row = (c: Component): string => `| ${c.name} | ${c.version} | ${c.license} | ${shippedIds.has(`${c.name}@${c.version}`) ? "shipped" : "build-time"} |`;
  return ["# Dependency licences", "", `${shipped.length} packages ship in the web app; ${all.length - shipped.length} more are build-time only.`, "", "| Package | Version | Licence | Used as |", "|---|---|---|---|", ...all.map(row), ""].join("\n");
}

if (import.meta.main) {
  const [cmd, out] = process.argv.slice(2);
  const { shipped, all } = collect();
  if (cmd === "check") {
    const findings = evaluate(shipped, all, loadPolicy());
    for (const f of findings) console.error(`✗ ${f.message}`);
    console.log(findings.length === 0 ? `licenses: ${shipped.length} shipped and ${all.length - shipped.length} build-time packages are within the allow-list` : `licenses: ${findings.length} problem(s)`);
    process.exit(findings.length === 0 ? 0 : 1);
  } else if ((cmd === "report" || cmd === "sbom") && out) {
    const pkg = JSON.parse(readFileSync(join(root, "apps", "web", "package.json"), "utf8")) as { name: string; version: string };
    writeFileSync(out, cmd === "report" ? toMarkdown(shipped, all) : `${JSON.stringify(toCycloneDx(shipped, pkg), null, 2)}\n`);
    console.log(`licenses: wrote ${out}`);
  } else { console.error("usage: node scripts/licenses.ts check | report <file.md> | sbom <file.json>"); process.exit(2); }
}
