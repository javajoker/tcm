// A photo as it crosses the gateway (task PM-50; docs/post-mvp/design/ai-assisted-intake.md §3, docs/privacy.md §6 rule 7): a JPEG and nothing else. The app re-encodes every picture
// on the device — the file it sends holds the picture, and none of what a camera adds (EXIF with the place and the time, the camera's and the software's names, a thumbnail, XMP, IPTC,
// a comment) — and the gateway checks that for itself instead of trusting the app: this module walks the JPEG's segments, which is all it takes. It decodes nothing.
//
// A JPEG is a sequence of segments `FF <marker> <length> <payload>`; after the start-of-scan segment come the entropy-coded bytes (in which `FF` is always followed by `00` or a restart
// marker) up to the next marker. What may stay: the quantisation and Huffman tables, the frame header, the scan, and an APP0 "JFIF" header without a thumbnail. Everything else
// — APP1 … APP15, COM — is metadata.

export type JpegProblem = "signature" | "structure" | "metadata" | "size";
export interface JpegInfo { readonly width: number; readonly height: number }

interface Segment { readonly marker: number; readonly from: number; readonly at: number; readonly to: number }

const isRestart = (m: number): boolean => m >= 0xd0 && m <= 0xd7;
const isFrame = (m: number): boolean => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
/** Baseline, extended sequential and progressive Huffman: what cameras, canvases and encoders produce. */
const isUsableFrame = (m: number): boolean => m === 0xc0 || m === 0xc1 || m === 0xc2;

/** The segments of a JPEG from SOI to EOI (the entropy-coded data belongs to its SOS segment), or null when it is cut short, has data after EOI or is not well formed. */
function segmentsOf(b: Uint8Array): Segment[] | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const out: Segment[] = [{ marker: 0xd8, from: 0, at: 1, to: 2 }];
  let i = 2;
  for (;;) {
    if (i >= b.length || b[i] !== 0xff) return null;
    let at = i + 1;
    while (at < b.length && b[at] === 0xff) at++;                       // fill bytes before a marker
    if (at >= b.length) return null;
    const marker = b[at]!;
    if (marker === 0xd9) {
      out.push({ marker, from: i, at, to: at + 1 });
      return at + 1 === b.length ? out : null;                          // nothing may follow the end of the image
    }
    if (marker === 0x00 || marker === 0x01 || marker === 0xd8 || isRestart(marker)) return null;
    if (at + 2 >= b.length) return null;
    const length = (b[at + 1]! << 8) | b[at + 2]!;
    if (length < 2 || at + 1 + length > b.length) return null;
    let to = at + 1 + length;
    if (marker === 0xda) {                                              // the scan: entropy-coded bytes until the next marker
      let k = to;
      for (; k + 1 < b.length; k++) {
        if (b[k] !== 0xff) continue;
        const next = b[k + 1]!;
        if (next !== 0x00 && next !== 0xff && !isRestart(next)) break;
      }
      if (k + 1 >= b.length) return null;
      to = k;
    }
    out.push({ marker, from: i, at, to });
    i = to;
  }
}

const ascii = (b: Uint8Array, from: number, text: string): boolean => [...text].every((c, k) => b[from + k] === c.charCodeAt(0));

/** A JFIF header is harmless when it names no thumbnail (the thumbnail is a second picture, and could be of anything). */
function plainJfif(b: Uint8Array, s: Segment): boolean {
  const payload = s.at + 3;
  return s.to - payload >= 14 && ascii(b, payload, "JFIF") && b[payload + 4] === 0 && b[payload + 12] === 0 && b[payload + 13] === 0;
}

const isMetadata = (b: Uint8Array, s: Segment): boolean => (s.marker === 0xe0 ? !plainJfif(b, s) : (s.marker >= 0xe1 && s.marker <= 0xef) || s.marker === 0xfe);

/** Whether `bytes` is a JPEG the gateway accepts: its start, its structure, no metadata, a frame within `[minSide, maxSide]`. */
export function inspectJpeg(bytes: Uint8Array, minSide = 1, maxSide = 65_535): { readonly ok: true; readonly info: JpegInfo } | { readonly ok: false; readonly problem: JpegProblem } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return { ok: false, problem: "signature" };
  const segments = segmentsOf(bytes);
  if (segments === null) return { ok: false, problem: "structure" };
  if (segments.some((s) => isMetadata(bytes, s))) return { ok: false, problem: "metadata" };
  const frames = segments.filter((s) => isFrame(s.marker));
  const frame = frames[0];
  if (frames.length !== 1 || frame === undefined || !isUsableFrame(frame.marker) || frame.to - frame.at < 9) return { ok: false, problem: "structure" };
  const height = (bytes[frame.at + 4]! << 8) | bytes[frame.at + 5]!;
  const width = (bytes[frame.at + 6]! << 8) | bytes[frame.at + 7]!;
  if (width === 0 || height === 0) return { ok: false, problem: "structure" };
  if (Math.min(width, height) < minSide || Math.max(width, height) > maxSide) return { ok: false, problem: "size" };
  return { ok: true, info: { width, height } };
}

/** The same picture without metadata: every APP1 … APP15 and comment segment, and a JFIF header that names a thumbnail, removed. Null when `bytes` is not a well-formed JPEG. */
export function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  const segments = segmentsOf(bytes);
  if (segments === null) return null;
  const kept = segments.filter((s) => !isMetadata(bytes, s));
  const out = new Uint8Array(kept.reduce((n, s) => n + (s.to - s.from), 0));
  let at = 0;
  for (const s of kept) {
    out.set(bytes.subarray(s.from, s.to), at);
    at += s.to - s.from;
  }
  return out;
}

// ── base64 ──────────────────────────────────────────────────────────────────

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** The bytes of a base64 string (standard alphabet, padded, no line breaks), or null. */
export function bytesFromBase64(text: string): Uint8Array | null {
  if (!BASE64.test(text)) return null;
  try {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function base64FromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
