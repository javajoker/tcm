// Pseudo-localisation (docs/i18n-guide.md §8, task I-05): development-only transforms that make layout and wording problems visible without a translator.
//   · "xa" (en-XA): accented look-alike letters, vowels doubled (≈ +35 % length) and ⟦brackets⟧ — exposes truncation, hard-coded strings (they stay plain) and concatenated sentences;
//   · "xl" (zh-XL): every string repeated with a separator — exposes wrapping and overflow of long Chinese strings.
// `{placeholders}` and `<tags>` are never touched, so a pseudo-localised message still interpolates and renders rich text.

export type PseudoMode = "xa" | "xl";

const PROTECTED = /\{[A-Za-z0-9_]+\}|<\/?[a-z][a-z0-9-]*>/g;
const ACCENT: Readonly<Record<string, string>> = {
  a: "å", b: "ƀ", c: "ç", d: "đ", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "î", j: "ĵ", k: "ķ", l: "ł", m: "ɱ", n: "ñ", o: "ø", p: "ƥ", q: "ǫ", r: "ŕ", s: "š", t: "ţ", u: "ü", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ž",
  A: "Å", B: "Ɓ", C: "Ç", D: "Đ", E: "É", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Î", J: "Ĵ", K: "Ķ", L: "Ł", M: "Ṁ", N: "Ñ", O: "Ø", P: "Ƥ", Q: "Ǫ", R: "Ŕ", S: "Š", T: "Ţ", U: "Ü", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
};
const VOWELS = new Set("aeiouyAEIOUY");

/** Map a run of plain text: accent every ASCII letter, double the vowels. */
const accent = (s: string): string => [...s].map((c) => { const a = ACCENT[c]; return a === undefined ? c : VOWELS.has(c) ? a + a : a; }).join("");

/** Apply `fn` to the text between protected tokens, leaving the tokens as they are. */
function aroundTokens(text: string, fn: (plain: string) => string): string {
  let out = "", last = 0;
  for (const m of text.matchAll(PROTECTED)) { out += fn(text.slice(last, m.index)) + m[0]; last = m.index + m[0].length; }
  return out + fn(text.slice(last));
}

export const pseudoXA = (text: string): string => (text === "" ? "" : `⟦${aroundTokens(text, accent)}⟧`);
export const pseudoXL = (text: string): string => (text === "" ? "" : `${text} · ${text}`);

export const pseudoize = (mode: PseudoMode, text: string): string => (mode === "xa" ? pseudoXA(text) : pseudoXL(text));
