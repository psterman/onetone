"""Build light/dark OneTone squircle UI icons from Tornado-T source art.

Taskbar/tray: crop to the *bright glyph* (not the dark plate), then scale up so
the mark fills most of the tile — otherwise it looks tiny next to other apps.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SRC_LIGHT = ROOT / "assets" / "icons" / "onetone-logo-source-light.png"
SRC_DARK = ROOT / "assets" / "icons" / "onetone-logo-source-dark.png"
OUT_LIGHT = ROOT / "assets" / "icons" / "onetone-icon-ui-light-1024.png"
OUT_DARK = ROOT / "assets" / "icons" / "onetone-icon-ui-primary-1024.png"
OUT_LIGHT_WEB = ROOT / "src" / "icon-light.png"
OUT_DARK_WEB = ROOT / "src" / "icon-dark.png"
ICONS_DIR = ROOT / "src-tauri" / "icons"
SIZE = 1024
# Glyph target size inside the tile (after tight crop). Higher = larger on taskbar.
FILL_RATIO = 0.96
# Tiny edge inset so squircle corners don't clip the funnel tip hard.
EDGE_INSET = 0.015
SQUIRCLE_RADIUS = 208
# Plate behind glyph — lifted from pure black so the tile still reads on dark taskbars.
DARK_PLATE = (12, 22, 42, 255)
LIGHT_PLATE = (255, 255, 255, 255)


def inside_rounded_rect(x: int, y: int, w: int, h: int, r: float) -> bool:
    if x < 0 or y < 0 or x >= w or y >= h:
        return False
    r = min(r, w / 2, h / 2)
    if x < r and y < r:
        return (x - r) ** 2 + (y - r) ** 2 <= r * r
    if x >= w - r and y < r:
        return (x - (w - r)) ** 2 + (y - r) ** 2 <= r * r
    if x < r and y >= h - r:
        return (x - r) ** 2 + (y - (h - r)) ** 2 <= r * r
    if x >= w - r and y >= h - r:
        return (x - (w - r)) ** 2 + (y - (h - r)) ** 2 <= r * r
    return True


def squircle_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    px = mask.load()
    for y in range(size):
        for x in range(size):
            if inside_rounded_rect(x, y, size, size, radius):
                px[x, y] = 255
    return mask


def glyph_bbox(img: Image.Image, bg: str) -> tuple[int, int, int, int]:
    """BBox of the logo mark only — ignore flat plate pixels."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    x0, y0, x1, y1 = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = mx - mn
            if bg == "light":
                # Keep blue/ink marks; drop near-white plate.
                keep = (mx < 245 and sat > 12) or (sat > 28 and mx < 252)
            else:
                # Keep white T + blue glow; drop near-black plate.
                keep = (mx > 48 and sat > 18) or mx > 170
            if not keep:
                continue
            found = True
            x0 = min(x0, x)
            y0 = min(y0, y)
            x1 = max(x1, x + 1)
            y1 = max(y1, y + 1)
    if not found:
        return 0, 0, w, h
    return x0, y0, x1, y1


def fit_on_canvas(src: Path, bg: str, fill_ratio: float = FILL_RATIO) -> Image.Image:
    img = Image.open(src).convert("RGBA")
    x0, y0, x1, y1 = glyph_bbox(img, bg)
    crop = img.crop((x0, y0, x1, y1))

    # Scale glyph so its longer side fills FILL_RATIO of the tile.
    target = int(round(SIZE * fill_ratio * (1.0 - EDGE_INSET * 2)))
    scale = target / max(crop.size)
    nw = max(1, int(round(crop.width * scale)))
    nh = max(1, int(round(crop.height * scale)))
    glyph = crop.resize((nw, nh), Image.Resampling.LANCZOS)

    fill = LIGHT_PLATE if bg == "light" else DARK_PLATE
    square = Image.new("RGBA", (SIZE, SIZE), fill)
    ox = (SIZE - nw) // 2
    oy = (SIZE - nh) // 2
    square.paste(glyph, (ox, oy), glyph)
    square = square.filter(ImageFilter.UnsharpMask(radius=0.8, percent=125, threshold=2))
    mask = squircle_mask(SIZE, SQUIRCLE_RADIUS)
    square.putalpha(mask)
    return square


def write(path: Path, img: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"Wrote {path}")


def derive_tray_variants(tray32: Image.Image) -> None:
    """Muted / missing tray states from the ready icon (keep same visual weight)."""
    muted = ImageEnhance.Color(tray32.convert("RGBA")).enhance(0.15)
    muted = ImageEnhance.Brightness(muted).enhance(0.72)
    write(ICONS_DIR / "tray-32-muted.png", muted)

    gray = ImageOps.grayscale(tray32.convert("RGB")).convert("RGBA")
    # Rebuild alpha from source so squircle stays.
    gray.putalpha(tray32.getchannel("A"))
    gray = ImageEnhance.Brightness(gray).enhance(0.85)
    write(ICONS_DIR / "tray-32-missing.png", gray)


def main() -> None:
    if not SRC_LIGHT.exists() or not SRC_DARK.exists():
        raise FileNotFoundError("missing onetone-logo-source-light/dark.png")
    light = fit_on_canvas(SRC_LIGHT, "light")
    dark = fit_on_canvas(SRC_DARK, "dark")
    write(OUT_LIGHT, light)
    write(OUT_DARK, dark)
    write(OUT_LIGHT_WEB, light.resize((256, 256), Image.Resampling.LANCZOS))
    write(OUT_DARK_WEB, dark.resize((256, 256), Image.Resampling.LANCZOS))
    write(ROOT / "src" / "icon.png", dark.resize((256, 256), Image.Resampling.LANCZOS))

    # Tray-ready at 32: max fill + sharpen for tiny sizes.
    tray_master = fit_on_canvas(SRC_DARK, "dark", fill_ratio=0.98)
    tray32 = tray_master.resize((32, 32), Image.Resampling.LANCZOS)
    tray32 = tray32.filter(ImageFilter.UnsharpMask(radius=1.0, percent=180, threshold=1))
    write(ICONS_DIR / "tray-32.png", tray32)
    derive_tray_variants(tray32)

    print("Next: python scripts/generate_onetone_icon.py  (exe/taskbar ico)")
    print("Then rebuild the app — tray icons are include_bytes! at compile time.")


if __name__ == "__main__":
    main()
