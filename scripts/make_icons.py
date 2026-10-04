"""Draws the app icons (apps/web/public/*.png) from the same shapes as public/icon.svg — original artwork, no fonts or third-party images.

    python3 scripts/make_icons.py            writes the PNG files (deterministic: same bytes every run)
    python3 scripts/make_icons.py --check    exits 1 when a committed file differs from what this script draws

The glyph is a teal disc with a cream taiji-like crescent: the right half of a disc (r 12) plus a left half-disc (r 6, centre 16,22) minus a
right half-disc (r 6, centre 16,10), on a 32-unit grid. "maskable" icons fill the whole square and keep the glyph inside the 80 % safe zone.
"""
from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "apps" / "web" / "public"
TEAL, CREAM = (0x1D, 0x6B, 0x74), (0xFA, 0xF7, 0xF2)
SS = 4          # samples per axis per pixel


def inside_glyph(x: float, y: float) -> bool:
    """x, y on the 32-unit grid of icon.svg."""
    right_disc = x >= 16 and (x - 16) ** 2 + (y - 16) ** 2 <= 12 ** 2
    left_bulge = x <= 16 and (x - 16) ** 2 + (y - 22) ** 2 <= 6 ** 2
    right_bite = x >= 16 and (x - 16) ** 2 + (y - 10) ** 2 <= 6 ** 2
    return (right_disc or left_bulge) and not right_bite


def render(size: int, *, maskable: bool) -> bytes:
    """RGBA rows. Plain icons are a disc on a transparent square; maskable icons fill the square and shrink the glyph into the safe zone."""
    scale = 0.8 if maskable else 1.0          # glyph size relative to the plain icon (its disc has r 14 of 16)
    rows = bytearray()
    for py in range(size):
        rows.append(0)                        # PNG filter type 0
        for px in range(size):
            bg = glyph = 0
            for sy in range(SS):
                for sx in range(SS):
                    u = (px + (sx + 0.5) / SS) / size * 32      # 0..32
                    v = (py + (sy + 0.5) / SS) / size * 32
                    if maskable or (u - 16) ** 2 + (v - 16) ** 2 <= 14 ** 2:
                        bg += 1
                        gu, gv = 16 + (u - 16) / scale, 16 + (v - 16) / scale
                        if inside_glyph(gu, gv):
                            glyph += 1
            n = SS * SS
            if bg == 0:
                rows += bytes((0, 0, 0, 0))
                continue
            # the glyph sits inside the disc; blend cream over teal by its coverage, alpha by the disc coverage
            mix = glyph / bg
            r, g, b = (round(TEAL[i] * (1 - mix) + CREAM[i] * mix) for i in range(3))
            rows += bytes((r, g, b, round(255 * bg / n)))
    return bytes(rows)


def png(size: int, raw: bytes) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


FILES = {"apple-touch-icon.png": (180, False), "icon-192.png": (192, False), "icon-512.png": (512, False), "icon-maskable-512.png": (512, True)}


def main() -> int:
    check = "--check" in sys.argv
    bad = 0
    for name, (size, maskable) in FILES.items():
        data = png(size, render(size, maskable=maskable))
        path = OUT / name
        if check:
            if not path.exists() or path.read_bytes() != data:
                print(f"✗ {name} differs from what scripts/make_icons.py draws"); bad = 1
        else:
            path.write_bytes(data)
            print(f"wrote {path.relative_to(OUT.parent.parent.parent)} ({len(data)} B)")
    return bad


if __name__ == "__main__":
    sys.exit(main())
