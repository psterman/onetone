"""Thin wrapper: rebuild UI/tray then taskbar ico via the canonical pipeline."""
from __future__ import annotations

import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

if __name__ == "__main__":
    runpy.run_path(str(ROOT / "scripts" / "build_onetone_theme_icons.py"), run_name="__main__")
    runpy.run_path(str(ROOT / "scripts" / "generate_onetone_icon.py"), run_name="__main__")
