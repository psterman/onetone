import sqlite3, os, json

p = os.path.expandvars(r"%APPDATA%\Cursor\User\globalStorage\state.vscdb")
wal = p + "-wal"
shm = p + "-shm"
print(
    "db_gb",
    round(os.path.getsize(p) / 1e9, 2),
    "wal",
    os.path.exists(wal),
    "wal_mb",
    round(os.path.getsize(wal) / 1e6, 1) if os.path.exists(wal) else 0,
    "shm",
    os.path.exists(shm),
)
uri = "file:///" + p.replace("\\", "/") + "?mode=ro"
try:
    c = sqlite3.connect(uri, uri=True, timeout=8)
    c.execute("PRAGMA query_only=ON")
    keys = c.execute(
        "SELECT key FROM ItemTable WHERE key LIKE 'composer.%' LIMIT 30"
    ).fetchall()
    print("ItemTable composer keys:", keys)
    for k in ("composer.composerHeaders", "composer.composerData"):
        row = c.execute(
            "SELECT length(value), substr(value,1,240) FROM ItemTable WHERE key=?",
            (k,),
        ).fetchone()
        print(k, row)
    sample = c.execute(
        "SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%' LIMIT 5"
    ).fetchall()
    print("composerData samples:", sample)
    # If headers exist, peek list field names
    for k in ("composer.composerHeaders", "composer.composerData"):
        row = c.execute("SELECT value FROM ItemTable WHERE key=?", (k,)).fetchone()
        if not row:
            continue
        try:
            obj = json.loads(row[0])
        except Exception as e:
            print(k, "json err", e)
            continue
        if isinstance(obj, dict):
            print(k, "top keys", list(obj.keys())[:20])
            for f in ("allComposers", "composers", "headers"):
                arr = obj.get(f)
                if isinstance(arr, list):
                    print(k, f, "len", len(arr))
                    if arr and isinstance(arr[0], dict):
                        print(k, f, "sample keys", list(arr[0].keys())[:20])
        else:
            print(k, "type", type(obj))
    print("ok")
except Exception as e:
    print("ERR", type(e).__name__, e)
