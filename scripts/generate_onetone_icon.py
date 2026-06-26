"""Generate OneTone icon: reference squircle style, full-bleed (no white margin)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_REF = ROOT / "assets" / "icons" / "onetone-icon-ui-primary-1024.png"
OUT_MASTER = ROOT / "assets" / "icons" / "onetone-icon-refined-1024.png"

SIZE = 1024
# 圆角外透明区压到与底部渐变一致，避免导出成白底
C_BOT = (0x07, 0x8F, 0xBC)


def _content_bbox(rgba: np.ndarray) -> tuple[int, int, int, int]:
    """非浅色画布区域（蓝色 squircle）的包围盒。"""
    light = (rgba[..., 0] > 220) & (rgba[..., 1] > 235) & (rgba[..., 2] > 240)
    fg = (~light) & (rgba[..., 3] > 128)
    ys, xs = np.where(fg)
    if len(xs) == 0:
        raise RuntimeError("reference icon has no foreground pixels")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def crop_reference_full_bleed(src: Image.Image, size: int) -> Image.Image:
    """把参考图里的蓝色圆角方块裁出并铺满输出画布。"""
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
    """透明像素用底色填充，杜绝白边。"""
    base = Image.new("RGB", img.size, backdrop)
    base.paste(img, mask=img.split()[3])
    return base


def generate() -> Path:
    if not SOURCE_REF.exists():
        raise FileNotFoundError(f"missing reference: {SOURCE_REF}")

    src = Image.open(SOURCE_REF)
    full_bleed = crop_reference_full_bleed(src, SIZE)
    final = flatten_opaque(full_bleed, C_BOT)

    OUT_MASTER.parent.mkdir(parents=True, exist_ok=True)
    final.save(OUT_MASTER, "PNG")
    print(f"Wrote {OUT_MASTER}")
    return OUT_MASTER


if __name__ == "__main__":
    generate()
