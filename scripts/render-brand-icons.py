#!/usr/bin/env python3
"""
Rasterise the Kingfisher mark from its master SVG.

Safari refuses SVG for `apple-touch-icon`, and a PWA manifest wants real
rasters, so the PNGs cannot simply be the SVG renamed. They are generated here
rather than hand-exported so that changing `brand/kingfisher-mark.svg` and
re-running this script is the whole story — there is no second copy of the
geometry to forget about.

    python3 scripts/render-brand-icons.py

Requires Pillow. Everything is drawn at 4x and downsampled, which is cheaper
than implementing analytic antialiasing and indistinguishable at icon sizes.
"""

import re
import pathlib
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
MASTER = ROOT / "brand" / "kingfisher-mark.svg"
SS = 4  # supersampling factor

# (relative path, pixel size, kind)
# `kind` controls how the mark is composited into the canvas:
#   - "fullbleed" — the mark fills the canvas edge to edge (any-purpose icons).
#   - "maskable"  — the mark is shrunk to ~60% of the canvas so the operating
#     system's mask (which can crop a circular or rounded square from the icon)
#     never clips the kingfisher mark. The 60% target follows the Web App
#     Manifest "maskable" specification's 80% safe-area recommendation, then
#     tightens to 60% so the bird still reads at very small sizes.
TARGETS = [
    ("public/icon-192.png", 192, "fullbleed"),
    ("public/icon-512.png", 512, "fullbleed"),
    ("public/icon-maskable-512.png", 512, "maskable"),
    ("src/app/apple-icon.png", 180, "fullbleed"),
    # The desktop application icon. electron-builder derives every macOS,
    # Windows and Linux size from this one, so it is the largest the packagers
    # ask for rather than a size anything displays directly.
    ("desktop/build/icon.png", 1024, "fullbleed"),
]

NS = {"svg": "http://www.w3.org/2000/svg"}


def parse_transform(value):
    """Only `translate(x y) scale(s)` is used by the master; reject anything else."""
    if not value:
        return 0.0, 0.0, 1.0
    t = re.search(r"translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)", value)
    s = re.search(r"scale\(\s*([-\d.]+)\s*\)", value)
    tx, ty = (float(t.group(1)), float(t.group(2))) if t else (0.0, 0.0)
    sc = float(s.group(1)) if s else 1.0
    return tx, ty, sc


def tokenize(d):
    return re.findall(r"[MLCZmlcz]|-?\d*\.?\d+", d)


def flatten_path(d, steps=24):
    """Turn an M/L/C/Z path into a polygon. Absolute commands only."""
    tokens = tokenize(d)
    points, i, cmd = [], 0, None
    cur = (0.0, 0.0)
    while i < len(tokens):
        token = tokens[i]
        if token in "MLCZmlcz":
            cmd = token
            i += 1
            if cmd in "Zz":
                continue
        if cmd in "Mm":
            cur = (float(tokens[i]), float(tokens[i + 1]))
            points.append(cur)
            i += 2
        elif cmd in "Ll":
            cur = (float(tokens[i]), float(tokens[i + 1]))
            points.append(cur)
            i += 2
        elif cmd in "Cc":
            x1, y1, x2, y2, x, y = (float(v) for v in tokens[i : i + 6])
            p0 = cur
            for step in range(1, steps + 1):
                t = step / steps
                u = 1 - t
                bx = u**3 * p0[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t**3 * x
                by = u**3 * p0[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t**3 * y
                points.append((bx, by))
            cur = (x, y)
            i += 6
        else:
            raise SystemExit(f"unsupported path command {cmd!r}; keep the master simple")
    return points


def render(size, kind="fullbleed"):
    tree = ET.parse(MASTER)
    root = tree.getroot()
    view = [float(v) for v in root.get("viewBox").split()]
    span = view[2]
    # `maskable` icons leave a 20% safe area on every side, so the mark is
    # rendered into the inner 60% of the canvas and centred.
    if kind == "maskable":
        inset = 0.2 * size
        mark_size = size - 2 * inset
        scale = mark_size * SS / span
    else:
        scale = size * SS / span
    canvas = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    def at(x, y, tx=0.0, ty=0.0, sc=1.0):
        if kind == "maskable":
            return (
                (x * sc + tx) * scale + inset * SS,
                (y * sc + ty) * scale + inset * SS,
            )
        return ((x * sc + tx) * scale, (y * sc + ty) * scale)

    # Background tile: the rounded rect plus the two lighter board squares,
    # drawn onto a mask so the squares are clipped by the corner radius.
    tile = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(tile)
    rects = root.find("svg:g", NS).findall("svg:rect", NS)
    for rect in rects:
        x = float(rect.get("x", 0)) * scale
        y = float(rect.get("y", 0)) * scale
        w = float(rect.get("width")) * scale
        h = float(rect.get("height")) * scale
        if kind == "maskable":
            x += inset * SS
            y += inset * SS
        tdraw.rectangle([x, y, x + w, y + h], fill=rect.get("fill"))
    mask = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, canvas.size[0] - 1, canvas.size[1] - 1], radius=14 * scale, fill=255
    )
    canvas.paste(tile, (0, 0), mask)

    # Foreground: the bird, then the eye punched back out in the tile colour.
    group = root.findall("svg:g", NS)[1]
    tx, ty, sc = parse_transform(group.get("transform"))
    for node in group:
        tag = node.tag.split("}")[-1]
        if tag == "path":
            polygon = [at(x, y, tx, ty, sc) for x, y in flatten_path(node.get("d"))]
            draw.polygon(polygon, fill=node.get("fill"))
        elif tag == "circle":
            cx, cy, r = (float(node.get(k)) for k in ("cx", "cy", "r"))
            x0, y0 = at(cx - r, cy - r, tx, ty, sc)
            x1, y1 = at(cx + r, cy + r, tx, ty, sc)
            draw.ellipse([x0, y0, x1, y1], fill=node.get("fill"))

    return canvas.resize((size, size), Image.LANCZOS)


def main():
    for target in TARGETS:
        relative, size, kind = target
        out = ROOT / relative
        out.parent.mkdir(parents=True, exist_ok=True)
        render(size, kind).save(out, "PNG", optimize=True)
        print(f"{relative:32} {size}x{size}  {out.stat().st_size:>7} B")


if __name__ == "__main__":
    main()
