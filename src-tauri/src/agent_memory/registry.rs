//! Agent Center registry - durable probe facts in agent_registry.
//! Not Soft Pad capability catalog. resolvedCapabilities are composed at snapshot time.

use crate::soft_pad_runtime::AgentKind;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

use super::store::{self, now_ms};

/// All known Soft Pad / catalog kinds - used for supportedNotFound seeding.
pub const ALL_AGENT_KINDS: &[AgentKind] = &[
    AgentKind::Codex,
    AgentKind::Claude,
    AgentKind::Cursor,
    AgentKind::MiniMax,
    AgentKind::CopilotCli,
    AgentKind::CopilotVscode,
    AgentKind::Gemini,
    AgentKind::WorkBuddy,
    AgentKind::Trae,
    AgentKind::TraeCode,
    AgentKind::Windsurf,
    AgentKind::Qoder,
    AgentKind::Cline,
    AgentKind::Roo,
    AgentKind::OpenCode,
    AgentKind::Aider,
];

/// Product-level stable id: `kind:<as_str>` - never serde_json AgentKind.
pub fn kind_agent_id(kind: AgentKind) -> String {
    format!("kind:{}", kind.as_str())
}

/// Discovered-only id - only create rows when real evidence exists.
pub fn discovered_agent_id(slug: &str) -> String {
    format!("discovered:{}", slug.trim().to_ascii_lowercase())
}

pub fn parse_runtime_kind(raw: Option<&str>) -> Option<AgentKind> {
    raw.and_then(|s| AgentKind::from_kind_str(s.trim()))
}

/// Parse `kind:foo` / `discovered:bar` agent_id prefixes.
pub fn agent_id_runtime_kind(agent_id: &str) -> Option<AgentKind> {
    let id = agent_id.trim();
    if let Some(rest) = id.strip_prefix("kind:") {
        return AgentKind::from_kind_str(rest);
    }
    None
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CanonicalTarget {
    Kind(AgentKind),
    Discovered(&'static str),
}

/// Normalize discovery labels / paths / process names - canonical entity.
/// Trae SOLO / Work - Trae; Trae CN / IDE / Code - TraeCode.
pub fn canonicalize_discovery_label(raw: &str) -> Option<CanonicalTarget> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    let lower = s.to_ascii_lowercase().replace('_', "-").replace(' ', "-");
    let compact = lower.replace('-', "");

    // Trae family - keep SOLO/Work separate from Code/IDE/CN.
    if compact.contains("traesolo")
        || lower.contains("trae-solo")
        || lower == "trae-work"
        || lower == "traework"
        || lower.contains("trae-work")
        || (lower.contains("solo") && lower.contains("trae"))
    {
        return Some(CanonicalTarget::Kind(AgentKind::Trae));
    }
    if compact.contains("traecode")
        || lower.contains("trae-code")
        || lower.contains("trae-cn")
        || lower.contains("traecn")
        || lower.contains("trae-ide")
        || lower == "trae"
        || (lower.contains("trae")
            && (lower.contains("code") || lower.contains("ide") || lower.contains("cn")))
    {
        return Some(CanonicalTarget::Kind(AgentKind::TraeCode));
    }

    if let Some(k) = AgentKind::from_kind_str(s).or_else(|| AgentKind::from_kind_str(&lower)) {
        return Some(CanonicalTarget::Kind(k));
    }

    match lower.as_str() {
        "hermes" => Some(CanonicalTarget::Discovered("hermes")),
        "openclaw" | "open-claw" => Some(CanonicalTarget::Discovered("openclaw")),
        "marvis" => Some(CanonicalTarget::Discovered("marvis")),
        "antigravity" | "anti-gravity" => Some(CanonicalTarget::Discovered("antigravity")),
        "kimi" | "kimi-code" | "kimicode" => Some(CanonicalTarget::Discovered("kimi")),
        _ => None,
    }
}

fn display_name_for_kind(kind: AgentKind) -> &'static str {
    match kind {
        AgentKind::Codex => "Codex",
        AgentKind::Claude => "Claude Code",
        AgentKind::Cursor => "Cursor",
        AgentKind::MiniMax => "MiniMax",
        AgentKind::CopilotCli => "Copilot CLI",
        AgentKind::CopilotVscode => "Copilot VS Code",
        AgentKind::Gemini => "Gemini CLI",
        AgentKind::WorkBuddy => "WorkBuddy",
        AgentKind::Trae => "Trae Work",
        AgentKind::TraeCode => "Trae Code",
        AgentKind::Windsurf => "Windsurf",
        AgentKind::Qoder => "Qoder",
        AgentKind::Cline => "Cline",
        AgentKind::Roo => "Roo",
        AgentKind::OpenCode => "OpenCode",
        AgentKind::Aider => "Aider",
    }
}

fn form_factor_for_kind(kind: AgentKind) -> &'static str {
    match kind {
        AgentKind::Codex
        | AgentKind::Claude
        | AgentKind::Gemini
        | AgentKind::CopilotCli
        | AgentKind::Aider
        | AgentKind::OpenCode
        | AgentKind::Cline
        | AgentKind::Roo => "cli",
        AgentKind::Cursor
        | AgentKind::Windsurf
        | AgentKind::Qoder
        | AgentKind::TraeCode
        | AgentKind::CopilotVscode => "ide",
        AgentKind::MiniMax | AgentKind::WorkBuddy | AgentKind::Trae => "desktop",
    }
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn appdata_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from)
}

fn local_appdata_dir() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
}

/// Known session/db roots - read-only existence checks only.
pub fn data_path_for_kind(kind: AgentKind) -> Option<PathBuf> {
    match kind {
        AgentKind::Claude => home_dir().map(|h| h.join(".claude")),
        AgentKind::Codex => home_dir().map(|h| h.join(".codex")),
        AgentKind::WorkBuddy => home_dir().map(|h| h.join(".workbuddy").join("workbuddy.db")),
        AgentKind::Cursor => appdata_dir().map(|a| {
            a.join("Cursor")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb")
        }),
        AgentKind::Qoder => {
            appdata_dir().map(|a| a.join("com.qodercn.app.stable").join("main.sqlite"))
        }
        AgentKind::Trae => appdata_dir().map(|a| {
            a.join("TRAE SOLO CN")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb")
        }),
        AgentKind::TraeCode => appdata_dir().map(|a| {
            a.join("Trae CN")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb")
        }),
        AgentKind::MiniMax => home_dir().map(|h| h.join(".minimax")),
        AgentKind::Gemini => home_dir().map(|h| h.join(".gemini")),
        AgentKind::Windsurf => appdata_dir().map(|a| a.join("Windsurf")),
        AgentKind::OpenCode => local_appdata_dir()
            .map(|a| a.join("opencode"))
            .or_else(|| home_dir().map(|h| h.join(".opencode"))),
        AgentKind::Aider => home_dir().map(|h| h.join(".aider")),
        AgentKind::Cline => home_dir().map(|h| h.join(".cline")),
        AgentKind::Roo => home_dir().map(|h| h.join(".roo")),
        AgentKind::CopilotCli | AgentKind::CopilotVscode => None,
    }
}

struct DiscoveredCandidate {
    slug: &'static str,
    display_name: &'static str,
    form_factor: &'static str,
    paths: fn() -> Vec<PathBuf>,
}

fn discovered_candidate_paths() -> &'static [DiscoveredCandidate] {
    &[
        DiscoveredCandidate {
            slug: "hermes",
            display_name: "Hermes",
            form_factor: "desktop",
            paths: || {
                let mut v = Vec::new();
                if let Some(h) = home_dir() {
                    v.push(h.join(".hermes"));
                }
                v
            },
        },
        DiscoveredCandidate {
            slug: "openclaw",
            display_name: "OpenClaw",
            form_factor: "desktop",
            paths: || {
                let mut v = Vec::new();
                if let Some(h) = home_dir() {
                    v.push(h.join(".openclaw"));
                }
                v
            },
        },
        DiscoveredCandidate {
            slug: "marvis",
            display_name: "Marvis",
            form_factor: "desktop",
            paths: || {
                let mut v = Vec::new();
                if let Some(h) = home_dir() {
                    v.push(h.join(".marvis"));
                }
                v
            },
        },
        DiscoveredCandidate {
            slug: "antigravity",
            display_name: "Antigravity",
            form_factor: "ide",
            paths: || {
                let mut v = Vec::new();
                if let Some(h) = home_dir() {
                    v.push(h.join(".gemini").join("antigravity"));
                }
                v
            },
        },
        DiscoveredCandidate {
            slug: "kimi",
            display_name: "Kimi Code",
            form_factor: "cli",
            paths: || {
                let mut v = Vec::new();
                if let Some(h) = home_dir() {
                    v.push(h.join(".kimi-code"));
                    v.push(h.join(".kimi"));
                }
                v
            },
        },
    ]
}

fn path_exists(p: &Path) -> bool {
    p.exists()
}

fn sqlite_header_ok(path: &Path) -> Option<bool> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).ok()?;
    let mut buf = [0u8; 16];
    f.read_exact(&mut buf).ok()?;
    Some(&buf[..15] == b"SQLite format 3")
}

fn path_mtime_ms(path: &Path) -> Option<i64> {
    let meta = std::fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?;
    let dur = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
    Some(dur.as_millis() as i64)
}

fn path_size_bytes(path: &Path) -> Option<i64> {
    std::fs::metadata(path).ok().map(|m| m.len() as i64)
}

/// Cheap version sniff — never blocks long; failure → None (UI shows —).
/// Cached ~10m so home remount / soft refresh does not re-spawn CLIs.
pub fn sniff_version(kind: AgentKind) -> Option<String> {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};
    use std::time::{Duration, Instant};

    static VERSION_CACHE: OnceLock<Mutex<HashMap<&'static str, (Instant, Option<String>)>>> =
        OnceLock::new();
    let cache = VERSION_CACHE.get_or_init(|| Mutex::new(HashMap::new()));

    const TTL: Duration = Duration::from_secs(600);
    let key = kind.as_str();
    if let Ok(guard) = cache.lock() {
        if let Some((at, val)) = guard.get(key) {
            if at.elapsed() < TTL {
                return val.clone();
            }
        }
    }

    let found = match kind {
        AgentKind::Cursor => sniff_cursor_version(),
        AgentKind::Claude => sniff_cli_version(&["claude", "claude.exe"]),
        AgentKind::Codex => sniff_cli_version(&["codex", "codex.exe"]),
        AgentKind::Gemini => sniff_cli_version(&["gemini", "gemini.exe"]),
        AgentKind::OpenCode => sniff_cli_version(&["opencode", "opencode.exe"]),
        AgentKind::Aider => sniff_cli_version(&["aider", "aider.exe"]),
        _ => None,
    };

    if let Ok(mut guard) = cache.lock() {
        guard.insert(key, (Instant::now(), found.clone()));
    }
    found
}

fn sniff_cursor_version() -> Option<String> {
    let candidates = [
        local_appdata_dir().map(|p| {
            p.join("Programs")
                .join("cursor")
                .join("resources")
                .join("app")
                .join("product.json")
        }),
        local_appdata_dir().map(|p| {
            p.join("Programs")
                .join("Cursor")
                .join("resources")
                .join("app")
                .join("product.json")
        }),
    ];
    for path in candidates.into_iter().flatten() {
        if !path.exists() {
            continue;
        }
        let text = std::fs::read_to_string(&path).ok()?;
        let v: Value = serde_json::from_str(&text).ok()?;
        if let Some(s) = v.get("version").and_then(|x| x.as_str()) {
            let t = s.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }
    None
}

fn sniff_cli_version(exes: &[&str]) -> Option<String> {
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;

    let owned: Vec<String> = exes.iter().map(|s| (*s).to_string()).collect();
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut found = None;
        for exe in &owned {
            let mut cmd = Command::new(exe);
            cmd.arg("--version")
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            let Ok(out) = cmd.output() else {
                continue;
            };
            let text = String::from_utf8_lossy(&out.stdout);
            let err = String::from_utf8_lossy(&out.stderr);
            if let Some(line) = text
                .lines()
                .chain(err.lines())
                .map(str::trim)
                .find(|l| !l.is_empty())
            {
                let cleaned: String = line.chars().take(48).collect();
                if !cleaned.is_empty() {
                    found = Some(cleaned);
                    break;
                }
            }
        }
        let _ = tx.send(found);
    });
    // ponytail: orphan child if hung past 900ms — upgrade to kill-on-timeout if flaky
    rx.recv_timeout(Duration::from_millis(900)).ok().flatten()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryRow {
    pub agent_id: String,
    pub runtime_kind: Option<String>,
    pub display_name: String,
    pub form_factor: String,
    pub presence_state: String,
    pub version: Option<String>,
    pub data_path: Option<String>,
    pub adapter_state: String,
    pub limitation_reason: Option<String>,
    pub capability_evidence_json: String,
    pub evidence_json: String,
    pub last_probe_at_ms: Option<i64>,
    pub last_successful_probe_at_ms: Option<i64>,
    pub last_sync_at_ms: Option<i64>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

pub fn list_registry(conn: &Connection) -> Result<Vec<RegistryRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT agent_id, runtime_kind, display_name, form_factor, presence_state,
                    version, data_path, adapter_state, limitation_reason,
                    capability_evidence_json, evidence_json,
                    last_probe_at_ms, last_successful_probe_at_ms, last_sync_at_ms,
                    created_at_ms, updated_at_ms
             FROM agent_registry ORDER BY display_name COLLATE NOCASE",
        )
        .map_err(|e| format!("list agent_registry: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(RegistryRow {
                agent_id: r.get(0)?,
                runtime_kind: r.get(1)?,
                display_name: r.get(2)?,
                form_factor: r.get(3)?,
                presence_state: r.get(4)?,
                version: r.get(5)?,
                data_path: r.get(6)?,
                adapter_state: r.get(7)?,
                limitation_reason: r.get(8)?,
                capability_evidence_json: r.get(9)?,
                evidence_json: r.get(10)?,
                last_probe_at_ms: r.get(11)?,
                last_successful_probe_at_ms: r.get(12)?,
                last_sync_at_ms: r.get(13)?,
                created_at_ms: r.get(14)?,
                updated_at_ms: r.get(15)?,
            })
        })
        .map_err(|e| format!("list agent_registry map: {e}"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("registry row: {e}"))?);
    }
    Ok(out)
}

fn get_row(conn: &Connection, agent_id: &str) -> Result<Option<RegistryRow>, String> {
    conn.query_row(
        "SELECT agent_id, runtime_kind, display_name, form_factor, presence_state,
                version, data_path, adapter_state, limitation_reason,
                capability_evidence_json, evidence_json,
                last_probe_at_ms, last_successful_probe_at_ms, last_sync_at_ms,
                created_at_ms, updated_at_ms
         FROM agent_registry WHERE agent_id = ?1",
        [agent_id],
        |r| {
            Ok(RegistryRow {
                agent_id: r.get(0)?,
                runtime_kind: r.get(1)?,
                display_name: r.get(2)?,
                form_factor: r.get(3)?,
                presence_state: r.get(4)?,
                version: r.get(5)?,
                data_path: r.get(6)?,
                adapter_state: r.get(7)?,
                limitation_reason: r.get(8)?,
                capability_evidence_json: r.get(9)?,
                evidence_json: r.get(10)?,
                last_probe_at_ms: r.get(11)?,
                last_successful_probe_at_ms: r.get(12)?,
                last_sync_at_ms: r.get(13)?,
                created_at_ms: r.get(14)?,
                updated_at_ms: r.get(15)?,
            })
        },
    )
    .optional()
    .map_err(|e| format!("get agent_registry: {e}"))
}

/// Merge evidence arrays by (source, detail) identity.
fn merge_evidence_json(existing: &str, incoming: &[Value]) -> String {
    let mut list: Vec<Value> = serde_json::from_str(existing).unwrap_or_else(|_| vec![]);
    for item in incoming {
        let key = (
            item.get("source").and_then(|v| v.as_str()).unwrap_or(""),
            item.get("detail").and_then(|v| v.as_str()).unwrap_or(""),
        );
        let dup = list.iter().any(|e| {
            let ek = (
                e.get("source").and_then(|v| v.as_str()).unwrap_or(""),
                e.get("detail").and_then(|v| v.as_str()).unwrap_or(""),
            );
            ek == key
        });
        if !dup {
            list.push(item.clone());
        }
    }
    serde_json::to_string(&list).unwrap_or_else(|_| "[]".into())
}

pub fn upsert_registry_row(conn: &Connection, row: &RegistryRow) -> Result<(), String> {
    let now = now_ms() as i64;
    let prev = get_row(conn, &row.agent_id)?;
    let (created_at, evidence_json, last_success, cap_json) = if let Some(p) = prev {
        let merged = merge_evidence_json(&p.evidence_json, &{
            serde_json::from_str::<Vec<Value>>(&row.evidence_json).unwrap_or_default()
        });
        let success = if row.last_successful_probe_at_ms.is_some() {
            row.last_successful_probe_at_ms
        } else {
            p.last_successful_probe_at_ms
        };
        let caps = if row.capability_evidence_json != "{}" {
            row.capability_evidence_json.clone()
        } else {
            p.capability_evidence_json
        };
        (p.created_at_ms, merged, success, caps)
    } else {
        (
            row.created_at_ms.max(1).max(now),
            row.evidence_json.clone(),
            row.last_successful_probe_at_ms,
            row.capability_evidence_json.clone(),
        )
    };

    conn.execute(
        "INSERT INTO agent_registry (
            agent_id, runtime_kind, display_name, form_factor, presence_state,
            version, data_path, adapter_state, limitation_reason,
            capability_evidence_json, evidence_json,
            last_probe_at_ms, last_successful_probe_at_ms, last_sync_at_ms,
            created_at_ms, updated_at_ms
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
         ON CONFLICT(agent_id) DO UPDATE SET
            runtime_kind=excluded.runtime_kind,
            display_name=excluded.display_name,
            form_factor=excluded.form_factor,
            presence_state=excluded.presence_state,
            version=COALESCE(excluded.version, agent_registry.version),
            data_path=COALESCE(excluded.data_path, agent_registry.data_path),
            adapter_state=excluded.adapter_state,
            limitation_reason=excluded.limitation_reason,
            capability_evidence_json=excluded.capability_evidence_json,
            evidence_json=excluded.evidence_json,
            last_probe_at_ms=excluded.last_probe_at_ms,
            last_successful_probe_at_ms=excluded.last_successful_probe_at_ms,
            last_sync_at_ms=COALESCE(excluded.last_sync_at_ms, agent_registry.last_sync_at_ms),
            updated_at_ms=excluded.updated_at_ms",
        params![
            row.agent_id,
            row.runtime_kind,
            row.display_name,
            row.form_factor,
            row.presence_state,
            row.version,
            row.data_path,
            row.adapter_state,
            row.limitation_reason,
            cap_json,
            evidence_json,
            row.last_probe_at_ms.unwrap_or(now),
            last_success,
            row.last_sync_at_ms,
            created_at,
            now,
        ],
    )
    .map_err(|e| format!("upsert agent_registry: {e}"))?;
    Ok(())
}

fn probe_kind_facts(kind: AgentKind) -> RegistryRow {
    let now = now_ms() as i64;
    let agent_id = kind_agent_id(kind);
    let data_path = data_path_for_kind(kind);
    let path_ok = data_path.as_ref().map(|p| path_exists(p)).unwrap_or(false);
    let mut evidence: Vec<Value> = Vec::new();
    let mut presence = "not_found";
    let mut adapter = "unknown";
    let mut limitation: Option<String> = None;
    let mut caps = json!({});
    let mut last_success: Option<i64> = None;
    let mut last_sync: Option<i64> = None;

    if let Some(ref p) = data_path {
        let detail = p.display().to_string();
        if path_ok {
            presence = "detected";
            last_success = Some(now);
            last_sync = path_mtime_ms(p);
            evidence.push(json!({
                "source": "config_dir",
                "detail": detail,
                "canonicalAgentId": agent_id,
                "mappingBasis": "known_data_path",
                "probedAtMs": now,
                "confidence": "high",
                "rawName": display_name_for_kind(kind),
            }));
            if p.extension().and_then(|e| e.to_str()) == Some("db")
                || p.extension().and_then(|e| e.to_str()) == Some("sqlite")
                || p.extension().and_then(|e| e.to_str()) == Some("vscdb")
                || p.file_name().and_then(|e| e.to_str()) == Some("workbuddy.db")
                || p.file_name().and_then(|e| e.to_str()) == Some("main.sqlite")
                || p.file_name().and_then(|e| e.to_str()) == Some("state.vscdb")
            {
                match sqlite_header_ok(p) {
                    Some(true) => {
                        adapter = "readable";
                        caps = json!({ "sessionMetadata": "available" });
                    }
                    Some(false) => {
                        adapter = "encrypted";
                        presence = "limited";
                        limitation = Some("sqlite_encrypted".into());
                        caps = json!({
                            "transcript": "unavailable",
                            "sessionMetadata": "limited",
                            "usage": "unknown"
                        });
                        // Trae: body unread - usage unavailable
                        if matches!(kind, AgentKind::Trae | AgentKind::TraeCode) {
                            caps = json!({
                                "transcript": "unavailable",
                                "sessionMetadata": "unavailable",
                                "usage": "limited",
                                "hooks": "unknown",
                                "process": "unknown"
                            });
                        }
                    }
                    None => {
                        adapter = "read_error";
                        presence = "limited";
                        limitation = Some("read_failed".into());
                    }
                }
                if let Some(sz) = path_size_bytes(p) {
                    if sz > 1_000_000_000 {
                        presence = "limited";
                        limitation = Some("oversized_db".into());
                        adapter = "limited";
                    }
                }
            } else {
                adapter = "path_present";
                caps = json!({ "sessionMetadata": "limited" });
            }
        } else {
            evidence.push(json!({
                "source": "config_dir",
                "detail": format!("missing:{detail}"),
                "canonicalAgentId": agent_id,
                "mappingBasis": "known_data_path",
                "probedAtMs": now,
                "confidence": "low",
                "rawName": display_name_for_kind(kind),
            }));
        }
    }

    RegistryRow {
        agent_id,
        runtime_kind: Some(kind.as_str().to_string()),
        display_name: display_name_for_kind(kind).to_string(),
        form_factor: form_factor_for_kind(kind).to_string(),
        presence_state: presence.to_string(),
        version: sniff_version(kind),
        data_path: data_path.map(|p| p.display().to_string()),
        adapter_state: adapter.to_string(),
        limitation_reason: limitation,
        capability_evidence_json: caps.to_string(),
        evidence_json: serde_json::to_string(&evidence).unwrap_or_else(|_| "[]".into()),
        last_probe_at_ms: Some(now),
        last_successful_probe_at_ms: last_success,
        last_sync_at_ms: last_sync,
        created_at_ms: now,
        updated_at_ms: now,
    }
}

/// Apply install-inventory presence onto a kind row (connected if high-confidence installed).
pub fn apply_install_presence(row: &mut RegistryRow, presence: &str, confidence: &str) {
    let installed = !matches!(presence, "none" | "");
    if !installed {
        return;
    }
    if confidence == "high" {
        match row.presence_state.as_str() {
            "not_found" => {
                row.presence_state = "connected".into();
                if row.adapter_state == "unknown" {
                    row.adapter_state = "inventory_only".into();
                }
            }
            "detected" => {
                if row.adapter_state != "encrypted"
                    && row.limitation_reason.as_deref() != Some("oversized_db")
                {
                    row.presence_state = "connected".into();
                }
            }
            "limited" => {}
            _ => {}
        }
    } else if row.presence_state == "not_found" {
        row.presence_state = "detected".into();
    }
}

fn probe_discovered(
    slug: &str,
    display: &str,
    form: &str,
    paths: &[PathBuf],
) -> Option<RegistryRow> {
    let now = now_ms() as i64;
    let found: Vec<&PathBuf> = paths.iter().filter(|p| path_exists(p)).collect();
    if found.is_empty() {
        return None; // no evidence - do not create row
    }
    let agent_id = discovered_agent_id(slug);
    let primary = found[0];
    let mut evidence = Vec::new();
    for p in &found {
        evidence.push(json!({
            "source": "config_dir",
            "detail": p.display().to_string(),
            "canonicalAgentId": agent_id,
            "mappingBasis": "discovered_path",
            "probedAtMs": now,
            "confidence": "medium",
            "rawName": display,
        }));
    }
    let encrypted = primary
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e == "db" || e == "sqlite" || e == "vscdb")
        .unwrap_or(false)
        && sqlite_header_ok(primary) == Some(false);

    Some(RegistryRow {
        agent_id,
        runtime_kind: None,
        display_name: display.to_string(),
        form_factor: form.to_string(),
        presence_state: if encrypted {
            "limited".into()
        } else {
            "detected".into()
        },
        version: None,
        data_path: Some(primary.display().to_string()),
        adapter_state: if encrypted {
            "encrypted".into()
        } else {
            "path_present".into()
        },
        limitation_reason: if encrypted {
            Some("sqlite_encrypted".into())
        } else {
            Some("discovered_only".into())
        },
        capability_evidence_json: json!({
            "transcript": if encrypted { "unavailable" } else { "unknown" },
            "sessionMetadata": "limited",
            "usage": "unknown"
        })
        .to_string(),
        evidence_json: serde_json::to_string(&evidence).unwrap_or_else(|_| "[]".into()),
        last_probe_at_ms: Some(now),
        last_successful_probe_at_ms: Some(now),
        last_sync_at_ms: path_mtime_ms(primary),
        created_at_ms: now,
        updated_at_ms: now,
    })
}

/// Refresh all kind rows + evidence-gated discovered rows. Single-source failures stay local.
pub fn refresh_registry(
    conn: &Connection,
    install_rows: &[(String, String, String)], // kind, presence, confidence
) -> Result<usize, String> {
    let mut count = 0usize;
    let install_map: std::collections::HashMap<&str, (&str, &str)> = install_rows
        .iter()
        .map(|(k, p, c)| (k.as_str(), (p.as_str(), c.as_str())))
        .collect();

    for kind in ALL_AGENT_KINDS {
        let mut row = probe_kind_facts(*kind);
        if let Some((presence, confidence)) = install_map.get(kind.as_str()) {
            if *presence == "unknown" {
                // Unimplemented inventory probe — not SupportedNotFound.
                row.presence_state = "unknown".into();
                row.limitation_reason = Some("ProbeNotImplemented".into());
                if row.adapter_state == "unknown" || row.adapter_state.is_empty() {
                    row.adapter_state = "probe_not_implemented".into();
                }
            } else {
                apply_install_presence(&mut row, presence, confidence);
            }
        }
        // Probe failure must not abort - already isolated per kind
        if let Err(e) = upsert_registry_row(conn, &row) {
            eprintln!("[agent_registry] upsert {}: {e}", row.agent_id);
            continue;
        }
        count += 1;
    }

    for cand in discovered_candidate_paths() {
        let paths = (cand.paths)();
        // If label maps to a known kind, merge into kind:* instead of discovered:*
        if let Some(CanonicalTarget::Kind(k)) = canonicalize_discovery_label(cand.slug) {
            let mut row = probe_kind_facts(k);
            for p in paths.iter().filter(|p| path_exists(p)) {
                let ev = json!([{
                    "source": "config_dir",
                    "detail": p.display().to_string(),
                    "canonicalAgentId": kind_agent_id(k),
                    "mappingBasis": "discovered_alias_merged",
                    "probedAtMs": now_ms(),
                    "confidence": "medium",
                    "rawName": cand.display_name,
                }]);
                row.evidence_json = merge_evidence_json(
                    &row.evidence_json,
                    &ev.as_array().cloned().unwrap_or_default(),
                );
            }
            let _ = upsert_registry_row(conn, &row);
            continue;
        }
        match probe_discovered(cand.slug, cand.display_name, cand.form_factor, &paths) {
            Some(row) => {
                if upsert_registry_row(conn, &row).is_ok() {
                    count += 1;
                }
            }
            None => {
                // Evidence gone: if historical row exists, mark not_found/stale (do not delete)
                let id = discovered_agent_id(cand.slug);
                if let Ok(Some(mut prev)) = get_row(conn, &id) {
                    let now = now_ms() as i64;
                    prev.presence_state = if prev.last_successful_probe_at_ms.is_some() {
                        "stale".into()
                    } else {
                        "not_found".into()
                    };
                    prev.last_probe_at_ms = Some(now);
                    prev.limitation_reason = Some("evidence_gone".into());
                    let _ = upsert_registry_row(conn, &prev);
                }
            }
        }
    }
    Ok(count)
}

/// High-level refresh using install inventory kinds when available.
pub fn refresh_registry_from_inventory(
    conn: &Connection,
    inventory_kinds: &[(impl AsRef<str>, impl AsRef<str>, impl AsRef<str>)],
) -> Result<usize, String> {
    let rows: Vec<(String, String, String)> = inventory_kinds
        .iter()
        .map(|(k, p, c)| {
            (
                k.as_ref().to_string(),
                p.as_ref().to_string(),
                c.as_ref().to_string(),
            )
        })
        .collect();
    refresh_registry(conn, &rows)
}

#[cfg(test)]
mod tests {
    use super::store::migrate;
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn stable_ids_for_all_sixteen_kinds() {
        let expected = [
            (AgentKind::Codex, "kind:codex"),
            (AgentKind::Claude, "kind:claude"),
            (AgentKind::Cursor, "kind:cursor"),
            (AgentKind::MiniMax, "kind:minimax"),
            (AgentKind::CopilotCli, "kind:copilotCli"),
            (AgentKind::CopilotVscode, "kind:copilotVscode"),
            (AgentKind::Gemini, "kind:gemini"),
            (AgentKind::WorkBuddy, "kind:workbuddy"),
            (AgentKind::Trae, "kind:trae"),
            (AgentKind::TraeCode, "kind:traeCode"),
            (AgentKind::Windsurf, "kind:windsurf"),
            (AgentKind::Qoder, "kind:qoder"),
            (AgentKind::Cline, "kind:cline"),
            (AgentKind::Roo, "kind:roo"),
            (AgentKind::OpenCode, "kind:opencode"),
            (AgentKind::Aider, "kind:aider"),
        ];
        assert_eq!(expected.len(), 16);
        assert_eq!(ALL_AGENT_KINDS.len(), 16);
        for (k, id) in expected {
            assert_eq!(kind_agent_id(k), id);
        }
        // camelCase serde must NOT be used as stable product ids
        assert_eq!(
            serde_json::to_string(&AgentKind::WorkBuddy).unwrap(),
            "\"workBuddy\""
        );
        assert_eq!(kind_agent_id(AgentKind::WorkBuddy), "kind:workbuddy");
        assert_eq!(
            serde_json::to_string(&AgentKind::MiniMax).unwrap(),
            "\"miniMax\""
        );
        assert_eq!(kind_agent_id(AgentKind::MiniMax), "kind:minimax");
        assert_eq!(
            serde_json::to_string(&AgentKind::OpenCode).unwrap(),
            "\"openCode\""
        );
        assert_eq!(kind_agent_id(AgentKind::OpenCode), "kind:opencode");
    }

    #[test]
    fn trae_canonicalization() {
        assert_eq!(
            canonicalize_discovery_label("TRAE SOLO CN"),
            Some(CanonicalTarget::Kind(AgentKind::Trae))
        );
        assert_eq!(
            canonicalize_discovery_label("TRAE SOLO"),
            Some(CanonicalTarget::Kind(AgentKind::Trae))
        );
        assert_eq!(
            canonicalize_discovery_label("Trae Work"),
            Some(CanonicalTarget::Kind(AgentKind::Trae))
        );
        assert_eq!(
            canonicalize_discovery_label("trae-work"),
            Some(CanonicalTarget::Kind(AgentKind::Trae))
        );
        assert_eq!(
            canonicalize_discovery_label("Trae CN"),
            Some(CanonicalTarget::Kind(AgentKind::TraeCode))
        );
        assert_eq!(
            canonicalize_discovery_label("Trae Code"),
            Some(CanonicalTarget::Kind(AgentKind::TraeCode))
        );
        assert_eq!(
            canonicalize_discovery_label("trae-code"),
            Some(CanonicalTarget::Kind(AgentKind::TraeCode))
        );
        assert_eq!(
            canonicalize_discovery_label("Trae IDE"),
            Some(CanonicalTarget::Kind(AgentKind::TraeCode))
        );
    }

    #[test]
    fn unknown_runtime_kind_stays_none() {
        assert!(parse_runtime_kind(Some("notARealAgent")).is_none());
        assert!(parse_runtime_kind(None).is_none());
        assert_eq!(
            parse_runtime_kind(Some("workbuddy")),
            Some(AgentKind::WorkBuddy)
        );
    }

    #[test]
    fn discovered_requires_evidence_no_seed() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        // refresh with empty install - discovered only if paths exist on this machine
        refresh_registry(&conn, &[]).unwrap();
        let rows = list_registry(&conn).unwrap();
        // All 16 kinds always present
        assert!(
            rows.iter()
                .filter(|r| r.agent_id.starts_with("kind:"))
                .count()
                >= 16
        );
        for r in rows
            .iter()
            .filter(|r| r.agent_id.starts_with("discovered:"))
        {
            let ev: Vec<Value> = serde_json::from_str(&r.evidence_json).unwrap_or_default();
            assert!(
                !ev.is_empty(),
                "discovered row without evidence: {}",
                r.agent_id
            );
        }
    }

    #[test]
    fn evidence_merge_dedupes() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        let now = 1_i64;
        let row = RegistryRow {
            agent_id: "kind:codex".into(),
            runtime_kind: Some("codex".into()),
            display_name: "Codex".into(),
            form_factor: "cli".into(),
            presence_state: "detected".into(),
            version: None,
            data_path: Some("/tmp/a".into()),
            adapter_state: "path_present".into(),
            limitation_reason: None,
            capability_evidence_json: "{}".into(),
            evidence_json: json!([{
                "source": "config_dir",
                "detail": "/tmp/a",
            }])
            .to_string(),
            last_probe_at_ms: Some(now),
            last_successful_probe_at_ms: Some(now),
            last_sync_at_ms: None,
            created_at_ms: now,
            updated_at_ms: now,
        };
        upsert_registry_row(&conn, &row).unwrap();
        upsert_registry_row(&conn, &row).unwrap();
        let got = get_row(&conn, "kind:codex").unwrap().unwrap();
        let ev: Vec<Value> = serde_json::from_str(&got.evidence_json).unwrap();
        assert_eq!(ev.len(), 1);
    }

    #[test]
    fn install_presence_elevates_connected() {
        let mut row = RegistryRow {
            agent_id: "kind:codex".into(),
            runtime_kind: Some("codex".into()),
            display_name: "Codex".into(),
            form_factor: "cli".into(),
            presence_state: "not_found".into(),
            version: None,
            data_path: None,
            adapter_state: "unknown".into(),
            limitation_reason: None,
            capability_evidence_json: "{}".into(),
            evidence_json: "[]".into(),
            last_probe_at_ms: None,
            last_successful_probe_at_ms: None,
            last_sync_at_ms: None,
            created_at_ms: 1,
            updated_at_ms: 1,
        };
        apply_install_presence(&mut row, "cli", "high");
        assert_eq!(row.presence_state, "connected");
    }

    #[test]
    fn sniff_version_fn_exists_for_kinds() {
        // Must not panic; result may be None on CI without CLIs.
        let _ = sniff_version(AgentKind::Claude);
        let _ = sniff_version(AgentKind::Codex);
        let _ = sniff_version(AgentKind::Cursor);
    }
}
