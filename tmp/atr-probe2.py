import sqlite3
p = r"C:\Users\pstem\AppData\Roaming\onetone\app\config\agent-task-runtime.sqlite3"
c = sqlite3.connect(p)
c.row_factory = sqlite3.Row
print("agent_tasks cols", [x[1] for x in c.execute("pragma table_info(agent_tasks)")])
print("agent_task_events cols", [x[1] for x in c.execute("pragma table_info(agent_task_events)")])
print("=== recent tasks ===")
for r in c.execute(
    "select task_id, status, permission_mode, current_turn, tool_call_count, substr(goal,1,120) as goal, substr(coalesce(last_error,''),1,220) as err, updated_at from agent_tasks order by updated_at desc limit 15"
):
    print(dict(r))
print("=== recent events ===")
for r in c.execute(
    "select task_id, kind, coalesce(tool_name,'') as tool, substr(coalesce(payload_json, payload, ''),1,220) as payload, created_at from agent_task_events order by created_at desc limit 50"
):
    print(dict(r))
