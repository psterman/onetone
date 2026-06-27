"""Generate onetone Windows icons: rich app assets + flat small/tray variants."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE_APP = ROOT / "assets" / "icons" / "onetone-icon-ui-primary-1024.png"
SOURCE_SMALL = ROOT / "assets" / "icons" / "onetone-logo.png"
OUT_MASTER = ROOT / "assets" / "icons" / "onetone-icon-refined-1024.png"
ICONS_DIR = ROOT / "src-tauri" / "icons"
WEB_ICON = ROOT / "src" / "icon.png"

SIZE = 1024
C_BOT = (0x07, 0x8F, 0xBC)

# Flat logo for tray + small bundle sizes (readable at 16px).
TRAY_SIZES = (16, 24, 32, 48)
SMALL_APP_SIZES = (16, 24, 32, 48, 64)
LARGE_APP_SIZES = (128, 256, 512, 1024)
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)

BUNDLE_FILES = {
    "32x32.png": 32,
    "64x64.png": 64,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 256,
}


def _content_bbox(rgba: np.ndarray) -> tuple[int, int, int, int]:
    light = (rgba[..., 0] > 220) & (rgba[..., 1] > 235) & (rgba[..., 2] > 240)
    fg = (~light) & (rgba[..., 3] > 128)
    ys, xs = np.where(fg)
    if len(xs) == 0:
        raise RuntimeError("reference icon has no foreground pixels")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def crop_reference_full_bleed(src: Image.Image, size: int) -> Image.Image:
    rgba = np.array(src.convert("RGBA"))
    x0, y0, x1, y1 = _content_bbox(rgba)
    crop = src.crop((x0, y0, x1, y1)).convert("RGBA")

    side = max(crop.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - crop.width) // 2
    oy = (side - crop.height) // 2
    square.paste(crop, (ox, oy), crop)
    return square.resize((size, size), Image.Resampling.LANCZOS)


def flatten_opaque(img: Image.Image, backdrop: tuple[int, int, int]) -> Image.Image:
    base = Image.new("RGB", img.size, backdrop)
    base.paste(img, mask=img.split()[3])
    return base


def resize_variant(img: Image.Image, size: int, sharpen: bool = False) -> Image.Image:
  out = img.resize((size, size), Image.Resampling.LANCZOS)
  if sharpen and size <= 32:
      out = out.filter(ImageFilter.UnsharpMask(radius=0.8, percent=140, threshold=2))
  return out.convert("RGBA")


def load_sources() -> tuple[Image.Image, Image.Image]:
    if not SOURCE_APP.exists():
        raise FileNotFoundError(f"missing app source: {SOURCE_APP}")
    if not SOURCE_SMALL.exists():
        raise FileNotFoundError(f"missing small/tray source: {SOURCE_SMALL}")

    app_master = crop_reference_full_bleed(Image.open(SOURCE_APP), SIZE)
    small_master = Image.open(SOURCE_SMALL).convert("RGBA")
    if small_master.size != (SIZE, SIZE):
        small_master = small_master.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    return app_master, small_master


def pick_master(size: int, app_master: Image.Image, small_master: Image.Image) -> Image.Image:
    return small_master if size <= 64 else app_master


def write_png(path: Path, img: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"Wrote {path}")


def generate_tray_icons(small_master: Image.Image) -> None:
    for size in TRAY_SIZES:
        icon = resize_variant(small_master, size, sharpen=True)
        write_png(ICONS_DIR / f"tray-{size}.png", icon)


def generate_bundle_pngs(app_master: Image.Image, small_master: Image.Image) -> None:
    for name, size in BUNDLE_FILES.items():
        master = pick_master(size, app_master, small_master)
        icon = resize_variant(master, size, sharpen=size <= 32)
        write_png(ICONS_DIR / name, icon)
    write_png(WEB_ICON, resize_variant(app_master, 256))


def generate_ico(app_master: Image.Image, small_master: Image.Image) -> None:
    frames: list[Image.Image] = []
    for size in ICO_SIZES:
        master = pick_master(size, app_master, small_master)
        frames.append(resize_variant(master, size, sharpen=size <= 32))

    out = ICONS_DIR / "icon.ico"
    frames[0].save(
        out,
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=frames[1:],
    )
    print(f"Wrote {out} ({', '.join(str(s) for s in ICO_SIZES)})")


def generate_master_preview(app_master: Image.Image) -> None:
    final = flatten_opaque(app_master, C_BOT)
    OUT_MASTER.parent.mkdir(parents=True, exist_ok=True)
    final.save(OUT_MASTER, "PNG")
    print(f"Wrote {OUT_MASTER}")


def generate() -> None:
    app_master, small_master = load_sources()
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    generate_tray_icons(small_master)
    generate_bundle_pngs(app_master, small_master)
    generate_ico(app_master, small_master)
    generate_master_preview(app_master)


if __name__ == "__main__":
    generate()
