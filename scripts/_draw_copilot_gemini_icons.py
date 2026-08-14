#!/usr/bin/env python3
"""Replace Copilot / Gemini letter placeholders with simple brand-like marks."""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "src" / "icons" / "app-target"
SIZE = 64


def rounded(size, radius, fill):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=fill)
    return im


def star4(cx, cy, outer, inner):
    pts = []
    for i in range(8):
        r = outer if i % 2 == 0 else inner
        a = math.radians(-90 + i * 45)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def gemini_png():
    im = rounded(SIZE, 14, (66, 133, 244, 255))
    d = ImageDraw.Draw(im)
    d.polygon(star4(32, 32, 22, 7.5), fill=(255, 255, 255, 255))
    return im


def copilot_png():
    im = rounded(SIZE, 14, (13, 17, 23, 255))
    d = ImageDraw.Draw(im)
    # helmet / visor copilot mark
    d.ellipse([16, 18, 48, 52], fill=(255, 255, 255, 255))
    d.ellipse([12, 14, 26, 28], fill=(255, 255, 255, 255))
    d.ellipse([38, 14, 52, 28], fill=(255, 255, 255, 255))
    d.rounded_rectangle([20, 30, 44, 40], radius=4, fill=(13, 17, 23, 255))
    return im


def gemini_svg():
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" role="img" aria-label="Gemini CLI">
  <title>Gemini CLI</title>
  <rect width="32" height="32" rx="8" fill="#4285F4"/>
  <path fill="#fff" d="M16 4.5l2.2 8.3L26.5 16l-8.3 3.2L16 27.5l-2.2-8.3L5.5 16l8.3-3.2z"/>
</svg>
"""


def copilot_svg():
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" role="img" aria-label="GitHub Copilot CLI">
  <title>GitHub Copilot CLI</title>
  <rect width="32" height="32" rx="8" fill="#0D1117"/>
  <ellipse cx="16" cy="17.5" rx="8" ry="8.5" fill="#fff"/>
  <ellipse cx="9.5" cy="10.5" rx="3.5" ry="3.5" fill="#fff"/>
  <ellipse cx="22.5" cy="10.5" rx="3.5" ry="3.5" fill="#fff"/>
  <rect x="10" y="15" width="12" height="5" rx="2.5" fill="#0D1117"/>
</svg>
"""


def main():
    gemini_png().save(APP / "gemini.png")
    copilot_png().save(APP / "copilot.png")
    (APP / "gemini.svg").write_text(gemini_svg(), encoding="utf-8")
    (APP / "copilot.svg").write_text(copilot_svg(), encoding="utf-8")
    print("wrote gemini + copilot png/svg")


if __name__ == "__main__":
    main()
