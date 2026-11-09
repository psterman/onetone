import re
from pathlib import Path

root = Path("src-tauri/src/agent_task_runtime")
pat = re.compile(
    r"(expected_content:\s*(?:None|opts\.expected_content|Some\([^)]*\)|EXPECTED_CONTENT\.into\(\)),)"
    r"(\r?\n)(\s*)\}"
)

for p in root.glob("*.rs"):
    s = p.read_text(encoding="utf-8")
    if re.search(r"expected_content:[^\n]+\n\s*plan_json:", s):
        print(f"{p.name}: already")
        continue

    def repl(m: re.Match[str]) -> str:
        indent = m.group(3)
        nl = m.group(2)
        return (
            f"{m.group(1)}{nl}"
            f"{indent}plan_json: None,{nl}"
            f"{indent}plan_version: 0,{nl}"
            f'{indent}plan_status: "none".into(),{nl}'
            f"{indent}}}"
        )

    ns, n = pat.subn(repl, s)
    if n:
        p.write_text(ns, encoding="utf-8")
    print(f"{p.name}: {n}")
