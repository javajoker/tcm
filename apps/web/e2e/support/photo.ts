// Pictures for the end-to-end scenarios of the photo of the tongue and the face (E42): synthetic, made here, deterministic — a PNG encoder, a tongue, a face, a picture that is too dark and
// one that is out of focus — and a way to give a picture the metadata a camera adds (an EXIF block with a place), so that a scenario can look for it in what is sent.
import { deflateSync } from "node:zlib";
import type { Page } from "@playwright/test";

const CRC = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

export type Rgb = readonly [number, number, number];

/** An RGB PNG; `text` becomes tEXt chunks (the kind of thing a picture can carry that a canvas does not keep). */
export function png(width: number, height: number, pixel: (x: number, y: number) => Rgb, text: Readonly<Record<string, string>> = {}): Buffer {
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[y * row + 1 + x * 3] = Math.max(0, Math.min(255, Math.round(r)));
      raw[y * row + 2 + x * 3] = Math.max(0, Math.min(255, Math.round(g)));
      raw[y * row + 3 + x * 3] = Math.max(0, Math.min(255, Math.round(b)));
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    ...Object.entries(text).map(([k, v]) => chunk("tEXt", Buffer.from(`${k}\0${v}`, "latin1"))),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A grain, the same every time. */
function grain(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 31 - 1; };
}

const W = 640, H = 480;
const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/** A tongue, as far as the quality gate can tell: a pink-red body with a grain, a pale coat in the middle, a crack, on a dark ground. */
export function tongue(text: Readonly<Record<string, string>> = {}): Buffer {
  const n = grain(7);
  return png(W, H, (x, y) => {
    const g = n();
    if (!inEllipse(x, y, 320, 250, 190, 150)) return [112 + g * 12, 80 + g * 12, 76 + g * 12];
    if (Math.abs(x - 320) < 2 && y > 190 && y < 340) return [150, 60, 70];
    if (inEllipse(x, y, 320, 250, 90, 70)) return [226 + g * 14, 196 + g * 14, 186 + g * 14];
    return [205 + g * 22 - (y - 250) * 0.05, 112 + g * 22, 122 + g * 22];
  }, text);
}

/** A face: skin, hair, eyes and lips on a wall. */
export function face(text: Readonly<Record<string, string>> = {}): Buffer {
  const n = grain(11);
  return png(W, H, (x, y) => {
    const g = n();
    if (!inEllipse(x, y, 320, 250, 150, 200)) return [158 + g * 10, 168 + g * 10, 184 + g * 10];
    if (y < 120) return [58 + g * 10, 46 + g * 10, 42 + g * 10];
    if (inEllipse(x, y, 262, 215, 22, 9) || inEllipse(x, y, 378, 215, 22, 9)) return [48 + g * 10, 38 + g * 10, 38 + g * 10];
    if (inEllipse(x, y, 320, 345, 48, 14)) return [182 + g * 12, 92 + g * 12, 102 + g * 12];
    return [208 + g * 22, 156 + g * 22, 132 + g * 22];
  }, text);
}

/** The tongue in a dark room. */
export function dark(): Buffer {
  const n = grain(13);
  return png(W, H, (x, y) => {
    const g = n();
    return inEllipse(x, y, 320, 250, 190, 150) ? [30 + g * 5, 16 + g * 5, 18 + g * 5] : [14 + g * 3, 10 + g * 3, 10 + g * 3];
  });
}

/** A picture with contrast but no edge: a slow gradient. */
export function blurry(): Buffer {
  return png(W, H, (x, y) => {
    const v = 70 + (x / W) * 120 + Math.sin(y / 60) * 12;
    return [v, v, v];
  });
}

/**
 * The picture as a JPEG of a camera: made by the browser's own encoder, with an EXIF block and a comment put after the start of the image — a place, a time and a make that the scenario
 * can look for in what is sent. Needs a page (the browser makes the JPEG).
 */
export async function cameraJpeg(page: Page, source: Buffer, exif: string, comment: string): Promise<Buffer> {
  const b64 = await page.evaluate(async (data) => {
    const bin = atob(data);                                           // (not fetch("data:…"): the page's connect-src does not allow it)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    const out = new Uint8Array(await jpeg!.arrayBuffer());
    let text = "";
    for (const b of out) text += String.fromCharCode(b);
    return btoa(text);
  }, source.toString("base64"));
  const jpeg = Buffer.from(b64, "base64");
  const segment = (marker: number, payload: string): Buffer => {
    const body = Buffer.from(payload, "latin1");
    return Buffer.concat([Buffer.from([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
  };
  return Buffer.concat([jpeg.subarray(0, 2), segment(0xe1, `Exif\0\0${exif}`), segment(0xfe, comment), jpeg.subarray(2)]);
}

/** Every string a page keeps for itself, to look for a picture in: local and session storage, every database's every record, the cache storage's names and requests. */
export async function everythingStored(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const parts: string[] = [];
    for (const store of [localStorage, sessionStorage]) for (let i = 0; i < store.length; i++) { const k = store.key(i)!; parts.push(k, store.getItem(k) ?? ""); }
    for (const name of await caches.keys()) { parts.push(`cache:${name}`); for (const r of await (await caches.open(name)).keys()) parts.push(r.url); }
    const dbs = await indexedDB.databases();
    for (const info of dbs) {
      if (info.name === undefined) continue;
      parts.push(`db:${info.name}`);
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(info.name!); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      for (const store of Array.from(db.objectStoreNames)) {
        parts.push(`store:${store}`);
        const rows = await new Promise<unknown[]>((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        for (const row of rows) parts.push(JSON.stringify(row, (_k, v: unknown) => (v instanceof Blob || v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? `<binary ${(v as { size?: number; byteLength?: number }).size ?? (v as { byteLength?: number }).byteLength}>` : v)) ?? "");
      }
      db.close();
    }
    return parts.join("\n");
  });
}
