// Shared helpers for the parity tests: the fixture produced by the Python oracle (scripts/kb/export_parity_cases.py).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Findings } from "../src/index.ts";

export interface ParityCase {
  readonly id: string;
  readonly findings: Findings;
  readonly expect: {
    readonly scores: Record<string, number>;
    readonly elements: Record<string, number>;
    readonly panel: Record<string, number>;
    readonly wuxingFunction: Record<string, number>;
    readonly bagang: { cold_heat: number; deficiency_excess: number; exterior: number };
    readonly costBase: number;
    readonly formulas: { id: string; k: number; explained: number; coreFit: number }[];
    readonly modification?: { formula: string; k: number; log: [string, string, number][]; cost: number };
  };
}

const file = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "parity.json");
export const PARITY: { _meta: { count: number; inputs_sha256: string }; cases: ParityCase[] } = JSON.parse(readFileSync(file, "utf8"));

/** Tolerance of the parity checks (tech spec §7.4). */
export const EPS = 1e-9;
