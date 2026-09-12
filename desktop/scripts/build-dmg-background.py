#!/usr/bin/env python3
"""
Build the polished DMG background asset.

Produces two PNGs from the same source so Finder can use the
2x variant on Retina displays and the 1x variant on the rest:

    desktop/build/dmg/background.png      720x460  (1x)
    desktop/build/dmg/background@2x.png  1440x920 (2x)

The design is intentionally restrained, and it draws only what Finder
does not: Finder itself places the Kingfisher.app icon and the
Applications alias at the positions `desktop/electron-builder.yml`
names under `dmg.contents`, and labels them. So the background carries

  - a dark, almost-black surface that matches Kingfisher's in-app
    surfaces;
  - the wordmark at the top;
  - a thin arrow that runs between the two icon positions, at their
    vertical centre;
  - one short caption, above the status-bar region, naming the action
    in the words a Mac user expects.

It carries no icons and no labels. The first version baked the app icon
at *both* positions — a second Kingfisher bird sat under the
Applications folder — and baked "Kingfisher" / "Applications" beneath
them, so a mounted DMG showed every label twice; its caption at 82 % of
the height was hidden under Finder's status bar. Photographed in
Phase 46, then fixed. ICON_CENTRES below must agree with the yml.
"""

from __future__ import annotations

import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent
BUILD_DIR = HERE.parent / "build" / "dmg"
PROJECT_ICON = HERE.parent / "build" / "icon.png"

# Where electron-builder places the two icons (centres, 1x), and their size.
# `desktop/electron-builder.yml` `dmg.contents` / `dmg.iconSize` are the
# same numbers; the arrow is drawn between them.
ICON_CENTRES = ((210, 230), (510, 230))
ICON_SIZE = 96

BG = (26, 28, 32, 255)        # matches Kingfisher dialog surface
FG = (244, 244, 246, 255)
DIM = (154, 160, 166, 255)

SIZES = [
    ("background.png", 720, 460),
    ("background@2x.png", 1440, 920),
]


def find_font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    """Pick a system font that looks at home in a Mac app installer.

    No single font is guaranteed to be present, so we try the ones
    Apple ships first and fall back to whatever is on the machine.
    The fallback chain is what a Mac user already sees in other
    installers, which is the look the owner asked for.
    """
    candidates = [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path_str in candidates:
        p = pathlib.Path(path_str)
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def draw_arrow(draw: ImageDraw.ImageDraw, x1: int, x2: int, y: int, thickness: int) -> None:
    """Draw a thin, calm arrow between the two icons.

    A typographic glyph like `\u2192` is tempting but renders at
    whatever the font designer chose; drawing the line ourselves
    keeps the proportions exactly what the design intends.
    """
    line_color = (244, 244, 246, 46)  # ~18% white
    draw.line([(x1, y), (x2, y)], fill=line_color, width=thickness)
    # Arrowhead: an isoceles triangle pointing right.
    head = max(thickness * 4, 12)
    draw.polygon(
        [
            (x2, y),
            (x2 - head, y - head // 2),
            (x2 - head, y + head // 2),
        ],
        fill=line_color,
    )


def draw(w: int, h: int) -> Image.Image:
    scale = w / 720
    im = Image.new("RGBA", (w, h), BG)
    # 1. A subtle vertical gradient that lifts the top edge enough
    #    to make the title legible without a chrome bar.
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    overlay_ctx = ImageDraw.Draw(overlay)
    for y in range(0, h // 3):
        a = int(10 * (1 - y / (h / 3)))
        overlay_ctx.line([(0, y), (w, y)], fill=(244, 244, 246, a))
    im = Image.alpha_composite(im, overlay)
    draw_ctx = ImageDraw.Draw(im)
    # 2. The wordmark.
    title_font = find_font("regular", size=int(h * 0.058))
    draw_ctx.text((w // 2, int(h * 0.10)), "KINGFISHER", font=title_font, fill=FG, anchor="ma")
    # 3. The arrow, between the icons Finder will draw. It starts a little
    #    clear of the left icon's edge and ends a little short of the right
    #    icon's, so neither icon sits on it.
    (lx, ly), (rx, _ry) = ICON_CENTRES
    half = ICON_SIZE / 2
    arrow_y = int(ly * scale)
    arrow_start_x = int((lx + half + 22) * scale)
    arrow_end_x = int((rx - half - 14) * scale)
    draw_arrow(draw_ctx, arrow_start_x, arrow_end_x, arrow_y, max(2, int(h * 0.012)))
    # 4. The caption, below the labels Finder draws under the icons (icon
    #    bottom at ly + 48, label to about ly + 80) and above the status
    #    bar a user may have switched on. 74 % of the height is 340 px at
    #    1x: clear of both.
    action_font = find_font("regular", size=int(h * 0.046))
    draw_ctx.text(
        (w // 2, int(h * 0.74)),
        "Drag Kingfisher to Applications",
        font=action_font,
        fill=FG,
        anchor="ma",
    )
    return im


def main() -> int:
    if not PROJECT_ICON.exists():
        print(
            f"Kingfisher project icon not found at {PROJECT_ICON}; the DMG toolchain expects it beside the background.",
            file=sys.stderr,
        )
        return 1
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    for name, w, h in SIZES:
        out = BUILD_DIR / name
        image = draw(w, h)
        image.save(out, "PNG", optimize=True)
        print(f"wrote {out} ({w}x{h})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
