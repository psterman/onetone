//! Minimal Codex CLI smoke task — real subprocess, no fake success.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::agent_usage;
use crate::soft_pad_runtime::AgentKind as SoftPadAgentKind;

pub const SMOKE_TITLE: &str = "验证 Codex 数据回流";
pub const SMOKE_AGENT: &str = "Codex";
pub const SMOKE_PROMPT: &str =
    "请只读取当前项目，返回一句项目状态摘要，不要修改任何文件，不要运行破坏性命令。";
pub const PROMPT_SAFETY_SUFFIX: &str =
    "\n\n【约束】只读取项目，不要修改任何文件，不要运行破坏性命令。";
pub const MAX_PROMPT_CHARS: usize = 4000;
pub const MISSING_CLI_MSG: &str = "未找到 Codex CLI，请先安装或配置 PATH";

pub const HEALTH_PATH: &str = "/api/agents/codex/health";
pub const CREATE_PATH: &str = "/api/tasks/codex-smoke-test";
pub const TASK_PATH_PREFIX: &str = "/api/tasks/";

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
            SmokeStatus::Starting => "正在启动 Codex",
            SmokeStatus::Running => "Codex 正在运行",
            SmokeStatus::OutputReceived => "已收到 Codex 输出",
            SmokeStatus::Completed => "Codex 已完成",
            SmokeStatus::Failed => "Codex 执行失败",
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
pub struct CodexHealth {
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
    format!("codex-smoke-{}-{}", now_ms(), n)
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
    // Prefer last non-empty paragraph-ish line as the "one sentence" summary.
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
    // Prompt goes on stdin (`-`) so Windows .cmd shims don't choke on Unicode argv.
    let shown = truncate(prompt, 120).replace('\n', " ");
    format!("codex exec --sandbox read-only -o <last-message.txt> -C {workspace} -  << '{shown}'")
}

/// Prefer node + codex.js over .cmd/.bat — CreateProcess rejects many Unicode batch args.
fn exec_command_spec(spec: agent_usage::CodexCommandSpec) -> agent_usage::CodexCommandSpec {
    let prog = PathBuf::from(&spec.program);
    let name = prog
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if name != "codex.cmd" && name != "codex.bat" {
        return spec;
    }
    let Some(dir) = prog.parent() else {
        return spec;
    };
    let js = dir.join("node_modules/@openai/codex/bin/codex.js");
    let node = dir.join("node.exe");
    if js.is_file() && node.is_file() {
        return agent_usage::CodexCommandSpec {
            program: node.into_os_string(),
            prefix_args: vec![js.into_os_string()],
        };
    }
    spec
}

/// Normalize user prompt; empty → default smoke prompt. Always keep read-only reminder for custom.
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

pub fn health() -> CodexHealth {
    match agent_usage::codex_command_spec() {
        Ok(spec) => {
            let version = probe_version(&spec).unwrap_or_default();
            let authenticated = probe_authenticated();
            CodexHealth {
                installed: true,
                version,
                authenticated,
                message: None,
            }
        }
        Err(_) => CodexHealth {
            installed: false,
            version: String::new(),
            authenticated: false,
            message: Some(MISSING_CLI_MSG.to_string()),
        },
    }
}

fn probe_authenticated() -> bool {
    // Best-effort: reuse cached Codex account snapshot; never invent true.
    let snap = agent_usage::snapshot(SoftPadAgentKind::Codex);
    if !snap.account_type.trim().is_empty() {
        return true;
    }
    if snap.status == "ready" && snap.last_success_at > 0 {
        return true;
    }
    false
}

fn probe_version(spec: &agent_usage::CodexCommandSpec) -> Option<String> {
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

/// Create task and spawn Codex in a background thread. Returns taskId.
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
        .name("codex-smoke-exec".into())
        .spawn(move || run_codex_exec(&id_for_thread, workspace, prompt))
        .map_err(|e| format!("spawn worker failed: {e}"))?;

    Ok(task_id)
}

fn run_codex_exec(task_id: &str, workspace: PathBuf, prompt: String) {
    update_task(task_id, |t| apply_status(t, SmokeStatus::Starting));

    let spec = match agent_usage::codex_command_spec() {
        Ok(s) => exec_command_spec(s),
        Err(_) => {
            fail_task(task_id, MISSING_CLI_MSG, None);
            return;
        }
    };

    // Last agent message → card headline (not the full noisy stdout stream).
    let last_msg_path = std::env::temp_dir().join(format!("onetone-codex-smoke-{task_id}.txt"));
    let _ = std::fs::remove_file(&last_msg_path);

    let mut command = Command::new(&spec.program);
    command
        .args(&spec.prefix_args)
        // `-` = read prompt from stdin (avoids Windows batch Unicode argv failures).
        .args(["exec", "--sandbox", "read-only", "-o"])
        .arg(&last_msg_path)
        .arg("-C")
        .arg(&workspace)
        .arg("-")
        .current_dir(&workspace)
        .stdin(Stdio::piped())
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
            fail_task(task_id, &format!("启动 Codex 失败: {e}"), None);
            return;
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        if let Err(e) = stdin.write_all(prompt.as_bytes()) {
            let _ = child.kill();
            let _ = child.wait();
            fail_task(task_id, &format!("写入 Codex Prompt 失败: {e}"), None);
            return;
        }
        // Close stdin so Codex sees EOF and starts.
        drop(stdin);
    } else {
        let _ = child.kill();
        let _ = child.wait();
        fail_task(task_id, "Codex stdin 不可用", None);
        return;
    }

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
                        // Live card core while still running (final -o overwrites at end).
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
            let _ = std::fs::remove_file(&last_msg_path);
            fail_task(task_id, &format!("等待 Codex 退出失败: {e}"), None);
            return;
        }
    };

    let stdout_joined = out_handle.join().unwrap_or_default();
    let stderr_joined = err_handle.join().unwrap_or_default();
    let code = status.code();

    let last_message = std::fs::read_to_string(&last_msg_path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let _ = std::fs::remove_file(&last_msg_path);

    update_task(task_id, |t| {
        if t.raw_stdout.trim().is_empty() && !stdout_joined.trim().is_empty() {
            t.raw_stdout = truncate(&stdout_joined, MAX_OUTPUT_CHARS);
        }
        if t.raw_stderr.trim().is_empty() && !stderr_joined.trim().is_empty() {
            t.raw_stderr = truncate(&stderr_joined, MAX_OUTPUT_CHARS);
        }
        t.exit_code = code;
        t.completed_at = Some(now_ms());
        // Prefer -o last message; fall back to heuristic on stdout.
        t.summary = last_message
            .clone()
            .unwrap_or_else(|| summarize_stdout(&t.raw_stdout));
        if status.success() {
            if t.summary.is_empty() {
                t.summary = "(Codex 已退出且无摘要输出)".to_string();
            }
            apply_status(t, SmokeStatus::Completed);
            t.error.clear();
        } else {
            let reason = if !t.raw_stderr.trim().is_empty() {
                truncate(t.raw_stderr.trim(), 800)
            } else if let Some(c) = code {
                format!("Codex 退出码 {c}")
            } else {
                "Codex 进程异常退出".to_string()
            };
            apply_status(t, SmokeStatus::Failed);
            t.error = reason;
        }
    });
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
    let rest = path.strip_prefix(TASK_PATH_PREFIX)?;
    if rest.is_empty() || rest.contains('/') {
        return None;
    }
    // Avoid colliding with create paths
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
        assert_eq!(SmokeStatus::Created.as_str(), "created");
        assert_eq!(SmokeStatus::Starting.as_str(), "starting");
        assert_eq!(SmokeStatus::Running.as_str(), "running");
        assert_eq!(SmokeStatus::OutputReceived.as_str(), "output_received");
        assert_eq!(SmokeStatus::Completed.as_str(), "completed");
        assert_eq!(SmokeStatus::Failed.as_str(), "failed");
        assert_eq!(SmokeStatus::Starting.phase_label_zh(), "正在启动 Codex");
        assert_eq!(SmokeStatus::Failed.phase_label_zh(), "Codex 执行失败");
    }

    #[test]
    fn parse_task_path_skips_create_route() {
        assert_eq!(parse_task_path("/api/tasks/codex-smoke-test"), None);
        assert_eq!(
            parse_task_path("/api/tasks/codex-smoke-1-2"),
            Some("codex-smoke-1-2")
        );
        assert_eq!(parse_task_path("/api/tasks/"), None);
    }

    #[test]
    fn summarize_prefers_last_plain_line() {
        let out = "thinking...\n{{\"ok\":true}}\nOneTone is a Tauri desktop app.\n";
        assert_eq!(summarize_stdout(out), "OneTone is a Tauri desktop app.");
    }

    #[test]
    fn missing_cli_health_does_not_claim_installed() {
        // Without forcing PATH, we only assert message constant + shape when not installed.
        // If Codex IS installed locally, installed may be true — that's real, not fake.
        let h = health();
        if !h.installed {
            assert_eq!(h.message.as_deref(), Some(MISSING_CLI_MSG));
            assert!(!h.authenticated);
            assert!(h.version.is_empty());
        }
    }

    #[test]
    fn create_task_starts_as_created_then_progresses() {
        // Do not require Codex CLI for the created snapshot.
        let workspace = repo_root();
        assert!(workspace.join("package.json").is_file() || workspace.join("src-tauri").is_dir());

        let mut task = SmokeTask {
            task_id: "t-test".into(),
            title: SMOKE_TITLE.into(),
            agent: SMOKE_AGENT.into(),
            status: String::new(),
            phase_label: String::new(),
            prompt: SMOKE_PROMPT.into(),
            summary: String::new(),
            raw_stdout: String::new(),
            raw_stderr: String::new(),
            exit_code: None,
            error: String::new(),
            started_at: Some(1),
            completed_at: None,
            command: build_command_display(&workspace.display().to_string(), SMOKE_PROMPT),
            workspace: workspace.display().to_string(),
        };
        apply_status(&mut task, SmokeStatus::Created);
        assert_eq!(task.status, "created");
        apply_status(&mut task, SmokeStatus::Starting);
        assert_eq!(task.status, "starting");
        apply_status(&mut task, SmokeStatus::Running);
        assert_eq!(task.status, "running");
        apply_status(&mut task, SmokeStatus::OutputReceived);
        assert_eq!(task.status, "output_received");
        apply_status(&mut task, SmokeStatus::Completed);
        assert_eq!(task.status, "completed");
        assert!(!task.command.contains("danger"));
        assert!(task.command.contains("read-only"));
        assert!(normalize_prompt(Some("看一下登录逻辑")).contains("【约束】"));
        assert_eq!(normalize_prompt(None), SMOKE_PROMPT);
    }
}
