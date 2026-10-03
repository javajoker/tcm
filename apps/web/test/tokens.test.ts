// The colour tokens must meet the contrast requirements of docs/ux-spec.md §6.2 / §8 in BOTH themes (WCAG 2.1 AA): text ≥ 4.5 : 1, UI components ≥ 3 : 1.
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolvePath(process.cwd(), "src/styles/tokens.css"), "utf8");   // vitest runs with the package as cwd

function block(selectorStart: string): Record<string, string> {
  const i = css.indexOf(selectorStart);
  expect(i, `block ${selectorStart}`).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf("{", i) + 1, css.indexOf("\n}", i));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) vars[m[1]!] = m[2]!.trim();
  return vars;
}
const light = block(":root {");
const dark = block(":root[data-theme=\"dark\"]");
const darkMedia = block(":root:not([data-theme=\"light\"])");

const resolve = (theme: Record<string, string>, base: Record<string, string>, name: string): string => {
  let v = theme[name] ?? base[name];
  for (let i = 0; i < 5 && v?.startsWith("var("); i++) { const ref = v.slice(6, -1); v = theme[ref] ?? base[ref]; }
  if (!v) throw new Error(`token ${name} missing`);
  return v;
};
const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

const themes: [string, Record<string, string>][] = [["light", light], ["dark", { ...light, ...dark }]];

describe.each(themes)("%s theme", (_name, theme) => {
  const tok = (n: string): string => resolve(theme, light, n);
  const textPairs: [string, string][] = [
    ["ink", "bg"], ["ink", "surface"], ["ink-muted", "bg"], ["ink-muted", "surface"], ["primary", "bg"], ["primary", "surface"], ["on-primary", "primary"], ["link", "surface"], ["link", "bg"],
    ["notice-text", "notice-bg"], ["danger-text", "danger-bg"], ["info-text", "info-bg"],
  ];
  it.each(textPairs)("text %s on %s ≥ 4.5 : 1", (fg, bg) => { expect(ratio(tok(fg), tok(bg))).toBeGreaterThanOrEqual(4.5); });
  it("focus ring and strong borders ≥ 3 : 1 against the page and the surface", () => {
    for (const bg of ["bg", "surface"]) { expect(ratio(tok("focus"), tok(bg))).toBeGreaterThanOrEqual(3); expect(ratio(tok("border-strong"), tok(bg))).toBeGreaterThanOrEqual(3); }
  });
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])("sequential scale step %i: its label colour reaches 4.5 : 1", (n) => {
    expect(ratio(tok(`scale-${n}-text`), tok(`scale-${n}`))).toBeGreaterThanOrEqual(4.5);
  });
  it("the scale is monotone in lightness (more is always darker in light, lighter in dark)", () => {
    const l = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => lum(tok(`scale-${n}`)));
    for (let i = 1; i < l.length; i++) expect(_name === "light" ? l[i]! < l[i - 1]! : l[i]! > l[i - 1]!).toBe(true);
  });
  it("five-phase identity colours are visible as non-text marks (≥ 3 : 1 on the surface)", () => {
    for (const e of ["wood", "fire", "earth", "metal", "water"]) expect(ratio(tok(`wx-${e}`), tok("surface"))).toBeGreaterThanOrEqual(3);
  });
});

describe("the two dark-theme definitions agree", () => {
  it("the media-query block and the data-theme block define the same tokens", () => {
    expect(darkMedia).toEqual(dark);
  });
});
