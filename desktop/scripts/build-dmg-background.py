#!/usr/bin/env python3
"""
Build the polished DMG background asset.

Produces two PNGs from the same source so Finder can use the
2x variant on Retina displays and the 1x variant on the rest:

    desktop/build/dmg/background.png      720x460  (1x)
    desktop/build/dmg/background@2x.png  1440x920 (2x)

The design is intentionally restrained:
  - a dark, almost-black background that matches Kingfisher's
    in-application surfaces;
  - the Kingfisher.app icon on the left;
  - the Applications alias on the right;
  - a thin arrow that runs between them at the same vertical
    level as the icons;
  - one short line of text under the icons that names the
    action in the words a Mac user expects.

No fake macOS chrome, no extra panels, no fake buttons, no
"powered by" line. The owner explicitly asked for the install
action to be obvious without instructions; the design has one
job and is judged on whether the drag target is unambiguous.
"""

from __future__ import annotations

import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent
BUILD_DIR = HERE.parent / "build" / "dmg"
PROJECT_ICON = HERE.parent / "build" / "icon.png"

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


def draw_icon(im: Image.Image, icon: Image.Image, x: int, y: int, size: int) -> None:
    """Composite the Kingfisher.app icon at the given position.

    macOS Finder draws its own soft drop shadow behind mounted
    icons, so the DMG background is the *back* of the Finder
    window and should not duplicate the shadow. We draw the icon
    flat.
    """
    icon_resized = icon.resize((size, size), Image.LANCZOS)
    im.paste(icon_resized, (x, y), icon_resized)


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


def draw(w: int, h: int, icon: Image.Image) -> Image.Image:
    im = Image.new("RGBA", (w, h), BG)
    draw_ctx = ImageDraw.Draw(im)
    # 1. A subtle vertical gradient that lifts the top edge enough
    #    to make the title legible without a chrome bar. Single
    #    alpha-blended rectangle, not a stripe.
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    overlay_ctx = ImageDraw.Draw(overlay)
    for y in range(0, h // 3):
        a = int(10 * (1 - y / (h / 3)))
        overlay_ctx.line([(0, y), (w, y)], fill=(244, 244, 246, a))
    im = Image.alpha_composite(im, overlay)
    draw_ctx = ImageDraw.Draw(im)
    # 2. The title.
    title_font = find_font("regular", size=int(h * 0.058))
    draw_ctx.text(
        (w // 2, int(h * 0.10)),
        "KINGFISHER",
        font=title_font,
        fill=FG,
        anchor="ma",
    )
    # 3. The icon row.
    icon_size = int(h * 0.32)
    row_y = int(h * 0.50 - icon_size / 2)
    left_x = int(w * 0.30 - icon_size / 2)
    right_x = int(w * 0.70 - icon_size / 2)
    draw_icon(im, icon, left_x, row_y, icon_size)
    draw_icon(im, icon, right_x, row_y, icon_size)
    # 4. The labels under each icon. macOS's `contents:` config in
    #    electron-builder draws the same strings; the background
    #    still previews the composition so designers can iterate
    #    without running the full toolchain.
    label_font = find_font("regular", size=int(h * 0.04))
    draw_ctx.text(
        (left_x + icon_size // 2, row_y + icon_size + int(h * 0.04)),
        "Kingfisher",
        font=label_font,
        fill=DIM,
        anchor="ma",
    )
    draw_ctx.text(
        (right_x + icon_size // 2, row_y + icon_size + int(h * 0.04)),
        "Applications",
        font=label_font,
        fill=DIM,
        anchor="ma",
    )
    # 5. The arrow.
    arrow_y = row_y + icon_size // 2
    arrow_start_x = left_x + icon_size + int(w * 0.04)
    arrow_end_x = right_x - int(w * 0.02)
    draw_arrow(draw_ctx, arrow_start_x, arrow_end_x, arrow_y, int(h * 0.012))
    # 6. The action text. One line, in the same display weight as
    #    the title but a touch smaller, so the eye reads the icons
    #    first and the text confirms the action.
    action_font = find_font("regular", size=int(h * 0.046))
    draw_ctx.text(
        (w // 2, int(h * 0.82)),
        "Drag Kingfisher to Applications",
        font=action_font,
        fill=FG,
        anchor="ma",
    )
    return im


def main() -> int:
    if not PROJECT_ICON.exists():
        print(
            f"Kingfisher project icon not found at {PROJECT_ICON}. The DMG background needs the app icon as a foreground element.",
            file=sys.stderr,
        )
        return 1
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    icon = Image.open(PROJECT_ICON).convert("RGBA")
    for name, w, h in SIZES:
        out = BUILD_DIR / name
        image = draw(w, h, icon)
        image.save(out, "PNG", optimize=True)
        print(f"wrote {out} ({w}x{h})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
