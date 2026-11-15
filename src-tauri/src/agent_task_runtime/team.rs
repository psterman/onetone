//! Multi-model Bug Fix Team orchestration.
//!
//! This module deliberately owns scheduling and policy only. Provider drivers remain in
//! `providers.rs`/`engine.rs`; a TeamNode produces small artifacts which can be fed to a
//! driver without sharing the complete conversation transcript.

use std::collections::HashSet;
use std::sync::{atomic::{AtomicU64, Ordering}, Mutex, OnceLock};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::store::{self, now_ms};

pub const MAX_WORKERS: usize = 4;
pub const MAX_REPAIR_ROUNDS: u32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamRole {
    Lead,
    Triage,
    Explorer,
    TestAnalyst,
    Implementer,
    Reviewer,
    Verifier,
}

impl TeamRole {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Lead => "lead",
            Self::Triage => "triage",
            Self::Explorer => "explorer",
            Self::TestAnalyst => "test_analyst",
            Self::Implementer => "implementer",
            Self::Reviewer => "reviewer",
            Self::Verifier => "verifier",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim() {
            "lead" => Some(Self::Lead),
            "triage" => Some(Self::Triage),
            "explorer" => Some(Self::Explorer),
            "test_analyst" => Some(Self::TestAnalyst),
            "implementer" => Some(Self::Implementer),
            "reviewer" => Some(Self::Reviewer),
            "verifier" => Some(Self::Verifier),
            _ => None,
        }
    }

    pub fn is_read_only(self) -> bool {
        !matches!(self, Self::Implementer)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRunDto {
    pub team_id: String,
    pub parent_task_id: String,
    pub goal: String,
    pub workspace_root: String,
    pub status: String,
    pub current_phase: String,
    pub lead_provider: Option<String>,
    pub repair_round: u32,
    pub max_repair_rounds: u32,
    pub execution_policy: String,
    pub execution_provider: String,
    pub nodes: Vec<TeamNodeDto>,
    pub artifacts: Vec<TeamArtifactDto>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamNodeDto {
    pub node_id: String,
    pub team_id: String,
    pub subject: String,
    pub description: String,
    pub role: String,
    pub provider_id: Option<String>,
    pub owner_id: Option<String>,
    pub revision: u64,
    pub write_scopes: Vec<String>,
    pub status: String,
    pub permission: String,
    /// ATR task id (also exposed as atrTaskId in tools).
    pub task_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub parent_session_id: Option<String>,
    #[serde(default)]
    pub last_event_id: Option<String>,
    pub depends_on: Vec<String>,
    pub error: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone)]
pub struct TeamToolCaller {
    pub team_id: String,
    pub node_id: String,
    pub role: String,
    pub atr_task_id: String,
    pub is_lead: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamArtifactDto {
    pub artifact_id: String,
    pub team_id: String,
    pub node_id: String,
    pub kind: String,
    pub body: Value,
    pub confidence: Option<f32>,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTeamRequest {
    pub goal: String,
    pub workspace_root: String,
    #[serde(default)]
    pub lead_provider: Option<String>,
    #[serde(default)]
    pub materials_summary: Option<String>,
    #[serde(default)]
    pub use_fake_driver: bool,
    #[serde(default)]
    pub write_scopes: Vec<String>,
    /// When true, pre-insert suggest_roles nodes (legacy). Default false: Lead-only start.
    #[serde(default = "default_auto_plan")]
    pub auto_plan: bool,
    #[serde(default)]
    pub autonomous_write: bool,
}

fn default_auto_plan() -> bool { false }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamNodeStatusRequest {
    pub node_id: String,
    pub status: String,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub expected_revision: Option<u64>,
    #[serde(default)]
    pub owner_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamIdRequest {
    pub team_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamArtifactRequest {
    pub team_id: String,
    pub node_id: String,
    pub kind: String,
    pub body: Value,
    #[serde(default)]
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamConfirmPlanRequest {
    pub team_id: String,
    #[serde(default)]
    pub plan: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamDispatchRequest {
    pub team_id: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub max_steps: Option<u32>,
    #[serde(default)]
    pub use_fake_driver: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamAdvanceRequest {
    pub team_id: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub max_steps: Option<u32>,
    #[serde(default)]
    pub use_fake_driver: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamTaskIdRequest {
    pub node_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamTaskListRequest {
    pub team_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamTaskCreateRequest {
    pub team_id: String,
    pub subject: String,
    #[serde(default)]
    pub description: String,
    pub role: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub write_scopes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamEventDto {
    pub event_id: String,
    pub team_id: String,
    pub node_id: Option<String>,
    pub kind: String,
    pub payload: Value,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamEventsRequest {
    pub team_id: String,
    #[serde(default)]
    pub after: Option<String>,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamParentTaskRequest {
    pub parent_task_id: String,
}

static ID_SEQ: AtomicU64 = AtomicU64::new(1);

fn id(prefix: &str) -> String {
    format!(
        "{}-{}-{}",
        prefix,
        now_ms(),
        ID_SEQ.fetch_add(1, Ordering::Relaxed)
    )
}

fn normalize_write_scopes(scopes: &[String]) -> Vec<String> {
    scopes
        .iter()
        .map(|s| s.trim().replace('\\', "/"))
        .filter(|s| !s.is_empty() && !s.starts_with('/') && !s.split('/').any(|p| p == ".."))
        .map(|s| s.trim_end_matches('/').to_string())
        .collect()
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS team_runs (
          team_id TEXT PRIMARY KEY,
          parent_task_id TEXT NOT NULL UNIQUE,
          goal TEXT NOT NULL,
          workspace_root TEXT NOT NULL,
          status TEXT NOT NULL,
          current_phase TEXT NOT NULL,
          lead_provider TEXT,
          repair_round INTEGER NOT NULL DEFAULT 0,
          max_repair_rounds INTEGER NOT NULL DEFAULT 2,
          execution_policy TEXT NOT NULL DEFAULT 'approval_required',
          execution_provider TEXT NOT NULL DEFAULT 'deepseek',
          scheduler_owner TEXT,
          scheduler_lease_until_ms INTEGER,
          scheduler_revision INTEGER NOT NULL DEFAULT 0,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS team_nodes (
          node_id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL,
          subject TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL,
          provider_id TEXT,
          owner_id TEXT,
          revision INTEGER NOT NULL DEFAULT 0,
          write_scopes_json TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL,
          permission TEXT NOT NULL,
          task_id TEXT,
          depends_on_json TEXT NOT NULL DEFAULT '[]',
          error TEXT,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_team_nodes_team ON team_nodes(team_id, created_at_ms);
        CREATE TABLE IF NOT EXISTS team_artifacts (
          artifact_id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL,
          node_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          body_json TEXT NOT NULL,
          confidence REAL,
          created_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_team_artifacts_team ON team_artifacts(team_id, created_at_ms);
        CREATE TABLE IF NOT EXISTS team_events (
          event_id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL,
          node_id TEXT,
          kind TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS team_messages (
          message_id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL,
          from_node_id TEXT,
          to_node_id TEXT,
          body_json TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_team_messages_team ON team_messages(team_id, created_at_ms);
        "#,
    )
    .map_err(|e| format!("team schema: {e}"))?;
    let columns = conn
        .prepare("PRAGMA table_info(team_nodes)")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect::<Vec<_>>();
    let run_columns = conn
        .prepare("PRAGMA table_info(team_runs)")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect::<Vec<_>>();
    if !run_columns.iter().any(|c| c == "execution_policy") {
        conn.execute("ALTER TABLE team_runs ADD COLUMN execution_policy TEXT NOT NULL DEFAULT 'approval_required'", [])
            .map_err(|e| format!("team execution_policy migration: {e}"))?;
    }
    if !run_columns.iter().any(|c| c == "execution_provider") {
        conn.execute("ALTER TABLE team_runs ADD COLUMN execution_provider TEXT NOT NULL DEFAULT 'deepseek'", [])
            .map_err(|e| format!("team execution_provider migration: {e}"))?;
    }
    for (name, sql) in [
        ("scheduler_owner", "ALTER TABLE team_runs ADD COLUMN scheduler_owner TEXT"),
        ("scheduler_lease_until_ms", "ALTER TABLE team_runs ADD COLUMN scheduler_lease_until_ms INTEGER"),
        ("scheduler_revision", "ALTER TABLE team_runs ADD COLUMN scheduler_revision INTEGER NOT NULL DEFAULT 0"),
    ] {
        if !run_columns.iter().any(|c| c == name) {
            conn.execute(sql, []).map_err(|e| format!("team {name} migration: {e}"))?;
        }
    }
    for (name, sql) in [
        ("task_id", "ALTER TABLE team_nodes ADD COLUMN task_id TEXT"),
        ("owner_id", "ALTER TABLE team_nodes ADD COLUMN owner_id TEXT"),
        ("subject", "ALTER TABLE team_nodes ADD COLUMN subject TEXT NOT NULL DEFAULT ''"),
        ("description", "ALTER TABLE team_nodes ADD COLUMN description TEXT NOT NULL DEFAULT ''"),
        ("revision", "ALTER TABLE team_nodes ADD COLUMN revision INTEGER NOT NULL DEFAULT 0"),
        ("write_scopes_json", "ALTER TABLE team_nodes ADD COLUMN write_scopes_json TEXT NOT NULL DEFAULT '[]'"),
        ("session_id", "ALTER TABLE team_nodes ADD COLUMN session_id TEXT"),
        ("parent_session_id", "ALTER TABLE team_nodes ADD COLUMN parent_session_id TEXT"),
        ("last_event_id", "ALTER TABLE team_nodes ADD COLUMN last_event_id TEXT"),
    ] {
        if !columns.iter().any(|c| c == name) {
            conn.execute(sql, [])
                .map_err(|e| format!("team {name} migration: {e}"))?;
        }
    }
    Ok(())
}

fn emit(
    conn: &Connection,
    team_id: &str,
    node_id: Option<&str>,
    kind: &str,
    payload: Value,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO team_events(event_id,team_id,node_id,kind,payload_json,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6)",
        params![id("tev"), team_id, node_id, kind, payload.to_string(), now_ms() as i64],
    ).map_err(|e| format!("team event: {e}"))?;
    Ok(())
}

fn emit_once(
    conn: &Connection,
    team_id: &str,
    node_id: Option<&str>,
    kind: &str,
    payload: Value,
) -> Result<(), String> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM team_events WHERE team_id=?1 AND kind=?2 AND (?3 IS NULL OR node_id=?3)",
        params![team_id, kind, node_id],
        |r| r.get(0),
    ).unwrap_or(0);
    if exists == 0 { emit(conn, team_id, node_id, kind, payload)?; }
    Ok(())
}

/// Suggested role template for Lead prompts — not a forced scheduler.
pub fn suggest_roles(goal: &str) -> Vec<TeamRole> {
    let lower = goal.to_ascii_lowercase();
    let mut roles = vec![TeamRole::Explorer];
    if lower.contains("race")
        || lower.contains("竞态")
        || lower.contains("偶尔")
        || lower.contains("intermittent")
    {
        roles.insert(0, TeamRole::Triage);
        roles.push(TeamRole::TestAnalyst);
    } else if lower.contains("test")
        || lower.contains("测试")
        || lower.contains("fail")
        || lower.contains("失败")
    {
        roles.insert(0, TeamRole::Triage);
        roles.push(TeamRole::TestAnalyst);
    } else if lower.contains("ui") || lower.contains("界面") || lower.contains("白屏") {
        roles.push(TeamRole::Verifier);
        roles.truncate(MAX_WORKERS);
        return roles;
    }
    roles.push(TeamRole::Implementer);
    roles.push(TeamRole::Reviewer);
    roles.push(TeamRole::Verifier);
    roles.truncate(MAX_WORKERS);
    roles
}

/// Legacy alias — prefer `suggest_roles`.
pub fn plan_roles(goal: &str) -> Vec<TeamRole> {
    suggest_roles(goal)
}

pub fn suggest_roles_prompt(goal: &str) -> String {
    let roles: Vec<&str> = suggest_roles(goal).iter().map(|r| r.as_str()).collect();
    format!(
        "Suggested roles (optional, not required): {}. Use create_task / spawn_teammate from the whitelist. Max {} workers + 1 Lead. Single Implementer only.",
        roles.join(", "),
        MAX_WORKERS
    )
}

fn map_tool_status_to_db(status: &str) -> Result<&'static str, String> {
    match status.trim() {
        "queued" | "ready" => Ok("ready"),
        "running" => Ok("running"),
        "blocked" => Ok("blocked"),
        "waiting" => Ok("waiting"),
        "completed" | "done" => Ok("done"),
        "failed" => Ok("failed"),
        "cancelled" | "interrupted" => Ok("cancelled"),
        other => Err(format!("invalid_team_node_status:{other}")),
    }
}

fn map_db_status_to_tool(status: &str) -> &str {
    match status {
        "ready" => "queued",
        "done" => "completed",
        "cancelled" => "failed",
        s => s,
    }
}

fn ensure_team_writable(team_id: &str) -> Result<(), String> {
    let run = snapshot(team_id)?;
    if matches!(run.status.as_str(), "done" | "closed" | "failed" | "cancelled") {
        return Err("team_closed".into());
    }
    Ok(())
}

pub fn caller_for_atr_task(atr_task_id: &str) -> Result<TeamToolCaller, String> {
    store::with_write(|conn| {
        ensure_schema(conn)?;
        let row = conn
            .query_row(
                "SELECT node_id,team_id,role FROM team_nodes WHERE task_id=?1 OR session_id=?1 LIMIT 1",
                [atr_task_id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
            )
            .map_err(|_| "team_caller_not_found".to_string())?;
        Ok(TeamToolCaller {
            node_id: row.0,
            team_id: row.1.clone(),
            role: row.2.clone(),
            atr_task_id: atr_task_id.to_string(),
            is_lead: row.2 == "lead",
        })
    })
}

pub fn role_permission(role: TeamRole) -> &'static str {
    if role.is_read_only() {
        "read_only"
    } else {
        "write_with_approval"
    }
}

pub fn start(req: StartTeamRequest) -> Result<TeamRunDto, String> {
    let execution_provider = req.lead_provider.clone().unwrap_or_else(|| "deepseek".into());
    let materials = {
        let hint = suggest_roles_prompt(&req.goal);
        match &req.materials_summary {
            Some(m) if !m.trim().is_empty() => format!("{m}\n\n{hint}"),
            _ => hint,
        }
    };
    // Lead session: read_only + Team tools (no apply_patch). parent_task_id = Lead ATR.
    let task = super::api_start(super::StartTaskRequest {
        goal: format!(
            "You are the Team Lead. Coordinate with Team tools only. Goal:\n{}\n\n{}",
            req.goal, materials
        ),
        workspace_root: req.workspace_root.clone(),
        permission_mode: Some("read_only".into()),
        materials_summary: Some(materials),
        plan_confirmed: Some(true),
        use_fake_driver: req.use_fake_driver,
        ..Default::default()
    })?;
    let run = store::with_write(|conn| {
        ensure_schema(conn)?;
        let team_id = id("team");
        let now = now_ms();
        conn.execute(
            "INSERT INTO team_runs(team_id,parent_task_id,goal,workspace_root,status,current_phase,lead_provider,repair_round,max_repair_rounds,execution_policy,execution_provider,created_at_ms,updated_at_ms) VALUES(?1,?2,?3,?4,'planning','planning',?5,0,2,?6,?7,?8,?8)",
            params![team_id, task.task_id, req.goal, task.workspace_root, execution_provider, if req.autonomous_write { "autonomous_write" } else { "approval_required" }, execution_provider, now as i64],
        ).map_err(|e| format!("team start: {e}"))?;
        emit(
            conn,
            &team_id,
            None,
            "team_started",
            json!({"parentTaskId": task.task_id}),
        )?;

        let lead_id = id("node");
        conn.execute(
            "INSERT INTO team_nodes(node_id,team_id,subject,description,role,provider_id,owner_id,revision,write_scopes_json,status,permission,task_id,session_id,parent_session_id,depends_on_json,error,created_at_ms,updated_at_ms) VALUES(?1,?2,'Lead','Coordinate team', 'lead',?3,?3,0,'[]','running','read_only',?4,?4,NULL,'[]',NULL,?5,?5)",
            params![lead_id, team_id, req.lead_provider, task.task_id, now as i64],
        ).map_err(|e| format!("team lead: {e}"))?;
        emit(
            conn,
            &team_id,
            Some(&lead_id),
            "task_created",
            json!({"role":"lead","status":"running"}),
        )?;

        // Lead is the ongoing coordinator — workers do not depend on Lead completing.
        let mut deps: Vec<String> = Vec::new();
        // Legacy path only: pre-insert suggested roles when auto_plan=true.
        let planned_roles = if req.auto_plan { suggest_roles(&req.goal) } else { Vec::new() };
        for role in planned_roles {
            let node_id = id("node");
            let dep_json = serde_json::to_string(&deps).unwrap_or_else(|_| "[]".into());
            conn.execute(
                "INSERT INTO team_nodes(node_id,team_id,role,provider_id,status,permission,depends_on_json,parent_session_id,error,created_at_ms,updated_at_ms) VALUES(?1,?2,?3,NULL,?4,?5,?6,?7,NULL,?8,?8)",
                params![node_id, team_id, role.as_str(), if role == TeamRole::Implementer { "blocked" } else { "ready" }, role_permission(role), dep_json, task.task_id, now as i64],
            ).map_err(|e| format!("team node: {e}"))?;
            emit(
                conn,
                &team_id,
                Some(&node_id),
                "task_created",
                json!({"role": role.as_str(), "permission": role_permission(role)}),
            )?;
            if role.is_read_only() && role != TeamRole::Lead {
                deps.push(node_id);
            }
        }
        let scopes = serde_json::to_string(&normalize_write_scopes(&req.write_scopes)).unwrap_or_else(|_| "[]".into());
        conn.execute("UPDATE team_nodes SET write_scopes_json=?1 WHERE team_id=?2 AND role='implementer'", params![scopes, team_id])
            .map_err(|e| format!("team write scopes: {e}"))?;
        load_run(conn, &team_id)
    })?;
    if !req.use_fake_driver {
        ensure_team_coordinator(&run.team_id);
    }
    Ok(run)
}

pub fn set_node_status(req: TeamNodeStatusRequest) -> Result<TeamRunDto, String> {
    store::with_write(|conn| {
        ensure_schema(conn)?;
        let (team_id, role, permission, revision): (String, String, String, u64) = conn
            .query_row(
                "SELECT team_id,role,permission,revision FROM team_nodes WHERE node_id=?1",
                [&req.node_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .map_err(|_| "team_node_not_found".to_string())?;
        let status = req.status.trim();
        if let Some(expected) = req.expected_revision {
            if expected != revision {
                return Err(format!("team_task_stale_revision:{revision}"));
            }
        }
        if !matches!(
            status,
            "ready" | "running" | "blocked" | "waiting" | "done" | "failed" | "cancelled"
        ) {
            return Err("invalid_team_node_status".into());
        }
        if status == "running" {
            let team_status: String = conn
                .query_row(
                    "SELECT status FROM team_runs WHERE team_id=?1",
                    [&team_id],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if team_status == "planning" && role == "implementer" {
                return Err("team_plan_not_confirmed".into());
            }
            let deps: String = conn
                .query_row(
                    "SELECT depends_on_json FROM team_nodes WHERE node_id=?1",
                    [&req.node_id],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            let dep_ids: Vec<String> = serde_json::from_str(&deps).unwrap_or_default();
            for dep in dep_ids {
                let dep_status: String = conn
                    .query_row(
                        "SELECT status FROM team_nodes WHERE node_id=?1",
                        [&dep],
                        |r| r.get(0),
                    )
                    .map_err(|_| "team_dependency_not_found".to_string())?;
                if dep_status != "done" {
                    return Err(format!("team_dependency_not_done:{dep}"));
                }
            }
        }
        if status == "running" && role == "implementer" {
            let active: i64 = conn.query_row("SELECT COUNT(1) FROM team_nodes WHERE team_id=?1 AND role='implementer' AND status='running'", [&team_id], |r| r.get(0)).unwrap_or(0);
            if active > 0 {
                return Err("team_write_slot_busy".into());
            }
            if permission != "write_with_approval" && permission != "write_autonomous" {
                return Err("team_write_policy_violation".into());
            }
        }
        conn.execute(
            "UPDATE team_nodes SET status=?1,owner_id=COALESCE(?2,owner_id),error=?3,revision=revision+1,updated_at_ms=?4 WHERE node_id=?5",
            params![status, req.owner_id, req.error, now_ms() as i64, req.node_id],
        )
        .map_err(|e| format!("team node status: {e}"))?;
        emit(
            conn,
            &team_id,
            Some(&req.node_id),
            "task_status_changed",
            json!({"status": status, "error": req.error, "ownerId": req.owner_id, "revision": revision + 1}),
        )?;
        load_run(conn, &team_id)
    })
}

pub fn confirm_plan(req: TeamConfirmPlanRequest) -> Result<TeamRunDto, String> {
    let run = snapshot(&req.team_id)?;
    // Approval is a one-way transition.  Replaying the click (or an SSE
    // reconnect) must not manufacture another approval_required event.
    if run.current_phase != "awaiting_plan" && run.status != "planning" {
        return Ok(run);
    }
    // Confirm Implementer ATR sessions (write lane). Lead is already plan_confirmed.
    for n in &run.nodes {
        if n.role == "implementer" {
            if let Some(tid) = &n.task_id {
                let _ = super::api_confirm_plan(super::ConfirmPlanRequest {
                    task_id: tid.clone(),
                    plan: req.plan.clone(),
                    goal: None,
                });
            }
        }
    }
    // Legacy: also confirm parent if it is still a write-lane task.
    let _ = super::api_confirm_plan(super::ConfirmPlanRequest {
        task_id: run.parent_task_id,
        plan: req.plan,
        goal: None,
    });
    store::with_write(|conn| {
        ensure_schema(conn)?;
        conn.execute(
            "UPDATE team_runs SET status='running',current_phase='awaiting_implementer',updated_at_ms=?1 WHERE team_id=?2",
            params![now_ms() as i64, req.team_id],
        )
        .map_err(|e| format!("team confirm: {e}"))?;
        // Unlock blocked implementer nodes.
        conn.execute(
            "UPDATE team_nodes SET status='ready',updated_at_ms=?1 WHERE team_id=?2 AND role='implementer' AND status='blocked'",
            params![now_ms() as i64, req.team_id],
        )
        .map_err(|e| e.to_string())?;
        emit(conn, &req.team_id, None, "plan_confirmed", json!({}))?;
        emit(conn, &req.team_id, None, "plan_ready", json!({}))?;
        load_run(conn, &req.team_id)
    })
}

/// Run all currently-ready read-only nodes in parallel. The parent task remains the sole
/// write lane; callers confirm its plan before using the normal ATR drive/approval flow.
pub fn dispatch_read_only(req: TeamDispatchRequest) -> Result<TeamRunDto, String> {
    let (team_id, goal, workspace_root, provider, nodes) = store::with_write(|conn| {
        ensure_schema(conn)?;
        let row = conn
            .query_row(
                "SELECT team_id,goal,workspace_root,lead_provider FROM team_runs WHERE team_id=?1",
                [&req.team_id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, Option<String>>(3)?,
                    ))
                },
            )
            .map_err(|_| "team_not_found".to_string())?;
        let provider = req
            .provider
            .clone()
            .or(row.3)
            .or_else(|| {
                super::provider_ready_snapshot()
                    .get("recommendedProvider")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .or_else(|| req.use_fake_driver.then(|| "fixture".to_string()))
            .ok_or_else(|| "team_provider_required".to_string())?;
        let mut stmt = conn.prepare("SELECT node_id,role FROM team_nodes WHERE team_id=?1 AND status='ready' AND role IN ('lead','triage','explorer','test_analyst') ORDER BY created_at_ms")
            .map_err(|e| e.to_string())?;
        let nodes = stmt
            .query_map([&req.team_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        if nodes.is_empty() {
            return Err("team_no_ready_read_only_nodes".into());
        }
        for (node_id, _) in &nodes {
            conn.execute("UPDATE team_nodes SET status='running',provider_id=?1,owner_id=?1,revision=revision+1,updated_at_ms=?2 WHERE node_id=?3", params![provider, now_ms() as i64, node_id]).map_err(|e| e.to_string())?;
            emit(
                conn,
                &req.team_id,
                Some(node_id),
                "task_status_changed",
                json!({"status":"running","provider":provider}),
            )?;
        }
        conn.execute("UPDATE team_runs SET status='running',current_phase='analysis',updated_at_ms=?1 WHERE team_id=?2", params![now_ms() as i64, req.team_id]).map_err(|e| e.to_string())?;
        emit(
            conn,
            &req.team_id,
            None,
            "task_status_changed",
            json!({"phase":"analysis"}),
        )?;
        Ok((row.0, row.1, row.2, provider, nodes))
    })?;
    let max_steps = req.max_steps.unwrap_or(4);
    let results = std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for (node_id, role) in nodes {
            let provider = provider.clone();
            let use_fake_driver = req.use_fake_driver;
            let goal = format!("Bug-fix team role: {role}. Analyze the following bug read-only. Produce concise evidence and a recommended next step; do not edit files.\n\n{goal}");
            let workspace_root = workspace_root.clone();
            handles.push(scope.spawn(move || {
                let task = super::api_start(super::StartTaskRequest {
                    goal,
                    workspace_root,
                    permission_mode: Some("read_only".into()),
                    plan_confirmed: Some(true),
                    use_fake_driver,
                    ..Default::default()
                });
                let outcome = task.and_then(|t| {
                    if use_fake_driver {
                        let mut driver = super::FakeDriver { steps: Vec::new(), idx: 0 };
                        super::api_drive_fake(&t.task_id, &mut driver).map(|done| (t, done))
                    } else {
                        super::api_drive(&t.task_id, &provider, Some(max_steps)).map(|done| (t, done))
                    }
                });
                (node_id, outcome)
            }));
        }
        handles
            .into_iter()
            .map(|h| h.join().map_err(|_| "team_worker_panicked".to_string()))
            .collect::<Result<Vec<_>, _>>()
    })?;
    for (node_id, outcome) in results {
        match outcome {
            Ok((task, done)) => {
                store::with_write(|conn| {
                    ensure_schema(conn)?;
                    conn.execute(
                        "UPDATE team_nodes SET task_id=?1,updated_at_ms=?2 WHERE node_id=?3",
                        params![task.task_id, now_ms() as i64, node_id],
                    )
                    .map_err(|e| format!("team node task link: {e}"))?;
                    Ok::<(), String>(())
                })?;
                let body = json!({"taskId": task.task_id, "status": done.status, "turns": done.current_turn, "toolCalls": done.tool_call_count, "error": done.last_error});
                add_artifact(TeamArtifactRequest {
                    team_id: team_id.clone(),
                    node_id: node_id.clone(),
                    kind: "evidence".into(),
                    body,
                    confidence: None,
                })?;
                set_node_status(TeamNodeStatusRequest {
                    node_id,
                    status: "done".into(),
                    error: None,
                    expected_revision: None,
                    owner_id: None,
                })?;
            }
            Err(err) => {
                add_artifact(TeamArtifactRequest {
                    team_id: team_id.clone(),
                    node_id: node_id.clone(),
                    kind: "blocked".into(),
                    body: json!({"error":err}),
                    confidence: Some(0.0),
                })?;
                set_node_status(TeamNodeStatusRequest {
                    node_id,
                    status: "failed".into(),
                    error: Some(err),
                    expected_revision: None,
                    owner_id: None,
                })?;
            }
        }
    }
    store::with_write(|conn| {
        ensure_schema(conn)?;
        conn.execute("UPDATE team_runs SET status='waiting',current_phase='awaiting_plan',updated_at_ms=?1 WHERE team_id=?2", params![now_ms() as i64, team_id]).map_err(|e| e.to_string())?;
        load_run(conn, &team_id)
    })
}

/// Continue a team after the parent Implementer has reached `done`.
/// Reviewer and Verifier remain read-only child tasks; the parent task remains the only
/// task that can apply a patch. Verifier agents may call the existing whitelisted
/// `run_check` tool, so shell execution still passes through the check registry.
pub fn advance(req: TeamAdvanceRequest) -> Result<TeamRunDto, String> {
    let mut run = snapshot(&req.team_id)?;
    let parent = super::api_status(&run.parent_task_id)?;
    if parent.status != "done" {
        store::with_write(|conn| {
            ensure_schema(conn)?;
            conn.execute("UPDATE team_runs SET status='waiting',current_phase='awaiting_implementer',updated_at_ms=?1 WHERE team_id=?2", params![now_ms() as i64, req.team_id])
                .map_err(|e| e.to_string())?;
            load_run(conn, &req.team_id)
        })
    } else {
        let provider = req
            .provider
            .or(run.lead_provider.clone())
            .or_else(|| {
                super::provider_ready_snapshot()
                    .get("recommendedProvider")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .or_else(|| req.use_fake_driver.then(|| "fixture".to_string()))
            .ok_or_else(|| "team_provider_required".to_string())?;
        let steps = req.max_steps.unwrap_or(6);
        for role_name in ["reviewer", "verifier"] {
            run = snapshot(&req.team_id)?;
            let Some(node) = run
                .nodes
                .iter()
                .find(|n| n.role == role_name && n.status == "ready")
                .cloned()
            else {
                continue;
            };
            set_node_status(TeamNodeStatusRequest {
                node_id: node.node_id.clone(),
                status: "running".into(),
                error: None,
                expected_revision: Some(node.revision),
                owner_id: Some(provider.clone()),
            })?;
            let instruction = if role_name == "reviewer" {
                "Review the completed parent Bug Fix Team change read-only. Inspect the diff and evidence, identify correctness or risk issues, and produce a concise patch_review artifact. Do not edit files."
            } else {
                "Verify the completed Bug Fix Team change read-only. Run an appropriate whitelisted check using run_check (for example frontend_typecheck or rust_lib_test_atr), then report a concise test_result. Do not edit files."
            };
            let child = super::api_start(super::StartTaskRequest {
                goal: format!(
                    "{instruction}\n\nOriginal bug:\n{}\n\nParent task id: {}",
                    run.goal, run.parent_task_id
                ),
                workspace_root: run.workspace_root.clone(),
                permission_mode: Some("read_only".into()),
                plan_confirmed: Some(true),
                use_fake_driver: req.use_fake_driver,
                ..Default::default()
            })
            .and_then(|task| {
                if req.use_fake_driver {
                    let mut driver = super::FakeDriver { steps: Vec::new(), idx: 0 };
                    super::api_drive_fake(&task.task_id, &mut driver).map(|done| (task, done))
                } else {
                    super::api_drive(&task.task_id, &provider, Some(steps)).map(|done| (task, done))
                }
            });
            match child {
                Ok((task, done)) => {
                    store::with_write(|conn| {
                        ensure_schema(conn)?;
                        conn.execute("UPDATE team_nodes SET task_id=?1,provider_id=?2,updated_at_ms=?3 WHERE node_id=?4", params![task.task_id, provider, now_ms() as i64, node.node_id])
                            .map_err(|e| format!("team followup link: {e}"))?;
                        Ok::<(), String>(())
                    })?;
                    let kind = if role_name == "reviewer" {
                        "patch_review"
                    } else {
                        "test_result"
                    };
                    add_artifact(TeamArtifactRequest {
                        team_id: req.team_id.clone(),
                        node_id: node.node_id.clone(),
                        kind: kind.into(),
                        body: if role_name == "reviewer" {
                            json!({"taskId": task.task_id, "status": done.status, "turns": done.current_turn, "toolCalls": done.tool_call_count, "error": done.last_error, "verdict": if done.status == "done" { "pass" } else { "block" }, "blockers": if done.status == "done" { json!([]) } else { json!([done.last_error.clone().unwrap_or_else(|| "review_failed".into())]) }})
                        } else {
                            json!({"taskId": task.task_id, "status": done.status, "turns": done.current_turn, "toolCalls": done.tool_call_count, "error": done.last_error, "checkId": "team_verifier", "exitCode": if done.status == "done" { 0 } else { 1 }, "passed": done.status == "done", "source": "host"})
                        },
                        confidence: None,
                    })?;
                    let final_status = if done.status == "done" {
                        "done"
                    } else {
                        "failed"
                    };
                    set_node_status(TeamNodeStatusRequest {
                        node_id: node.node_id,
                        status: final_status.into(),
                        error: done.last_error,
                        expected_revision: Some(node.revision + 1),
                        owner_id: Some(provider.clone()),
                    })?;
                }
                Err(err) => {
                    add_artifact(TeamArtifactRequest {
                        team_id: req.team_id.clone(),
                        node_id: node.node_id.clone(),
                        kind: "blocked".into(),
                        body: json!({"error": err}),
                        confidence: Some(0.0),
                    })?;
                    set_node_status(TeamNodeStatusRequest {
                        node_id: node.node_id,
                        status: "failed".into(),
                        error: Some(err),
                        expected_revision: Some(node.revision + 1),
                        owner_id: Some(provider.clone()),
                    })?;
                }
            }
        }
        run = snapshot(&req.team_id)?;
        let verifier_failed = run
            .nodes
            .iter()
            .any(|n| n.role == "verifier" && n.status == "failed");
        let reviewer_failed = run
            .nodes
            .iter()
            .any(|n| n.role == "reviewer" && n.status == "failed");
        let (status, phase) = if verifier_failed || reviewer_failed {
            ("needs_user", "needs_user")
        } else {
            ("done", "complete")
        };
        store::with_write(|conn| {
            ensure_schema(conn)?;
            conn.execute(
                "UPDATE team_runs SET status=?1,current_phase=?2,updated_at_ms=?3 WHERE team_id=?4",
                params![status, phase, now_ms() as i64, req.team_id],
            )
            .map_err(|e| e.to_string())?;
            emit(
                conn,
                &req.team_id,
                None,
                "team_advanced",
                json!({"status": status}),
            )?;
            load_run(conn, &req.team_id)
        })
    }
}

pub fn add_artifact(req: TeamArtifactRequest) -> Result<TeamArtifactDto, String> {
    let allowed = [
        "bug_summary",
        "evidence",
        "hypothesis",
        "reproduction",
        "plan",
        "patch_review",
        "test_result",
        "blocked",
    ];
    if !allowed.contains(&req.kind.as_str()) {
        return Err("invalid_team_artifact_kind".into());
    }
    if req.body.is_null() {
        return Err("team_artifact_body_required".into());
    }
    if req.kind == "patch_review" {
        let verdict = req.body.get("verdict").and_then(Value::as_str).unwrap_or("");
        if !matches!(verdict, "pass" | "block") {
            return Err("team_patch_review_verdict_required".into());
        }
        if verdict == "block"
            && req.body.get("blockers").and_then(Value::as_array).map(|a| a.is_empty()).unwrap_or(true)
        {
            return Err("team_patch_review_blockers_required".into());
        }
    }
    if req.kind == "test_result" {
        let passed = req.body.get("passed").and_then(Value::as_bool);
        let source = req.body.get("source").and_then(Value::as_str).unwrap_or("");
        if passed.is_none() || source != "host" {
            return Err("team_test_result_host_evidence_required".into());
        }
    }
    store::with_write(|conn| {
        ensure_schema(conn)?;
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM team_nodes WHERE team_id=?1 AND node_id=?2",
                params![req.team_id, req.node_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists == 0 {
            return Err("team_node_not_found".into());
        }
        let artifact_id = id("art");
        let now = now_ms();
        conn.execute("INSERT INTO team_artifacts(artifact_id,team_id,node_id,kind,body_json,confidence,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7)", params![artifact_id, req.team_id, req.node_id, req.kind, req.body.to_string(), req.confidence, now as i64]).map_err(|e| format!("team artifact: {e}"))?;
        emit(
            conn,
            &req.team_id,
            Some(&req.node_id),
            "artifact_added",
            json!({"artifactId": artifact_id, "kind": req.kind}),
        )?;
        Ok(TeamArtifactDto {
            artifact_id,
            team_id: req.team_id,
            node_id: req.node_id,
            kind: req.kind,
            body: req.body,
            confidence: req.confidence,
            created_at: now,
        })
    })
}

pub fn snapshot(team_id: &str) -> Result<TeamRunDto, String> {
    store::with_write(|conn| {
        ensure_schema(conn)?;
        load_run(conn, team_id)
    })
}

/// Recover Team drawer after FE reload / lost in-memory currentTeam.
pub fn snapshot_by_parent_task(parent_task_id: &str) -> Result<TeamRunDto, String> {
    let parent = parent_task_id.trim();
    if parent.is_empty() {
        return Err("team_parent_task_required".into());
    }
    store::with_write(|conn| {
        ensure_schema(conn)?;
        let team_id: String = conn
            .query_row(
                "SELECT team_id FROM team_runs WHERE parent_task_id=?1",
                [parent],
                |r| r.get(0),
            )
            .or_else(|_| {
                conn.query_row(
                    "SELECT team_id FROM team_nodes WHERE task_id=?1 OR session_id=?1 LIMIT 1",
                    [parent],
                    |r| r.get(0),
                )
            })
            .map_err(|_| "team_not_found".to_string())?;
        load_run(conn, &team_id)
    })
}

pub fn task_get(req: TeamTaskIdRequest) -> Result<TeamNodeDto, String> {
    let run = snapshot_for_node(&req.node_id)?;
    run.nodes
        .into_iter()
        .find(|node| node.node_id == req.node_id)
        .ok_or_else(|| "team_task_not_found".to_string())
}

pub fn task_create(req: TeamTaskCreateRequest) -> Result<TeamNodeDto, String> {
    let role = TeamRole::parse(&req.role).ok_or_else(|| "invalid_team_role".to_string())?;
    let run = snapshot(&req.team_id)?;
    let mut deps = req.depends_on.clone();
    if role == TeamRole::Reviewer {
        if let Some(implementer) = run.nodes.iter().find(|n| n.role == "implementer") {
            if !deps.iter().any(|d| d == &implementer.node_id) {
                deps.push(implementer.node_id.clone());
            }
        }
    }
    if role == TeamRole::Verifier {
        if let Some(reviewer) = run.nodes.iter().find(|n| n.role == "reviewer") {
            if !deps.iter().any(|d| d == &reviewer.node_id) {
                deps.push(reviewer.node_id.clone());
            }
        }
    }
    let scopes = normalize_write_scopes(&req.write_scopes);
    let worker_count = run.nodes.iter().filter(|n| n.role != "lead").count();
    if worker_count >= MAX_WORKERS {
        return Err("team_max_workers_reached".into());
    }
    if role == TeamRole::Implementer && run.nodes.iter().any(|n| n.role == "implementer") {
        return Err("team_single_writer_violation".into());
    }
    for dep in &deps {
        if !run.nodes.iter().any(|n| &n.node_id == dep) {
            return Err(format!("team_dependency_not_found:{dep}"));
        }
    }
    let status = if deps.iter().all(|dep| run.nodes.iter().any(|n| &n.node_id == dep && n.status == "done")) {
        "ready"
    } else {
        "blocked"
    };
    let node_id = id("node");
    let now = now_ms();
    store::with_write(|conn| {
        ensure_schema(conn)?;
        conn.execute(
            "INSERT INTO team_nodes(node_id,team_id,subject,description,role,provider_id,owner_id,revision,write_scopes_json,status,permission,task_id,depends_on_json,error,created_at_ms,updated_at_ms) VALUES(?1,?2,?3,?4,?5,NULL,NULL,0,?6,?7,?8,NULL,?9,NULL,?10,?10)",
            params![node_id, req.team_id, req.subject, req.description, role.as_str(), serde_json::to_string(&scopes).unwrap_or_else(|_| "[]".into()), status, role_permission(role), serde_json::to_string(&deps).unwrap_or_else(|_| "[]".into()), now as i64],
        ).map_err(|e| format!("team task create: {e}"))?;
        emit(conn, &req.team_id, Some(&node_id), "task_created", json!({"role": role.as_str(), "subject": req.subject, "status": status}))?;
        load_run(conn, &req.team_id)
    }).and_then(|run| run.nodes.into_iter().find(|n| n.node_id == node_id).ok_or_else(|| "team_task_create_missing".into()))
}

pub fn task_list(req: TeamTaskListRequest) -> Result<Vec<TeamNodeDto>, String> {
    Ok(snapshot(&req.team_id)?.nodes)
}

pub fn events(req: TeamEventsRequest) -> Result<Vec<TeamEventDto>, String> {
    store::with_write(|conn| {
        ensure_schema(conn)?;
        let limit = req.limit.unwrap_or(100).clamp(1, 500) as i64;
        let mut stmt = conn.prepare("SELECT event_id,team_id,node_id,kind,payload_json,created_at_ms FROM team_events WHERE team_id=?1 AND (?2 IS NULL OR event_id>?2) ORDER BY created_at_ms,event_id LIMIT ?3").map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![req.team_id, req.after, limit], |r| {
            let payload: String = r.get(4)?;
            Ok(TeamEventDto { event_id: r.get(0)?, team_id: r.get(1)?, node_id: r.get(2)?, kind: r.get(3)?, payload: serde_json::from_str(&payload).unwrap_or(Value::Null), created_at: r.get::<_, i64>(5)? as u64 })
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

fn snapshot_for_node(node_id: &str) -> Result<TeamRunDto, String> {
    store::with_write(|conn| {
        ensure_schema(conn)?;
        let team_id: String = conn
            .query_row("SELECT team_id FROM team_nodes WHERE node_id=?1", [node_id], |r| r.get(0))
            .map_err(|_| "team_task_not_found".to_string())?;
        load_run(conn, &team_id)
    })
}

fn load_run(conn: &Connection, team_id: &str) -> Result<TeamRunDto, String> {
    let run = conn.query_row("SELECT parent_task_id,goal,workspace_root,status,current_phase,lead_provider,repair_round,max_repair_rounds,execution_policy,execution_provider,created_at_ms,updated_at_ms FROM team_runs WHERE team_id=?1", [team_id], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,Option<String>>(5)?,r.get::<_,u32>(6)?,r.get::<_,u32>(7)?,r.get::<_,String>(8)?,r.get::<_,String>(9)?,r.get::<_,u64>(10)?,r.get::<_,u64>(11)?))).map_err(|_| "team_not_found".to_string())?;
    let mut stmt = conn.prepare("SELECT node_id,team_id,subject,description,role,provider_id,owner_id,revision,write_scopes_json,status,permission,task_id,session_id,parent_session_id,last_event_id,depends_on_json,error,created_at_ms,updated_at_ms FROM team_nodes WHERE team_id=?1 ORDER BY created_at_ms").map_err(|e| e.to_string())?;
    let nodes = stmt
        .query_map([team_id], |r| {
            let scopes: String = r.get(8)?;
            let deps: String = r.get(15)?;
            Ok(TeamNodeDto {
                node_id: r.get(0)?,
                team_id: r.get(1)?,
                subject: r.get(2)?,
                description: r.get(3)?,
                role: r.get(4)?,
                provider_id: r.get(5)?,
                owner_id: r.get(6)?,
                revision: r.get::<_, u64>(7)?,
                write_scopes: serde_json::from_str(&scopes).unwrap_or_default(),
                status: r.get(9)?,
                permission: r.get(10)?,
                task_id: r.get(11)?,
                session_id: r.get(12)?,
                parent_session_id: r.get(13)?,
                last_event_id: r.get(14)?,
                depends_on: serde_json::from_str(&deps).unwrap_or_default(),
                error: r.get(16)?,
                created_at: r.get(17)?,
                updated_at: r.get(18)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT artifact_id,team_id,node_id,kind,body_json,confidence,created_at_ms FROM team_artifacts WHERE team_id=?1 ORDER BY created_at_ms").map_err(|e| e.to_string())?;
    let artifacts = stmt
        .query_map([team_id], |r| {
            let body: String = r.get(4)?;
            Ok(TeamArtifactDto {
                artifact_id: r.get(0)?,
                team_id: r.get(1)?,
                node_id: r.get(2)?,
                kind: r.get(3)?,
                body: serde_json::from_str(&body).unwrap_or(Value::Null),
                confidence: r.get(5)?,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(TeamRunDto {
        team_id: team_id.into(),
        parent_task_id: run.0,
        goal: run.1,
        workspace_root: run.2,
        status: run.3,
        current_phase: run.4,
        lead_provider: run.5,
        repair_round: run.6,
        max_repair_rounds: run.7,
        nodes,
        artifacts,
        execution_policy: run.8,
        execution_provider: run.9,
        created_at: run.10,
        updated_at: run.11,
    })
}

fn tool_result(team_id: &str, node: &TeamNodeDto, next: &str) -> Value {
    json!({
        "teamId": team_id,
        "taskId": node.node_id,
        "status": map_db_status_to_tool(&node.status),
        "revision": node.revision,
        "next": next,
        "atrTaskId": node.task_id,
        "sessionId": node.session_id,
    })
}

/// Reconcile TeamNode state from ATR facts and host-generated artifacts.
/// Model status requests are intentionally ignored as authoritative state.
pub fn reconcile_team(team_id: &str) -> Result<TeamRunDto, String> {
    let initial = snapshot(team_id)?;
    for node in &initial.nodes {
        let Some(task_id) = node.task_id.as_deref() else {
            if node.status == "running" {
                let _ = set_node_status(TeamNodeStatusRequest {
                    node_id: node.node_id.clone(),
                    status: "failed".into(),
                    error: Some("node_running_without_atr_task".into()),
                    expected_revision: Some(node.revision),
                    owner_id: None,
                });
            }
            continue;
        };
        let Ok(task) = super::api_status(task_id) else { continue };
        let mapped = match task.status.as_str() {
            "done" => Some("done"),
            "failed" | "interrupted" => Some("failed"),
            "cancelled" => Some("cancelled"),
            "waiting" => Some("waiting"),
            "running" | "verifying" | "repair" | "review" => Some("running"),
            _ => None,
        };
        if let Some(status) = mapped {
            if status != node.status {
                let _ = set_node_status(TeamNodeStatusRequest {
                    node_id: node.node_id.clone(),
                    status: status.into(),
                    error: task.last_error.clone(),
                    expected_revision: Some(node.revision),
                    owner_id: node.owner_id.clone(),
                });
            }
        }
    }

    let run = snapshot(team_id)?;
    if matches!(run.status.as_str(), "cancelled" | "failed") {
        return Ok(run);
    }
    let has_failed = run.nodes.iter().any(|n| n.status == "failed");
    let implementer = run.nodes.iter().find(|n| n.role == "implementer");
    let reviewer = run.nodes.iter().find(|n| n.role == "reviewer");
    let verifier = run.nodes.iter().find(|n| n.role == "verifier");
    let reviewer_pass = run.artifacts.iter().any(|a| {
        a.kind == "patch_review"
            && a.body.get("verdict").and_then(Value::as_str) == Some("pass")
    });
    let verifier_pass = run.artifacts.iter().any(|a| {
        a.kind == "test_result"
            && a.body.get("source").and_then(Value::as_str) == Some("host")
            && a.body.get("passed").and_then(Value::as_bool) == Some(true)
    });
    let all_terminal = run.nodes.iter().filter(|n| n.role != "lead").all(|n| {
        matches!(n.status.as_str(), "done" | "failed" | "cancelled" | "blocked")
    });
    let complete = implementer.map(|n| n.status == "done").unwrap_or(false)
        && reviewer.map(|n| n.status == "done").unwrap_or(false)
        && verifier.map(|n| n.status == "done").unwrap_or(false)
        && reviewer_pass
        && verifier_pass
        && all_terminal;
    let (status, phase) = if complete {
        ("done", "complete")
    } else if has_failed {
        ("needs_user", "needs_user")
    } else if implementer.map(|n| n.status == "running" || n.status == "waiting").unwrap_or(false) {
        ("running", "implementing")
    } else if reviewer.map(|n| n.status == "running" || n.status == "waiting").unwrap_or(false) {
        ("running", "reviewing")
    } else if verifier.map(|n| n.status == "running" || n.status == "waiting").unwrap_or(false) {
        ("running", "verifying")
    } else {
        ("waiting", "awaiting_plan")
    };
    store::with_write(|conn| {
        ensure_schema(conn)?;
        conn.execute(
            "UPDATE team_runs SET status=?1,current_phase=?2,updated_at_ms=?3 WHERE team_id=?4 AND status NOT IN ('done','cancelled','failed')",
            params![status, phase, now_ms() as i64, team_id],
        ).map_err(|e| e.to_string())?;
        if complete {
            emit_once(conn, team_id, None, "team_completed", json!({"source":"host","verified":true}))?;
        } else if status == "needs_user" {
            emit_once(conn, team_id, None, "team_failed", json!({"source":"host","reason":"node_or_evidence_failed"}))?;
        }
        load_run(conn, team_id)
    })
}

/// Non-blocking Team coordinator tick. Lead remains owned by the FE WorkController;
/// this entry point reconciles facts and advances the persisted Team projection.
pub fn team_tick(team_id: &str) -> Result<TeamRunDto, String> {
    let run = reconcile_team(team_id)?;
    if matches!(run.status.as_str(), "done" | "cancelled" | "failed" | "needs_user") {
        return Ok(run);
    }

    let providers = super::provider_ready_snapshot();
    let provider_ready = providers.get("providers").and_then(Value::as_array)
        .and_then(|items| items.iter().find(|p| p.get("id").and_then(Value::as_str) == Some(run.execution_provider.as_str())))
        .and_then(|p| p.get("ready").and_then(Value::as_bool)).unwrap_or(false);
    if !provider_ready {
        return store::with_write(|conn| {
            ensure_schema(conn)?;
            conn.execute("UPDATE team_runs SET status='needs_user',current_phase='needs_user',updated_at_ms=?1 WHERE team_id=?2 AND status NOT IN ('done','cancelled','failed')", params![now_ms() as i64, team_id]).map_err(|e| e.to_string())?;
            emit_once(conn, team_id, None, "team_provider_unavailable", json!({"provider": run.execution_provider, "source":"host"}))?;
            load_run(conn, team_id)
        });
    }

    // Host scheduling is deliberately bounded: one node per tick. This keeps the
    // IPC call responsive while the persisted revision/task binding prevents
    // duplicate dispatches across concurrent polls.
    if let Some(node) = run.nodes.iter().find(|node| {
        node.role != "lead"
            && node.status == "ready"
            && node.task_id.is_none()
            && node.depends_on.iter().all(|dep| {
                run.nodes.iter().any(|candidate| candidate.node_id == *dep && candidate.status == "done")
            })
    }).cloned() {
        let caller = TeamToolCaller {
            team_id: run.team_id.clone(),
            node_id: run.parent_task_id.clone(),
            role: "lead".into(),
            atr_task_id: run.parent_task_id.clone(),
            is_lead: true,
        };
        if let Ok(result) = spawn_teammate(&caller, &json!({
            "taskId": node.node_id,
            "provider": run.execution_provider,
            "useFakeDriver": false,
            "maxSteps": 4,
        })) {
            let status = result.get("status").and_then(Value::as_str).unwrap_or("");
            if matches!(node.role.as_str(), "reviewer" | "verifier") {
                let artifact = if node.role == "reviewer" {
                    json!({
                        "taskId": node.task_id,
                        "verdict": if status == "completed" { "pass" } else { "block" },
                        "blockers": if status == "completed" { json!([]) } else { json!(["review_failed"]) },
                        "source": "host"
                    })
                } else {
                    json!({
                        "taskId": node.task_id,
                        "checkId": "team_verifier",
                        "exitCode": if status == "completed" { 0 } else { 1 },
                        "passed": status == "completed",
                        "source": "host"
                    })
                };
                let _ = add_artifact(TeamArtifactRequest {
                    team_id: team_id.to_string(),
                    node_id: node.node_id.clone(),
                    kind: if node.role == "reviewer" { "patch_review" } else { "test_result" }.into(),
                    body: artifact,
                    confidence: None,
                });
            }
        }
        let after = reconcile_team(team_id)?;
        if after.status == "needs_user" {
            return Ok(after);
        }
        return Ok(after);
    }

    let current = snapshot(team_id)?;
    let reviewer_blocked = current.nodes.iter().any(|n| n.role == "reviewer" && n.status == "failed");
    let verifier_blocked = current.nodes.iter().any(|n| n.role == "verifier" && n.status == "failed");
    if reviewer_blocked || verifier_blocked {
        return prepare_repair(team_id, if reviewer_blocked { "reviewer_failed" } else { "verifier_failed" });
    }

    reconcile_team(team_id)
}

/// Reset the write/review/verify lane for one bounded repair round. Historical
/// artifacts remain intact, so the next Implementer receives an auditable trail.
fn prepare_repair(team_id: &str, reason: &str) -> Result<TeamRunDto, String> {
    store::with_write(|conn| {
        ensure_schema(conn)?;
        let (round, max_rounds): (u32, u32) = conn.query_row(
            "SELECT repair_round,max_repair_rounds FROM team_runs WHERE team_id=?1",
            [team_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).map_err(|_| "team_not_found".to_string())?;
        if round >= max_rounds {
            conn.execute(
                "UPDATE team_runs SET status='needs_user',current_phase='needs_user',updated_at_ms=?1 WHERE team_id=?2",
                params![now_ms() as i64, team_id],
            ).map_err(|e| e.to_string())?;
            emit(conn, team_id, None, "repair_exhausted", json!({"reason": reason, "round": round}))?;
            return load_run(conn, team_id);
        }
        conn.execute(
            "UPDATE team_runs SET repair_round=repair_round+1,status='running',current_phase='repairing',updated_at_ms=?1 WHERE team_id=?2",
            params![now_ms() as i64, team_id],
        ).map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE team_nodes SET task_id=NULL,session_id=NULL,parent_session_id=NULL,status=CASE WHEN role IN ('implementer','reviewer','verifier') THEN 'ready' ELSE status END,error=NULL,revision=revision+1,updated_at_ms=?1 WHERE team_id=?2 AND role IN ('implementer','reviewer','verifier')",
            params![now_ms() as i64, team_id],
        ).map_err(|e| e.to_string())?;
        emit(conn, team_id, None, "repair_started", json!({"reason": reason, "round": round + 1}))?;
        load_run(conn, team_id)
    })
}

static TEAM_COORDINATORS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn ensure_team_coordinator(team_id: &str) {
    let registry = TEAM_COORDINATORS.get_or_init(|| Mutex::new(HashSet::new()));
    let Ok(mut active) = registry.lock() else { return };
    if !active.insert(team_id.to_string()) {
        return;
    }
    let team = team_id.to_string();
    std::thread::spawn(move || {
        let owner = format!("scheduler-{}", id("lease"));
        loop {
            let run = match claim_scheduler_lease(&team, &owner) {
                Ok(true) => team_tick(&team),
                Ok(false) => snapshot(&team),
                Err(err) => Err(err),
            };
            match run {
                Ok(run) if matches!(run.status.as_str(), "done" | "cancelled" | "failed" | "needs_user") => break,
                Ok(_) => std::thread::sleep(std::time::Duration::from_millis(700)),
                Err(_) => std::thread::sleep(std::time::Duration::from_millis(1200)),
            }
        }
        if let Ok(mut active) = TEAM_COORDINATORS.get_or_init(|| Mutex::new(HashSet::new())).lock() {
            active.remove(&team);
        }
    });
}

fn claim_scheduler_lease(team_id: &str, owner: &str) -> Result<bool, String> {
    store::with_write(|conn| {
        ensure_schema(conn)?;
        let now = now_ms() as i64;
        let changed = conn.execute(
            "UPDATE team_runs SET scheduler_owner=?1,scheduler_lease_until_ms=?2,scheduler_revision=scheduler_revision+1,updated_at_ms=?3 WHERE team_id=?4 AND status NOT IN ('done','cancelled','failed') AND (scheduler_lease_until_ms IS NULL OR scheduler_lease_until_ms<?3 OR scheduler_owner=?1)",
            params![owner, now + 2500, now, team_id],
        ).map_err(|e| e.to_string())?;
        Ok(changed == 1)
    })
}

pub fn reconcile_only(team_id: &str) -> Result<TeamRunDto, String> {
    reconcile_team(team_id)
}

pub fn resume_team(team_id: &str) -> Result<TeamRunDto, String> {
    let run = store::with_write(|conn| {
        ensure_schema(conn)?;
        conn.execute(
            "UPDATE team_runs SET status='running',current_phase='repairing',updated_at_ms=?1 WHERE team_id=?2 AND status='needs_user'",
            params![now_ms() as i64, team_id],
        ).map_err(|e| e.to_string())?;
        emit(conn, team_id, None, "team_resumed", json!({"source":"user"}))?;
        load_run(conn, team_id)
    })?;
    ensure_team_coordinator(team_id);
    Ok(run)
}

pub fn recover_all() -> Result<usize, String> {
    let ids = store::with_write(|conn| {
        ensure_schema(conn)?;
        let mut stmt = conn.prepare("SELECT team_id FROM team_runs WHERE status NOT IN ('done','cancelled','failed')")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })?;
    for id in &ids { ensure_team_coordinator(id); }
    Ok(ids.len())
}

fn require_lead(caller: &TeamToolCaller) -> Result<(), String> {
    if caller.is_lead {
        Ok(())
    } else {
        Err("team_lead_only".into())
    }
}

fn arg_str(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("missing_{key}"))
}

pub fn create_task_tool(caller: &TeamToolCaller, args: &Value) -> Result<Value, String> {
    require_lead(caller)?;
    ensure_team_writable(&caller.team_id)?;
    let role = arg_str(args, "role").or_else(|_| arg_str(args, "Role"))?;
    let subject = args
        .get("subject")
        .and_then(|v| v.as_str())
        .unwrap_or("task")
        .to_string();
    let description = args
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let depends_on = args
        .get("dependsOn")
        .or_else(|| args.get("depends_on"))
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let write_scopes = args
        .get("writeScopes")
        .or_else(|| args.get("write_scopes"))
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let node = task_create(TeamTaskCreateRequest {
        team_id: caller.team_id.clone(),
        subject,
        description,
        role,
        depends_on,
        write_scopes,
    })?;
    // Stamp parent_session_id to Lead ATR.
    store::with_write(|conn| {
        ensure_schema(conn)?;
        conn.execute(
            "UPDATE team_nodes SET parent_session_id=?1,updated_at_ms=?2 WHERE node_id=?3",
            params![caller.atr_task_id, now_ms() as i64, node.node_id],
        )
        .map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })?;
    let node = task_get(TeamTaskIdRequest {
        node_id: node.node_id,
    })?;
    Ok(tool_result(&caller.team_id, &node, "spawn_teammate"))
}

pub fn claim_task(caller: &TeamToolCaller, args: &Value) -> Result<Value, String> {
    ensure_team_writable(&caller.team_id)?;
    let node_id = arg_str(args, "taskId")
        .or_else(|_| arg_str(args, "nodeId"))
        .or_else(|_| arg_str(args, "task_id"))?;
    let expected = args
        .get("expectedRevision")
        .or_else(|| args.get("expected_revision"))
        .and_then(|v| v.as_u64());
    let node = task_get(TeamTaskIdRequest {
        node_id: node_id.clone(),
    })?;
    if node.team_id != caller.team_id {
        return Err("team_node_wrong_team".into());
    }
    if !caller.is_lead && node.role != caller.role && node.owner_id.as_deref() != Some(&caller.node_id)
    {
        // Workers may only claim their own role node when unowned or owned by them.
        if node.owner_id.is_some() && node.owner_id.as_deref() != Some(&caller.node_id) {
            return Err("team_claim_denied".into());
        }
    }
    let run = set_node_status(TeamNodeStatusRequest {
        node_id: node_id.clone(),
        status: "running".into(),
        error: None,
        expected_revision: expected,
        owner_id: Some(caller.node_id.clone()),
    })?;
    let node = run
        .nodes
        .into_iter()
        .find(|n| n.node_id == node_id)
        .ok_or_else(|| "team_task_not_found".to_string())?;
    store::with_write(|conn| {
        ensure_schema(conn)?;
        emit(
            conn,
            &caller.team_id,
            Some(&node.node_id),
            "task_claimed",
            json!({"ownerId": caller.node_id, "revision": node.revision}),
        )?;
        Ok::<(), String>(())
    })?;
    Ok(tool_result(&caller.team_id, &node, "update_task"))
}

pub fn update_task_tool(caller: &TeamToolCaller, args: &Value) -> Result<Value, String> {
    ensure_team_writable(&caller.team_id)?;
    let node_id = arg_str(args, "taskId")
        .or_else(|_| arg_str(args, "nodeId"))?;
    let status_raw = arg_str(args, "status")?;
    let db_status = map_tool_status_to_db(&status_raw)?;
    let expected = args
        .get("expectedRevision")
        .or_else(|| args.get("expected_revision"))
        .and_then(|v| v.as_u64());
    let error = args
        .get("error")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let node = task_get(TeamTaskIdRequest {
        node_id: node_id.clone(),
    })?;
    if node.team_id != caller.team_id {
        return Err("team_node_wrong_team".into());
    }
    if !caller.is_lead
        && node.owner_id.as_deref() != Some(&caller.node_id)
        && node.task_id.as_deref() != Some(&caller.atr_task_id)
    {
        return Err("team_update_denied".into());
    }
    if matches!(db_status, "done" | "failed") {
        // Terminal state is an observation owned by the host.  Keep the model's
        // intent as an event so the coordinator can audit it, but never let a
        // tool call turn a node into a factually-complete node.
        store::with_write(|conn| {
            ensure_schema(conn)?;
            emit(
                conn,
                &caller.team_id,
                Some(&node.node_id),
                "model_status_requested",
                json!({"requestedStatus": status_raw, "error": error, "source": "model"}),
            )?;
            Ok::<(), String>(())
        })?;
        return Ok(tool_result(&caller.team_id, &node, "reconcile_team"));
    }
    let run = set_node_status(TeamNodeStatusRequest {
        node_id: node_id.clone(),
        status: db_status.into(),
        error,
        expected_revision: expected,
        owner_id: Some(caller.node_id.clone()),
    })?;
    let node = run
        .nodes
        .into_iter()
        .find(|n| n.node_id == node_id)
        .ok_or_else(|| "team_task_not_found".to_string())?;
    Ok(tool_result(&caller.team_id, &node, "wait_for_team"))
}

pub fn reassign_task(caller: &TeamToolCaller, args: &Value) -> Result<Value, String> {
    require_lead(caller)?;
    ensure_team_writable(&caller.team_id)?;
    let node_id = arg_str(args, "taskId").or_else(|_| arg_str(args, "nodeId"))?;
    let to_owner = arg_str(args, "ownerId")
        .or_else(|_| arg_str(args, "toNodeId"))
        .or_else(|_| arg_str(args, "memberId"))?;
    let expected = args
        .get("expectedRevision")
        .and_then(|v| v.as_u64());
    let run = snapshot(&caller.team_id)?;
    let target = run
        .nodes
        .iter()
        .find(|n| n.node_id == to_owner || n.role == to_owner)
        .ok_or_else(|| "team_reassign_target_invalid".to_string())?;
    if target.role == "lead" {
        return Err("team_reassign_lead_denied".into());
    }
    let node = task_get(TeamTaskIdRequest {
        node_id: node_id.clone(),
    })?;
    let run = set_node_status(TeamNodeStatusRequest {
        node_id: node_id.clone(),
        status: node.status.clone(),
        error: None,
        expected_revision: expected.or(Some(node.revision)),
        owner_id: Some(target.node_id.clone()),
    })?;
    let node = run
        .nodes
        .into_iter()
        .find(|n| n.node_id == node_id)
        .ok_or_else(|| "team_task_not_found".to_string())?;
    store::with_write(|conn| {
        ensure_schema(conn)?;
        emit(
            conn,
            &caller.team_id,
            Some(&node.node_id),
            "task_reassigned",
            json!({"ownerId": target.node_id, "revision": node.revision}),
        )?;
        Ok::<(), String>(())
    })?;
    Ok(tool_result(&caller.team_id, &node, "wait_for_team"))
}

fn slim_child_goal(run: &TeamRunDto, node: &TeamNodeDto) -> String {
    let dep_summaries: Vec<String> = run
        .artifacts
        .iter()
        .filter(|a| node.depends_on.contains(&a.node_id))
        .take(6)
        .map(|a| format!("[{}] {}", a.kind, a.body.to_string().chars().take(240).collect::<String>()))
        .collect();
    let msgs = store::with_write(|conn| {
        ensure_schema(conn)?;
        let mut stmt = conn
            .prepare(
                "SELECT body_json FROM team_messages WHERE team_id=?1 AND (to_node_id=?2 OR to_node_id IS NULL) ORDER BY created_at_ms DESC LIMIT 5",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![run.team_id, node.node_id], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok::<Vec<String>, String>(rows)
    })
    .unwrap_or_default();
    format!(
        "Team role: {role}. Task: {subject}\n{desc}\n\nTeam goal:\n{goal}\n\nDependency artifacts:\n{deps}\n\nLead messages:\n{msgs}\n\nDo not edit files unless you are the Implementer with plan confirmed. Produce concise evidence.",
        role = node.role,
        subject = node.subject,
        desc = node.description,
        goal = run.goal,
        deps = if dep_summaries.is_empty() {
            "(none)".into()
        } else {
            dep_summaries.join("\n")
        },
        msgs = if msgs.is_empty() {
            "(none)".into()
        } else {
            msgs.join("\n")
        },
    )
}

pub fn spawn_teammate(caller: &TeamToolCaller, args: &Value) -> Result<Value, String> {
    require_lead(caller)?;
    ensure_team_writable(&caller.team_id)?;
    let node_id = arg_str(args, "taskId")
        .or_else(|_| arg_str(args, "nodeId"))
        .ok();
    let role_opt = args.get("role").and_then(|v| v.as_str()).map(str::to_string);
    let use_fake = args
        .get("useFakeDriver")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let max_steps = args
        .get("maxSteps")
        .and_then(|v| v.as_u64())
        .map(|n| n as u32)
        .unwrap_or(4);
    let provider = args
        .get("provider")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    let mut run = snapshot(&caller.team_id)?;
    let node = if let Some(nid) = node_id {
        run.nodes
            .iter()
            .find(|n| n.node_id == nid)
            .cloned()
            .ok_or_else(|| "team_task_not_found".to_string())?
    } else if let Some(role) = role_opt.clone() {
        // Create then spawn.
        let created = create_task_tool(
            caller,
            &json!({
                "role": role,
                "subject": args.get("subject").and_then(|v| v.as_str()).unwrap_or("spawned"),
                "description": args.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                "dependsOn": args.get("dependsOn").cloned().unwrap_or(json!([])),
                "writeScopes": args.get("writeScopes").cloned().unwrap_or(json!([])),
            }),
        )?;
        let nid = created
            .get("taskId")
            .and_then(|v| v.as_str())
            .ok_or("team_spawn_create_failed")?;
        run = snapshot(&caller.team_id)?;
        run.nodes
            .iter()
            .find(|n| n.node_id == nid)
            .cloned()
            .ok_or_else(|| "team_task_not_found".to_string())?
    } else {
        return Err("missing_taskId_or_role".into());
    };

    if node.task_id.is_some() {
        return Err("team_already_spawned".into());
    }
    if node.role == "implementer" {
        if run.status == "planning" {
            return Err("team_plan_not_confirmed".into());
        }
    }
    let role = TeamRole::parse(&node.role).ok_or("invalid_team_role")?;
    let perm = if role == TeamRole::Implementer {
        if run.execution_policy == "autonomous_write" { "write_autonomous" } else { "write_with_approval" }
    } else {
        "read_only"
    };
    let goal = slim_child_goal(&run, &node);
    let running_revision = node.revision;
    set_node_status(TeamNodeStatusRequest {
        node_id: node.node_id.clone(),
        status: "running".into(),
        error: None,
        expected_revision: Some(running_revision),
        owner_id: provider.clone(),
    })?;
    let child = super::api_start(super::StartTaskRequest {
        goal,
        workspace_root: run.workspace_root.clone(),
        permission_mode: Some(perm.into()),
        plan_confirmed: Some(role != TeamRole::Implementer || run.execution_policy == "autonomous_write"),
        use_fake_driver: use_fake,
        ..Default::default()
    });
    let child = match child {
        Ok(child) => child,
        Err(error) => {
            let _ = set_node_status(TeamNodeStatusRequest {
                node_id: node.node_id.clone(),
                status: "failed".into(),
                error: Some(error.clone()),
                expected_revision: Some(running_revision + 1),
                owner_id: provider.clone(),
            });
            return Err(error);
        }
    };
    store::with_write(|conn| {
        ensure_schema(conn)?;
        conn.execute(
            "UPDATE team_nodes SET task_id=?1,session_id=?1,parent_session_id=?2,provider_id=COALESCE(?3,provider_id),revision=revision+1,updated_at_ms=?4 WHERE node_id=?5",
            params![
                child.task_id,
                caller.atr_task_id,
                provider,
                now_ms() as i64,
                node.node_id
            ],
        )
        .map_err(|e| e.to_string())?;
        emit(
            conn,
            &caller.team_id,
            Some(&node.node_id),
            "teammate_spawned",
            json!({"atrTaskId": child.task_id, "role": node.role}),
        )?;
        Ok::<(), String>(())
    })?;

    // Drive child (fake or real). Projection after drive.
    let drive_result = if use_fake {
        let mut driver = super::FakeDriver {
            steps: Vec::new(),
            idx: 0,
        };
        super::api_drive_fake(&child.task_id, &mut driver)
    } else {
        let p = provider
            .or(run.lead_provider.clone())
            .or_else(|| {
                super::provider_ready_snapshot()
                    .get("recommendedProvider")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .ok_or_else(|| "team_provider_required".to_string())?;
        super::api_drive(&child.task_id, &p, Some(max_steps))
    };
    match drive_result {
        Ok(done) => {
            let final_status = if done.status == "done" {
                "done"
            } else if done.status == "cancelled" {
                "cancelled"
            } else if done.status == "waiting" {
                "waiting"
            } else {
                "failed"
            };
            let _ = set_node_status(TeamNodeStatusRequest {
                node_id: node.node_id.clone(),
                status: final_status.into(),
                error: done.last_error.clone(),
                expected_revision: None,
                owner_id: Some(caller.node_id.clone()),
            });
            if matches!(final_status, "done" | "failed") {
                let kind = if final_status == "done" {
                    "evidence"
                } else {
                    "blocked"
                };
                let _ = add_artifact(TeamArtifactRequest {
                    team_id: caller.team_id.clone(),
                    node_id: node.node_id.clone(),
                    kind: kind.into(),
                    body: json!({
                        "taskId": child.task_id,
                        "status": done.status,
                        "error": done.last_error,
                    }),
                    confidence: None,
                });
            }
        }
        Err(err) => {
            let _ = set_node_status(TeamNodeStatusRequest {
                node_id: node.node_id.clone(),
                status: "failed".into(),
                error: Some(err),
                expected_revision: None,
                owner_id: None,
            });
        }
    }
    let node = task_get(TeamTaskIdRequest {
        node_id: node.node_id,
    })?;
    Ok(tool_result(&caller.team_id, &node, "wait_for_team"))
}

pub fn interrupt_teammate(caller: &TeamToolCaller, args: &Value) -> Result<Value, String> {
    if !caller.is_lead {
        // Allow self-interrupt only.
        let node_id = arg_str(args, "taskId").or_else(|_| arg_str(args, "nodeId"))?;
        let node = task_get(TeamTaskIdRequest { node_id })?;
        if node.task_id.as_deref() != Some(&caller.atr_task_id)
            && node.owner_id.as_deref() != Some(&caller.node_id)
        {
            return Err("team_interrupt_denied".into());
        }
    }
    let node_id = arg_str(args, "taskId").or_else(|_| arg_str(args, "nodeId"))?;
    let node = task_get(TeamTaskIdRequest {
        node_id: node_id.clone(),
    })?;
    if let Some(tid) = &node.task_id {
        let _ = super::api_cancel(tid);
    }
    let run = set_node_status(TeamNodeStatusRequest {
        node_id: node_id.clone(),
        status: "cancelled".into(),
        error: Some("interrupted".into()),
        expected_revision: None,
        owner_id: None,
    })?;
    let node = run
        .nodes
        .into_iter()
        .find(|n| n.node_id == node_id)
        .ok_or_else(|| "team_task_not_found".to_string())?;
    store::with_write(|conn| {
        ensure_schema(conn)?;
        emit(
            conn,
            &caller.team_id,
            Some(&node.node_id),
            "teammate_interrupted",
            json!({"atrTaskId": node.task_id}),
        )?;
        Ok::<(), String>(())
    })?;
    Ok(tool_result(&caller.team_id, &node, "wait_for_team"))
}

pub fn send_message(caller: &TeamToolCaller, args: &Value) -> Result<Value, String> {
    ensure_team_writable(&caller.team_id)?;
    let to_node = args
        .get("toNodeId")
        .or_else(|| args.get("taskId"))
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let body = args
        .get("body")
        .cloned()
        .or_else(|| {
            args.get("text")
                .and_then(|v| v.as_str())
                .map(|t| json!({"text": t}))
        })
        .unwrap_or(json!({}));
    // Keep short.
    let body_s = body.to_string();
    if body_s.len() > 4000 {
        return Err("team_message_too_large".into());
    }
    let message_id = id("tmsg");
    store::with_write(|conn| {
        ensure_schema(conn)?;
        conn.execute(
            "INSERT INTO team_messages(message_id,team_id,from_node_id,to_node_id,body_json,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6)",
            params![
                message_id,
                caller.team_id,
                caller.node_id,
                to_node,
                body_s,
                now_ms() as i64
            ],
        )
        .map_err(|e| e.to_string())?;
        emit(
            conn,
            &caller.team_id,
            to_node.as_deref(),
            "message_added",
            json!({"messageId": message_id, "from": caller.node_id}),
        )?;
        Ok::<(), String>(())
    })?;
    // Optionally forward to ATR submit_user_input when target has a running session.
    if let Some(ref tid) = to_node {
        if let Ok(n) = task_get(TeamTaskIdRequest {
            node_id: tid.clone(),
        }) {
            if let Some(atr) = n.task_id {
                let text = body
                    .get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("team message");
                let _ = super::api_submit_user_input(super::SubmitUserInputRequest {
                    task_id: atr,
                    text: text.to_string(),
                });
            }
        }
    }
    Ok(json!({
        "teamId": caller.team_id,
        "taskId": to_node,
        "status": "queued",
        "revision": 0,
        "next": "wait_for_team",
        "messageId": message_id,
    }))
}

pub fn wait_for_team(caller: &TeamToolCaller, args: &Value) -> Result<Value, String> {
    require_lead(caller)?;
    let timeout_ms = args
        .get("timeoutMs")
        .and_then(|v| v.as_u64())
        .unwrap_or(50);
    let node_ids: Vec<String> = args
        .get("nodeIds")
        .or_else(|| args.get("taskIds"))
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    let want_all_done = args
        .get("allDone")
        .and_then(|v| v.as_bool())
        .unwrap_or(!node_ids.is_empty());
    let deadline = now_ms().saturating_add(timeout_ms.max(1));
    loop {
        let run = snapshot(&caller.team_id)?;
        // Project ATR statuses onto nodes.
        for n in &run.nodes {
            if let Some(tid) = &n.task_id {
                if matches!(n.status.as_str(), "running" | "waiting") {
                    if let Ok(t) = super::api_status(tid) {
                        let mapped = match t.status.as_str() {
                            "done" => Some("done"),
                            "failed" | "interrupted" => Some("failed"),
                            "cancelled" => Some("cancelled"),
                            "waiting" => Some("waiting"),
                            _ => None,
                        };
                        if let Some(st) = mapped {
                            if st != n.status {
                                let _ = set_node_status(TeamNodeStatusRequest {
                                    node_id: n.node_id.clone(),
                                    status: st.into(),
                                    error: t.last_error.clone(),
                                    expected_revision: None,
                                    owner_id: None,
                                });
                            }
                        }
                    }
                }
            }
        }
        let run = snapshot(&caller.team_id)?;
        let targets: Vec<_> = if node_ids.is_empty() {
            run.nodes
                .iter()
                .filter(|n| n.role != "lead")
                .cloned()
                .collect()
        } else {
            run.nodes
                .iter()
                .filter(|n| node_ids.contains(&n.node_id))
                .cloned()
                .collect()
        };
        let all_terminal = targets.iter().all(|n| {
            matches!(
                n.status.as_str(),
                "done" | "failed" | "cancelled" | "blocked"
            )
        });
        let any_done = targets.iter().any(|n| n.status == "done");
        if want_all_done && all_terminal {
            return Ok(json!({
                "teamId": caller.team_id,
                "taskId": Value::Null,
                "status": "completed",
                "revision": 0,
                "next": "close_team",
                "nodes": targets.iter().map(|n| json!({
                    "taskId": n.node_id,
                    "status": map_db_status_to_tool(&n.status),
                    "role": n.role,
                })).collect::<Vec<_>>(),
            }));
        }
        if !want_all_done && any_done {
            return Ok(json!({
                "teamId": caller.team_id,
                "status": "running",
                "revision": 0,
                "next": "update_task",
            }));
        }
        if now_ms() >= deadline {
            return Ok(json!({
                "teamId": caller.team_id,
                "status": "running",
                "revision": 0,
                "next": "wait_for_team",
                "timedOut": true,
            }));
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}

pub fn close_team(caller: &TeamToolCaller, args: &Value) -> Result<Value, String> {
    require_lead(caller)?;
    ensure_team_writable(&caller.team_id)?;
    let summary = args
        .get("summary")
        .and_then(|v| v.as_str())
        .unwrap_or("closed");
    store::with_write(|conn| {
        ensure_schema(conn)?;
        emit(
            conn,
            &caller.team_id,
            Some(&caller.node_id),
            "team_close_requested",
            json!({"summary": summary, "source": "model"}),
        )?;
        Ok::<(), String>(())
    })?;
    let reconciled = reconcile_team(&caller.team_id)?;
    if reconciled.status == "done" && reconciled.current_phase == "complete" {
        return Ok(json!({
            "teamId": caller.team_id,
            "taskId": Value::Null,
            "status": "completed",
            "revision": 0,
            "next": "done",
            "summary": summary,
        }));
    }
    Ok(json!({
        "teamId": caller.team_id,
        "taskId": Value::Null,
        "status": "waiting",
        "revision": 0,
        "next": "reconcile_team",
        "summary": summary,
    }))
}

/// Cancel all child ATR tasks when parent TeamRun is cancelled.
pub fn cancel_team_children(team_id: &str) -> Result<(), String> {
    let run = snapshot(team_id)?;
    for n in run.nodes {
        if let Some(tid) = n.task_id {
            let _ = super::api_cancel(&tid);
        }
    }
    store::with_write(|conn| {
        ensure_schema(conn)?;
        conn.execute(
            "UPDATE team_nodes SET status='cancelled',error=COALESCE(error,'cancelled'),revision=revision+1,updated_at_ms=?1 WHERE team_id=?2 AND status NOT IN ('done','failed','cancelled')",
            params![now_ms() as i64, team_id],
        ).map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE team_runs SET status='cancelled',current_phase='cancelled',updated_at_ms=?1 WHERE team_id=?2",
            params![now_ms() as i64, team_id],
        )
        .map_err(|e| e.to_string())?;
        emit(conn, team_id, None, "team_cancelled", json!({"reason":"user"}))?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dynamic_plan_is_bounded_and_has_single_writer() {
        let roles = plan_roles("偶尔重复发送，疑似竞态");
        assert!(roles.len() <= MAX_WORKERS);
        assert_eq!(
            roles
                .iter()
                .filter(|r| **r == TeamRole::Implementer)
                .count(),
            1
        );
        assert!(roles.contains(&TeamRole::Triage));
        assert!(roles.contains(&TeamRole::TestAnalyst));
    }

    #[test]
    fn unknown_artifact_and_role_are_rejected() {
        assert!(TeamRole::parse("hacker").is_none());
        let allowed = [
            "bug_summary",
            "evidence",
            "hypothesis",
            "reproduction",
            "plan",
            "patch_review",
            "test_result",
            "blocked",
        ];
        assert!(!allowed.contains(&"shell"));
    }

    #[test]
    fn read_only_policy_excludes_only_implementer() {
        assert!(TeamRole::Explorer.is_read_only());
        assert!(TeamRole::Reviewer.is_read_only());
        assert!(TeamRole::Lead.is_read_only());
        assert!(!TeamRole::Implementer.is_read_only());
    }

    #[test]
    fn simple_bug_plan_keeps_review_and_verify_gates() {
        let roles = plan_roles("compile error in parser");
        assert!(roles.contains(&TeamRole::Implementer));
        assert!(roles.contains(&TeamRole::Reviewer));
        assert!(roles.contains(&TeamRole::Verifier));
        assert_eq!(role_permission(TeamRole::Verifier), "read_only");
    }

    #[test]
    fn snapshot_by_parent_recovers_lead_only_team() {
        let stamp = format!("team_by_parent_{}_{}", std::process::id(), now_ms());
        let db = std::env::temp_dir().join(format!("{stamp}.sqlite"));
        let root = std::env::temp_dir().join(format!("{stamp}_ws"));
        let _ = std::fs::remove_file(&db);
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        super::store::set_test_db_path(Some(db.clone()));

        let team = start(StartTeamRequest {
            goal: "recover me".into(),
            workspace_root: root.display().to_string(),
            lead_provider: None,
            materials_summary: None,
            use_fake_driver: true,
            write_scopes: vec![],
            auto_plan: false,
            autonomous_write: false,
        })
        .unwrap();
        let found = snapshot_by_parent_task(&team.parent_task_id).unwrap();
        assert_eq!(found.team_id, team.team_id);
        assert_eq!(found.parent_task_id, team.parent_task_id);

        super::store::set_test_db_path(None);
        let _ = std::fs::remove_file(db);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn suggest_roles_covers_compile_logic_and_test_fail() {
        let compile = suggest_roles("compile error in parser");
        assert!(compile.contains(&TeamRole::Implementer));
        assert!(compile.contains(&TeamRole::Reviewer));
        let logic = suggest_roles("logic bug in state machine");
        assert!(logic.contains(&TeamRole::Implementer));
        assert!(logic.contains(&TeamRole::Verifier));
        let fail = suggest_roles("unit test fail in auth");
        assert!(fail.contains(&TeamRole::Triage));
        assert!(fail.contains(&TeamRole::TestAnalyst));
        assert_eq!(default_auto_plan(), false);
    }

    #[test]
    fn fake_fixture_closes_analysis_review_verify_loop() {
        let stamp = format!("team_fixture_{}_{}", std::process::id(), now_ms());
        let db = std::env::temp_dir().join(format!("{stamp}.sqlite"));
        let root = std::env::temp_dir().join(format!("{stamp}_ws"));
        let _ = std::fs::remove_file(&db);
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        super::store::set_test_db_path(Some(db.clone()));

        let team = start(StartTeamRequest {
            goal: "compile error fixture".into(),
            workspace_root: root.display().to_string(),
            lead_provider: None,
            materials_summary: None,
            use_fake_driver: true,
            write_scopes: vec!["src".into()],
            auto_plan: true,
            autonomous_write: false,
        })
        .unwrap();
        assert!(team.nodes.iter().any(|n| n.role == "lead" && n.task_id.is_some()));
        let mut parent_driver = super::super::FakeDriver { steps: Vec::new(), idx: 0 };
        super::super::api_drive_fake(&team.parent_task_id, &mut parent_driver).unwrap();
        let analyzed = dispatch_read_only(TeamDispatchRequest {
            team_id: team.team_id.clone(),
            provider: None,
            max_steps: Some(1),
            use_fake_driver: true,
        })
        .unwrap();
        assert!(analyzed.artifacts.iter().any(|a| a.kind == "evidence"));
        let implementer = analyzed.nodes.iter().find(|n| n.role == "implementer").unwrap();
        assert_eq!(implementer.write_scopes, vec!["src"]);
        assert_eq!(implementer.revision, 0);
        let stale = set_node_status(TeamNodeStatusRequest {
            node_id: implementer.node_id.clone(),
            status: "running".into(),
            error: None,
            expected_revision: Some(99),
            owner_id: Some("stale-agent".into()),
        });
        assert!(stale.unwrap_err().contains("team_task_stale_revision"));
        let finished = advance(TeamAdvanceRequest {
            team_id: team.team_id.clone(),
            provider: None,
            max_steps: Some(1),
            use_fake_driver: true,
        })
        .unwrap();
        assert_eq!(finished.status, "done");
        assert!(finished.artifacts.iter().any(|a| a.kind == "patch_review"));
        assert!(finished.artifacts.iter().any(|a| a.kind == "test_result"));

        super::store::set_test_db_path(None);
        let _ = std::fs::remove_file(db);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn lead_only_start_and_dynamic_tools() {
        let stamp = format!("team_dyn_{}_{}", std::process::id(), now_ms());
        let db = std::env::temp_dir().join(format!("{stamp}.sqlite"));
        let root = std::env::temp_dir().join(format!("{stamp}_ws"));
        let _ = std::fs::remove_file(&db);
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        super::store::set_test_db_path(Some(db.clone()));

        let team = start(StartTeamRequest {
            goal: "compile error in parser".into(),
            workspace_root: root.display().to_string(),
            lead_provider: None,
            materials_summary: None,
            use_fake_driver: true,
            write_scopes: vec!["src".into()],
            auto_plan: false,
            autonomous_write: false,
        })
        .unwrap();
        assert_eq!(team.nodes.iter().filter(|n| n.role != "lead").count(), 0);
        let lead = team.nodes.iter().find(|n| n.role == "lead").unwrap();
        let caller = TeamToolCaller {
            team_id: team.team_id.clone(),
            node_id: lead.node_id.clone(),
            role: "lead".into(),
            atr_task_id: team.parent_task_id.clone(),
            is_lead: true,
        };
        let created = create_task_tool(
            &caller,
            &json!({"role":"explorer","subject":"find files","description":"scan"}),
        )
        .unwrap();
        let explorer_id = created.get("taskId").and_then(|v| v.as_str()).unwrap().to_string();
        let bad = create_task_tool(&caller, &json!({"role":"hacker","subject":"x"}));
        assert!(bad.unwrap_err().contains("invalid_team_role"));
        let spawned = spawn_teammate(
            &caller,
            &json!({"taskId": explorer_id, "useFakeDriver": true, "maxSteps": 1}),
        )
        .unwrap();
        assert!(spawned.get("atrTaskId").is_some() || spawned.get("sessionId").is_some());
        let closed = close_team(&caller, &json!({"summary":"ok"})).unwrap();
        assert_eq!(closed.get("status").and_then(|v| v.as_str()), Some("waiting"));
        let again = create_task_tool(&caller, &json!({"role":"triage","subject":"x"}));
        assert!(again.is_ok());

        super::store::set_test_db_path(None);
        let _ = std::fs::remove_file(db);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn second_implementer_and_stale_claim_rejected() {
        let stamp = format!("team_pol_{}_{}", std::process::id(), now_ms());
        let db = std::env::temp_dir().join(format!("{stamp}.sqlite"));
        let root = std::env::temp_dir().join(format!("{stamp}_ws"));
        let _ = std::fs::remove_file(&db);
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        super::store::set_test_db_path(Some(db.clone()));

        let team = start(StartTeamRequest {
            goal: "logic bug".into(),
            workspace_root: root.display().to_string(),
            lead_provider: None,
            materials_summary: None,
            use_fake_driver: true,
            write_scopes: vec![],
            auto_plan: false,
            autonomous_write: false,
        })
        .unwrap();
        let lead = team.nodes.iter().find(|n| n.role == "lead").unwrap();
        let caller = TeamToolCaller {
            team_id: team.team_id.clone(),
            node_id: lead.node_id.clone(),
            role: "lead".into(),
            atr_task_id: team.parent_task_id.clone(),
            is_lead: true,
        };
        create_task_tool(&caller, &json!({"role":"implementer","subject":"fix"})).unwrap();
        let second = create_task_tool(&caller, &json!({"role":"implementer","subject":"again"}));
        assert!(second.unwrap_err().contains("team_single_writer_violation"));
        let explorer = create_task_tool(&caller, &json!({"role":"explorer","subject":"e"})).unwrap();
        let eid = explorer.get("taskId").and_then(|v| v.as_str()).unwrap().to_string();
        let worker = TeamToolCaller {
            team_id: team.team_id.clone(),
            node_id: eid.clone(),
            role: "explorer".into(),
            atr_task_id: "fake-worker".into(),
            is_lead: false,
        };
        let reassign = reassign_task(&worker, &json!({"taskId": eid, "ownerId": "x"}));
        assert!(reassign.unwrap_err().contains("team_lead_only"));

        super::store::set_test_db_path(None);
        let _ = std::fs::remove_file(db);
        let _ = std::fs::remove_dir_all(root);
    }
}
