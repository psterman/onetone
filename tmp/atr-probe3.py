import sqlite3
from datetime import datetime
p = r"C:\Users\pstem\AppData\Roaming\onetone\app\config\agent-task-runtime.sqlite3"
c = sqlite3.connect(p)
c.row_factory = sqlite3.Row

def ts(ms):
    try:
        return datetime.fromtimestamp(ms/1000).strftime("%H:%M:%S")
    except Exception:
        return str(ms)

print("=== recent tasks ===")
for r in c.execute(
    "select task_id, status, permission_mode, current_turn, tool_call_count, substr(goal,1,120) as goal, substr(coalesce(last_error,''),1,240) as err, updated_at_ms from agent_tasks order by updated_at_ms desc limit 15"
):
    d=dict(r); d["t"]=ts(d.pop("updated_at_ms")); print(d)

print("=== recent events ===")
for r in c.execute(
    "select task_id, kind, coalesce(tool_name,'') as tool, substr(payload_json,1,240) as payload, created_at_ms from agent_task_events order by created_at_ms desc limit 60"
):
    d=dict(r); d["t"]=ts(d.pop("created_at_ms")); print(d)
