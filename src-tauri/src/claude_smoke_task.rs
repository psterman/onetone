//! Minimal Claude Code CLI smoke task — real subprocess, no fake success.
//! Mirrors codex_smoke_task: home prompt → `claude -p` (plan/read-only) → card.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::agent_usage;
use crate::claude_cli_cmd::{claude_command_spec, ClaudeCommandSpec};
use crate::soft_pad_runtime::AgentKind as SoftPadAgentKind;

pub use crate::claude_cli_cmd::{ENV_CLAUDE_BIN, MISSING_CLI_MSG};

pub const SMOKE_TITLE: &str = "验证 Claude 数据回流";
pub const SMOKE_AGENT: &str = "Claude";
pub const SMOKE_PROMPT: &str =
    "请只读取当前项目，返回一句项目状态摘要，不要修改任何文件，不要运行破坏性命令。";
pub const PROMPT_SAFETY_SUFFIX: &str =
    "\n\n【约束】只读取项目，不要修改任何文件，不要运行破坏性命令。";
pub const MAX_PROMPT_CHARS: usize = 4000;

pub const HEALTH_PATH: &str = "/api/agents/claude/health";
pub const CREATE_PATH: &str = "/api/tasks/claude-smoke-test";

const MAX_OUTPUT_CHARS: usize = 64 * 1024;
const VERSION_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SmokeStatus {
    Created,
    Starting,
    Running,
    OutputReceived,
    Completed,
    Failed,
}

impl SmokeStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SmokeStatus::Created => "created",
            SmokeStatus::Starting => "starting",
            SmokeStatus::Running => "running",
            SmokeStatus::OutputReceived => "output_received",
            SmokeStatus::Completed => "completed",
            SmokeStatus::Failed => "failed",
        }
    }

    pub fn phase_label_zh(&self) -> &'static str {
        match self {
            SmokeStatus::Created => "已创建",
            SmokeStatus::Starting => "正在启动 Claude",
            SmokeStatus::Running => "Claude 正在运行",
            SmokeStatus::OutputReceived => "已收到 Claude 输出",
            SmokeStatus::Completed => "Claude 已完成",
            SmokeStatus::Failed => "Claude 执行失败",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmokeTask {
    pub task_id: String,
    pub title: String,
    pub agent: String,
    pub status: String,
    pub phase_label: String,
    pub prompt: String,
    pub summary: String,
    pub raw_stdout: String,
    pub raw_stderr: String,
    pub exit_code: Option<i32>,
    pub error: String,
    pub started_at: Option<u64>,
    pub completed_at: Option<u64>,
    pub command: String,
    pub workspace: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeHealth {
    pub installed: bool,
    pub version: String,
    pub authenticated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn store() -> &'static Mutex<HashMap<String, SmokeTask>> {
    static STORE: OnceLock<Mutex<HashMap<String, SmokeTask>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_task_id() -> String {
    static SEQ: AtomicU64 = AtomicU64::new(1);
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    format!("claude-smoke-{}-{}", now_ms(), n)
}

pub fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

fn apply_status(task: &mut SmokeTask, status: SmokeStatus) {
    task.status = status.as_str().to_string();
    task.phase_label = status.phase_label_zh().to_string();
}

fn update_task<F>(task_id: &str, f: F)
where
    F: FnOnce(&mut SmokeTask),
{
    if let Ok(mut g) = store().lock() {
        if let Some(task) = g.get_mut(task_id) {
            f(task);
        }
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    s.chars().take(max).collect::<String>() + "…"
}

fn summarize_stdout(stdout: &str) -> String {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let line = trimmed
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .filter(|l| !l.starts_with('{'))
        .last()
        .unwrap_or(trimmed);
    truncate(line, 500)
}

fn build_command_display(workspace: &str, prompt: &str) -> String {
    let shown = truncate(prompt, 120).replace('\n', " ");
    format!(
        "claude -p --permission-mode plan --output-format text (cwd={workspace}) \"{shown}\""
    )
}

pub fn normalize_prompt(user: Option<&str>) -> String {
    let raw = user.map(str::trim).unwrap_or("");
    if raw.is_empty() {
        return SMOKE_PROMPT.to_string();
    }
    let clipped = truncate(raw, MAX_PROMPT_CHARS);
    if clipped.contains("不要修改") || clipped.contains("只读取") {
        clipped
    } else {
        format!("{clipped}{PROMPT_SAFETY_SUFFIX}")
    }
}

fn title_from_prompt(prompt: &str) -> String {
    let one = prompt.lines().next().unwrap_or(prompt).trim();
    if one.is_empty() || one == SMOKE_PROMPT {
        return SMOKE_TITLE.to_string();
    }
    truncate(one, 48)
}

pub fn get_task(task_id: &str) -> Option<SmokeTask> {
    store()
        .lock()
        .ok()
        .and_then(|g| g.get(task_id.trim()).cloned())
}

pub fn health() -> ClaudeHealth {
    match claude_command_spec() {
        Ok(spec) => {
            let version = probe_version(&spec).unwrap_or_default();
            let authenticated = probe_authenticated();
            ClaudeHealth {
                installed: true,
                version,
                authenticated,
                message: None,
            }
        }
        Err(_) => ClaudeHealth {
            installed: false,
            version: String::new(),
            authenticated: false,
            message: Some(MISSING_CLI_MSG.to_string()),
        },
    }
}

fn probe_authenticated() -> bool {
    let snap = agent_usage::snapshot(SoftPadAgentKind::Claude);
    if !snap.account_type.trim().is_empty() {
        return true;
    }
    if snap.status == "ready" && snap.last_success_at > 0 {
        return true;
    }
    // Best-effort: Claude Code config dir exists (never invent true from empty).
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        let claude_dir = PathBuf::from(home).join(".claude");
        if claude_dir.join("settings.json").is_file() || claude_dir.is_dir() {
            // Presence alone ≠ logged in; keep false unless usage says ready.
            return false;
        }
    }
    false
}

fn probe_version(spec: &ClaudeCommandSpec) -> Option<String> {
    let mut command = Command::new(&spec.program);
    command
        .args(&spec.prefix_args)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn().ok()?;
    let stdout = child.stdout.take();
    let started = SystemTime::now();
    loop {
        if started.elapsed().ok()? > VERSION_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => {
                let _ = child.kill();
                return None;
            }
        }
    }
    let mut out = String::new();
    if let Some(mut s) = stdout {
        let _ = s.read_to_string(&mut out);
    }
    let v = out.lines().next().unwrap_or("").trim().to_string();
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

pub fn start_smoke_test(user_prompt: Option<String>) -> Result<String, String> {
    let workspace = repo_root();
    let workspace_str = workspace.display().to_string();
    let task_id = next_task_id();
    let prompt = normalize_prompt(user_prompt.as_deref());
    let title = title_from_prompt(&prompt);
    let command = build_command_display(&workspace_str, &prompt);

    let mut task = SmokeTask {
        task_id: task_id.clone(),
        title,
        agent: SMOKE_AGENT.to_string(),
        status: String::new(),
        phase_label: String::new(),
        prompt: prompt.clone(),
        summary: String::new(),
        raw_stdout: String::new(),
        raw_stderr: String::new(),
        exit_code: None,
        error: String::new(),
        started_at: Some(now_ms()),
        completed_at: None,
        command,
        workspace: workspace_str,
    };
    apply_status(&mut task, SmokeStatus::Created);

    store()
        .lock()
        .map_err(|e| e.to_string())?
        .insert(task_id.clone(), task);

    let id_for_thread = task_id.clone();
    thread::Builder::new()
        .name("claude-smoke-exec".into())
        .spawn(move || run_claude_print(&id_for_thread, workspace, prompt))
        .map_err(|e| format!("spawn worker failed: {e}"))?;

    Ok(task_id)
}

fn run_claude_print(task_id: &str, workspace: PathBuf, prompt: String) {
    update_task(task_id, |t| apply_status(t, SmokeStatus::Starting));

    let spec = match claude_command_spec() {
        Ok(s) => s,
        Err(_) => {
            fail_task(task_id, MISSING_CLI_MSG, None);
            return;
        }
    };

    // Write prompt to a UTF-8 temp file and pass path via `@`-style? Claude uses arg.
    // Prefer writing prompt bytes through a short ASCII-only arg file path is not supported
    // for -p; use node.exe + prompt arg (Unicode OK) after .cmd rewrite.
    let mut command = Command::new(&spec.program);
    command
        .args(&spec.prefix_args)
        .args([
            "-p",
            "--permission-mode",
            "plan",
            "--output-format",
            "text",
        ])
        .arg(&prompt)
        .current_dir(&workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }

    let mut child = match command.spawn() {
        Ok(c) => c,
        Err(e) => {
            fail_task(task_id, &format!("启动 Claude 失败: {e}"), None);
            return;
        }
    };

    update_task(task_id, |t| apply_status(t, SmokeStatus::Running));

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let id_out = task_id.to_string();
    let out_handle = thread::spawn(move || {
        let mut buf = String::new();
        if let Some(pipe) = stdout {
            let reader = BufReader::new(pipe);
            for line in reader.lines().map_while(Result::ok) {
                if !line.trim().is_empty() {
                    update_task(&id_out, |t| {
                        if t.status == SmokeStatus::Running.as_str()
                            || t.status == SmokeStatus::Starting.as_str()
                        {
                            apply_status(t, SmokeStatus::OutputReceived);
                        }
                        if !t.raw_stdout.is_empty() {
                            t.raw_stdout.push('\n');
                        }
                        t.raw_stdout.push_str(&line);
                        if t.raw_stdout.len() > MAX_OUTPUT_CHARS {
                            t.raw_stdout.truncate(MAX_OUTPUT_CHARS);
                        }
                        let live = summarize_stdout(&t.raw_stdout);
                        if !live.is_empty() {
                            t.summary = live;
                        }
                    });
                }
                buf.push_str(&line);
                buf.push('\n');
                if buf.len() > MAX_OUTPUT_CHARS {
                    break;
                }
            }
        }
        buf
    });

    let id_err = task_id.to_string();
    let err_handle = thread::spawn(move || {
        let mut buf = String::new();
        if let Some(pipe) = stderr {
            let reader = BufReader::new(pipe);
            for line in reader.lines().map_while(Result::ok) {
                update_task(&id_err, |t| {
                    if !t.raw_stderr.is_empty() {
                        t.raw_stderr.push('\n');
                    }
                    t.raw_stderr.push_str(&line);
                    if t.raw_stderr.len() > MAX_OUTPUT_CHARS {
                        t.raw_stderr.truncate(MAX_OUTPUT_CHARS);
                    }
                });
                buf.push_str(&line);
                buf.push('\n');
                if buf.len() > MAX_OUTPUT_CHARS {
                    break;
                }
            }
        }
        buf
    });

    let status = match child.wait() {
        Ok(s) => s,
        Err(e) => {
            let _ = out_handle.join();
            let _ = err_handle.join();
            fail_task(task_id, &format!("等待 Claude 退出失败: {e}"), None);
            return;
        }
    };

    let stdout_joined = out_handle.join().unwrap_or_default();
    let stderr_joined = err_handle.join().unwrap_or_default();
    let code = status.code();

    update_task(task_id, |t| {
        if t.raw_stdout.trim().is_empty() && !stdout_joined.trim().is_empty() {
            t.raw_stdout = truncate(&stdout_joined, MAX_OUTPUT_CHARS);
        }
        if t.raw_stderr.trim().is_empty() && !stderr_joined.trim().is_empty() {
            t.raw_stderr = truncate(&stderr_joined, MAX_OUTPUT_CHARS);
        }
        t.exit_code = code;
        t.completed_at = Some(now_ms());
        if t.summary.trim().is_empty() {
            t.summary = summarize_stdout(&t.raw_stdout);
        }
        if status.success() {
            if t.summary.is_empty() {
                t.summary = "(Claude 已退出且无摘要输出)".to_string();
            }
            apply_status(t, SmokeStatus::Completed);
            t.error.clear();
        } else {
            // MiniMax gateway often prints unrecognized_model / auto-mode notices on stderr
            // even for soft failures — prefer real errors over those banners.
            let real = real_claude_stderr(&t.raw_stderr);
            let reason = if !real.is_empty() {
                truncate(real.trim(), 800)
            } else if let Some(c) = code {
                format!("Claude 退出码 {c}")
            } else {
                "Claude 进程异常退出".to_string()
            };
            apply_status(t, SmokeStatus::Failed);
            t.error = reason;
        }
    });
}

fn is_benign_claude_stderr_line(line: &str) -> bool {
    let l = line.trim();
    if l.is_empty() {
        return true;
    }
    l.contains("unrecognized_model")
        || l.contains("api.minimaxi.com")
        || l.contains("classifier requests")
        || l.contains("auto mode")
        || l.contains("Nothing breaks:")
        || l.contains("ask your gateway to implement")
}

fn real_claude_stderr(stderr: &str) -> String {
    stderr
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !is_benign_claude_stderr_line(l))
        .collect::<Vec<_>>()
        .join("\n")
}

fn fail_task(task_id: &str, error: &str, exit_code: Option<i32>) {
    update_task(task_id, |t| {
        apply_status(t, SmokeStatus::Failed);
        t.error = error.to_string();
        t.exit_code = exit_code;
        t.completed_at = Some(now_ms());
    });
}

pub fn parse_task_path(path: &str) -> Option<&str> {
    let rest = path.strip_prefix("/api/tasks/")?;
    if rest.is_empty() || rest.contains('/') {
        return None;
    }
    if rest == "codex-smoke-test" || rest == "claude-smoke-test" {
        return None;
    }
    Some(rest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_labels_match_acceptance() {
        assert_eq!(SmokeStatus::Starting.phase_label_zh(), "正在启动 Claude");
        assert_eq!(SmokeStatus::Failed.phase_label_zh(), "Claude 执行失败");
        assert_eq!(SmokeStatus::Completed.as_str(), "completed");
    }

    #[test]
    fn parse_skips_create_routes() {
        assert_eq!(parse_task_path("/api/tasks/claude-smoke-test"), None);
        assert_eq!(
            parse_task_path("/api/tasks/claude-smoke-1-2"),
            Some("claude-smoke-1-2")
        );
    }

    #[test]
    fn normalize_adds_safety() {
        assert!(normalize_prompt(Some("首页做什么")).contains("【约束】"));
        assert_eq!(normalize_prompt(None), SMOKE_PROMPT);
    }

    #[test]
    fn command_is_plan_readonly() {
        let cmd = build_command_display(r"E:\voice-pilot", SMOKE_PROMPT);
        assert!(cmd.contains("--permission-mode plan"));
        assert!(cmd.contains("-p"));
        assert!(!cmd.contains("--permission-mode bypassPermissions"));
        assert!(!cmd.contains("dangerously-skip-permissions"));
    }

    #[test]
    fn benign_minimax_stderr_is_filtered() {
        let raw = "[claude-code:unrecognized_model] {\"model\":\"MiniMax-M3[1m]\"}\nWe're changing auto mode...\napi.minimaxi.com\nNothing breaks: auto mode keeps working\nREAL_ERROR: boom\n";
        let real = real_claude_stderr(raw);
        assert!(real.contains("REAL_ERROR"));
        assert!(!real.contains("unrecognized_model"));
        assert!(!real.contains("minimaxi"));
    }
}
