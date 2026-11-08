import sqlite3, os, json, re

p = os.path.expandvars(r"%APPDATA%\Cursor\User\globalStorage\state.vscdb")
uri = "file:///" + p.replace("\\", "/") + "?mode=ro"
c = sqlite3.connect(uri, uri=True, timeout=15)
c.execute("PRAGMA query_only=ON")

print("--- ItemTable keys matching composer/allComposer/header ---")
for row in c.execute(
    "SELECT key FROM ItemTable WHERE key LIKE '%composer%' OR key LIKE '%Composer%' OR key LIKE '%allComposer%' LIMIT 80"
):
    print(row[0])

print("--- ItemTable keys whose value mentions allComposers (sample scan) ---")
# Bound cost: only scan keys that look promising
candidates = list(
    c.execute(
        "SELECT key, length(value) FROM ItemTable WHERE key LIKE 'composer.%' OR key LIKE 'workbench.%' OR key LIKE '%session%' OR key LIKE '%chat%' LIMIT 200"
    )
)
print("candidate count", len(candidates))
for key, ln in candidates[:80]:
    print(f"  {key} len={ln}")

# Peek composerData sample for workspace / timestamps we can index from
print("--- sample composerData shape ---")
key = c.execute(
    "SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%' LIMIT 1"
).fetchone()[0]
raw = c.execute("SELECT value FROM cursorDiskKV WHERE key=?", (key,)).fetchone()[0]
obj = json.loads(raw)
print("key", key)
print("top keys", list(obj.keys())[:40] if isinstance(obj, dict) else type(obj))
if isinstance(obj, dict):
    for f in (
        "fullConversationHeadersOnly",
        "conversationHeaders",
        "headers",
        "composerId",
        "createdAt",
        "lastUpdatedAt",
        "updatedAt",
        "name",
        "text",
        "status",
        "workspace",
        "workspaceUri",
        "subtitle",
    ):
        if f in obj:
            v = obj[f]
            if isinstance(v, list):
                print(f, "list len", len(v), "sample0", (v[0] if v else None))
            else:
                s = str(v)
                print(f, s[:160])

# Count composerData rows (may be slow)
print("--- counting composerData ---")
n = c.execute(
    "SELECT COUNT(1) FROM cursorDiskKV WHERE key LIKE 'composerData:%'"
).fetchone()[0]
print("composerData count", n)

# Search any ItemTable value containing allComposers substring (expensive but capped)
print("--- scan ItemTable for allComposers substring (first 5) ---")
found = 0
for key, val in c.execute("SELECT key, value FROM ItemTable"):
    if val and b"allComposers" in (val if isinstance(val, (bytes, bytearray)) else str(val).encode()):
        print("HIT", key, "len", len(val))
        found += 1
        if found >= 5:
            break
print("done found", found)
