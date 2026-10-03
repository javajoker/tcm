// Test support: read the generated data/ directory with fs and build the chunks of a knowledge base (Node only).
// The profile pruning of the real bundler is added by task E-03; until then this returns the unpruned "dev" view.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CoreChunk, ProfileName, RawKbChunks, ScopeConfig, ScopeProfiles } from "../src/types.ts";

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data");

export function readData<T>(rel: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, rel), "utf8")) as T;
}

export function rawChunksFromDisk(profile: ProfileName = "dev"): RawKbChunks {
  const scope = readData<ScopeProfiles>("config/scope-profiles.json");
  const config: ScopeConfig = {
    profileName: profile, profile: scope.profiles[profile], levels: scope.levels, dimensions: scope.dimensions, noticeKinds: scope.notice_kinds, resolution: scope.resolution,
  };
  const core: CoreChunk = {
    config,
    symptoms: readData("diagnosis/symptoms.json"), questions: readData("diagnosis/questions.json"), exclusions: readData("diagnosis/exclusions.json"),
    patterns: readData("diagnosis/patterns.json"), elements: readData("diagnosis/pattern-elements.json"), constitutions: readData("diagnosis/constitutions.json"),
    redFlags: readData("diagnosis/red-flags.json"), tongue: readData("diagnosis/tongue.json"), pulse: readData("diagnosis/pulse.json"),
    panelSchema: readData("diagnosis/panel-schema.json"), params: readData("diagnosis/scoring-params.json"), safety: readData("safety/rules.json"),
    treatment: readData("treatment/guidance.json"),
    wuxing: { correspondences: readData("wuxing/correspondences.json"), susceptibility: readData("wuxing/susceptibility.json"), yunqi: readData("wuxing/yunqi.json") },
    glossary: readData("glossary.json"),
  };
  return {
    version: "test-disk", schemaVersion: 1, core,
    formulas: { items: readData<{ items: RawKbChunks["formulas"]["items"] }>("formulas/formulas.json").items },
    herbs: { items: readData<{ items: NonNullable<RawKbChunks["herbs"]>["items"] }>("herbs/herbs.json").items },
    citations: { items: readData<{ items: RawKbChunks["citations"]["items"] }>("citations.json").items },
  };
}
