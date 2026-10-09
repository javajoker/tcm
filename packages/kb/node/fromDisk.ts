// Node-only helpers: read the generated data/ directory with fs and build the chunks of a knowledge base exactly as the bundler does.
// Used by the bundler script (scripts/bundle-data.ts) and by tests of every package that needs a real knowledge base.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChunks, type BuildResult, type DataFiles } from "../src/bundle.ts";
import type { Citations, ProfileName, RawKbChunks } from "../src/types.ts";
import { BOOK_DIR, pageIdsOf, readBook, readPages, type ReviewedUnit } from "./book.ts";
import { COURSE_DIR, readCourse } from "./course.ts";

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data");

function read<T>(rel: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, rel), "utf8")) as T;
}

/** Every data file, and the learning book and the course read from docs/book/zh-Hant and docs/course/zh-Hant with their quotations resolved against the citations and their status from the review records. */
export function readDataFiles(): DataFiles {
  const citations = read<Citations>("citations.json");
  const reviewed = read<{ reviewed: ReviewedUnit[] }>("review/records.json").reviewed;
  const ids = (dir: string): Map<string, string> => pageIdsOf(readPages(dir).map((p) => p.name));
  return {
    scope: read("config/scope-profiles.json"), symptoms: read("diagnosis/symptoms.json"), questions: read("diagnosis/questions.json"), exclusions: read("diagnosis/exclusions.json"), orientation: read("diagnosis/orientation.json"),
    patterns: read("diagnosis/patterns.json"), elements: read("diagnosis/pattern-elements.json"), constitutions: read("diagnosis/constitutions.json"),
    redFlags: read("diagnosis/red-flags.json"), tongue: read("diagnosis/tongue.json"), pulse: read("diagnosis/pulse.json"), panelSchema: read("diagnosis/panel-schema.json"),
    params: read("diagnosis/scoring-params.json"), safety: read("safety/rules.json"), treatment: read("treatment/guidance.json"),
    correspondences: read("wuxing/correspondences.json"), susceptibility: read("wuxing/susceptibility.json"), yunqi: read("wuxing/yunqi.json"), glossary: read("glossary.json"), emergency: read("safety/emergency.json"), nameFold: read("safety/name-fold.json"), constitutionItems: read("diagnosis/constitution-items.json"),
    formulas: read("formulas/formulas.json"), herbs: read("herbs/herbs.json"), citations, cities: read("geo/cities.json"),
    pairings: read("herbs/pairings.json"), processing: read("herbs/processing.json"), doseBands: read("herbs/dose-bands.json"), yinjing: read("herbs/yinjing.json"),
    prescriptionParams: read("treatment/prescription.json"), sanyin: read("treatment/sanyin.json"),
    book: readBook(citations.items, BOOK_DIR, reviewed, ids(COURSE_DIR)),
    course: readCourse(citations.items, COURSE_DIR, reviewed, ids(BOOK_DIR)),
  };
}

/** The knowledge base as the closed beta ships it (draft label on): tests use it unless they are about the public build. */
export function buildFromDisk(profile: ProfileName = "dev", overrides?: unknown, draftLabel = true): BuildResult {
  return buildChunks(readDataFiles(), { profile, overrides, version: `test-${profile}`, draftLabel });
}

export function rawChunksFromDisk(profile: ProfileName = "dev", overrides?: unknown, draftLabel = true): RawKbChunks {
  return buildFromDisk(profile, overrides, draftLabel).chunks;
}
