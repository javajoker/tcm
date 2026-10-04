// Loads the golden cases and their config from test/golden (shared by the test and by scripts/golden-report.ts).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GoldenCase, GoldenConfig } from "../src/golden.ts";

export const goldenDir = join(import.meta.dirname, "golden");
export const loadGoldenConfig = (): GoldenConfig => JSON.parse(readFileSync(join(goldenDir, "config.json"), "utf8")) as GoldenConfig;
export const loadGoldenCases = (): GoldenCase[] =>
  readdirSync(goldenDir).filter((f) => /^G-\d{4}\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(join(goldenDir, f), "utf8")) as GoldenCase);
