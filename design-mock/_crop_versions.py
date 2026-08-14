#!/usr/bin/env python3
"""Crop the 3-up concept page into A/B/C individual images."""
from PIL import Image
import os, sys

src = r"C:\Users\Administrator\Desktop\voice-pilot\design-mock\tray-menu-v3-concepts-full.png"
out_dir = r"C:\Users\Administrator\Desktop\voice-pilot\design-mock"

im = Image.open(src)
W, H = im.size
print("Source size:", W, H)

# Padding from the page: header is ~100px, then 3 columns with 24px gap
# Column width = (W - 24*2 - 32*2) / 3  (gap=24, page padding=32)
gap = 24
pad = 32
col_w = (W - pad*2 - gap*2) // 3
header_h = 100  # title + lede

# Each column starts at x = pad + i*(col_w+gap)
labels = ['A', 'B', 'C']
for i, label in enumerate(labels):
    x0 = pad + i*(col_w + gap)
    y0 = header_h
    x1 = x0 + col_w
    y1 = H - 60  # trim bottom padding

    crop = im.crop((x0, y0, x1, y1))
    # Add a small white border for breathing room
    bordered = Image.new('RGB', (crop.size[0]+24, crop.size[1]+24), (245, 247, 250))
    bordered.paste(crop, (12, 12))
    out_path = os.path.join(out_dir, f'tray-menu-v3-{label}.png')
    bordered.save(out_path, optimize=True)
    print(f"Wrote {out_path} -> {bordered.size}")
