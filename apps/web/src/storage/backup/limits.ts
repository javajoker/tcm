// What a backup file may be (docs/post-mvp/design/backup-and-data-lock.md §3.4): a file is untrusted, so every size and depth is bounded before anything is built from it.

export const LIMITS = {
  /** The file, in bytes (a person's history is a few hundred KB; this is generous and still safe to parse in memory). */
  fileBytes: 20 * 1024 * 1024,
  /** Saved assessments in one file. */
  records: 1_000,
  /** Nesting of any value, and the total number of values in one record. */
  depth: 24,
  nodes: 200_000,
  /** One string, one list, one object's keys, one key. */
  string: 20_000,
  list: 20_000,
  keys: 5_000,
  key: 120,
  /** Free text the person typed: the note on a result, an allergy name, a medicine name. */
  note: 2_000,
  name: 100,
  names: 100,
  /** The PBKDF2 iteration count a file may ask for (PM-09): bounded on both sides so a hostile file cannot ask for 10⁹ or for 1. */
  minIterations: 100_000,
  maxIterations: 5_000_000,
} as const;

/** The storage-schema versions this build reads (`apps/web/src/storage/migrations.ts`); a file from a newer one is refused. */
export const BACKUP_FORMAT = "tcm-backup";
export const BACKUP_ENCRYPTED_FORMAT = "tcm-backup-encrypted";
export const BACKUP_VERSION = 1;
