export type KbErrorCode = "schema-mismatch" | "manifest-invalid" | "chunk-missing" | "chunk-hash-mismatch" | "chunk-invalid" | "index-invalid";

/** Thrown by the loader and the indexer. The app shows a generic "could not load the knowledge base" screen; the code is for developers. */
export class KbError extends Error {
  readonly code: KbErrorCode;
  constructor(code: KbErrorCode, message: string) {
    super(message);
    this.name = "KbError";
    this.code = code;
  }
}
