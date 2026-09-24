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

from PIL import Image, ImageChops, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
MASTER = ROOT / "brand" / "kingfisher-mark.svg"
SS = 4  # supersampling factor

# (relative path, pixel size, kind)
# `kind` controls how the mark is composited into the canvas:
#   - "fullbleed" — the mark fills the canvas edge to edge, with the tile's
#     rounded corners left transparent (any-purpose icons and favicons).
#   - "square"    — the same, but the corners are filled: iOS composites the
#     Apple touch icon onto black and then applies its own corner mask, so a
#     transparent corner shows as a black one on the home screen.
#   - "maskable"  — the mark is shrunk to ~60% of the canvas so the operating
#     system's mask (which can crop a circular or rounded square from the icon)
#     never clips the kingfisher mark. The 60% target follows the Web App
#     Manifest "maskable" specification's 80% safe-area recommendation, then
#     tightens to 60% so the bird still reads at very small sizes. The
#     frame colour fills the whole canvas, because the mask is the
#     operating system's to choose and a transparent margin shows through it.
#   - "macos"     — Apple's icon grid: the rounded body is 824 of 1024 px,
#     centred, with the platform's own corner radius and a soft shadow under
#     it. A full-bleed tile sat larger than every other icon in the Dock.
TARGETS = [
    ("public/icon-192.png", 192, "fullbleed"),
    ("public/icon-512.png", 512, "fullbleed"),
    ("public/icon-maskable-512.png", 512, "maskable"),
    ("src/app/apple-icon.png", 180, "square"),
    # A PNG favicon at a multiple of 48 px, the size Google's search-result
    # favicon crawler asks for; the .ico carries 16/32/48 and the SVG has no
    # size, and this is the one file that satisfies the crawler outright.
    # Next's file convention links every `icon*` file in `src/app/`.
    ("src/app/icon1.png", 96, "fullbleed"),
    # The desktop application icon. electron-builder derives every macOS,
    # Windows and Linux size from this one, so it is the largest the packagers
    # ask for rather than a size anything displays directly.
    ("desktop/build/icon.png", 1024, "macos"),
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


MACOS_BODY = 824 / 1024
MACOS_RADIUS = 0.2237  # of the body's side, Apple's continuous-corner approximation


def render(size, kind="fullbleed"):
    if kind == "macos":
        return render_macos(size)
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
    if kind == "maskable":
        frame = root.find("svg:g", NS).find("svg:rect", NS).get("fill")
        draw.rectangle([0, 0, canvas.size[0], canvas.size[1]], fill=frame)

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
        [0, 0, canvas.size[0] - 1, canvas.size[1] - 1],
        radius=0 if kind == "square" else 14 * scale,
        fill=255,
    )
    # Composited, not pasted: a paste replaces the pixels under the mask with
    # the tile's, transparent margin and all, and the maskable icon's frame
    # colour went with them.
    tile.putalpha(ImageChops.multiply(tile.getchannel("A"), mask))
    canvas.alpha_composite(tile)

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


# The master is also served as an SVG, in two places: the favicon Next links
# from `src/app/`, and the image the landing and the public pages draw. They
# are copies of the master, written here, so they cannot keep an old colour
# (`src/ui/brand-assets.test.ts` checks that they are byte-identical).
SVG_COPIES = [
    "src/app/icon.svg",
    "public/landing/img/kingfisher-mark.svg",
    "marketing/assets/img/kingfisher-mark.svg",
]


def render_macos(size):
    """The square render, rounded and shadowed on Apple's 1024 grid."""
    from PIL import ImageFilter

    body = round(size * MACOS_BODY)
    inset = (size - body) // 2
    tile = render(body, "square")
    mask = Image.new("L", (body * SS, body * SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, body * SS - 1, body * SS - 1], radius=MACOS_RADIUS * body * SS, fill=255
    )
    mask = mask.resize((body, body), Image.LANCZOS)
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shade = Image.new("RGBA", (body, body), (0, 0, 0, 90))
    shadow.paste(shade, (inset, inset + round(size * 0.012)), mask)
    shadow = shadow.filter(ImageFilter.GaussianBlur(size * 0.014))
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(shadow)
    canvas.paste(tile, (inset, inset), mask)
    return canvas


def main():
    for relative in SVG_COPIES:
        (ROOT / relative).write_bytes(MASTER.read_bytes())
        print(f"{relative:32} svg      {(ROOT / relative).stat().st_size:>7} B")
    for target in TARGETS:
        relative, size, kind = target
        out = ROOT / relative
        out.parent.mkdir(parents=True, exist_ok=True)
        render(size, kind).save(out, "PNG", optimize=True)
        print(f"{relative:32} {size}x{size}  {out.stat().st_size:>7} B")
    # Browsers ask for /favicon.ico by convention whatever the page links;
    # Next serves this file there. Three sizes from the full-bleed render.
    ico = ROOT / "src/app/favicon.ico"
    render(48, "fullbleed").save(ico, "ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"{'src/app/favicon.ico':32} 16/32/48  {ico.stat().st_size:>7} B")


if __name__ == "__main__":
    main()
