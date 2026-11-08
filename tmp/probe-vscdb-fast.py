import sqlite3, os, time, json

p = os.path.expandvars(r"%APPDATA%\Cursor\User\globalStorage\state.vscdb")
uri = "file:///" + p.replace("\\", "/") + "?mode=ro"
c = sqlite3.connect(uri, uri=True, timeout=15)
c.execute("PRAGMA query_only=ON")

t0 = time.time()
keys = [r[0] for r in c.execute("SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%'")]
print("keys", len(keys), "in", round(time.time() - t0, 2), "s")

# Try json_extract
t0 = time.time()
try:
    rows = c.execute(
        "SELECT key, json_extract(value,'$.createdAt'), json_extract(value,'$.composerId') FROM cursorDiskKV WHERE key LIKE 'composerData:%'"
    ).fetchall()
    print("json_extract createdAt", len(rows), "in", round(time.time() - t0, 2), "s", "sample", rows[0])
except Exception as e:
    print("json_extract failed", e)

# substr parse createdAt
t0 = time.time()
ok = 0
for key in keys:
    raw = c.execute(
        "SELECT substr(value,1,8000) FROM cursorDiskKV WHERE key=?", (key,)
    ).fetchone()[0]
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", "ignore")
    # cheap find
    i = raw.find('"createdAt"')
    if i < 0:
        continue
    j = raw.find(":", i)
    k = raw.find(",", j)
    if j > 0 and k > j:
        ok += 1
print("substr createdAt", ok, "in", round(time.time() - t0, 2), "s")
