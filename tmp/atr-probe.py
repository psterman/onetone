import sqlite3
p = r"C:\Users\pstem\AppData\Roaming\onetone\app\config\agent-task-runtime.sqlite3"
c = sqlite3.connect(p)
c.row_factory = sqlite3.Row
print("=== tables ===")
for r in c.execute("select name from sqlite_master where type='table'"):
    print(r[0])
print("=== recent tasks ===")
cols = [x[1] for x in c.execute("pragma table_info(tasks)")]
print("cols", cols)
q = "select task_id, status, permission_mode, current_turn, tool_call_count, substr(goal,1,100) as goal, substr(coalesce(last_error,''),1,200) as err, updated_at from tasks order by updated_at desc limit 15"
for r in c.execute(q):
    print(dict(r))
print("=== recent events ===")
ecols = [x[1] for x in c.execute("pragma table_info(events)")]
print("ecols", ecols)
