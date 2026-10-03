// Node-only helpers: read the generated data/ directory with fs and build the chunks of a knowledge base exactly as the bundler does.
// Used by the bundler script (scripts/bundle-data.ts) and by tests of every package that needs a real knowledge base.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChunks, type BuildResult, type DataFiles } from "../src/bundle.ts";
import type { ProfileName, RawKbChunks } from "../src/types.ts";

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data");

function read<T>(rel: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, rel), "utf8")) as T;
}

export function readDataFiles(): DataFiles {
  return {
    scope: read("config/scope-profiles.json"), symptoms: read("diagnosis/symptoms.json"), questions: read("diagnosis/questions.json"), exclusions: read("diagnosis/exclusions.json"), orientation: read("diagnosis/orientation.json"),
    patterns: read("diagnosis/patterns.json"), elements: read("diagnosis/pattern-elements.json"), constitutions: read("diagnosis/constitutions.json"),
    redFlags: read("diagnosis/red-flags.json"), tongue: read("diagnosis/tongue.json"), pulse: read("diagnosis/pulse.json"), panelSchema: read("diagnosis/panel-schema.json"),
    params: read("diagnosis/scoring-params.json"), safety: read("safety/rules.json"), treatment: read("treatment/guidance.json"),
    correspondences: read("wuxing/correspondences.json"), susceptibility: read("wuxing/susceptibility.json"), yunqi: read("wuxing/yunqi.json"), glossary: read("glossary.json"),
    formulas: read("formulas/formulas.json"), herbs: read("herbs/herbs.json"), citations: read("citations.json"),
  };
}

export function buildFromDisk(profile: ProfileName = "dev", overrides?: unknown): BuildResult {
  return buildChunks(readDataFiles(), { profile, overrides, version: `test-${profile}` });
}

export function rawChunksFromDisk(profile: ProfileName = "dev", overrides?: unknown): RawKbChunks {
  return buildFromDisk(profile, overrides).chunks;
}
