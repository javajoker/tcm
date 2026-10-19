// The practitioner reference (PM-65): the knowledge base the skill carries — one JSON file beside its script, written by `scripts/build-skill.ts` from the closed beta's
// build (the release profile with its draft label) and its study reference — and the knowledge base it reads in the practitioner's role. The herb browser, the book, the
// course and the city list are left out: the reference shows none of them.
import { indexKnowledgeBase, memoryReference, type KnowledgeBase, type RawKbChunks, type ReferenceChunk } from "@tcm/kb";

export const KB_FILE_FORMAT = "tcm-practitioner-kb";

export interface PractitionerKbFile {
  readonly format: typeof KB_FILE_FORMAT;
  readonly version: 1;
  /** Which build of the app the script and the file come from. */
  readonly build: string;
  readonly chunks: Pick<RawKbChunks, "version" | "schemaVersion" | "core" | "formulas" | "herbs" | "citations" | "guidance">;
  readonly reference: ReferenceChunk;
}

/** The practitioner's knowledge base from the file's contents. */
export async function practitionerKb(file: PractitionerKbFile): Promise<KnowledgeBase> {
  if (file.format !== KB_FILE_FORMAT || file.version !== 1) throw new Error(`not a knowledge base of the practitioner reference (${KB_FILE_FORMAT} version 1)`);
  const raw: RawKbChunks = {
    ...file.chunks, herbBrowser: null, book: null, course: null, reference: memoryReference(file.reference),
    cities: () => Promise.reject(new Error("the practitioner reference carries no city list")),
  };
  return indexKnowledgeBase(raw).forRole("practitioner");
}
