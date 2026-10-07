// Regenerate packages/wuxing/src/astro/vsop87-earth.ts from the official VSOP87D.ear archive (task PM-28; docs/post-mvp/design/five-phase-extensions.md §6).
//   node scripts/astro/gen-vsop87.ts <path/to/VSOP87D.ear>            print what would change (a summary) and exit 1 if the committed table differs
//   node scripts/astro/gen-vsop87.ts <path/to/VSOP87D.ear> --write    write the table
// The archive is not in the repository and nothing is downloaded here: it is the file `VSOP87D.ear` of CDS/VizieR VI/81 (Strasbourg,
// https://cdsarc.cds.unistra.fr/ftp/cats/VI/81/VSOP87D.ear, 324 786 bytes; the IMCCE mirror is byte-identical). An archive whose SHA-256 is not the pinned one is refused.
// The table keeps the terms of the Earth's heliocentric longitude (L) and radius vector (R) with |A| ≥ 1e-9 and 1e-8 respectively, in the archive's order, and writes
// each number as JavaScript prints it — the form of the table taken over from the author's earlier engine, which this generator reproduces byte for byte.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PINNED_SHA256 = "8b160c859136d467f2be7fc29efa8a9652e95516dfbde00e4c739d7ddc90ca91";
export const TABLE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "packages", "wuxing", "src", "astro", "vsop87-earth.ts");
/** Variables of the archive (1 L, 2 B, 3 R) kept, with the smallest amplitude kept. */
export const KEEP = { L: { variable: 1, min: 1e-9 }, R: { variable: 3, min: 1e-8 } } as const;
const ARCSEC_PER_RADIAN = 180 / Math.PI * 3600;
const SUN_ARCSEC_PER_DAY = 360 * 3600 / 365.2422;

export type Term = readonly [number, number, number];
/** variable (1…3) → power of τ (0…5) → the terms in the archive's order. */
export type Archive = ReadonlyMap<number, ReadonlyMap<number, readonly Term[]>>;

/** The term blocks of a VSOP87 archive: a header line names the variable and the power of τ, then one line per term whose last three numbers are A, B, C. */
export function parseArchive(text: string): Archive {
  const out = new Map<number, Map<number, Term[]>>();
  let block: { variable: number; power: number; expected: number; terms: Term[] } | null = null;
  const close = (): void => {
    if (block === null) return;
    if (block.terms.length !== block.expected) throw new Error(`variable ${block.variable}, τ^${block.power}: the header says ${block.expected} terms, the block holds ${block.terms.length}`);
    let byPower = out.get(block.variable);
    if (byPower === undefined) out.set(block.variable, (byPower = new Map()));
    byPower.set(block.power, block.terms);
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const head = /VSOP87 VERSION D4\s+EARTH\s+VARIABLE\s+(\d)\s+\(LBR\)\s+\*T\*\*(\d)\s+(\d+)\s+TERMS/.exec(line);
    if (head !== null) {
      close();
      block = { variable: Number(head[1]), power: Number(head[2]), expected: Number(head[3]), terms: [] };
      continue;
    }
    if (block === null) throw new Error("a term line before any header: not a VSOP87D Earth archive");
    const parts = line.trim().split(/\s+/);
    const [a, b, c] = parts.slice(-3).map(Number) as [number, number, number];
    if (parts.length < 6 || ![a, b, c].every(Number.isFinite)) throw new Error(`not a term line: ${line.slice(0, 60)}`);
    block.terms.push([a, b, c]);
  }
  close();
  return out;
}

export interface Series { readonly powers: readonly (readonly Term[])[]; readonly total: number; readonly kept: number; readonly residual: number }

/** One variable's kept terms by power, and what was dropped: the worst-case residual Σ|A| of the dropped terms at |τ| = 1 (a thousand years from J2000). */
export function seriesOf(archive: Archive, variable: number, min: number): Series {
  const byPower = archive.get(variable);
  if (byPower === undefined) throw new Error(`the archive has no variable ${variable}`);
  const powers: Term[][] = [];
  let total = 0, kept = 0, residual = 0;
  for (let p = 0; p <= 5; p++) {
    const terms = byPower.get(p) ?? [];
    total += terms.length;
    const keep = terms.filter((t) => Math.abs(t[0]) >= min);
    kept += keep.length;
    for (const t of terms) if (Math.abs(t[0]) < min) residual += Math.abs(t[0]);
    powers.push(keep);
  }
  return { powers, total, kept, residual };
}

const block = (name: string, s: Series): string => [
  `export const ${name}: Vsop87Series = [`,
  ...s.powers.flatMap((terms, p) => [`  // T^${p}: ${terms.length} terms`, "  [", terms.map((t) => `    [${t.map((x) => String(x)).join(", ")}],`).join("\n"), "  ],"]),
  "];",
].join("\n");

/** The table file, header included. */
export function render(archive: Archive): string {
  const L = seriesOf(archive, KEEP.L.variable, KEEP.L.min);
  const R = seriesOf(archive, KEEP.R.variable, KEEP.R.min);
  const lArcsec = L.residual * ARCSEC_PER_RADIAN;
  const lSeconds = lArcsec * 86400 / SUN_ARCSEC_PER_DAY;           // the Sun's longitude moves about 3548″ a day
  const header = `/**
 * VSOP87D Earth heliocentric longitude (L) and radius vector (R) series.
 *
 * DATA FILE — generated by scripts/astro/gen-vsop87.ts from the official archive; do not edit by hand.
 *
 * Origin: the official VSOP87D.ear archive (Bretagnon & Francou 1988),
 *   · CDS/VizieR VI/81 (Strasbourg)  https://cdsarc.cds.unistra.fr/ftp/cats/VI/81/VSOP87D.ear
 *   · IMCCE (Paris Observatory)      ftp://ftp.imcce.fr/pub/ephem/planets/vsop87/VSOP87D.ear
 * SHA-256 of the archive: ${PINNED_SHA256}
 * (both mirrors are byte-identical; the generator refuses any other file).
 *
 * Each term is [A, B, C] and contributes A·cos(B + C·τ), τ = Julian millennia from J2000.
 * L is in radians, R in astronomical units.
 *
 * Truncation: terms with |A| < ${KEEP.L.min} (L) / ${KEEP.R.min} (R) are dropped.
 *   L keeps ${L.kept} of ${L.total} terms (worst-case discarded residual at |τ| = 1: ${lArcsec.toFixed(3)}″ ≈ ${lSeconds.toFixed(1)} s of time),
 *   R keeps ${R.kept} of ${R.total} terms (worst-case discarded residual at |τ| = 1: ${R.residual.toExponential(1)} AU).
 * Heliocentric latitude B is omitted: the Sun's ecliptic latitude is < 1.2″ and only
 * enters the FK5 correction through tan β (~3e-7″).
 */

export type Vsop87Series = readonly (readonly (readonly [number, number, number])[])[];
`;
  return `${header}\n${block("EARTH_L", L)}\n\n${block("EARTH_R", R)}\n`;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The archive at `path`, refused unless it is the pinned one. */
export function readArchive(path: string): Archive {
  const bytes = readFileSync(path);
  const hash = sha256(bytes);
  if (hash !== PINNED_SHA256) throw new Error(`${path}: SHA-256 ${hash} is not the pinned ${PINNED_SHA256} — not the official VSOP87D.ear`);
  return parseArchive(bytes.toString("latin1"));
}

if (import.meta.main) {
  const [path, flag] = process.argv.slice(2);
  if (path === undefined) {
    console.error("usage: node scripts/astro/gen-vsop87.ts <path/to/VSOP87D.ear> [--write]");
    process.exit(2);
  }
  const text = render(readArchive(path));
  if (flag === "--write") {
    writeFileSync(TABLE, text);
    console.log(`wrote ${TABLE}`);
  } else {
    const same = readFileSync(TABLE, "utf8") === text;
    console.log(same ? "vsop87-earth.ts is what the archive gives" : "vsop87-earth.ts differs from what the archive gives: run with --write");
    process.exit(same ? 0 : 1);
  }
}
