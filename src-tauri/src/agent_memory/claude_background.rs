//! Claude Code background session probe / stop — Agent Center control plane evidence.
//!
//! Production parser: `[]` → Ok+empty; any non-empty array → ParseError until a verified
//! active fixture lands. Resolver consumes typed `ClaudeBackgroundProbe` only (no IO).

use crate::agent_memory::store::now_ms;
use crate::claude_cli_cmd::claude_command_spec;
use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

pub const PROBE_TTL_MS: u64 = 3_000;
const PROBE_TIMEOUT: Duration = Duration::from_secs(3);
const STOP_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_OUTPUT_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProbePolicy {
    Cached,
    ForceFresh,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClaudeProbeState {
    Ok,
    CliUnavailable,
    Timeout,
    CommandFailed,
    ParseError,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaudeBackgroundSession {
    pub external_session_id: String,
    pub active: bool,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaudeBackgroundProbe {
    pub state: ClaudeProbeState,
    pub sessions: Vec<ClaudeBackgroundSession>,
    pub observed_at: u64,
    pub fresh_until: u64,
    pub confidence: String,
}

impl ClaudeBackgroundProbe {
    pub fn error_state(state: ClaudeProbeState, observed_at: u64) -> Self {
        Self {
            state,
            sessions: Vec::new(),
            observed_at,
            fresh_until: observed_at.saturating_add(PROBE_TTL_MS),
            confidence: "low".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClaudeRunError {
    Unavailable,
    Timeout,
    CommandFailed { detail: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClaudeStopError {
    Unavailable,
    Timeout,
    CommandFailed { detail: String },
}

pub trait ClaudeProbeRunner: Send + Sync {
    fn probe_agents_json(&self) -> Result<String, ClaudeRunError>;
    fn stop_session(&self, external_session_id: &str) -> Result<(), ClaudeStopError>;

    /// Default: JSON probe + parse. Tests may override with typed evidence.
    fn probe_evidence(&self, now: u64) -> ClaudeBackgroundProbe {
        match self.probe_agents_json() {
            Ok(raw) => match parse_agents_json(&raw) {
                Ok(sessions) => ClaudeBackgroundProbe {
                    state: ClaudeProbeState::Ok,
                    sessions,
                    observed_at: now,
                    fresh_until: now.saturating_add(PROBE_TTL_MS),
                    confidence: "high".into(),
                },
                Err(st) => ClaudeBackgroundProbe::error_state(st, now),
            },
            Err(ClaudeRunError::Unavailable) => {
                ClaudeBackgroundProbe::error_state(ClaudeProbeState::CliUnavailable, now)
            }
            Err(ClaudeRunError::Timeout) => {
                ClaudeBackgroundProbe::error_state(ClaudeProbeState::Timeout, now)
            }
            Err(ClaudeRunError::CommandFailed { .. }) => {
                ClaudeBackgroundProbe::error_state(ClaudeProbeState::CommandFailed, now)
            }
        }
    }
}

pub struct SystemClaudeRunner;

impl ClaudeProbeRunner for SystemClaudeRunner {
    fn probe_agents_json(&self) -> Result<String, ClaudeRunError> {
        let spec = claude_command_spec().map_err(|_| ClaudeRunError::Unavailable)?;
        let mut cmd = Command::new(&spec.program);
        cmd.args(&spec.prefix_args)
            .args(["agents", "--json", "--all"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        run_capture(&mut cmd, PROBE_TIMEOUT).map_err(|e| match e {
            CaptureError::Spawn => ClaudeRunError::Unavailable,
            CaptureError::Timeout => ClaudeRunError::Timeout,
            CaptureError::Failed { detail } => ClaudeRunError::CommandFailed { detail },
        })
    }

    fn stop_session(&self, external_session_id: &str) -> Result<(), ClaudeStopError> {
        let id = external_session_id.trim();
        if id.is_empty() {
            return Err(ClaudeStopError::CommandFailed {
                detail: "empty_session_id".into(),
            });
        }
        let spec = claude_command_spec().map_err(|_| ClaudeStopError::Unavailable)?;
        let mut cmd = Command::new(&spec.program);
        cmd.args(&spec.prefix_args)
            .arg("stop")
            .arg(id)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        run_capture(&mut cmd, STOP_TIMEOUT)
            .map(|_| ())
            .map_err(|e| match e {
                CaptureError::Spawn => ClaudeStopError::Unavailable,
                CaptureError::Timeout => ClaudeStopError::Timeout,
                CaptureError::Failed { detail } => ClaudeStopError::CommandFailed { detail },
            })
    }
}

enum CaptureError {
    Spawn,
    Timeout,
    Failed { detail: String },
}

fn run_capture(cmd: &mut Command, timeout: Duration) -> Result<String, CaptureError> {
    let mut child = cmd.spawn().map_err(|_| CaptureError::Spawn)?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let out_handle = thread::spawn(move || read_capped(stdout));
    let err_handle = thread::spawn(move || read_capped(stderr));

    let started = Instant::now();
    let status = loop {
        if started.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = out_handle.join();
            let _ = err_handle.join();
            return Err(CaptureError::Timeout);
        }
        match child.try_wait() {
            Ok(Some(st)) => break st,
            Ok(None) => thread::sleep(Duration::from_millis(20)),
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = out_handle.join();
                let _ = err_handle.join();
                return Err(CaptureError::Failed {
                    detail: e.to_string(),
                });
            }
        }
    };

    let stdout_s = out_handle.join().unwrap_or_default();
    let stderr_s = err_handle.join().unwrap_or_default();
    if !status.success() {
        let code = status.code().unwrap_or(-1);
        let detail = if stderr_s.trim().is_empty() {
            format!("exit={code}")
        } else {
            format!("exit={code}: {}", truncate_diag(&stderr_s))
        };
        return Err(CaptureError::Failed { detail });
    }
    let _ = stderr_s; // diagnostic only; never log env/secrets
    Ok(stdout_s)
}

fn read_capped(pipe: Option<impl Read>) -> String {
    let mut buf = Vec::new();
    if let Some(mut r) = pipe {
        let mut chunk = [0u8; 8192];
        loop {
            match r.read(&mut chunk) {
                Ok(0) => break,
                Ok(n) => {
                    let remain = MAX_OUTPUT_BYTES.saturating_sub(buf.len());
                    if remain == 0 {
                        // Drain remainder so writer does not block, but drop bytes.
                        continue;
                    }
                    buf.extend_from_slice(&chunk[..n.min(remain)]);
                }
                Err(_) => break,
            }
        }
    }
    String::from_utf8_lossy(&buf).into_owned()
}

fn truncate_diag(s: &str) -> String {
    let t = s.trim();
    if t.chars().count() <= 200 {
        t.to_string()
    } else {
        t.chars().take(200).collect::<String>() + "…"
    }
}

/// Parse verified schema only. Empty array is Ok. Non-empty → ParseError until active fixture.
pub fn parse_agents_json(raw: &str) -> Result<Vec<ClaudeBackgroundSession>, ClaudeProbeState> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(ClaudeProbeState::ParseError);
    }
    let value: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|_| ClaudeProbeState::ParseError)?;
    let arr = value.as_array().ok_or(ClaudeProbeState::ParseError)?;
    if arr.is_empty() {
        return Ok(Vec::new());
    }
    // Active fixture not published — do not guess field names.
    Err(ClaudeProbeState::ParseError)
}

pub fn session_still_active(probe: &ClaudeBackgroundProbe, external_session_id: &str) -> bool {
    if probe.state != ClaudeProbeState::Ok {
        return false;
    }
    let want = external_session_id.trim();
    if want.is_empty() {
        return false;
    }
    probe
        .sessions
        .iter()
        .any(|s| s.external_session_id.trim() == want && s.active)
}

pub struct ClaudeProbeCache {
    inner: Mutex<Option<ClaudeBackgroundProbe>>,
}

impl ClaudeProbeCache {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    pub fn invalidate(&self) {
        if let Ok(mut g) = self.inner.lock() {
            *g = None;
        }
    }

    fn peek_fresh(&self, now: u64) -> Option<ClaudeBackgroundProbe> {
        let g = self.inner.lock().ok()?;
        let p = g.as_ref()?;
        if p.fresh_until >= now {
            Some(p.clone())
        } else {
            None
        }
    }

    fn store(&self, probe: ClaudeBackgroundProbe) {
        if let Ok(mut g) = self.inner.lock() {
            *g = Some(probe);
        }
    }
}

impl Default for ClaudeProbeCache {
    fn default() -> Self {
        Self::new()
    }
}

fn process_cache() -> &'static ClaudeProbeCache {
    static CACHE: OnceLock<ClaudeProbeCache> = OnceLock::new();
    CACHE.get_or_init(ClaudeProbeCache::new)
}

pub fn system_runner() -> SystemClaudeRunner {
    SystemClaudeRunner
}

pub fn process_probe_cache() -> &'static ClaudeProbeCache {
    process_cache()
}

fn build_probe_from_runner(runner: &dyn ClaudeProbeRunner, now: u64) -> ClaudeBackgroundProbe {
    runner.probe_evidence(now)
}

/// Probe with policy. Never holds cache mutex across subprocess IO.
pub fn get_probe(
    policy: ProbePolicy,
    runner: &dyn ClaudeProbeRunner,
    cache: &ClaudeProbeCache,
) -> ClaudeBackgroundProbe {
    let now = now_ms();
    if matches!(policy, ProbePolicy::Cached) {
        if let Some(hit) = cache.peek_fresh(now) {
            return hit;
        }
    }
    let probe = build_probe_from_runner(runner, now);
    // Short-TTL positive and negative cache. Fail-closed enablement still requires
    // state == Ok + exact active match; cached errors only avoid repeat CLI churn.
    cache.store(probe.clone());
    probe
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex as StdMutex;

    struct FakeRunner {
        probe: StdMutex<Result<String, ClaudeRunError>>,
        stop: StdMutex<Result<(), ClaudeStopError>>,
        probe_calls: AtomicUsize,
        stop_calls: AtomicUsize,
    }

    impl FakeRunner {
        fn ok_empty() -> Self {
            Self {
                probe: StdMutex::new(Ok("[]".into())),
                stop: StdMutex::new(Ok(())),
                probe_calls: AtomicUsize::new(0),
                stop_calls: AtomicUsize::new(0),
            }
        }
    }

    impl ClaudeProbeRunner for FakeRunner {
        fn probe_agents_json(&self) -> Result<String, ClaudeRunError> {
            self.probe_calls.fetch_add(1, Ordering::SeqCst);
            self.probe.lock().unwrap().clone()
        }
        fn stop_session(&self, _id: &str) -> Result<(), ClaudeStopError> {
            self.stop_calls.fetch_add(1, Ordering::SeqCst);
            self.stop.lock().unwrap().clone()
        }
    }

    #[test]
    fn parse_empty_array_ok() {
        let s = parse_agents_json("[]").unwrap();
        assert!(s.is_empty());
        let fixture = include_str!("../../../scripts/fixtures/claude-agents/empty-v2.1.288.json");
        assert!(parse_agents_json(fixture).unwrap().is_empty());
    }

    #[test]
    fn parse_invalid_json_error() {
        assert_eq!(
            parse_agents_json("{not json"),
            Err(ClaudeProbeState::ParseError)
        );
        assert_eq!(parse_agents_json("{}"), Err(ClaudeProbeState::ParseError));
    }

    #[test]
    fn parse_nonempty_unknown_schema_fail_closed() {
        // Must not guess id/sessionId/status/active.
        assert_eq!(
            parse_agents_json(r#"[{"id":"x","status":"running"}]"#),
            Err(ClaudeProbeState::ParseError)
        );
    }

    #[test]
    fn get_probe_empty_ok_and_caches() {
        let runner = FakeRunner::ok_empty();
        let cache = ClaudeProbeCache::new();
        let p1 = get_probe(ProbePolicy::Cached, &runner, &cache);
        assert_eq!(p1.state, ClaudeProbeState::Ok);
        assert!(p1.sessions.is_empty());
        let p2 = get_probe(ProbePolicy::Cached, &runner, &cache);
        assert_eq!(runner.probe_calls.load(Ordering::SeqCst), 1);
        assert_eq!(p2.state, ClaudeProbeState::Ok);
        let _ = get_probe(ProbePolicy::ForceFresh, &runner, &cache);
        assert_eq!(runner.probe_calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn get_probe_maps_runner_errors() {
        let cache = ClaudeProbeCache::new();
        let runner = FakeRunner {
            probe: StdMutex::new(Err(ClaudeRunError::Unavailable)),
            stop: StdMutex::new(Ok(())),
            probe_calls: AtomicUsize::new(0),
            stop_calls: AtomicUsize::new(0),
        };
        assert_eq!(
            get_probe(ProbePolicy::ForceFresh, &runner, &cache).state,
            ClaudeProbeState::CliUnavailable
        );
        *runner.probe.lock().unwrap() = Err(ClaudeRunError::Timeout);
        assert_eq!(
            get_probe(ProbePolicy::ForceFresh, &runner, &cache).state,
            ClaudeProbeState::Timeout
        );
        *runner.probe.lock().unwrap() = Err(ClaudeRunError::CommandFailed { detail: "x".into() });
        assert_eq!(
            get_probe(ProbePolicy::ForceFresh, &runner, &cache).state,
            ClaudeProbeState::CommandFailed
        );
        *runner.probe.lock().unwrap() = Ok("not-json".into());
        assert_eq!(
            get_probe(ProbePolicy::ForceFresh, &runner, &cache).state,
            ClaudeProbeState::ParseError
        );
    }

    #[test]
    fn force_fresh_error_replaces_ok_with_negative_cache() {
        let runner = FakeRunner::ok_empty();
        let cache = ClaudeProbeCache::new();
        let ok = get_probe(ProbePolicy::Cached, &runner, &cache);
        assert_eq!(ok.state, ClaudeProbeState::Ok);
        *runner.probe.lock().unwrap() = Err(ClaudeRunError::Timeout);
        let bad = get_probe(ProbePolicy::ForceFresh, &runner, &cache);
        assert_eq!(bad.state, ClaudeProbeState::Timeout);
        // Negative cache hit: Cached returns Timeout without calling runner.
        *runner.probe.lock().unwrap() = Ok("[]".into());
        let calls_before = runner.probe_calls.load(Ordering::SeqCst);
        let cached_bad = get_probe(ProbePolicy::Cached, &runner, &cache);
        assert_eq!(cached_bad.state, ClaudeProbeState::Timeout);
        assert_eq!(runner.probe_calls.load(Ordering::SeqCst), calls_before);
        // ForceFresh after negative cache still re-runs and can recover to Ok.
        let recovered = get_probe(ProbePolicy::ForceFresh, &runner, &cache);
        assert_eq!(recovered.state, ClaudeProbeState::Ok);
        assert!(runner.probe_calls.load(Ordering::SeqCst) > calls_before);
    }

    #[test]
    fn cached_parse_error_avoids_repeat_cli() {
        let runner = FakeRunner {
            probe: StdMutex::new(Ok(r#"[{"id":"x","status":"running"}]"#.into())),
            stop: StdMutex::new(Ok(())),
            probe_calls: AtomicUsize::new(0),
            stop_calls: AtomicUsize::new(0),
        };
        let cache = ClaudeProbeCache::new();
        let p1 = get_probe(ProbePolicy::Cached, &runner, &cache);
        assert_eq!(p1.state, ClaudeProbeState::ParseError);
        assert_eq!(runner.probe_calls.load(Ordering::SeqCst), 1);
        let p2 = get_probe(ProbePolicy::Cached, &runner, &cache);
        assert_eq!(p2.state, ClaudeProbeState::ParseError);
        assert_eq!(runner.probe_calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn session_still_active_exact_match_only() {
        let probe = ClaudeBackgroundProbe {
            state: ClaudeProbeState::Ok,
            sessions: vec![ClaudeBackgroundSession {
                external_session_id: "abc-123".into(),
                active: true,
                cwd: None,
            }],
            observed_at: 1,
            fresh_until: 10_000,
            confidence: "high".into(),
        };
        assert!(session_still_active(&probe, "abc-123"));
        assert!(session_still_active(&probe, "  abc-123  "));
        assert!(!session_still_active(&probe, "abc"));
        assert!(!session_still_active(&probe, "abc-1234"));
        let inactive = ClaudeBackgroundProbe {
            sessions: vec![ClaudeBackgroundSession {
                external_session_id: "abc-123".into(),
                active: false,
                cwd: None,
            }],
            ..probe.clone()
        };
        assert!(!session_still_active(&inactive, "abc-123"));
    }
}
