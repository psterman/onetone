"""Generate onetone Windows icons from raster masters (squircle mask only)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE_APP = ROOT / "assets" / "icons" / "onetone-icon-ui-primary-1024.png"
SOURCE_SMALL = ROOT / "assets" / "icons" / "onetone-logo.png"
OUT_MASTER = ROOT / "assets" / "icons" / "onetone-icon-refined-1024.png"
ICONS_DIR = ROOT / "src-tauri" / "icons"
WEB_ICON = ROOT / "src" / "icon.png"

SIZE = 1024
# Match the baked squircle in the 1024 master artwork.
SQUIRCLE_INSET = 0
SQUIRCLE_RADIUS = 208

TRAY_SIZES = (16, 24, 32, 48)
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)

BUNDLE_FILES = {
    "32x32.png": 32,
    "64x64.png": 64,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 256,
}


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


def squircle_mask(size: int, inset: int, radius: int) -> Image.Image:
    w = h = size
    mask = Image.new("L", (size, size), 0)
    px = mask.load()
    for y in range(h):
        for x in range(w):
            if inside_rounded_rect(x - inset, y - inset, w - inset * 2, h - inset * 2, radius):
                px[x, y] = 255
    return mask


def apply_squircle_transparency(img: Image.Image) -> Image.Image:
    """Only corner pixels outside the squircle become transparent; never flood-fill the artwork."""
    size = img.size[0]
    scale = size / SIZE
    inset = max(0, int(round(SQUIRCLE_INSET * scale)))
    radius = max(1, int(round(SQUIRCLE_RADIUS * scale)))
    rgba = img.convert("RGBA")
    mask = squircle_mask(size, inset, radius)
    rgba.putalpha(mask)
    return rgba


def enhance_master(img: Image.Image) -> Image.Image:
    return img.filter(ImageFilter.UnsharpMask(radius=1.0, percent=118, threshold=3))


def load_master() -> Image.Image:
    src = SOURCE_APP if SOURCE_APP.exists() else SOURCE_SMALL
    if not src.exists():
        raise FileNotFoundError(f"missing logo source: {SOURCE_APP}")
    master = Image.open(src).convert("RGBA")
    if master.size != (SIZE, SIZE):
        master = master.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    master = enhance_master(master)
    return apply_squircle_transparency(master)


def resize_variant(img: Image.Image, size: int, sharpen: bool = False) -> Image.Image:
    out = img.resize((size, size), Image.Resampling.LANCZOS)
    if sharpen and size <= 48:
        out = out.filter(ImageFilter.UnsharpMask(radius=0.9, percent=150, threshold=2))
    return apply_squircle_transparency(out)


def write_png(path: Path, img: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"Wrote {path}")


def generate_tray_icons(master: Image.Image) -> None:
    for size in TRAY_SIZES:
        write_png(ICONS_DIR / f"tray-{size}.png", resize_variant(master, size, sharpen=True))


def generate_bundle_pngs(master: Image.Image) -> None:
    for name, size in BUNDLE_FILES.items():
        write_png(ICONS_DIR / name, resize_variant(master, size, sharpen=size <= 32))
    write_png(WEB_ICON, resize_variant(master, 256))


def generate_ico(master: Image.Image) -> None:
    frames = [resize_variant(master, size, sharpen=size <= 32) for size in ICO_SIZES]
    out = ICONS_DIR / "icon.ico"
    frames[0].save(
        out,
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=frames[1:],
    )
    print(f"Wrote {out} ({', '.join(str(s) for s in ICO_SIZES)})")


def generate() -> None:
    master = load_master()
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    generate_tray_icons(master)
    generate_bundle_pngs(master)
    generate_ico(master)
    write_png(OUT_MASTER, master)


if __name__ == "__main__":
    generate()
