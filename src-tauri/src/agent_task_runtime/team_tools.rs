//! Lead/worker Team tools invoked from the ATR tool loop.
//! Returns compact JSON only — never full chat transcripts.

use serde_json::{json, Value};

use super::team::{
    self, claim_task, close_team, create_task_tool, interrupt_teammate, reassign_task,
    send_message, spawn_teammate, update_task_tool, wait_for_team, TeamToolCaller,
};

pub const TEAM_TOOL_NAMES: &[&str] = &[
    "create_task",
    "claim_task",
    "update_task",
    "reassign_task",
    "spawn_teammate",
    "interrupt_teammate",
    "send_message",
    "wait_for_team",
    "close_team",
];

pub fn is_team_tool(name: &str) -> bool {
    TEAM_TOOL_NAMES.contains(&name)
}

/// Resolve caller identity from the ATR task that is invoking the tool.
pub fn caller_for_atr_task(atr_task_id: &str) -> Result<TeamToolCaller, String> {
    team::caller_for_atr_task(atr_task_id)
}

pub fn dispatch(caller: &TeamToolCaller, name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "create_task" => create_task_tool(caller, args),
        "claim_task" => claim_task(caller, args),
        "update_task" => update_task_tool(caller, args),
        "reassign_task" => reassign_task(caller, args),
        "spawn_teammate" => spawn_teammate(caller, args),
        "interrupt_teammate" => interrupt_teammate(caller, args),
        "send_message" => send_message(caller, args),
        "wait_for_team" => wait_for_team(caller, args),
        "close_team" => close_team(caller, args),
        _ => Err(format!("unknown_team_tool:{name}")),
    }
}

pub fn compact_ok(
    team_id: &str,
    task_id: Option<&str>,
    status: &str,
    revision: u64,
    next: &str,
) -> Value {
    json!({
        "teamId": team_id,
        "taskId": task_id,
        "status": status,
        "revision": revision,
        "next": next,
    })
}
