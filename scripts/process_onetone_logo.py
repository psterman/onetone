"""Extract transparent logo from a flat app-icon graphic and write master PNG sources."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = ROOT / "assets" / "icons" / "onetone-logo-source.png"
OUT_LOGO = ROOT / "assets" / "icons" / "onetone-logo.png"
OUT_APP = ROOT / "assets" / "icons" / "onetone-icon-ui-primary-1024.png"
SIZE = 1024
PAD = 0.08


def is_bg(r: int, g: int, b: int, a: int) -> bool:
    if a < 8:
        return True
    mx = max(r, g, b)
    mn = min(r, g, b)
    if mx < 28 and (mx - mn) < 18:
        return True
    if mx > 246 and (mx - mn) < 22:
        return True
    if mx > 238 and (mx - mn) < 10:
        return True
    return False


def remove_background(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    visited = bytearray(w * h)

    def idx(x: int, y: int) -> int:
        return y * w + x

    stack: list[tuple[int, int]] = []
    for x in range(w):
        stack.append((x, 0))
        stack.append((x, h - 1))
    for y in range(h):
        stack.append((0, y))
        stack.append((w - 1, y))

    while stack:
        x, y = stack.pop()
        i = idx(x, y)
        if visited[i]:
            continue
        visited[i] = 1
        r, g, b, a = px[x, y]
        if not is_bg(r, g, b, a):
            continue
        px[x, y] = (r, g, b, 0)
        if x > 0:
            stack.append((x - 1, y))
        if x + 1 < w:
            stack.append((x + 1, y))
        if y > 0:
            stack.append((x, y - 1))
        if y + 1 < h:
            stack.append((x, y + 1))

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = mx - mn
            if mx > 225 and sat < 28:
                fade = max(0, min(120, int((255 - mx) * 18)))
                px[x, y] = (r, g, b, min(a, fade))
    return rgba


def content_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    x0, y0, x1, y1 = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 12:
                found = True
                x0 = min(x0, x)
                y0 = min(y0, y)
                x1 = max(x1, x + 1)
                y1 = max(y1, y + 1)
    if not found:
        raise RuntimeError("no foreground pixels after background removal")
    return x0, y0, x1, y1


def crop_to_content(img: Image.Image, pad_ratio: float) -> Image.Image:
    x0, y0, x1, y1 = content_bbox(img)
    crop = img.crop((x0, y0, x1, y1))
    side = max(crop.size)
    pad = int(side * pad_ratio)
    square = Image.new("RGBA", (side + pad * 2, side + pad * 2), (0, 0, 0, 0))
    ox = pad + (side - crop.width) // 2
    oy = pad + (side - crop.height) // 2
    square.paste(crop, (ox, oy), crop)
    return square.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def process(src: Path = DEFAULT_SRC) -> Image.Image:
    if not src.exists():
        raise FileNotFoundError(f"missing logo source: {src}")
    logo = crop_to_content(remove_background(Image.open(src)), PAD)
    return logo.filter(ImageFilter.UnsharpMask(radius=0.6, percent=110, threshold=2))


def write_outputs(logo: Image.Image) -> None:
    for path in (DEFAULT_SRC, OUT_LOGO, OUT_APP):
        path.parent.mkdir(parents=True, exist_ok=True)
        logo.save(path, "PNG")
        print(f"Wrote {path}")


if __name__ == "__main__":
    import sys

    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    write_outputs(process(src))
