"""Regenerate minimal Cursor activity fixture (no real user data)."""
import json
import os
import sqlite3
import time

base = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(base, "state.vscdb")
if os.path.exists(path):
    os.remove(path)
conn = sqlite3.connect(path)
conn.execute("CREATE TABLE ItemTable (key TEXT UNIQUE, value BLOB)")
conn.execute("CREATE TABLE cursorDiskKV (key TEXT UNIQUE, value BLOB)")
now = int(time.time() * 1000)
cid = "fixture-composer-1"
headers = {
    "allComposers": [
        {
            "type": "head",
            "composerId": cid,
            "name": "Fixture",
            "createdAt": now - 3_600_000,
            "lastUpdatedAt": now,
            "unifiedMode": "agent",
        }
    ]
}
bubbles = []
for i in range(3):
    bid = f"user-bubble-{i}"
    bubbles.append((bid, 1, now - (3 - i) * 60_000))
    bubbles.append((f"asst-bubble-{i}", 2, now - (3 - i) * 60_000 + 1000))
composer = {
    "composerId": cid,
    "fullConversationHeadersOnly": [{"bubbleId": bid, "type": t} for bid, t, _ in bubbles],
    "usageData": {},
    "createdAt": now - 3_600_000,
    "lastUpdatedAt": now,
    "unifiedMode": "agent",
}
conn.execute(
    "INSERT INTO ItemTable(key,value) VALUES(?,?)",
    ("composer.composerHeaders", json.dumps(headers)),
)
conn.execute(
    "INSERT INTO cursorDiskKV(key,value) VALUES(?,?)",
    (f"composerData:{cid}", json.dumps(composer)),
)
for bid, typ, ts in bubbles:
    body = {"type": typ, "bubbleId": bid, "createdAt": ts, "text": ""}
    conn.execute(
        "INSERT INTO cursorDiskKV(key,value) VALUES(?,?)",
        (f"bubbleId:{cid}:{bid}", json.dumps(body)),
    )
conn.commit()
conn.close()
print("wrote", path)
