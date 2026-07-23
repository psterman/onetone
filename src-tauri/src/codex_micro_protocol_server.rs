//! Labs / acceptance loopback HTTP entry for Codex Micro **status** RPC.
//!
//! - **Default: OFF.** Normal users never get this listener.
//! - Optional auto-start only when `ONETONE_CODEX_MICRO_PROTOCOL=1` (Labs/验收).
//! - Bind: `127.0.0.1` only. CORS `*` OK (loopback Labs; not a public surface).
//! - Methods: status only (`thstatus` / `rgbcfg` / `lights.preview` / `device.status` / `sys.version`).
//! - Never accepts `v.oai.hid` / `v.oai.rad` over HTTP (no remote key injection).

use std::io::{Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;

use crate::codex_app_state;
use crate::codex_micro_overlay::{self, CodexMicroOverlaySnapshot};
use crate::AppState;

pub const DEFAULT_PORT: u16 = 8796;
pub const MAX_BODY_BYTES: usize = 16 * 1024;
pub const PROTOCOL_PATH: &str = "/api/codex-micro/protocol";
pub const APP_STATE_PATH: &str = codex_app_state::APP_STATE_PATH;

/// Env flag: Labs/验收 only. When set to `1`/`true`/`yes`, setup may auto-start the listener.
pub const ENV_ENABLE: &str = "ONETONE_CODEX_MICRO_PROTOCOL";
pub const ENV_PORT: &str = "ONETONE_CODEX_MICRO_PROTOCOL_PORT";

const ALLOWED_METHODS: &[&str] = &[
    "v.oai.thstatus",
    "v.oai.rgbcfg",
    "lights.preview",
    "device.status",
    "sys.version",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolServerStatus {
    pub enabled: bool,
    pub url: String,
    /// Always true in docs/UI: this surface is Labs/acceptance, not a product feature.
    pub labs_only: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolServerStartResult {
    pub ok: bool,
    pub url: String,
    pub labs_only: bool,
}

struct Runtime {
    enabled: bool,
    port: u16,
    url: String,
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

fn runtime() -> &'static Mutex<Runtime> {
    static RT: OnceLock<Mutex<Runtime>> = OnceLock::new();
    RT.get_or_init(|| {
        Mutex::new(Runtime {
            enabled: false,
            port: 0,
            url: String::new(),
            stop: Arc::new(AtomicBool::new(true)),
            join: None,
        })
    })
}

/// True when method is allowed on the HTTP status surface.
pub fn allowed_http_method(method: &str) -> bool {
    let m = method.trim();
    ALLOWED_METHODS.iter().any(|x| *x == m)
}

/// HTTP must never accept action methods.
pub fn is_http_action_method(method: &str) -> bool {
    matches!(method.trim(), "v.oai.hid" | "v.oai.rad")
}

/// Validate body: non-empty, ≤16KB, JSON object, allowed method.
/// Returns method name on success.
pub fn validate_protocol_body(raw: &str) -> Result<String, &'static str> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("empty_body");
    }
    if trimmed.len() > MAX_BODY_BYTES {
        return Err("body_too_large");
    }
    let value: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|_| "invalid_json")?;
    let obj = value.as_object().ok_or("invalid_json")?;
    let method = obj
        .get("m")
        .or_else(|| obj.get("method"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or("invalid_method")?;
    if is_http_action_method(method) || !allowed_http_method(method) {
        return Err("invalid_method");
    }
    Ok(method.to_string())
}

pub fn resolve_port(explicit: Option<u16>) -> u16 {
    if let Some(p) = explicit {
        if p > 0 {
            return p;
        }
    }
    std::env::var(ENV_PORT)
        .ok()
        .and_then(|s| s.trim().parse::<u16>().ok())
        .filter(|p| *p > 0)
        .unwrap_or(DEFAULT_PORT)
}

/// Labs/验收: env requests auto-start. Default users never hit this.
pub fn env_requests_autostart() -> bool {
    match std::env::var(ENV_ENABLE) {
        Ok(v) => {
            let t = v.trim().to_ascii_lowercase();
            t == "1" || t == "true" || t == "yes" || t == "on"
        }
        Err(_) => false,
    }
}

pub fn status() -> ProtocolServerStatus {
    let g = runtime().lock().unwrap();
    ProtocolServerStatus {
        enabled: g.enabled,
        url: g.url.clone(),
        labs_only: true,
    }
}

pub fn stop() -> Result<(), String> {
    let mut g = runtime().lock().unwrap();
    if !g.enabled && g.join.is_none() {
        return Ok(());
    }
    g.stop.store(true, Ordering::SeqCst);
    // Unblock accept by connecting to self.
    if g.port > 0 {
        let _ = TcpStream::connect_timeout(
            &std::net::SocketAddr::from(([127, 0, 0, 1], g.port)),
            Duration::from_millis(200),
        );
    }
    let join = g.join.take();
    g.enabled = false;
    g.url.clear();
    let port = g.port;
    g.port = 0;
    drop(g);
    if let Some(h) = join {
        let _ = h.join();
    }
    let _ = port;
    Ok(())
}

pub fn start(
    app: AppHandle,
    state: Arc<AppState>,
    port: Option<u16>,
) -> Result<ProtocolServerStartResult, String> {
    let port = resolve_port(port);
    {
        let g = runtime().lock().unwrap();
        if g.enabled && g.port == port && !g.stop.load(Ordering::SeqCst) {
            return Ok(ProtocolServerStartResult {
                ok: true,
                url: g.url.clone(),
                labs_only: true,
            });
        }
    }
    let _ = stop();

    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AddrInUse {
            "port_in_use".to_string()
        } else {
            format!("bind_failed:{e}")
        }
    })?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("bind_failed:{e}"))?;

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_thread = Arc::clone(&stop_flag);
    let url = format!("http://127.0.0.1:{port}{PROTOCOL_PATH}");
    let url_thread = url.clone();

    let join = thread::Builder::new()
        .name("codex-micro-protocol-http".into())
        .spawn(move || {
            serve_loop(listener, stop_thread, app, state);
        })
        .map_err(|e| format!("spawn_failed:{e}"))?;

    let mut g = runtime().lock().unwrap();
    g.enabled = true;
    g.port = port;
    g.url = url.clone();
    g.stop = stop_flag;
    g.join = Some(join);
    drop(g);

    eprintln!(
        "[codex-micro-protocol] Labs/验收 loopback listening on {url_thread} (status RPC only; hid/rad rejected)"
    );

    Ok(ProtocolServerStartResult {
        ok: true,
        url,
        labs_only: true,
    })
}

/// Apply a validated status RPC and refresh overlay (caller must be on the main/UI thread).
pub fn apply_status_rpc(
    app: &AppHandle,
    state: &AppState,
    raw: &str,
) -> Result<CodexMicroOverlaySnapshot, String> {
    let method = validate_protocol_body(raw)?;
    let _ = method;
    crate::codex_micro_vendor::apply_rpc_json(raw);
    // Status lights only — avoid layout thrash.
    codex_micro_overlay::push_overlay_status(app, state);
    Ok(codex_micro_overlay::build_snapshot(state))
}


/// HTTP serve thread entry — vendor store is lock-safe; overlay push is fire-and-forget on UI thread.
fn apply_status_rpc_from_http(
    app: &AppHandle,
    state: Arc<AppState>,
    raw: &str,
) -> Result<CodexMicroOverlaySnapshot, String> {
    validate_protocol_body(raw)?;
    crate::codex_micro_vendor::apply_rpc_json(raw);
    let snapshot = codex_micro_overlay::build_snapshot(state.as_ref());
    let app2 = app.clone();
    let state2 = Arc::clone(&state);
    let _ = app.run_on_main_thread(move || {
        codex_micro_overlay::push_overlay_status(&app2, state2.as_ref());
    });
    Ok(snapshot)
}

fn serve_loop(
    listener: TcpListener,
    stop: Arc<AtomicBool>,
    app: AppHandle,
    state: Arc<AppState>,
) {
    while !stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream, _)) => {
                if stop.load(Ordering::SeqCst) {
                    let _ = stream.shutdown(Shutdown::Both);
                    break;
                }
                // Concurrent handlers — one wedged main-thread RPC must not block Hook POSTs.
                let app_c = app.clone();
                let state_c = Arc::clone(&state);
                let _ = thread::Builder::new()
                    .name("codex-micro-http".into())
                    .spawn(move || {
                        if let Err(err) = handle_client(stream, &app_c, state_c) {
                            eprintln!("[codex-micro-protocol] request error: {err}");
                        }
                    });
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(40));
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => {
                eprintln!("[codex-micro-protocol] accept: {e}");
                thread::sleep(Duration::from_millis(100));
            }
        }
    }
}

fn handle_client(mut stream: TcpStream, app: &AppHandle, state: Arc<AppState>) -> Result<(), String> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));

    let mut buf = Vec::with_capacity(4096);
    let mut tmp = [0u8; 1024];
    let header_end;
    loop {
        let n = stream.read(&mut tmp).map_err(|e| e.to_string())?;
        if n == 0 {
            return Ok(());
        }
        buf.extend_from_slice(&tmp[..n]);
        if buf.len() > MAX_BODY_BYTES + 8192 {
            write_error(&mut stream, 413, "body_too_large")?;
            return Ok(());
        }
        if let Some(pos) = find_header_end(&buf) {
            header_end = pos;
            break;
        }
    }

    let header = std::str::from_utf8(&buf[..header_end]).unwrap_or("");
    let (method, path) = parse_request_line(header).unwrap_or(("", ""));

    if method.eq_ignore_ascii_case("OPTIONS") {
        write_raw(
            &mut stream,
            204,
            "No Content",
            &format!("{}\r\nAllow: GET, POST, OPTIONS\r\n", cors_headers()),
            b"",
        )?;
        return Ok(());
    }

    let is_protocol = path == PROTOCOL_PATH;
    let is_app_state = path == APP_STATE_PATH;
    if !is_protocol && !is_app_state {
        write_error(&mut stream, 404, "not_found")?;
        return Ok(());
    }

    if method.eq_ignore_ascii_case("GET") {
        if is_app_state {
            return handle_app_state_get(&mut stream, Arc::clone(&state));
        }
        write_error(&mut stream, 405, "not_found")?;
        return Ok(());
    }

    if !method.eq_ignore_ascii_case("POST") {
        write_error(&mut stream, 405, "not_found")?;
        return Ok(());
    }

    let content_length = parse_content_length(header).unwrap_or(0);
    if content_length > MAX_BODY_BYTES {
        write_error(&mut stream, 413, "body_too_large")?;
        return Ok(());
    }

    let mut body = buf[header_end..].to_vec();
    while body.len() < content_length {
        let n = stream.read(&mut tmp).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&tmp[..n]);
        if body.len() > MAX_BODY_BYTES {
            write_error(&mut stream, 413, "body_too_large")?;
            return Ok(());
        }
    }
    body.truncate(content_length);
    let raw = String::from_utf8(body).map_err(|_| "invalid_json".to_string())?;

    if is_app_state {
        return handle_app_state_post(&mut stream, app, state, &raw);
    }

    match validate_protocol_body(&raw) {
        Ok(rpc_method) => match apply_status_rpc_from_http(app, state, &raw) {
            Ok(snapshot) => {
                eprintln!("[codex-micro-protocol] ok method={rpc_method}");
                let payload = serde_json::json!({ "ok": true, "snapshot": snapshot });
                let bytes = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;
                write_raw(
                    &mut stream,
                    200,
                    "OK",
                    &format!(
                        "{}Content-Type: application/json; charset=utf-8\r\n",
                        cors_headers()
                    ),
                    &bytes,
                )?;
            }
            Err(code) => {
                eprintln!("[codex-micro-protocol] fail method={rpc_method} err={code}");
                write_error(&mut stream, 400, &code)?;
            }
        },
        Err(code) => {
            eprintln!("[codex-micro-protocol] reject err={code}");
            let status = if code == "body_too_large" { 413 } else { 400 };
            write_error(&mut stream, status, code)?;
        }
    }
    Ok(())
}

fn handle_app_state_get(
    stream: &mut TcpStream,
    state: Arc<AppState>,
) -> Result<(), String> {
    let view = codex_app_state::snapshot();
    let lights = {
        let cfg = state.cfg.lock();
        codex_micro_overlay::status_lights_enabled(&cfg)
    };
    let payload = serde_json::json!({
        "ok": true,
        "disabled": !lights,
        "appStateEnabled": lights,
        "state": view
    });
    let bytes = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;
    write_raw(
        stream,
        200,
        "OK",
        &format!(
            "{}Content-Type: application/json; charset=utf-8\r\n",
            cors_headers()
        ),
        &bytes,
    )?;
    Ok(())
}

fn handle_app_state_post(
    stream: &mut TcpStream,
    app: &AppHandle,
    state: Arc<AppState>,
    raw: &str,
) -> Result<(), String> {
    match apply_app_state_from_http(app, state, raw) {
        Ok((view, lights_enabled)) => {
            eprintln!(
                "[codex-app-state] ok source={} event={} status={} lights={}",
                view.source, view.event, view.status, lights_enabled
            );
            let payload = serde_json::json!({
                "ok": true,
                "disabled": !lights_enabled,
                "appStateEnabled": lights_enabled,
                "state": view
            });
            let bytes = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;
            write_raw(
                stream,
                200,
                "OK",
                &format!(
                    "{}Content-Type: application/json; charset=utf-8\r\n",
                    cors_headers()
                ),
                &bytes,
            )?;
        }
        Err(code) => {
            eprintln!("[codex-app-state] reject err={code}");
            let status = if code == "body_too_large" { 413 } else { 400 };
            write_error(stream, status, &code)?;
        }
    }
    Ok(())
}

fn apply_app_state_from_http(
    app: &AppHandle,
    state: Arc<AppState>,
    raw: &str,
) -> Result<(codex_app_state::CodexAppStateView, bool), String> {
    let payload = codex_app_state::validate_app_state_body(raw).map_err(|e| e.to_string())?;
    // Apply off the UI thread — Hook POST must not wait on a wedged WebView main loop
    // (that was causing PermissionRequest to time out while the pad stayed "running" and blocked the dialog).
    let view = codex_app_state::apply_payload(&payload);
    let lights = {
        let cfg = state.cfg.lock();
        codex_micro_overlay::status_lights_enabled(&cfg)
    };
    let pass = lights
        && view.status == "needs_input"
        && (view.last_source == "codex_hook" || view.last_source == "codex_app");
    codex_micro_overlay::set_overlay_click_through(pass);

    // Best-effort UI refresh; never block the Hook HTTP response on it.
    let app2 = app.clone();
    let state2 = Arc::clone(&state);
    let _ = app.run_on_main_thread(move || {
        codex_micro_overlay::push_overlay_status(&app2, state2.as_ref());
    });
    Ok((view, lights))
}

fn find_header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4)
        .position(|w| w == b"\r\n\r\n")
        .map(|i| i + 4)
}

fn parse_request_line(header: &str) -> Option<(&str, &str)> {
    let line = header.lines().next()?;
    let mut parts = line.split_whitespace();
    let method = parts.next()?;
    let path = parts.next()?;
    // Strip query
    let path = path.split('?').next().unwrap_or(path);
    Some((method, path))
}

fn parse_content_length(header: &str) -> Option<usize> {
    for line in header.lines().skip(1) {
        let lower = line.to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix("content-length:") {
            return rest.trim().parse().ok();
        }
    }
    None
}

fn cors_headers() -> String {
    // Loopback Labs only (bound 127.0.0.1). Wildcard so overlay (tauri.localhost /
    // localhost:1420) and acceptance (:8766) can poll / POST without CORS blocks.
    "Access-Control-Allow-Origin: *\r\n\
     Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
     Access-Control-Allow-Headers: Content-Type\r\n"
        .to_string()
}

fn write_error(stream: &mut TcpStream, status: u16, code: &str) -> Result<(), String> {
    let body = serde_json::json!({ "ok": false, "error": code });
    let bytes = serde_json::to_vec(&body).map_err(|e| e.to_string())?;
    let reason = match status {
        204 => "No Content",
        400 => "Bad Request",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Payload Too Large",
        _ => "Error",
    };
    write_raw(
        stream,
        status,
        reason,
        &format!(
            "{}Content-Type: application/json; charset=utf-8\r\n",
            cors_headers()
        ),
        &bytes,
    )
}

fn write_raw(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    extra_headers: &str,
    body: &[u8],
) -> Result<(), String> {
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\n{extra_headers}\r\n",
        body.len()
    );
    stream.write_all(head.as_bytes()).map_err(|e| e.to_string())?;
    if !body.is_empty() {
        stream.write_all(body).map_err(|e| e.to_string())?;
    }
    let _ = stream.flush();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codex_micro_vendor;

    #[test]
    fn whitelist_status_only_rejects_hid_rad() {
        assert!(allowed_http_method("v.oai.thstatus"));
        assert!(allowed_http_method("v.oai.rgbcfg"));
        assert!(allowed_http_method("lights.preview"));
        assert!(allowed_http_method("device.status"));
        assert!(allowed_http_method("sys.version"));
        assert!(!allowed_http_method("v.oai.hid"));
        assert!(!allowed_http_method("v.oai.rad"));
        assert!(is_http_action_method("v.oai.hid"));
        assert!(is_http_action_method("v.oai.rad"));
    }

    #[test]
    fn validate_rejects_non_object_and_actions() {
        assert_eq!(validate_protocol_body(""), Err("empty_body"));
        assert_eq!(validate_protocol_body("[]"), Err("invalid_json"));
        assert_eq!(validate_protocol_body("\"x\""), Err("invalid_json"));
        assert_eq!(
            validate_protocol_body(r#"{"m":"v.oai.hid","p":{"k":"AG00","act":1}}"#),
            Err("invalid_method")
        );
        assert_eq!(
            validate_protocol_body(r#"{"m":"v.oai.rad","p":{"a":0,"d":1}}"#),
            Err("invalid_method")
        );
        assert_eq!(
            validate_protocol_body(r#"{"m":"unknown.method","p":{}}"#),
            Err("invalid_method")
        );
        assert!(validate_protocol_body(
            r#"{"m":"v.oai.thstatus","p":{"slots":[{"i":0,"s":"running"}]}}"#
        )
        .is_ok());
    }

    #[test]
    fn validate_rejects_oversized_body() {
        let big = format!(
            "{{\"m\":\"v.oai.thstatus\",\"p\":{{\"s\":\"{}\"}}}}",
            "x".repeat(MAX_BODY_BYTES)
        );
        assert_eq!(validate_protocol_body(&big), Err("body_too_large"));
    }

    #[test]
    fn thstatus_body_updates_native_slots() {
        let _g = codex_micro_vendor::test_protocol_lock();
        codex_micro_vendor::reset_protocol_state();
        let raw = r#"{"m":"v.oai.thstatus","p":{"slots":[{"i":0,"s":"running"},{"i":1,"s":"needs_input"}]}}"#;
        assert!(validate_protocol_body(raw).is_ok());
        let _ = codex_micro_vendor::apply_rpc_json(raw);
        let snap = codex_micro_vendor::protocol_snapshot();
        assert_eq!(snap.connection_state, "connected");
        assert_eq!(
            snap.agent_slots[0].as_ref().map(|s| s.state.as_str()),
            Some("running")
        );
        assert_eq!(
            snap.agent_slots[1].as_ref().map(|s| s.state.as_str()),
            Some("needs_input")
        );
        assert!(codex_micro_vendor::native_fresh(&snap));
    }

    #[test]
    fn stop_when_disabled_is_ok() {
        let _ = stop();
        assert!(!status().enabled);
        assert!(stop().is_ok());
        assert!(!status().enabled);
        assert!(status().labs_only);
    }

    #[test]
    fn resolve_port_defaults() {
        assert_eq!(resolve_port(Some(8796)), 8796);
        assert_eq!(resolve_port(Some(0)), DEFAULT_PORT);
        let st = status();
        assert!(st.labs_only);
        assert!(!st.enabled);
    }

    #[test]
    fn app_state_path_is_separate_from_protocol() {
        assert_ne!(PROTOCOL_PATH, APP_STATE_PATH);
        assert_eq!(APP_STATE_PATH, "/api/codex-app/state");
        assert!(codex_app_state::validate_app_state_body(
            r#"{"source":"codex_hook","event":"UserPromptSubmit"}"#
        )
        .is_ok());
        assert_eq!(
            codex_app_state::validate_app_state_body(r#"{"m":"v.oai.hid","p":{}}"#).err(),
            Some("invalid_method")
        );
    }
}
