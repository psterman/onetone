#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
probe-agent-dbs.py — 只读探测本机各 AI agent 的 SQLite 落盘结构
用途：为「多 agent 会话聚合面板」做技术选型取证
用法：python probe-agent-dbs.py [--sample N]
安全：全程只读，绝不写回原库；被占用的库先复制到临时目录再打开（含 -wal/-shm）
"""
import os
import sys
import shutil
import sqlite3
import tempfile
import argparse
from pathlib import Path

HOME = Path.home()
APPDATA = Path(os.environ.get("APPDATA", HOME / "AppData/Roaming"))

TARGETS = [
    ("WorkBuddy",       HOME / ".workbuddy/workbuddy.db",                          "A"),
    ("WorkBuddyEdge",   HOME / ".workbuddy/edge-sync-mapping-v4.db",               "A"),
    ("Cursor-state",    APPDATA / "Cursor/User/globalStorage/state.vscdb",          "A"),
    ("Antigravity",     HOME / ".gemini/antigravity/conversation_summaries.db",     "A"),
    ("Codex-threads",   HOME / ".codex/thread_history_1.sqlite",                    "A"),
    ("Codex-state",     HOME / ".codex/state_5.sqlite",                             "A"),
    ("Codex-memories",  HOME / ".codex/memories_1.sqlite",                          "A"),
    ("Codex-goals",     HOME / ".codex/goals_1.sqlite",                             "A"),
    ("Codex-logs",      HOME / ".codex/logs_2.sqlite",                              "A"),
    ("Qoder",           APPDATA / "com.qodercn.app.stable/main.sqlite",             "B"),
    ("Trae-SOLO",       APPDATA / "TRAE SOLO CN/ModularData/ai-agent/database.db",  "D"),
    ("Trae-CN",         APPDATA / "Trae CN/ModularData/ai-agent/database.db",       "D"),
]

INTERESTING = ("session", "chat", "thread", "conversation", "message", "turn",
               "composer", "composerdata", "bubble", "task", "history", "prompt")


def safe_copy(src: Path) -> Path | None:
    """复制主库 + WAL + SHM 到临时目录，避免锁与半写状态"""
    if not src.exists():
        return None
    tmp = Path(tempfile.mkdtemp(prefix="agentprobe_")) / src.name
    try:
        shutil.copy2(src, tmp)
        for suf in ("-wal", "-shm"):
            w = src.with_name(src.name + suf)
            if w.exists():
                shutil.copy2(w, tmp.with_name(tmp.name + suf))
        return tmp
    except Exception as e:
        print(f"    [copy-fail] {e}")
        return None


def is_sqlcipher(path: Path) -> bool:
    with open(path, "rb") as f:
        return f.read(16) != b"SQLite format 3\x00"


def probe(name, src, grade, sample=2, max_tables=40):
    print(f"\n{'='*78}\n### {name}  [可解析性 {grade}]  {src}")
    if not src.exists():
        print("  (不存在)")
        return
    size = src.stat().st_size
    print(f"  体积: {size/1024/1024:.2f} MB")
    tmp = safe_copy(src)
    if not tmp:
        return

    if is_sqlcipher(tmp):
        print("  !! 文件头非 SQLite —— SQLCipher 加密，第三方无法直接解析")
        return

    try:
        con = sqlite3.connect(f"file:{tmp.as_posix()}?mode=ro&immutable=1", uri=True)
    except Exception as e:
        print(f"  [open-fail] {e}")
        return

    try:
        rows = con.execute(
            "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') "
            "AND name NOT LIKE 'sqlite_%' ORDER BY type, name"
        ).fetchall()
    except Exception as e:
        print(f"  [schema-fail] {e}  (可能加密或损坏)")
        con.close()
        return

    print(f"  对象数: {len(rows)}")
    for tname, ttype in rows[:max_tables]:
        mark = "*" if any(k in tname.lower() for k in INTERESTING) else " "
        try:
            n = con.execute(f'SELECT COUNT(*) FROM "{tname}"').fetchone()[0]
        except Exception:
            n = "?"
        cols = [r[1] for r in con.execute(f'PRAGMA table_info("{tname}")').fetchall()]
        print(f"  {mark}[{ttype[0]}] {tname:<42} rows={n}")
        if cols:
            print(f"       cols: {', '.join(cols[:16])}{' …' if len(cols) > 16 else ''}")
    con.close()


def kv_peek():
    """Cursor / Antigravity 这类 KV 库：看 value 的前缀，判断结构"""
    print(f"\n{'='*78}\n### Cursor state.vscdb —— 关键 KV key 抽样")
    src = APPDATA / "Cursor/User/globalStorage/state.vscdb"
    tmp = safe_copy(src)
    if not tmp:
        return
    con = sqlite3.connect(f"file:{tmp.as_posix()}?mode=ro&immutable=1", uri=True)
    for table in ("ItemTable", "cursorDiskKV"):
        try:
            rs = con.execute(f"SELECT key, length(value) FROM {table} ORDER BY 2 DESC LIMIT 12").fetchall()
        except Exception as e:
            print(f"  {table}: {e}")
            continue
        print(f"  -- {table} --")
        for k, ln in rs:
            print(f"     {k[:70]:<72} {ln/1024:.1f} KB")
    con.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=2)
    a = ap.parse_args()
    print("=" * 78)
    print("多 Agent 落盘结构探测报告")
    print("=" * 78)
    for name, src, grade in TARGETS:
        probe(name, src, grade, a.sample)
    try:
        kv_peek()
    except Exception as e:
        print(f"kv_peek err: {e}")


if __name__ == "__main__":
    main()
