import sqlite3, json
from datetime import datetime
p = r"C:\Users\pstem\AppData\Roaming\onetone\app\config\agent-task-runtime.sqlite3"
c = sqlite3.connect(p)
c.row_factory = sqlite3.Row
print("=== last 8 tasks ===")
for r in c.execute(
    "select task_id, status, permission_mode, current_turn, tool_call_count, goal, substr(coalesce(last_error,''),1,160) err, updated_at_ms from agent_tasks order by updated_at_ms desc limit 8"
):
    d=dict(r)
    d["t"]=datetime.fromtimestamp(d.pop("updated_at_ms")/1000).strftime("%H:%M:%S")
    print(json.dumps(d, ensure_ascii=False))
print("=== last task events ===")
tid = c.execute("select task_id from agent_tasks order by updated_at_ms desc limit 1").fetchone()[0]
print("tid", tid)
for r in c.execute(
    "select seq, kind, tool_name, payload_json, created_at_ms from agent_task_events where task_id=? order by seq",
    (tid,),
):
    seq, kind, tool, payload, ms = r
    t = datetime.fromtimestamp(ms/1000).strftime("%H:%M:%S")
    try:
        pobj = json.loads(payload) if payload else {}
    except Exception:
        pobj = payload
    print(f"[{t}] #{seq} {kind} tool={tool} {json.dumps(pobj, ensure_ascii=False)[:500]}")
