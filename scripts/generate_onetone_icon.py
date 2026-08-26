"""Generate onetone Windows icons from raster masters (squircle mask only)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
# Primary 1024×1024 master (mic + wing squircle on dark background).
SOURCE_APP = ROOT / "assets" / "icons" / "onetone-logo-candidate-b.png"
SOURCE_SMALL = ROOT / "assets" / "icons" / "onetone-logo.png"
WINDOWS_EXPORT = ROOT / "assets" / "icons" / "windows-export"
OUT_MASTER = ROOT / "assets" / "icons" / "onetone-icon-refined-1024.png"
ICONS_DIR = ROOT / "src-tauri" / "icons"
WEB_ICON = ROOT / "src" / "icon.png"

SIZE = 1024
# Match the baked squircle in the 1024 master artwork.
SQUIRCLE_INSET = 0
SQUIRCLE_RADIUS = 208

TRAY_SIZES = (16, 24, 32, 48)
# Windows taskbar / exe icon sizes (each embedded natively — no upscaling blur).
ICO_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)

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
    """Corner pixels outside the squircle become transparent; preserve glyph alpha."""
    from PIL import ImageChops

    size = img.size[0]
    scale = size / SIZE
    inset = max(0, int(round(SQUIRCLE_INSET * scale)))
    radius = max(1, int(round(SQUIRCLE_RADIUS * scale)))
    rgba = img.convert("RGBA")
    mask = squircle_mask(size, inset, radius)
    rgba.putalpha(ImageChops.multiply(rgba.getchannel("A"), mask))
    return rgba


def enhance_master(img: Image.Image) -> Image.Image:
    return img.filter(ImageFilter.UnsharpMask(radius=1.0, percent=118, threshold=3))


def load_master_raw() -> Image.Image:
    src = SOURCE_APP if SOURCE_APP.exists() else SOURCE_SMALL
    if not src.exists():
        raise FileNotFoundError(f"missing logo source: {SOURCE_APP}")
    master = Image.open(src).convert("RGBA")
    if master.size != (SIZE, SIZE):
        master = master.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    return master


def load_tray_builder():
    import importlib.util

    path = ROOT / "scripts" / "build_onetone_theme_icons.py"
    spec = importlib.util.spec_from_file_location("boti", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.build_tray_icon


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


def generate_bundle_pngs(master: Image.Image, master_raw: Image.Image, build_tray) -> None:
    taskbar_sizes = {"32x32.png": 32, "icon.png": 256}
    squircle_sizes = {"64x64.png": 64, "128x128.png": 128, "128x128@2x.png": 256}
    for name, size in taskbar_sizes.items():
        write_png(ICONS_DIR / name, build_tray(master_raw, size))
    for name, size in squircle_sizes.items():
        write_png(ICONS_DIR / name, resize_variant(master, size, sharpen=size <= 32))
    write_png(WEB_ICON, resize_variant(master, 256))


def _ico_png_payload(img: Image.Image) -> bytes:
    """Single PNG frame payload as stored inside a Vista+ .ico file (preserves alpha)."""
    import io

    buf = io.BytesIO()
    img.convert("RGBA").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def write_ico_png(path: Path, frames: list[Image.Image]) -> None:
    """Pack PNG frames so Windows taskbar keeps real transparency (BMP ICO paints alpha as black)."""
    import struct

    payloads = [_ico_png_payload(frame) for frame in frames]
    count = len(payloads)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    entries = bytearray()
    blobs = bytearray()
    for frame, payload in zip(frames, payloads):
        size = frame.size[0]
        w = size if size < 256 else 0
        h = size if size < 256 else 0
        # PNG entries: color count 0, planes 1, bitcount 32 (common Vista+ convention)
        entries.extend(
            struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(payload), offset)
        )
        blobs.extend(payload)
        offset += len(payload)
    path.write_bytes(header + entries + blobs)


def generate_ico(master: Image.Image, master_raw: Image.Image, build_tray) -> None:
    """PNG-in-ICO; small frames use max-fill tray tiles."""
    sizes_asc = tuple(sorted(ICO_SIZES))
    frames = [
        build_tray(master_raw, size) if size <= 48 else resize_variant(master, size, sharpen=False)
        for size in sizes_asc
    ]
    out = ICONS_DIR / "icon.ico"
    write_ico_png(out, frames)
    print(f"Wrote {out} PNG-in-ICO, order: {', '.join(str(s) for s in sizes_asc)}")


def generate_windows_export(master: Image.Image, master_raw: Image.Image, build_tray) -> None:
    import shutil

    WINDOWS_EXPORT.mkdir(parents=True, exist_ok=True)
    write_png(WINDOWS_EXPORT / "icon.png", build_tray(master_raw, 256))
    write_png(WINDOWS_EXPORT / "32x32.png", build_tray(master_raw, 32))
    for name, size in {"64x64.png": 64, "128x128.png": 128, "128x128@2x.png": 256}.items():
        write_png(WINDOWS_EXPORT / name, resize_variant(master, size, sharpen=size <= 32))
    write_png(WINDOWS_EXPORT / "app-1024.png", resize_variant(master, 1024))
    for size in TRAY_SIZES:
        tray_path = ICONS_DIR / f"tray-{size}.png"
        if tray_path.exists():
            import shutil as sh

            sh.copy2(tray_path, WINDOWS_EXPORT / f"tray-{size}.png")
    ico = ICONS_DIR / "icon.ico"
    if ico.exists():
        shutil.copy2(ico, WINDOWS_EXPORT / "icon.ico")


def generate() -> None:
    master_raw = load_master_raw()
    master = enhance_master(master_raw.copy())
    master = apply_squircle_transparency(master)
    build_tray = load_tray_builder()
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    generate_bundle_pngs(master, master_raw, build_tray)
    generate_ico(master, master_raw, build_tray)
    generate_windows_export(master, master_raw, build_tray)
    write_png(OUT_MASTER, master)
    print("Tray ready/muted/missing left to build_onetone_theme_icons.py")


if __name__ == "__main__":
    generate()
