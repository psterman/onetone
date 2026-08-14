#!/usr/bin/env python3
"""
One-shot icon organizer for voice-pilot.
Generates placeholder SVG + PNG for missing agents and LLM providers.

Source of truth: src/icons/app-target/ for agents, src/icons/provider/ for providers.

NOTE: these are PLACEHOLDER icons (colored square + initials).
Replace with official brand assets when shipping.
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = r"C:\Users\Administrator\Desktop\voice-pilot"
APP_DIR = os.path.join(ROOT, r"src\icons\app-target")
PROV_DIR = os.path.join(ROOT, r"src\icons\provider")

# (filename_stem, initials, hex_color, human_label, is_provider)
ICONS = [
    # ===== AGENTS (SoftPad status lights) =====
    # P0
    ("gemini",            "G",  "#4285F4", "Gemini CLI",         False),
    ("copilot",           "Cp", "#1F6FEB", "GitHub Copilot CLI", False),  # replace existing generic
    # P1
    ("aider",             "Ai", "#FF6B35", "Aider",              False),
    ("opencode",          "OC", "#0F172A", "OpenCode",           False),
    ("tongyi-lingma",     "TL", "#FF6A00", "Tongyi Lingma",      False),
    ("codegeex",          "Cg", "#3F6EE3", "CodeGeeX",           False),
    # P2
    ("chatgpt",           "CG", "#10A37F", "ChatGPT Desktop",    False),
    ("ms-copilot",        "MC", "#0078D4", "MS Copilot (Win11)", False),
    ("devin",             "De", "#F55036", "Devin",              False),
    ("manus",             "Mn", "#7B2CBF", "Manus",              False),
    ("cherry-studio",     "CS", "#FF6B9D", "Cherry Studio",      False),
    ("lobe-chat",         "LC", "#4CAF50", "LobeChat",           False),
    ("cline",             "Cl", "#FF6B35", "Cline",              False),
    ("roo",               "Ro", "#E74C3C", "Roo Code",           False),
    ("windsurf",          "Ws", "#16A085", "Windsurf",           False),
    ("continue-dev",      "Co", "#007ACC", "Continue.dev",       False),
    ("perplexity",        "Px", "#20808D", "Perplexity",         False),

    # ===== PROVIDERS (quota viewing) =====
    # P0
    ("openrouter",        "OR", "#FF4D4D", "OpenRouter",         True),
    ("moonshot",          "MS", "#1F1F1F", "Moonshot (Kimi)",    True),
    ("kimi",              "Ki", "#1F1F1F", "Kimi",               True),  # alias
    ("siliconflow",       "SF", "#1E88E5", "SiliconFlow",        True),
    # P1
    ("anthropic",         "An", "#D97757", "Anthropic",          True),
    ("openai",            "OA", "#10A37F", "OpenAI",             True),
    ("qwen",              "Qw", "#FF6A00", "Qwen (DashScope)",   True),
    ("zhipu",             "Zh", "#3F6EE3", "Zhipu (GLM)",        True),
    # P2
    ("replicate",         "Re", "#7B2CBF", "Replicate",          True),
    ("elevenlabs",        "EL", "#0F172A", "ElevenLabs",         True),
    ("mistral",           "Mi", "#FF7000", "Mistral",            True),
    ("groq",              "Gr", "#F55036", "Groq",               True),
    ("together",          "To", "#FF5722", "Together.ai",        True),
    ("fireworks",         "Fw", "#FF6F61", "Fireworks.ai",       True),
    ("cohere",            "Co", "#39594D", "Cohere",             True),
    ("stability",         "St", "#A855F7", "Stability AI",       True),
    ("runway",            "Rw", "#0F172A", "Runway",             True),
    ("hailuo",            "Hl", "#5B47E0", "Hailuo (MiniMax)",   True),
    ("kling",             "Kl", "#FF6F00", "Kling (Kuaishou)",   True),
    ("jimeng",            "Jm", "#3B82F6", "Jimeng (ByteDance)", True),
]

# PNG rendering — square 64x64 by default; runtime reads whatever is on disk
PNG_SIZE = 64
SVG_SIZE = 32  # viewBox

def make_svg(stem, initials, color, label):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SVG_SIZE} {SVG_SIZE}" fill="none" role="img" aria-label="{label}">
  <title>{label}</title>
  <rect width="{SVG_SIZE}" height="{SVG_SIZE}" rx="8" fill="{color}"/>
  <text x="{SVG_SIZE/2}" y="{SVG_SIZE/2 + 5}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="{14 if len(initials) <= 1 else 11}" font-weight="700" fill="#fff" text-anchor="middle">{initials}</text>
</svg>
'''

def make_png(stem, initials, color, size=PNG_SIZE):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Rounded square
    r = size // 4
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=color)
    # Text
    font_size = int(size * 0.45) if len(initials) == 1 else int(size * 0.36)
    try:
        font = ImageFont.truetype("seguisb.ttf", font_size)
    except OSError:
        try:
            font = ImageFont.truetype("segoeui.ttf", font_size)
        except OSError:
            font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), initials, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        ((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1] - 2),
        initials, fill=(255, 255, 255, 255), font=font
    )
    return img

def main():
    os.makedirs(APP_DIR, exist_ok=True)
    os.makedirs(PROV_DIR, exist_ok=True)
    summary = {"created_svg": [], "created_png": [], "skipped": []}
    for stem, initials, color, label, is_provider in ICONS:
        out_dir = PROV_DIR if is_provider else APP_DIR
        svg_path = os.path.join(out_dir, f"{stem}.svg")
        png_path = os.path.join(out_dir, f"{stem}.png")
        # SVG: always write (small, scales)
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(make_svg(stem, initials, color, label))
        summary["created_svg"].append(svg_path)
        # PNG: only if missing (don't overwrite existing real brand assets)
        if os.path.exists(png_path):
            summary["skipped"].append(png_path)
        else:
            try:
                make_png(stem, initials, color).save(png_path)
                summary["created_png"].append(png_path)
            except Exception as e:
                print(f"PNG failed: {png_path}: {e}")
    print("=== Icon organizer ===")
    print(f"SVG written: {len(summary['created_svg'])}")
    print(f"PNG created: {len(summary['created_png'])}")
    print(f"PNG kept (real brand asset exists): {len(summary['skipped'])}")
    for p in summary['skipped']:
        print(f"  kept: {os.path.relpath(p, ROOT)}")

if __name__ == "__main__":
    main()
