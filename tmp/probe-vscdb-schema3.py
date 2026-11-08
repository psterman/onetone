import sqlite3, os, json, time

p = os.path.expandvars(r"%APPDATA%\Cursor\User\globalStorage\state.vscdb")
uri = "file:///" + p.replace("\\", "/") + "?mode=ro"
c = sqlite3.connect(uri, uri=True, timeout=15)
c.execute("PRAGMA query_only=ON")

for k in (
    "composer.composerHeaders.version",
    "composer.planRegistry",
    "workbench.backgroundComposer.persistentData",
):
    row = c.execute("SELECT value FROM ItemTable WHERE key=?", (k,)).fetchone()
    if not row:
        print(k, "MISSING")
        continue
    raw = row[0]
    try:
        obj = json.loads(raw)
        print(k, "json type", type(obj).__name__, "keys" if isinstance(obj, dict) else "", list(obj.keys())[:15] if isinstance(obj, dict) else str(obj)[:120])
    except Exception:
        print(k, "raw", str(raw)[:120])

# Sample a few recent composerData by createdAt
rows = c.execute(
    "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'"
).fetchall()
parsed = []
for key, raw in rows:
    try:
        obj = json.loads(raw)
    except Exception:
        continue
    if not isinstance(obj, dict):
        continue
    ca = obj.get("createdAt") or obj.get("lastUpdatedAt") or 0
    try:
        ca = int(ca)
    except Exception:
        ca = 0
    hdrs = obj.get("fullConversationHeadersOnly") or []
    user = sum(1 for h in hdrs if isinstance(h, dict) and h.get("type") == 1)
    parsed.append((ca, key, user, len(hdrs), obj.get("name"), obj.get("status")))

parsed.sort(reverse=True)
now = int(time.time() * 1000)
day = 24 * 3600 * 1000
today = sum(1 for ca, *_ in parsed if ca >= now - (now % day))  # rough UTC
print("total composers", len(parsed))
print("top 5 recent:")
for row in parsed[:5]:
    print(row)
# local day approx from OS
import datetime

local = datetime.datetime.now().astimezone()
start = datetime.datetime(local.year, local.month, local.day, tzinfo=local.tzinfo)
today_start = int(start.timestamp() * 1000)
yest_start = today_start - day
turns_today = sessions_today = turns_yest = 0
for ca, key, user, n, name, status in parsed:
    if ca >= today_start:
        sessions_today += 1
        turns_today += user
    elif ca >= yest_start:
        turns_yest += user
print("approx light KPI today sessions", sessions_today, "turns", turns_today, "yest turns", turns_yest, "today_start", today_start)
