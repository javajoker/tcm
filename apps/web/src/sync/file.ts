// A file the person chose, as the sync needs it (docs/post-mvp/design/research-tracks.md §4; task PM-32). The browser's file handle behind a small interface, so that the sync can be tested without a browser and
// everything that can go wrong at the file is named once, here. Nothing is uploaded: the file is on the person's own disk, in a folder their own cloud client may synchronise.

export type Permission = "granted" | "prompt" | "denied";

/** What went wrong at the file, in the words the sync acts on. */
export type FileFailure =
  | "permission"          // the person has not allowed it in this session, or took the permission back
  | "locked"              // another program holds the file (a cloud client mid-upload, an editor): try again later
  | "full"                // no room to write
  | "gone"                // the file was moved or deleted
  | "failed";             // anything else

export class FileError extends Error {
  readonly kind: FileFailure;
  constructor(kind: FileFailure, cause?: unknown) {
    super(`the file could not be used: ${kind}`, cause === undefined ? undefined : { cause });
    this.name = "FileError";
    this.kind = kind;
  }
}

/** The name of a DOMException, whatever realm it came from. */
const nameOf = (e: unknown): string => (typeof e === "object" && e !== null && typeof (e as { name?: unknown }).name === "string" ? (e as { name: string }).name : "");

/** What a failure of the file API means for the sync. */
export function classify(error: unknown): FileFailure {
  if (error instanceof FileError) return error.kind;
  switch (nameOf(error)) {
    case "NotAllowedError": case "SecurityError": return "permission";
    case "NoModificationAllowedError": case "InvalidStateError": case "NotReadableError": case "AbortError": return "locked";
    case "QuotaExceededError": return "full";
    case "NotFoundError": return "gone";
    default: return "failed";
  }
}

/** A file the app may keep up to date. */
export interface SyncFile {
  readonly name: string;
  /** The text of the file now; `""` for an empty file. */
  read(): Promise<string>;
  /** Replace the whole file. Resolves once the browser has closed — and so swapped in — the new content; otherwise rejects with a `FileError` and leaves the previous content as it was. */
  write(text: string): Promise<void>;
  /** Whether the app may read and write it now: `granted`, `prompt` (the person is asked with `request`), or `denied`. */
  permission(): Promise<Permission>;
  /** Ask the person. Needs a click (the browser refuses otherwise). */
  request(): Promise<Permission>;
}

/** The part of a `FileSystemFileHandle` that is used (the full interface needs the DOM's own typings; a fake in a test needs only this). */
export interface HandleLike {
  readonly name: string;
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
  queryPermission?(descriptor: { mode: "readwrite" }): Promise<Permission>;
  requestPermission?(descriptor: { mode: "readwrite" }): Promise<Permission>;
}

/** The sync's view of a browser file handle. */
export function fileOf(handle: HandleLike): SyncFile {
  return {
    name: handle.name,
    async read() {
      try { return await (await handle.getFile()).text(); } catch (e) { throw new FileError(classify(e), e); }
    },
    async write(text) {
      let writable: Awaited<ReturnType<HandleLike["createWritable"]>>;
      try { writable = await handle.createWritable(); } catch (e) { throw new FileError(classify(e), e); }
      try {
        await writable.write(text);
        await writable.close();                                    // the browser swaps the new content in on close: until then the file is as it was
      } catch (e) {
        try { await writable.abort?.(); } catch { /* the previous content is kept either way */ }
        throw new FileError(classify(e), e);
      }
    },
    async permission() { try { return (await handle.queryPermission?.({ mode: "readwrite" })) ?? "granted"; } catch { return "denied"; } },
    async request() { try { return (await handle.requestPermission?.({ mode: "readwrite" })) ?? "granted"; } catch { return "denied"; } },
  };
}

// ── choosing a file ──────────────────────────────────────────────────────

/** The parts of the window's picker that are used. */
interface Picker { showSaveFilePicker?: (options: { suggestedName: string; types: readonly { description: string; accept: Record<string, readonly string[]> }[] }) => Promise<HandleLike> }

/**
 * Can this browser keep a file the person chose? The File System Access API's save picker: Chromium on desktop and Android. Elsewhere the feature is hidden and the manual backup and the share sheet remain.
 * `window` is a parameter so that a test can say what the browser offers.
 */
export const syncSupported = (w: unknown = typeof window === "undefined" ? undefined : window): boolean => typeof (w as Picker | undefined)?.showSaveFilePicker === "function";

/** The suggested name of the file; the person may choose any other, or an existing file of another device. */
export const SUGGESTED_NAME = "tcm-backup.encrypted.json";

/** Let the person choose a file; `null` when they close the picker. The browser asks for the permission as part of choosing. */
export async function chooseFile(w: unknown = typeof window === "undefined" ? undefined : window): Promise<HandleLike | null> {
  const picker = (w as Picker | undefined)?.showSaveFilePicker;
  if (typeof picker !== "function") throw new FileError("failed");
  try {
    return await picker.call(w, { suggestedName: SUGGESTED_NAME, types: [{ description: "Encrypted backup", accept: { "application/json": [".json"] } }] });
  } catch (e) {
    if (nameOf(e) === "AbortError") return null;
    throw new FileError(classify(e), e);
  }
}
