//! Cursor state.vscdb session discovery — headers + user-turn observed (no message body).

use crate::agent_memory::events::{
    append_observed_event, source_ref_for_turn, upsert_project, upsert_session_candidate,
};
use crate::agent_memory::model::{
    ProbeStatus, ProjectMatch, SessionCandidate, WorkspaceEvidence, PROVIDER_CURSOR,
};
use crate::agent_memory::project::{mark_active_sessions, resolve_project};
use crate::agent_memory::store::{now_ms, with_write};
use crate::cursor_local_activity;
use rusqlite::{params, Connection, OpenFlags};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};

#[derive(Debug, Clone)]
struct FileMarks {
    db_mtime_ms: u64,
    db_size: u64,
    wal_mtime_ms: u64,
    wal_size: u64,
    shm_mtime_ms: u64,
    shm_size: u64,
}

fn file_mtime_size(path: &Path) -> (u64, u64) {
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return (0, 0),
    };
    let size = meta.len();
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    (mtime, size)
}

fn collect_marks(db: &Path) -> FileMarks {
    let (db_mtime_ms, db_size) = file_mtime_size(db);
    let wal = PathBuf::from(format!("{}-wal", db.display()));
    let shm = PathBuf::from(format!("{}-shm", db.display()));
    let (wal_mtime_ms, wal_size) = file_mtime_size(&wal);
    let (shm_mtime_ms, shm_size) = file_mtime_size(&shm);
    FileMarks {
        db_mtime_ms,
        db_size,
        wal_mtime_ms,
        wal_size,
        shm_mtime_ms,
        shm_size,
    }
}

fn marks_changed(prev: &FileMarks, next: &FileMarks) -> bool {
    prev.db_mtime_ms != next.db_mtime_ms
        || prev.db_size != next.db_size
        || prev.wal_mtime_ms != next.wal_mtime_ms
        || prev.wal_size != next.wal_size
        || prev.shm_mtime_ms != next.shm_mtime_ms
        || prev.shm_size != next.shm_size
}

fn open_ro(path: &Path) -> Result<Connection, String> {
    let uri = format!(
        "file:///{}?mode=ro",
        path.to_string_lossy().replace('\\', "/")
    );
    let conn = Connection::open_with_flags(
        &uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("open vscdb: {e}"))?;
    let _ = conn.busy_timeout(Duration::from_secs(3));
    Ok(conn)
}

fn kv_get(conn: &Connection, table: &str, key: &str) -> Option<Value> {
    if table != "ItemTable" && table != "cursorDiskKV" {
        return None;
    }
    if key.starts_with("cursorAuth/") || key.contains("accessToken") || key.contains("refreshToken")
    {
        return None;
    }
    let sql = format!("SELECT value FROM [{table}] WHERE key = ?1");
    let bytes: Result<Vec<u8>, _> = conn.query_row(&sql, [key], |row| row.get(0));
    let bytes = match bytes {
        Ok(b) => b,
        Err(_) => {
            let s: Result<String, _> = conn.query_row(&sql, [key], |row| row.get(0));
            s.ok()?.into_bytes()
        }
    };
    serde_json::from_str(String::from_utf8_lossy(&bytes).trim()).ok()
}

fn as_ms(v: &Value) -> Option<u64> {
    match v {
        Value::Number(n) => n.as_u64().or_else(|| n.as_i64().map(|i| i.max(0) as u64)),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
}

fn truncate_cursor_json(v: &Value) -> String {
    let mut s = serde_json::to_string(v).unwrap_or_else(|_| "{}".into());
    const MAX: usize = 16 * 1024;
    if s.len() > MAX {
        s.truncate(MAX);
    }
    s
}

struct HeaderHit {
    composer_id: String,
    title: Option<String>,
    created_at: Option<u64>,
    updated_at: Option<u64>,
}

fn list_headers(conn: &Connection) -> Result<(Vec<HeaderHit>, String), ProbeStatus> {
    let candidates = ["composer.composerHeaders", "composer.composerData"];
    for key in candidates {
        let Some(v) = kv_get(conn, "ItemTable", key) else {
            continue;
        };
        let Some(obj) = v.as_object() else {
            continue;
        };
        let list_field = ["allComposers", "composers", "headers"]
            .into_iter()
            .find(|f| obj.get(*f).and_then(|x| x.as_array()).is_some());
        let Some(list_field) = list_field else {
            continue;
        };
        let list = obj
            .get(list_field)
            .and_then(|x| x.as_array())
            .cloned()
            .unwrap_or_default();
        if list.is_empty() {
            return Ok((Vec::new(), format!("headers:{key}:empty")));
        }
        let mut out = Vec::new();
        for item in &list {
            let Some(o) = item.as_object() else {
                continue;
            };
            let id = o
                .get("composerId")
                .or_else(|| o.get("id"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            if id.is_empty() {
                continue;
            }
            let title = o
                .get("name")
                .or_else(|| o.get("title"))
                .and_then(|x| x.as_str())
                .map(|s| {
                    let t = s.trim();
                    if t.len() > 120 {
                        format!("{}…", &t[..120])
                    } else {
                        t.to_string()
                    }
                })
                .filter(|s| !s.is_empty());
            let mut created = None;
            let mut updated = None;
            for f in ["createdAt", "lastUpdatedAt", "updatedAt"] {
                if let Some(ms) = o.get(f).and_then(as_ms) {
                    if f == "createdAt" {
                        created = Some(ms);
                    } else {
                        updated = Some(updated.map_or(ms, |u: u64| u.max(ms)));
                    }
                }
            }
            out.push(HeaderHit {
                composer_id: id,
                title,
                created_at: created,
                updated_at: updated.or(created),
            });
        }
        let schema_hash = format!(
            "{:x}",
            Sha256::digest(format!("{key}|{list_field}|{}", out.len()).as_bytes())
        );
        return Ok((out, schema_hash));
    }
    Err(ProbeStatus::SchemaUnknown)
}

fn load_cursor_row(db_path: &str) -> Option<(FileMarks, String, Option<u64>, Value)> {
    with_write(|conn| {
        Ok(conn
            .query_row(
                "SELECT last_file_size, last_db_mtime_ms, last_wal_size, last_wal_mtime_ms,
                        last_shm_size, last_shm_mtime_ms, schema_hash, last_successful_probe_at_ms,
                        cursor_json
                 FROM provider_cursors WHERE provider = ?1 AND database_path = ?2",
                params![PROVIDER_CURSOR, db_path],
                |r| {
                    let raw: String = r.get(8).unwrap_or_else(|_| "{}".into());
                    let cursor_json =
                        serde_json::from_str(&raw).unwrap_or(Value::Object(Default::default()));
                    Ok((
                        FileMarks {
                            db_size: r.get::<_, i64>(0).unwrap_or(0) as u64,
                            db_mtime_ms: r.get::<_, i64>(1).unwrap_or(0) as u64,
                            wal_size: r.get::<_, i64>(2).unwrap_or(0) as u64,
                            wal_mtime_ms: r.get::<_, i64>(3).unwrap_or(0) as u64,
                            shm_size: r.get::<_, i64>(4).unwrap_or(0) as u64,
                            shm_mtime_ms: r.get::<_, i64>(5).unwrap_or(0) as u64,
                        },
                        r.get::<_, String>(6).unwrap_or_default(),
                        r.get::<_, Option<i64>>(7)?.map(|x| x as u64),
                        cursor_json,
                    ))
                },
            )
            .ok())
    })
    .ok()
    .flatten()
}

/// Conversation-header user turns only — never loads bubble message body.
fn emit_user_turns_for_composer(
    conn: &Connection,
    session_id: &str,
    composer_id: &str,
    fallback_ts: u64,
) -> Option<String> {
    let key = format!("composerData:{composer_id}");
    let data = kv_get(conn, "cursorDiskKV", &key)?;
    let obj = data.as_object()?;
    let headers_field = [
        "fullConversationHeadersOnly",
        "conversationHeaders",
        "headers",
    ]
    .into_iter()
    .find(|f| obj.get(*f).and_then(|x| x.as_array()).is_some())?;
    let hdrs = obj.get(headers_field)?.as_array()?;
    let mut newest_ref = String::new();
    let mut emitted = 0usize;
    const MAX_TURNS: usize = 48;
    for h in hdrs {
        if emitted >= MAX_TURNS {
            break;
        }
        let Some(o) = h.as_object() else {
            continue;
        };
        let ty = o
            .get("type")
            .or_else(|| o.get("bubbleType"))
            .and_then(|t| t.as_i64().or_else(|| t.as_u64().map(|u| u as i64)));
        // Cursor user turns historically type==1
        if ty != Some(1) {
            continue;
        }
        let Some(bid) = o
            .get("bubbleId")
            .or_else(|| o.get("id"))
            .and_then(|x| x.as_str())
            .filter(|s| !s.is_empty())
        else {
            continue;
        };
        let sref = format!("{composer_id}:{bid}");
        let ts = o
            .get("createdAt")
            .or_else(|| o.get("timestamp"))
            .and_then(as_ms)
            .unwrap_or(fallback_ts);
        let _ = append_observed_event(
            session_id,
            PROVIDER_CURSOR,
            "user_turn_observed",
            &sref,
            ts,
            "User turn observed",
        );
        newest_ref = sref;
        emitted += 1;
    }
    if newest_ref.is_empty() {
        None
    } else {
        Some(newest_ref)
    }
}

fn save_cursor_row(
    db_path: &str,
    marks: &FileMarks,
    schema_hash: &str,
    status: ProbeStatus,
    cursor_json: &str,
) {
    let now = now_ms() as i64;
    let _ = with_write(|conn| {
        conn.execute(
            "INSERT INTO provider_cursors(
               provider, database_path, last_scan_at_ms, last_file_size, last_db_mtime_ms,
               last_wal_size, last_wal_mtime_ms, last_shm_size, last_shm_mtime_ms,
               schema_hash, last_successful_probe_at_ms, cursor_json, probe_status
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
             ON CONFLICT(provider, database_path) DO UPDATE SET
               last_scan_at_ms=excluded.last_scan_at_ms,
               last_file_size=excluded.last_file_size,
               last_db_mtime_ms=excluded.last_db_mtime_ms,
               last_wal_size=excluded.last_wal_size,
               last_wal_mtime_ms=excluded.last_wal_mtime_ms,
               last_shm_size=excluded.last_shm_size,
               last_shm_mtime_ms=excluded.last_shm_mtime_ms,
               schema_hash=excluded.schema_hash,
               last_successful_probe_at_ms=excluded.last_successful_probe_at_ms,
               cursor_json=excluded.cursor_json,
               probe_status=excluded.probe_status",
            params![
                PROVIDER_CURSOR,
                db_path,
                now,
                marks.db_size as i64,
                marks.db_mtime_ms as i64,
                marks.wal_size as i64,
                marks.wal_mtime_ms as i64,
                marks.shm_size as i64,
                marks.shm_mtime_ms as i64,
                schema_hash,
                now,
                cursor_json,
                status.as_str(),
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    });
}

/// Discover Cursor sessions; persist observed events. Non-blocking caller should run on worker.
pub fn discover_cursor_sessions(
    project_hint: Option<&Path>,
) -> Result<Vec<SessionCandidate>, String> {
    let Some(db_path) = cursor_local_activity_vscdb_path() else {
        save_probe_not_found();
        return Ok(Vec::new());
    };
    let db_s = db_path.to_string_lossy().to_string();
    let marks = collect_marks(&db_path);

    if !cursor_local_activity::consent_enabled() {
        // Consent off: do not scan; leave cache. Probe marked consent_off.
        save_cursor_row(
            &db_s,
            &marks,
            "",
            ProbeStatus::ConsentOff,
            "{\"version\":1}",
        );
        return Ok(Vec::new());
    }

    let prev = load_cursor_row(&db_s);
    let skip_scan = prev
        .as_ref()
        .map(|(m, _, _, _)| !marks_changed(m, &marks))
        .unwrap_or(false);
    if skip_scan {
        // Still refresh active flags from cache projection side; return empty delta.
        return Ok(Vec::new());
    }
    let prev_last_composer_updated = prev
        .as_ref()
        .and_then(|(_, _, _, cj)| cj.get("lastComposerUpdatedAt").and_then(|x| x.as_u64()))
        .unwrap_or(0);
    let mut last_bubble_ref = prev
        .as_ref()
        .and_then(|(_, _, _, cj)| {
            cj.get("lastBubbleRef")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_default();

    let conn = match open_ro(&db_path) {
        Ok(c) => c,
        Err(e) => {
            let st = if e.to_lowercase().contains("lock") {
                ProbeStatus::ReadLocked
            } else {
                ProbeStatus::ReadError
            };
            save_cursor_row(&db_s, &marks, "", st, "{\"version\":1}");
            return Err(e);
        }
    };

    let (headers, schema_hash) = match list_headers(&conn) {
        Ok(x) => x,
        Err(ProbeStatus::SchemaUnknown) => {
            save_cursor_row(
                &db_s,
                &marks,
                "",
                ProbeStatus::SchemaUnknown,
                "{\"version\":1}",
            );
            return Ok(Vec::new());
        }
        Err(st) => {
            save_cursor_row(&db_s, &marks, "", st, "{\"version\":1}");
            return Ok(Vec::new());
        }
    };

    if headers.is_empty() {
        save_cursor_row(
            &db_s,
            &marks,
            &schema_hash,
            ProbeStatus::EmptyValid,
            "{\"version\":1,\"lastComposerUpdatedAt\":0}",
        );
        return Ok(Vec::new());
    }

    // Graded workspace evidence — scan never auto-Exact without High tier.
    let fg_title = crate::app_identity::foreground_app_identity()
        .map(|id| id.window_title)
        .filter(|t| !t.trim().is_empty());
    let selection = crate::agent_memory::workspace_evidence::select_workspace_evidence(
        fg_title.as_deref(),
        now_ms(),
    );
    let evidence: Option<WorkspaceEvidence> = match &selection {
        crate::agent_memory::workspace_evidence::EvidenceSelection::High(ev)
        | crate::agent_memory::workspace_evidence::EvidenceSelection::Probable(ev) => {
            Some(ev.clone())
        }
        _ => None,
    };
    // Only accept real existing path hints (never display-name PathBuf).
    let safe_hint = project_hint.and_then(|p| {
        crate::agent_memory::project::validate_workspace_path(p).map(|_| p.to_path_buf())
    });
    let (project, match_kind, match_reason, match_conf) =
        resolve_project(safe_hint.as_deref(), evidence.as_ref());
    let _ = upsert_project(
        &project.project_id,
        &project.display_name,
        project.workspace_path.as_deref(),
        project.git_root.as_deref(),
    );

    let mut candidates = Vec::new();
    let mut last_id = String::new();
    let mut last_updated: u64 = 0;

    // Prefer newest composers for turn scan (bound cost on large histories).
    let mut turn_rank: Vec<(u64, usize, String)> = headers
        .iter()
        .enumerate()
        .map(|(i, h)| {
            (
                h.updated_at.or(h.created_at).unwrap_or(0),
                i,
                h.composer_id.clone(),
            )
        })
        .collect();
    turn_rank.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    let turn_scan_set: std::collections::HashSet<String> = turn_rank
        .into_iter()
        .take(16)
        .map(|(_, _, id)| id)
        .collect();

    for h in &headers {
        let mut c = SessionCandidate {
            provider: PROVIDER_CURSOR.into(),
            external_session_id: h.composer_id.clone(),
            project_id: project.project_id.clone(),
            project_match: match_kind.clone(),
            match_reason: match_reason.clone(),
            match_confidence: match_conf,
            started_at: h.created_at,
            updated_at: h.updated_at,
            title: h.title.clone(),
            is_active: false,
            activity_source: "observed".into(),
            active_confidence: 0.0,
            workspace_evidence: evidence.clone(),
        };
        // If no path evidence, force unknown project id for first insert path — resolver already
        // may be probable from hint; keep that. When hint missing, unknown.
        if match_kind == ProjectMatch::Unknown {
            c.project_id = crate::agent_memory::model::UNKNOWN_PROJECT_ID.into();
        }

        let sid = upsert_session_candidate(&c)?;
        let ts = h.updated_at.or(h.created_at).unwrap_or_else(now_ms);
        let sref = source_ref_for_turn(&h.composer_id, None, Some(ts), "session_updated");
        let _ = append_observed_event(
            &sid,
            PROVIDER_CURSOR,
            "session_updated",
            &sref,
            ts,
            "Cursor session updated",
        );
        let dref = source_ref_for_turn(
            &h.composer_id,
            None,
            h.created_at.or(Some(ts)),
            "session_discovered",
        );
        let _ = append_observed_event(
            &sid,
            PROVIDER_CURSOR,
            "session_discovered",
            &dref,
            h.created_at.unwrap_or(ts),
            "Cursor session discovered",
        );

        // User turns: newest composers only. Bodies never read. UNIQUE ignores dupes.
        let should_scan_turns = turn_scan_set.contains(&h.composer_id)
            && (prev_last_composer_updated == 0
                || ts >= prev_last_composer_updated.saturating_sub(1));
        if should_scan_turns {
            if let Some(bref) = emit_user_turns_for_composer(&conn, &sid, &h.composer_id, ts) {
                last_bubble_ref = bref;
            }
        }

        if ts >= last_updated {
            last_updated = ts;
            last_id = h.composer_id.clone();
        }
        candidates.push(c);
    }

    mark_active_sessions(&mut candidates, &project.project_id);
    // Persist active flags
    for c in &candidates {
        let _ = upsert_session_candidate(c);
    }

    let cursor_val = serde_json::json!({
        "version": 1,
        "lastComposerUpdatedAt": last_updated,
        "lastComposerId": last_id,
        "lastBubbleRef": last_bubble_ref,
        "lastSeenKeys": headers.iter().take(32).map(|h| h.composer_id.clone()).collect::<Vec<_>>(),
    });
    save_cursor_row(
        &db_s,
        &marks,
        &schema_hash,
        ProbeStatus::Ready,
        &truncate_cursor_json(&cursor_val),
    );

    Ok(candidates)
}

fn cursor_local_activity_vscdb_path() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    let p = PathBuf::from(appdata)
        .join("Cursor")
        .join("User")
        .join("globalStorage")
        .join("state.vscdb");
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

fn save_probe_not_found() {
    let _ = with_write(|conn| {
        conn.execute(
            "INSERT INTO provider_cursors(provider, database_path, last_scan_at_ms, probe_status, cursor_json)
             VALUES ('cursor','',?1,'not_found','{\"version\":1}')
             ON CONFLICT(provider, database_path) DO UPDATE SET
               last_scan_at_ms=excluded.last_scan_at_ms,
               probe_status=excluded.probe_status",
            params![now_ms() as i64],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    });
}
