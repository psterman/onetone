//! Loopback Team task-board bridge for external orchestrators.
//! Default is off. The bridge only exposes durable Team task operations and never exposes
//! file, shell, or provider credentials.

use std::io::{Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::agent_task_runtime::{
    api_team_add_artifact, api_team_set_node_status, api_team_snapshot, api_team_start,
    api_team_advance, api_team_confirm_plan, api_team_dispatch_read_only, api_team_events, api_team_task_create,
    api_team_task_get, api_team_task_list, TeamArtifactRequest, TeamIdRequest,
    StartTeamRequest, TeamAdvanceRequest, TeamConfirmPlanRequest, TeamDispatchRequest,
    TeamNodeStatusRequest, TeamTaskCreateRequest, TeamTaskIdRequest, TeamTaskListRequest,
    TeamEventsRequest,
};

const DEFAULT_PORT: u16 = 8797;
const MAX_BODY: usize = 256 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamBridgeStartRequest {
    #[serde(default)]
    pub port: Option<u16>,
    pub token: Option<String>,
    /// When true, stop + mint a new token even if already running.
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamBridgeStatus {
    pub enabled: bool,
    pub url: String,
    pub authenticated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamBridgeStartResult {
    pub ok: bool,
    pub url: String,
    pub token: String,
}

struct Runtime {
    enabled: bool,
    port: u16,
    token: String,
    stop: std::sync::Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

fn runtime() -> &'static Mutex<Runtime> {
    static RUNTIME: OnceLock<Mutex<Runtime>> = OnceLock::new();
    RUNTIME.get_or_init(|| {
        Mutex::new(Runtime {
            enabled: false,
            port: 0,
            token: String::new(),
            stop: std::sync::Arc::new(AtomicBool::new(true)),
            join: None,
        })
    })
}

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

fn make_token() -> String {
    format!("ot-team-{}-{}", now_ms(), std::process::id())
}

pub fn start(req: TeamBridgeStartRequest) -> Result<TeamBridgeStartResult, String> {
    let want_port = req.port.unwrap_or(DEFAULT_PORT);
    // Idempotent: re-start was minting a new token and killing live SSE streams.
    if !req.force {
        let state = runtime().lock().map_err(|_| "team_bridge_lock".to_string())?;
        if state.enabled && !state.token.is_empty() && state.port == want_port {
            let keep = match &req.token {
                Some(t) if !t.trim().is_empty() => t.trim() == state.token,
                _ => true,
            };
            if keep {
                return Ok(TeamBridgeStartResult {
                    ok: true,
                    url: format!("http://127.0.0.1:{}", state.port),
                    token: state.token.clone(),
                });
            }
        }
    }
    stop()?;
    let port = want_port;
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| format!("team_bridge_bind: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| format!("team_bridge_nonblocking: {e}"))?;
    let token = req.token.filter(|t| !t.trim().is_empty()).unwrap_or_else(make_token);
    let stop_flag = std::sync::Arc::new(AtomicBool::new(false));
    let thread_stop = stop_flag.clone();
    let thread_token = token.clone();
    let join = thread::spawn(move || {
        while !thread_stop.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let token = thread_token.clone();
                    thread::spawn(move || { let _ = handle_stream(stream, &token); });
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(std::time::Duration::from_millis(30));
                }
                Err(_) => break,
            }
        }
    });
    let url = format!("http://127.0.0.1:{port}");
    let mut state = runtime().lock().map_err(|_| "team_bridge_lock".to_string())?;
    state.enabled = true;
    state.port = port;
    state.token = token.clone();
    state.stop = stop_flag;
    state.join = Some(join);
    Ok(TeamBridgeStartResult { ok: true, url, token })
}

pub fn stop() -> Result<(), String> {
    let join = {
        let mut state = runtime().lock().map_err(|_| "team_bridge_lock".to_string())?;
        if !state.enabled && state.join.is_none() { return Ok(()); }
        state.stop.store(true, Ordering::SeqCst);
        state.enabled = false;
        state.token.clear();
        state.join.take()
    };
    if let Some(handle) = join { let _ = handle.join(); }
    Ok(())
}

pub fn status() -> TeamBridgeStatus {
    let state = runtime().lock().unwrap_or_else(|e| e.into_inner());
    TeamBridgeStatus {
        enabled: state.enabled,
        url: if state.port == 0 { String::new() } else { format!("http://127.0.0.1:{}", state.port) },
        authenticated: state.enabled && !state.token.is_empty(),
    }
}

fn handle_stream(mut stream: TcpStream, token: &str) -> Result<(), String> {
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
    let mut raw = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        raw.extend_from_slice(&buf[..n]);
        if raw.len() > MAX_BODY + 16 * 1024 { return respond(&mut stream, 413, json!({"error":"body_too_large"})); }
        if raw.windows(4).any(|w| w == b"\r\n\r\n") {
            let header_end = raw.windows(4).position(|w| w == b"\r\n\r\n").unwrap() + 4;
            let content_length = header_value(&raw[..header_end], "content-length").and_then(|v| v.parse::<usize>().ok()).unwrap_or(0);
            if raw.len() >= header_end + content_length { break; }
        }
    }
    let header_end = raw.windows(4).position(|w| w == b"\r\n\r\n").ok_or("invalid_http")? + 4;
    let headers = String::from_utf8_lossy(&raw[..header_end]);
    if header_value(headers.as_bytes(), "x-onetone-team-token").as_deref() != Some(token) {
        return respond(&mut stream, 401, json!({"error":"unauthorized"}));
    }
    let request_line = headers.lines().next().unwrap_or("");
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("");
    if method == "GET" && path == "/health" { return respond(&mut stream, 200, json!({"ok":true,"service":"onetone-team"})); }
    if method == "GET" && path.starts_with("/v1/team/events/stream") {
        let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
        let mut team_id = String::new();
        let mut after = None;
        for pair in query.split('&') {
            let Some((k, v)) = pair.split_once('=') else { continue; };
            if k == "teamId" { team_id = v.to_string(); }
            if k == "after" { after = Some(v.to_string()); }
        }
        if team_id.is_empty() { return respond(&mut stream, 400, json!({"error":"teamId_required"})); }
        return respond_sse(&mut stream, &team_id, after);
    }
    let body = &raw[header_end..];
    let value: Value = if body.is_empty() { json!({}) } else { serde_json::from_slice(body).map_err(|_| "invalid_json".to_string())? };
    let result = match (method, path) {
        ("POST", "/v1/team/start") => {
            let req: StartTeamRequest = serde_json::from_value(value).map_err(|e| e.to_string())?;
            serde_json::to_value(api_team_start(req)).map_err(|e| e.to_string())?
        }
        ("POST", "/v1/team/confirm-plan") => {
            let req: TeamConfirmPlanRequest = serde_json::from_value(value).map_err(|e| e.to_string())?;
            serde_json::to_value(api_team_confirm_plan(req)).map_err(|e| e.to_string())?
        }
        ("POST", "/v1/team/dispatch-read-only") => {
            let req: TeamDispatchRequest = serde_json::from_value(value).map_err(|e| e.to_string())?;
            serde_json::to_value(api_team_dispatch_read_only(req)).map_err(|e| e.to_string())?
        }
        ("POST", "/v1/team/advance") => {
            let req: TeamAdvanceRequest = serde_json::from_value(value).map_err(|e| e.to_string())?;
            serde_json::to_value(api_team_advance(req)).map_err(|e| e.to_string())?
        }
        ("POST", "/v1/team/tasks/get") => {
            let req: TeamTaskIdRequest = serde_json::from_value(value).map_err(|e| e.to_string())?;
            serde_json::to_value(api_team_task_get(req)).map_err(|e| e.to_string())?
        }
        ("POST", "/v1/team/tasks/create") => {
            let req: TeamTaskCreateRequest = serde_json::from_value(value).map_err(|e| e.to_string())?;
            serde_json::to_value(api_team_task_create(req)).map_err(|e| e.to_string())?
        }
        ("POST", "/v1/team/tasks/list") => {
            let req: TeamTaskListRequest = serde_json::from_value(value).map_err(|e| e.to_string())?;
            serde_json::to_value(api_team_task_list(req)).map_err(|e| e.to_string())?
        }
        ("POST", "/v1/team/events") => {
            let req: TeamEventsRequest = serde_json::from_value(value).map_err(|e| e.to_string())?;
            serde_json::to_value(api_team_events(req)).map_err(|e| e.to_string())?
        }
        ("POST", "/v1/team/snapshot") => {
            let req: TeamIdRequest = serde_json::from_value(value).map_err(|e| e.to_string())?;
            serde_json::to_value(api_team_snapshot(&req.team_id)).map_err(|e| e.to_string())?
        }
        ("POST", "/v1/team/tasks/update") => {
            let req: TeamNodeStatusRequest = serde_json::from_value(value).map_err(|e| e.to_string())?;
            serde_json::to_value(api_team_set_node_status(req)).map_err(|e| e.to_string())?
        }
        ("POST", "/v1/team/artifacts") => {
            let req: TeamArtifactRequest = serde_json::from_value(value).map_err(|e| e.to_string())?;
            serde_json::to_value(api_team_add_artifact(req)).map_err(|e| e.to_string())?
        }
        _ => return respond(&mut stream, 404, json!({"error":"not_found"})),
    };
    respond(&mut stream, 200, result)
}

fn header_value(raw: &[u8], wanted: &str) -> Option<String> {
    let text = String::from_utf8_lossy(raw);
    text.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.trim().eq_ignore_ascii_case(wanted) { Some(value.trim().to_string()) } else { None }
    })
}

fn respond(stream: &mut TcpStream, status: u16, value: Value) -> Result<(), String> {
    let body = value.to_string();
    let response = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
    stream.write_all(response.as_bytes()).map_err(|e| e.to_string())?;
    let _ = stream.shutdown(Shutdown::Both);
    Ok(())
}

fn respond_sse(stream: &mut TcpStream, team_id: &str, mut after: Option<String>) -> Result<(), String> {
    stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n").map_err(|e| e.to_string())?;
    for _ in 0..120 {
        let batch = api_team_events(TeamEventsRequest { team_id: team_id.to_string(), after: after.clone(), limit: Some(100) })?;
        for event in batch {
            let payload = serde_json::to_string(&event).map_err(|e| e.to_string())?;
            stream.write_all(format!("id: {}\nevent: team\ndata: {}\n\n", event.event_id, payload).as_bytes()).map_err(|e| e.to_string())?;
            after = Some(event.event_id);
        }
        stream.write_all(b": keep-alive\n\n").map_err(|e| e.to_string())?;
        stream.flush().map_err(|e| e.to_string())?;
        thread::sleep(std::time::Duration::from_millis(500));
    }
    let _ = stream.shutdown(Shutdown::Both);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_is_off_by_default_and_token_is_nonempty() {
        let _ = stop();
        assert!(!status().enabled);
        assert!(make_token().starts_with("ot-team-"));
    }

    #[test]
    fn start_is_idempotent_keeps_token() {
        let _ = stop();
        let a = start(TeamBridgeStartRequest {
            port: Some(18797),
            token: Some("ot-team-fixed-test".into()),
            force: false,
        })
        .unwrap();
        let b = start(TeamBridgeStartRequest {
            port: Some(18797),
            token: None,
            force: false,
        })
        .unwrap();
        assert_eq!(a.token, b.token);
        assert_eq!(a.url, b.url);
        let c = start(TeamBridgeStartRequest {
            port: Some(18797),
            token: None,
            force: true,
        })
        .unwrap();
        assert_ne!(a.token, c.token);
        let _ = stop();
    }
}
