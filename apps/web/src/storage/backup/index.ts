// Backup and restore (docs/post-mvp/design/backup-and-data-lock.md §3): the file format, the validating importer and the plan that becomes one transaction. Pure; the storage layer applies the writes.
export { canonicalJson, sha256Hex } from "./canonical.ts";
export { BACKUP_ENCRYPTED_FORMAT, BACKUP_FORMAT, BACKUP_VERSION, LIMITS } from "./limits.ts";
export { backupFileName, backupPrefs, buildBackup, checkDocument, DEFAULT_SELECTION, readBackup, serializeBackup, type BackupDocument, type BackupPayload, type ReadError, type ReadErrorCode, type ReadResult, type Selection, type Source, type Stamps } from "./format.ts";
export { applyPlan, planImport, prepareImport, type Applied, type Choice, type Conflict, type Current, type ImportContext, type ReplayOutcome, type Plan, type PlanItem, type Prepared, type PreparedRecord, type RejectReason, type Rejected, type Status, type Write } from "./plan.ts";
export { validateAssessment, validateDraft, validatePrefs, type BackupPrefs, type Valid } from "./validate.ts";
export { encryptBackup, openEncrypted, serializeEncrypted, type EncryptedBackup, type EncryptedHeader, type OpenError, type OpenResult } from "./encrypted.ts";
