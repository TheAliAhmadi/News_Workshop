"""Generate the application icons.

Written with the standard library only, so a build machine needs no image
tooling and the icons stay reproducible from source.
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

ICONS = Path(__file__).resolve().parent / 'icons'
BACKGROUND = (17, 24, 39)
PANEL = (241, 245, 249)
ACCENT = (56, 189, 248)
HIGHLIGHT = (129, 140, 248)
SUPERSAMPLE = 4
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)
ICNS_SIZES = {'ic07': 128, 'ic08': 256, 'ic09': 512, 'ic10': 1024, 'ic11': 32, 'ic12': 64, 'ic13': 256, 'ic14': 512}


def _rounded(x, y, size, radius):
    """Signed coverage test for a rounded square in a unit-ish coordinate space."""
    left, top, right, bottom = radius, radius, size - radius, size - radius
    cx = min(max(x, left), right)
    cy = min(max(y, top), bottom)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def _blend(base, layer, alpha):
    return tuple(round(b + (l - b) * alpha) for b, l in zip(base, layer))


def _render(size):
    """Draw one icon at `size` pixels, supersampled for smooth edges."""
    big = size * SUPERSAMPLE
    unit = big / 32.0
    rows = []
    for y in range(big):
        row = bytearray()
        for x in range(big):
            if not _rounded(x, y, big, big * 0.22):
                row += bytes((0, 0, 0, 0))
                continue
            colour = BACKGROUND
            # A page of records.
            if 7 * unit <= x <= 25 * unit and 6 * unit <= y <= 26 * unit:
                colour = PANEL
                # Text lines on the page, with the classified row highlighted.
                for index, top in enumerate((10, 14, 18)):
                    if top * unit <= y <= (top + 1.6) * unit and 10 * unit <= x <= 22 * unit:
                        colour = ACCENT if index == 1 else (148, 163, 184)
            # A marker showing a result attached to the page.
            if (x - 24 * unit) ** 2 + (y - 24 * unit) ** 2 <= (5.5 * unit) ** 2:
                colour = HIGHLIGHT
            if (x - 24 * unit) ** 2 + (y - 24 * unit) ** 2 <= (2.4 * unit) ** 2:
                colour = PANEL
            row += bytes(colour + (255,))
        rows.append(bytes(row))
    return _downsample(rows, big, SUPERSAMPLE)


def _downsample(rows, big, factor):
    size = big // factor
    out = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r = g = b = a = 0
            for dy in range(factor):
                line = rows[y * factor + dy]
                for dx in range(factor):
                    offset = ((x * factor + dx) * 4)
                    r += line[offset]; g += line[offset + 1]; b += line[offset + 2]; a += line[offset + 3]
            count = factor * factor
            row += bytes((r // count, g // count, b // count, a // count))
        out.append(bytes(row))
    return out


def _png(rows, size):
    raw = b''.join(b'\x00' + row for row in rows)

    def chunk(tag, payload):
        return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF)

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


def write_png(size, path):
    path.write_bytes(_png(_render(size), size))


def write_ico(path, sizes=ICO_SIZES):
    """ICO with PNG-compressed entries, supported by Windows Vista and newer."""
    images = [(size, _png(_render(size), size)) for size in sizes]
    header = struct.pack('<HHH', 0, 1, len(images))
    offset = len(header) + 16 * len(images)
    entries, payload = b'', b''
    for size, data in images:
        entries += struct.pack('<BBBBHHII', size if size < 256 else 0, size if size < 256 else 0,
                               0, 0, 1, 32, len(data), offset)
        payload += data
        offset += len(data)
    path.write_bytes(header + entries + payload)


def write_icns(path, entries=ICNS_SIZES):
    """ICNS with PNG entries, the format macOS has accepted since 10.7."""
    body = b''
    for tag, size in entries.items():
        data = _png(_render(size), size)
        body += tag.encode('ascii') + struct.pack('>I', len(data) + 8) + data
    path.write_bytes(b'icns' + struct.pack('>I', len(body) + 8) + body)


if __name__ == '__main__':
    ICONS.mkdir(parents=True, exist_ok=True)
    write_ico(ICONS / 'workbench.ico')
    write_icns(ICONS / 'workbench.icns')
    write_png(512, ICONS / 'workbench.png')
    for created in sorted(ICONS.iterdir()):
        print(f'{created.name}: {created.stat().st_size:,} bytes')
