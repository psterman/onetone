"""
Disable Cursor Local agent loop / Privacy-local routing.

Run ONLY after Cursor is fully quit (tray icon gone):
  python e:\\voice-pilot\\scripts\\cursor-disable-local-loop.py

Then start Cursor, open a NEW chat, try Plan.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time


def djb2_minus(s: str) -> str:
    h = 0
    for ch in s:
        h = ((h << 5) - h + ord(ch)) & 0xFFFFFFFF
    return str(h)


def main() -> int:
    db = os.path.join(
        os.environ["APPDATA"], "Cursor", "User", "globalStorage", "state.vscdb"
    )
    if not os.path.exists(db):
        print("MISSING", db)
        return 1

    # Refuse if Cursor.exe still running
    try:
        import subprocess

        out = subprocess.check_output(
            ["tasklist", "/FI", "IMAGENAME eq Cursor.exe"],
            text=True,
            errors="ignore",
        )
        if "Cursor.exe" in out:
            print("Cursor.exe still running. Quit Cursor completely (tray too), then re-run.")
            return 2
    except Exception as e:
        print("warn: could not check process list:", e)

    c = sqlite3.connect(db)
    gate_hash = djb2_minus("agent_host_local_loop")
    expires = int(time.time() * 1000) + 30 * 24 * 60 * 60 * 1000

    # 1) Privacy flags
    c.execute(
        "UPDATE ItemTable SET value=? WHERE key=?",
        ("false", "cursorai/donotchange/privacyMode"),
    )
    c.execute(
        "UPDATE ItemTable SET value=? WHERE key=?",
        (
            json.dumps({"privacyMode": "PRIVACY_MODE_USAGE_DATA_TRAINING_ALLOWED"}),
            "cursorai/donotchange/newPrivacyMode2",
        ),
    )

    # 2) serverConfig isDev so overrides stick longer
    row = c.execute(
        "SELECT value FROM ItemTable WHERE key=?", ("cursorai/serverConfig",)
    ).fetchone()
    if row:
        sc = json.loads(row[0])
        sc["isDevDoNotUseForSecretThingsBecauseCanBeSpoofedByUsers"] = True
        c.execute(
            "UPDATE ItemTable SET value=? WHERE key=?",
            (json.dumps(sc, separators=(",", ":")), "cursorai/serverConfig"),
        )

    # 3) featureFlagOverrides
    key = "workbench.experiments.featureFlagOverrides"
    overrides = {}
    row = c.execute("SELECT value FROM ItemTable WHERE key=?", (key,)).fetchone()
    if row and row[0]:
        try:
            overrides = json.loads(row[0])
            if not isinstance(overrides, dict):
                overrides = {}
        except Exception:
            overrides = {}
    overrides["agent_host_local_loop"] = {"value": False, "expiresAt": expires}
    val = json.dumps(overrides)
    if c.execute("SELECT 1 FROM ItemTable WHERE key=?", (key,)).fetchone():
        c.execute("UPDATE ItemTable SET value=? WHERE key=?", (val, key))
    else:
        c.execute("INSERT INTO ItemTable (key, value) VALUES (?, ?)", (key, val))

    # 4) Force statsigBootstrap gate false
    brow = c.execute(
        "SELECT value FROM ItemTable WHERE key=?",
        ("workbench.experiments.statsigBootstrap",),
    ).fetchone()
    if brow:
        boot = json.loads(brow[0])
        gates = boot.setdefault("feature_gates", {})
        g = dict(gates.get(gate_hash) or {})
        g.update(
            {
                "name": gate_hash,
                "id_type": g.get("id_type") or "userID",
                "secondary_exposures": g.get("secondary_exposures") or [],
                "rule_id": g.get("rule_id") or "disabled_local",
                "value": False,
            }
        )
        gates[gate_hash] = g
        c.execute(
            "UPDATE ItemTable SET value=? WHERE key=?",
            (
                json.dumps(boot, separators=(",", ":")),
                "workbench.experiments.statsigBootstrap",
            ),
        )

    # 5) reactive storage privacy routing
    rk = "src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser"
    rrow = c.execute("SELECT value FROM ItemTable WHERE key=?", (rk,)).fetchone()
    if rrow:
        obj = json.loads(rrow[0])
        obj["noStorageMode"] = False
        obj["serverPrivacyMode"] = 3  # training allowed / non-local privacy
        c.execute(
            "UPDATE ItemTable SET value=? WHERE key=?",
            (json.dumps(obj, separators=(",", ":")), rk),
        )

    # 6) Disable local-first window routing
    lr = "cursor/localFirstWindowReactivationConfig"
    c.execute(
        "UPDATE ItemTable SET value=? WHERE key=?",
        (
            json.dumps(
                {
                    "localRoutingEnabled": False,
                    "userRoutingEnabled": True,
                    "inactiveDays": 7,
                    "minSupportedClientVersion": "3.18.0",
                }
            ),
            lr,
        ),
    )

    # 7) Clear Local Agents (Glass) project binding for this machine
    for lk, empty in (
        ("glass.localAgentProjects.v1", "[]"),
        ("glass.localAgentProjectMembership.v1", "{}"),
    ):
        if c.execute("SELECT 1 FROM ItemTable WHERE key=?", (lk,)).fetchone():
            c.execute("UPDATE ItemTable SET value=? WHERE key=?", (empty, lk))
        else:
            c.execute("INSERT INTO ItemTable (key, value) VALUES (?, ?)", (lk, empty))

    c.commit()

    # verify
    print("privacyMode", c.execute(
        "SELECT value FROM ItemTable WHERE key=?",
        ("cursorai/donotchange/privacyMode",),
    ).fetchone()[0])
    print("newPrivacyMode2", c.execute(
        "SELECT value FROM ItemTable WHERE key=?",
        ("cursorai/donotchange/newPrivacyMode2",),
    ).fetchone()[0])
    print("overrides", c.execute(
        "SELECT value FROM ItemTable WHERE key=?", (key,)
    ).fetchone()[0])
    boot2 = json.loads(
        c.execute(
            "SELECT value FROM ItemTable WHERE key=?",
            ("workbench.experiments.statsigBootstrap",),
        ).fetchone()[0]
    )
    print("bootstrap.gate", boot2["feature_gates"].get(gate_hash))
    obj2 = json.loads(c.execute("SELECT value FROM ItemTable WHERE key=?", (rk,)).fetchone()[0])
    print("noStorageMode", obj2.get("noStorageMode"), "serverPrivacyMode", obj2.get("serverPrivacyMode"))
    print("localRouting", c.execute("SELECT value FROM ItemTable WHERE key=?", (lr,)).fetchone()[0])
    print("localProjects", c.execute(
        "SELECT value FROM ItemTable WHERE key=?",
        ("glass.localAgentProjects.v1",),
    ).fetchone()[0])
    c.close()
    print("OK — start Cursor, NEW chat, try Plan")
    return 0


if __name__ == "__main__":
    sys.exit(main())
