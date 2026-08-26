"""Build OneTone icons from mic+wing art: strip plate, transparent canvas, max fill."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SRC_MASTER = ROOT / "assets" / "icons" / "onetone-logo-candidate-b.png"
SRC_LIGHT = ROOT / "assets" / "icons" / "onetone-logo-source-light.png"
SRC_DARK = ROOT / "assets" / "icons" / "onetone-logo-source-dark.png"
OUT_LIGHT = ROOT / "assets" / "icons" / "onetone-icon-ui-light-1024.png"
OUT_DARK = ROOT / "assets" / "icons" / "onetone-icon-ui-primary-1024.png"
OUT_LIGHT_WEB = ROOT / "src" / "icon-light.png"
OUT_DARK_WEB = ROOT / "src" / "icon-dark.png"
ICONS_DIR = ROOT / "src-tauri" / "icons"
SIZE = 1024
FILL_RATIO = 0.98
EDGE_INSET = 0.008
SQUIRCLE_RADIUS = 208
# Near-white plate threshold for edge flood (keeps interior white T).
BG_MIN = 242
BG_TOL = 20


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


def is_plate(p: tuple[int, int, int, int]) -> bool:
    r, g, b, a = p
    if a < 8:
        return True
    mx = max(r, g, b)
    mn = min(r, g, b)
    # Near-white plate
    if mx >= BG_MIN and (mx - mn) <= BG_TOL:
        return True
    # Near-black plate
    if mx < 28 and (mx - mn) < 18:
        return True
    # Dark navy squircle (mic+wing app icon background)
    if mx < 100 and b >= r and b >= g and (mx - mn) < 55:
        return True
    return False


def flood_clear_plate(img: Image.Image) -> Image.Image:
    """Clear background plate from edges; keep interior white/blue glyph."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    seen = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def seed(x: int, y: int) -> None:
        if seen[y][x] or not is_plate(px[x, y]):
            return
        seen[y][x] = True
        q.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= w or ny >= h or seen[ny][nx]:
                continue
            if is_plate(px[nx, ny]):
                seen[ny][nx] = True
                q.append((nx, ny))
    return rgba


def glyph_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    x0, y0, x1, y1 = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            if px[x, y][3] < 12:
                continue
            found = True
            x0 = min(x0, x)
            y0 = min(y0, y)
            x1 = max(x1, x + 1)
            y1 = max(y1, y + 1)
    if not found:
        return 0, 0, w, h
    return x0, y0, x1, y1


def fit_glyph(
    glyph_src: Image.Image,
    fill_ratio: float = FILL_RATIO,
    edge_inset: float = EDGE_INSET,
    cover: bool = False,
    apply_squircle: bool = True,
) -> Image.Image:
    x0, y0, x1, y1 = glyph_bbox(glyph_src)
    crop = glyph_src.crop((x0, y0, x1, y1))

    target = int(round(SIZE * fill_ratio * (1.0 - edge_inset * 2)))
    if cover:
        scale = max(target / max(1, crop.width), target / max(1, crop.height))
    else:
        scale = target / max(crop.size)
    nw = max(1, int(round(crop.width * scale)))
    nh = max(1, int(round(crop.height * scale)))
    glyph = crop.resize((nw, nh), Image.Resampling.LANCZOS)

    square = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ox = (SIZE - nw) // 2
    oy = (SIZE - nh) // 2
    square.paste(glyph, (ox, oy), glyph)
    square = square.filter(ImageFilter.UnsharpMask(radius=0.8, percent=125, threshold=2))
    if apply_squircle:
        mask = squircle_mask(SIZE, SQUIRCLE_RADIUS)
        square.putalpha(ImageChops.multiply(square.getchannel("A"), mask))
    return square


def write(path: Path, img: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"Wrote {path}")


def derive_tray_variants(tray32: Image.Image) -> None:
    muted = ImageEnhance.Color(tray32.convert("RGBA")).enhance(0.15)
    muted = ImageEnhance.Brightness(muted).enhance(0.72)
    write(ICONS_DIR / "tray-32-muted.png", muted)

    gray = ImageOps.grayscale(tray32.convert("RGB")).convert("RGBA")
    gray.putalpha(tray32.getchannel("A"))
    gray = ImageEnhance.Brightness(gray).enhance(0.85)
    write(ICONS_DIR / "tray-32-missing.png", gray)


TRAY_BG = (3, 14, 42, 255)  # match tray_icon_render::THEME_BG


def extract_white_glyph(img: Image.Image) -> Image.Image:
    """Keep near-white logo strokes; drop navy plate."""
    rgba = img.convert("RGBA")
    px = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            if min(r, g, b) > 170:
                px[x, y] = (255, 255, 255, a)
            else:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def build_tray_icon(glyph_src: Image.Image, size: int) -> Image.Image:
    """Solid tray/taskbar tile: white glyph on navy with readable padding."""
    glyph = extract_white_glyph(glyph_src)
    x0, y0, x1, y1 = glyph_bbox(glyph)
    crop = glyph.crop((x0, y0, x1, y1))
    # ~12–14% margin each side; 16px keeps a touch fuller so strokes survive.
    fill = 0.76 if size <= 16 else 0.72
    target = int(round(size * fill))
    # contain (min) — never clip feathers / mic stem
    scale = min(target / max(1, crop.width), target / max(1, crop.height))
    nw = max(1, int(round(crop.width * scale)))
    nh = max(1, int(round(crop.height * scale)))
    scaled = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (size, size), TRAY_BG)
    ox = (size - nw) // 2
    oy = (size - nh) // 2
    out.paste(scaled, (ox, oy), scaled)
    if size <= 48:
        out = out.filter(ImageFilter.UnsharpMask(radius=0.9, percent=180, threshold=1))
    return out


def build_app_web_icon(master: Image.Image, size: int = 256) -> Image.Image:
    """In-app chrome: same padded solid tile as tray (readable on light UI)."""
    return build_tray_icon(master, size)


def main() -> None:
    if not SRC_MASTER.exists():
        raise FileNotFoundError(f"missing {SRC_MASTER}")

    master = Image.open(SRC_MASTER).convert("RGBA")
    write(SRC_LIGHT, master.copy())
    write(SRC_DARK, master.copy())

    cleared = flood_clear_plate(master.copy())
    write(SRC_LIGHT, cleared)
    write(SRC_DARK, cleared)

    write(OUT_LIGHT, master)
    write(OUT_DARK, master)

    web = build_app_web_icon(master)
    write(OUT_LIGHT_WEB, web)
    write(OUT_DARK_WEB, web)
    write(ROOT / "src" / "icon.png", web)

    for size, name in ((16, "tray-16.png"), (24, "tray-24.png"), (32, "tray-32.png"), (48, "tray-48.png")):
        write(ICONS_DIR / name, build_tray_icon(master, size))
    derive_tray_variants(Image.open(ICONS_DIR / "tray-32.png").convert("RGBA"))

    print("Next: python scripts/generate_onetone_icon.py  (exe/taskbar ico)")
    print("Then rebuild the app — tray icons are include_bytes! at compile time.")


if __name__ == "__main__":
    main()
