import sqlite3, json
from datetime import datetime
p = r"C:\Users\pstem\AppData\Roaming\onetone\app\config\agent-task-runtime.sqlite3"
c = sqlite3.connect(p)
tid = "atr_1794045479813_7c7548343518"
row = c.execute("select * from agent_tasks where task_id=?", (tid,)).fetchone()
cols = [x[1] for x in c.execute("pragma table_info(agent_tasks)")]
task = dict(zip(cols, row))
print("TASK", json.dumps({k: task[k] for k in ["task_id","status","permission_mode","waiting_reason","current_turn","tool_call_count","goal","last_error","updated_at_ms"]}, ensure_ascii=False, indent=2))
print("--- EVENTS ---")
for r in c.execute("select seq, kind, tool_name, payload_json, created_at_ms from agent_task_events where task_id=? order by seq", (tid,)):
    seq, kind, tool, payload, ms = r
    t = datetime.fromtimestamp(ms/1000).strftime("%H:%M:%S")
    try:
        pobj = json.loads(payload) if payload else {}
    except Exception:
        pobj = payload
    print(f"[{t}] #{seq} {kind} tool={tool}")
    print(json.dumps(pobj, ensure_ascii=False)[:800])
    print()
