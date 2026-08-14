#!/usr/bin/env python3
"""Import official Cline / OpenCode / Aider marks into src/icons/app-target.

Sources (do not use random logo sites):
  Cline     https://github.com/cline/cline/blob/main/apps/vscode/assets/icons/icon.png
  OpenCode  https://opencode.ai/brand  (opencode-logo-dark-square)
  Aider     https://aider.chat/assets/icons/android-chrome-192x192.png
"""
from pathlib import Path
from urllib.request import urlopen, Request

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "src" / "icons" / "app-target"
SIZE = 64
RADIUS = 14
UA = "onetone-icon-import/1"

URLS = {
    "cline.png": "https://raw.githubusercontent.com/cline/cline/main/apps/vscode/assets/icons/icon.png",
    "opencode.png": "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/console/app/src/asset/brand/opencode-logo-dark-square.png",
    "aider.png": "https://aider.chat/assets/icons/android-chrome-192x192.png",
}


def fetch(url):
    with urlopen(Request(url, headers={"User-Agent": UA}), timeout=30) as r:
        return r.read()


def fit_round(im, size=SIZE, radius=RADIUS, under=None):
    im = im.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    if under:
        bg = Image.new("RGBA", (size, size), under)
        bg.alpha_composite(im)
        im = bg
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    a = im.getchannel("A")
    im.putalpha(ImageChops.multiply(a, mask))
    return im


CLINE_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" role="img" aria-label="Cline">
  <title>Cline</title>
  <rect width="32" height="32" rx="8" fill="#1B1F24"/>
  <g fill="#E8EEF2" transform="translate(2.6,1.9) scale(0.292)">
    <path fill-rule="evenodd" d="M65.4492701,16.3 C76.3374701,16.3 85.1635558,25.16479 85.1635558,36.1 L85.1635558,42.7 L90.9027661,54.1647464 C91.4694141,55.2966923 91.4668177,56.6300535 90.8957658,57.7597839 L85.1635558,69.1 L85.1635558,75.7 C85.1635558,86.63554 76.3374701,95.5 65.4492701,95.5 L26.0206986,95.5 C15.1328272,95.5 6.30641291,86.63554 6.30641291,75.7 L6.30641291,69.1 L0.448507752,57.7954874 C-0.14693501,56.6464093 -0.149634367,55.2802504 0.441262896,54.1288283 L6.30641291,42.7 L6.30641291,36.1 C6.30641291,25.16479 15.1328272,16.3 26.0206986,16.3 L65.4492701,16.3 Z M62.9301895,22 L29.189529,22 C19.8723267,22 12.3191987,29.5552188 12.3191987,38.875 L12.3191987,44.5 L7.44288578,53.9634655 C6.84794449,55.1180686 6.85066096,56.4896598 7.45017099,57.6418974 L12.3191987,67 L12.3191987,72.625 C12.3191987,81.9450625 19.8723267,89.5 29.189529,89.5 L62.9301895,89.5 C72.2476729,89.5 79.8005198,81.9450625 79.8005198,72.625 L79.8005198,67 L84.5682187,57.6061395 C85.1432011,56.473244 85.1458141,55.1345713 84.5752587,53.9994398 L79.8005198,44.5 L79.8005198,38.875 C79.8005198,29.5552188 72.2476729,22 62.9301895,22 Z"/>
    <circle cx="45.735" cy="11" r="11"/>
    <rect x="31" y="44.5" width="5" height="22" rx="2.5" fill="#1B1F24"/>
    <rect x="55" y="44.5" width="5" height="22" rx="2.5" fill="#1B1F24"/>
  </g>
</svg>
"""

OPENCODE_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" role="img" aria-label="OpenCode">
  <title>OpenCode</title>
  <rect width="32" height="32" rx="8" fill="#211E1E"/>
  <g transform="translate(3.2,0) scale(0.106667)">
    <path d="M180 240H60V120H180V240Z" fill="#4B4646"/>
    <path fill-rule="evenodd" d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#F1ECEC"/>
  </g>
</svg>
"""

AIDER_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" role="img" aria-label="Aider">
  <title>Aider</title>
  <rect width="32" height="32" rx="8" fill="#041604"/>
  <path fill="#14B014" d="M10 22V14c0-3.2 2.2-5.4 5.4-5.4 2.2 0 3.7.9 4.6 2.3V9.2h2.6V22h-2.6v-1.6c-.9 1.3-2.5 2.2-4.6 2.2-3.2 0-5.4-2.2-5.4-5.4zm2.7 0c0 1.8 1.2 3 3 3s3-1.2 3-3v-3.2c0-1.8-1.2-3-3-3s-3 1.2-3 3z"/>
</svg>
"""


def main():
    import io

    (APP / "cline.svg").write_text(CLINE_SVG, encoding="utf-8")
    (APP / "opencode.svg").write_text(OPENCODE_SVG, encoding="utf-8")
    (APP / "aider.svg").write_text(AIDER_SVG, encoding="utf-8")

    under = {
        "opencode.png": (33, 30, 30, 255),  # official mark is transparent; sit on brand dark
    }
    for name, url in URLS.items():
        raw = fetch(url)
        im = Image.open(io.BytesIO(raw))
        fit_round(im, under=under.get(name)).save(APP / name)
        print("wrote", name, "from", url)

    print("wrote cline + opencode + aider png/svg")


if __name__ == "__main__":
    main()
