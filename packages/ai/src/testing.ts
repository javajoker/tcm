// A stand-in for a photo, for tests (task PM-50): bytes with the structure of a JPEG — SOI, a JFIF header, tables, a frame header of the given size, a scan, EOI — that nothing can decode
// but that the gateway's checks (image.ts) and the mock provider accept or refuse as they would a real one. Optional extra segments stand for what a camera adds (an EXIF block with a
// place, a comment …). Not used by the app.
import { base64FromBytes } from "./image.ts";

export interface FakeJpeg {
  readonly width?: number;
  readonly height?: number;
  /** Bytes of entropy-coded data in the scan (the size of the file, roughly). */
  readonly size?: number;
  /** Extra segments after the JFIF header: `[marker, payload]`, e.g. `[0xe1, "Exif\0\0GPS"]`. */
  readonly extra?: readonly (readonly [number, string])[];
  /** A byte pattern used for the scan data (never `FF`): lets a test find the "pixels" again in a log or a request. */
  readonly fill?: number;
}

const segment = (marker: number, payload: readonly number[]): number[] => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const text = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

export function fakeJpeg(o: FakeJpeg = {}): Uint8Array<ArrayBuffer> {
  const width = o.width ?? 640, height = o.height ?? 480, size = o.size ?? 20_000, fill = o.fill ?? 0x5a;
  const bytes = [
    0xff, 0xd8,
    ...segment(0xe0, [...text("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...(o.extra ?? []).flatMap(([marker, payload]) => segment(marker, text(payload))),
    ...segment(0xdb, [0, ...new Array<number>(64).fill(8)]),
    ...segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
  ];
  const scan = new Uint8Array(size).fill(fill === 0xff ? 0x5a : fill);
  return Uint8Array.from([...bytes, ...scan, 0xff, 0xd9]);
}

export const fakeJpegBase64 = (o: FakeJpeg = {}): string => base64FromBytes(fakeJpeg(o));
