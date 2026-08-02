#!/usr/bin/env python3
"""Replace eprintln!/println! with app_log::sync_emergency_line in src-tauri/src."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src-tauri" / "src"


def replace_macros(src: str, name: str) -> str:
    out = []
    i = 0
    needle = name + "!"
    while True:
        j = src.find(needle, i)
        if j < 0:
            out.append(src[i:])
            break
        # Skip if this line is only a comment about eprintln
        line_start = src.rfind("\n", 0, j) + 1
        line_prefix = src[line_start:j].lstrip()
        if line_prefix.startswith("//") or line_prefix.startswith("*") or line_prefix.startswith("///"):
            out.append(src[i : j + len(needle)])
            i = j + len(needle)
            continue
        out.append(src[i:j])
        k = j + len(needle)
        if k >= len(src) or src[k] != "(":
            out.append(src[j:k])
            i = k
            continue
        depth = 0
        m = k
        while m < len(src):
            c = src[m]
            if c == "(":
                depth += 1
                m += 1
            elif c == ")":
                depth -= 1
                m += 1
                if depth == 0:
                    break
            elif c in "\"'":
                q = c
                m += 1
                while m < len(src):
                    if src[m] == "\\":
                        m += 2
                        continue
                    if src[m] == q:
                        m += 1
                        break
                    m += 1
            else:
                m += 1
        args = src[k + 1 : m - 1]
        out.append(f'crate::app_log::sync_emergency_line("rs", &format!({args}))')
        i = m
    return "".join(out)


def main() -> None:
    changed = []
    for p in ROOT.rglob("*.rs"):
        t = p.read_text(encoding="utf-8")
        newt = t
        for name in ("eprintln", "println"):
            if f"{name}!" in newt:
                newt = replace_macros(newt, name)
        if newt != t:
            p.write_text(newt, encoding="utf-8")
            changed.append(str(p))
    print(f"changed {len(changed)}")
    for c in changed:
        print(c)
    left = []
    for p in ROOT.rglob("*.rs"):
        for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            if "eprintln!" not in line and "println!" not in line:
                continue
            s = line.strip()
            if s.startswith("//") or s.startswith("*") or s.startswith("///"):
                continue
            left.append(f"{p}:{i}:{s[:120]}")
    print(f"left {len(left)}")
    for x in left[:40]:
        print(x)


if __name__ == "__main__":
    main()
