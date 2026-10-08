// From a file the person chose to a picture the gateway may be sent (PM-50; docs/post-mvp/design/ai-assisted-intake.md §3, docs/privacy.md §2): decoded on the device, turned upright,
// scaled to at most `MAX_SIDE` pixels on its long side, drawn on a canvas — which is where every camera detail is lost, the place, the time, the make and the thumbnail — looked at by the
// quality gate, and only when the person presses Send encoded as a JPEG with no metadata at all (`stripJpeg` takes out anything a browser's encoder would still add). Nothing is
// written anywhere: the picture lives on a canvas in memory, and `releasePhoto` empties it. The camera is the device's own: the file input hands over what the camera app took, so the
// page needs no camera permission (`Permissions-Policy: camera=()` stays, in every build).
import { base64FromBytes, LIMITS, stripJpeg } from "@tcm/ai";
import type { ObserveModule } from "@tcm/ai";
import { assess, GATE, type Quality } from "./quality.ts";

/** The long side of the picture that is sent, in pixels: enough for a provider's vision model to see a tongue's coating, not more than it needs. */
export const MAX_SIDE = 1024;
/** The largest file the app will decode; a phone photo is a few megabytes. */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;

export interface Captured {
  /** The picture, upright and scaled: shown to the person, then encoded and dropped. */
  readonly canvas: HTMLCanvasElement;
  /** The picture's size as the camera took it. */
  readonly original: { readonly width: number; readonly height: number };
  readonly quality: Quality;
}

/** Why a file could not be turned into a picture: not an image the browser can read, or too large. */
export type CaptureError = "type" | "huge" | "unreadable";

const KINDS = /^image\/(jpeg|png|webp|heic|heif|avif|gif|bmp)$/i;

/** The file as a picture and its quality, or why not. */
export async function readPhoto(file: File, module: ObserveModule): Promise<{ readonly ok: true; readonly photo: Captured } | { readonly ok: false; readonly error: CaptureError }> {
  if (!KINDS.test(file.type) && !(file.type === "" && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))) return { ok: false, error: "type" };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "huge" };
  let bitmap: ImageBitmap;
  try {
    try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { bitmap = await createImageBitmap(file); }
  } catch {
    return { ok: false, error: "unreadable" };
  }
  try {
    const original = { width: bitmap.width, height: bitmap.height };
    if (original.width < 1 || original.height < 1) return { ok: false, error: "unreadable" };
    const canvas = draw(bitmap, MAX_SIDE);
    if (canvas === null) return { ok: false, error: "unreadable" };
    // shown in the page at the width the page has, in proportion (the canvas keeps its pixels)
    canvas.style.cssText = "display:block;max-width:100%;max-height:60vh;width:auto;height:auto";
    const small = draw(canvas, GATE.analysis);
    const context = small?.getContext("2d", { willReadFrequently: true }) ?? null;
    if (small === null || context === null) { releaseCanvas(canvas); return { ok: false, error: "unreadable" }; }
    const pixels = context.getImageData(0, 0, small.width, small.height);
    const quality = assess(pixels, original, module);
    releaseCanvas(small);
    return { ok: true, photo: { canvas, original, quality } };
  } finally {
    bitmap.close();
  }
}

/** A copy of `source` with its long side at most `side` pixels, on a white ground (a transparent picture does not turn black), or null when the browser cannot draw. */
function draw(source: ImageBitmap | HTMLCanvasElement, side: number): HTMLCanvasElement | null {
  const scale = Math.min(1, side / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (context === null) return null;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const blobOf = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

/**
 * The picture as the JPEG that is sent: no metadata, at most `LIMITS.imageBytes`. The first quality that fits is taken; null when the browser cannot encode, or the picture does not
 * fit even at the lowest quality.
 */
export async function encodeJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  for (const quality of [0.86, 0.72, 0.58]) {
    const blob = await blobOf(canvas, quality);
    if (blob === null || blob.type !== "image/jpeg") return null;
    const clean = stripJpeg(new Uint8Array(await blob.arrayBuffer()));
    if (clean === null) return null;
    if (clean.length <= LIMITS.imageBytes) return clean;
  }
  return null;
}

export const toBase64 = base64FromBytes;

/** Empties a canvas: its pixels are gone from memory as far as the page can make them. */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

export const releasePhoto = (photo: Captured): void => releaseCanvas(photo.canvas);
