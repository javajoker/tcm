import assert from "node:assert/strict";
import { test } from "node:test";
import { collect, evaluate, licenseAllowed, loadPolicy, parsePnpm, toCycloneDx, toMarkdown, type Component, type Policy } from "./licenses.ts";

const policy: Policy = { allow: ["MIT", "ISC", "Apache-2.0"], buildOnly: ["MPL-2.0"], exceptions: {} };
const c = (name: string, license: string, version = "1.0.0"): Component => ({ name, version, license, homepage: null });

test("pnpm's output is flattened to one component per name and version, sorted", () => {
  const json = JSON.stringify({ MIT: [{ name: "b", versions: ["2.0.0", "1.0.0"], homepage: "https://b.example" }, { name: "a", versions: ["1.0.0"] }], ISC: [{ name: "c", versions: ["3.0.0"] }] });
  assert.deepEqual(parsePnpm(json).map((x) => `${x.name}@${x.version} ${x.license}`), ["a@1.0.0 MIT", "b@1.0.0 MIT", "b@2.0.0 MIT", "c@3.0.0 ISC"]);
  assert.equal(parsePnpm(json).find((x) => x.name === "b")!.homepage, "https://b.example");
});

test("SPDX expressions: one allowed alternative of an OR is enough, every part of an AND is needed", () => {
  const ok = ["MIT", "ISC"];
  assert.equal(licenseAllowed("MIT", ok), true);
  assert.equal(licenseAllowed("(MIT OR GPL-3.0)", ok), true);
  assert.equal(licenseAllowed("(GPL-3.0 OR AGPL-3.0)", ok), false);
  assert.equal(licenseAllowed("(MIT AND ISC)", ok), true);
  assert.equal(licenseAllowed("(MIT AND GPL-3.0)", ok), false);
  assert.equal(licenseAllowed("GPL-3.0", ok), false);
  assert.equal(licenseAllowed("UNKNOWN", ok), false);
});

test("a shipped package must be on the allow-list; build-time packages may also use the build-only licences", () => {
  const shipped = [c("react", "MIT"), c("copyleft-lib", "GPL-3.0")];
  const all = [...shipped, c("tool", "MPL-2.0"), c("bad-tool", "AGPL-3.0")];
  const messages = evaluate(shipped, all, policy).map((f) => f.message);
  assert.deepEqual(messages, ["copyleft-lib@1.0.0 is shipped under GPL-3.0, which is not on the allow-list", "bad-tool@1.0.0 (build-time) is under AGPL-3.0, which is not allowed even for build tools"]);
  // a weak-copyleft licence is not acceptable in what ships
  assert.equal(evaluate([c("lib", "MPL-2.0")], [c("lib", "MPL-2.0")], policy).length, 1);
});

test("an exception is per package and version, carries its reason, and must not go stale", () => {
  const p: Policy = { ...policy, exceptions: { "weird@1.0.0": "dual-licensed in a way SPDX cannot express; legal reviewed 2026-10-04" } };
  assert.deepEqual(evaluate([c("weird", "SEE LICENSE IN FILE")], [c("weird", "SEE LICENSE IN FILE")], p), []);
  assert.equal(evaluate([c("weird", "SEE LICENSE IN FILE", "2.0.0")], [c("weird", "SEE LICENSE IN FILE", "2.0.0")], p).length, 2, "another version is not excepted, and the old exception is stale");
  assert.match(evaluate([], [], p)[0]!.message, /no longer matches an installed package/);
});

test("the SBOM is CycloneDX 1.5 with package URLs (scoped names encoded), licences and links", () => {
  const sbom = toCycloneDx([{ name: "@scope/pkg", version: "1.2.3", license: "MIT", homepage: "https://x.example" }, c("dual", "(MIT OR Apache-2.0)")], { name: "app", version: "0.1.0" }) as {
    bomFormat: string; specVersion: string; metadata: { component: { name: string } }; components: { purl: string; licenses: unknown[]; externalReferences?: unknown[] }[];
  };
  assert.deepEqual([sbom.bomFormat, sbom.specVersion, sbom.metadata.component.name], ["CycloneDX", "1.5", "app"]);
  assert.equal(sbom.components[0]!.purl, "pkg:npm/%40scope/pkg@1.2.3");
  assert.deepEqual(sbom.components[0]!.licenses, [{ license: { id: "MIT" } }]);
  assert.deepEqual(sbom.components[1]!.licenses, [{ expression: "(MIT OR Apache-2.0)" }]);
  assert.equal(sbom.components[0]!.externalReferences?.length, 1);
  assert.equal(JSON.stringify(toCycloneDx([c("a", "MIT")], { name: "app", version: "1" })), JSON.stringify(toCycloneDx([c("a", "MIT")], { name: "app", version: "1" })), "deterministic");
});

test("the report tells shipped from build-time", () => {
  const md = toMarkdown([c("react", "MIT")], [c("react", "MIT"), c("vitest", "MIT")]);
  assert.match(md, /1 packages ship in the web app; 1 more are build-time only/);
  assert.match(md, /\| react \| 1\.0\.0 \| MIT \| shipped \|/);
  assert.match(md, /\| vitest \| 1\.0\.0 \| MIT \| build-time \|/);
});

test("the dependencies installed in this repository are within the policy", () => {
  const { shipped, all } = collect();
  assert.ok(shipped.length > 0 && all.length > shipped.length);
  assert.ok(shipped.some((x) => x.name === "react"), "react ships");
  assert.deepEqual(evaluate(shipped, all, loadPolicy()).map((f) => f.message), []);
});
