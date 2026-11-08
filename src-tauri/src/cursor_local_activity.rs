//! Cursor Activity Provider — local intensity from state.vscdb (not official quota).
//!
//! Reads only session/turn metadata. Never selects `cursorAuth/*`, cookies, or message text
//! into product fields. Schema is discovered via detectors; hard-coded key presence is not enough.

use crate::agent_usage::{self, AgentUsageSnapshot};
use rusqlite::{Connection, OpenFlags};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const SRC_CURSOR_LOCAL: &str = "cursor_local_activity";
pub const CURSOR_USAGE_CONSOLE: &str = "https://cursor.com/settings";
const REFRESH_SECS: u64 = 10 * 60;
/// High Cursor builds hold WAL longer — retry sooner after a busy miss.
const REFRESH_BUSY_SECS: u64 = 45;
const SCHEMA_CACHE_MS: u64 = 10 * 60 * 1000;
/// Keep a detected schema for aggregate even after TTL while live detect flaps under lock.
const SCHEMA_STALE_MAX_MS: u64 = 24 * 60 * 60 * 1000;
const OPEN_BUSY_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone)]
struct HeadersLayout {
    table: String,
    key: String,
    list_field: String,
    id_field: String,
    ts_fields: Vec<String>,
}

#[derive(Debug, Clone)]
struct ComposerDataLayout {
    table: String,
    key_prefix: String,
    headers_field: String,
    bubble_id_field: String,
    type_field: String,
    user_type: i64,
}

#[derive(Debug, Clone)]
struct BubbleLayout {
    table: String,
    key_prefix: String,
    /// `{composerId}:{bubbleId}` after prefix
    created_at_field: String,
}

#[derive(Debug, Clone)]
struct SchemaBundle {
    headers: HeadersLayout,
    composer: ComposerDataLayout,
    /// None → count user headers against composer day (newer Cursor / lock flakes).
    bubble: Option<BubbleLayout>,
    detected_at_ms: u64,
}

fn last_busy_flag() -> &'static AtomicBool {
    static FLAG: OnceLock<AtomicBool> = OnceLock::new();
    FLAG.get_or_init(|| AtomicBool::new(false))
}

fn note_refresh_busy(busy: bool) {
    last_busy_flag().store(busy, Ordering::SeqCst);
}

#[derive(Debug, Clone, Default)]
pub struct ActivityTotals {
    pub turns_today: u64,
    pub turns_yesterday: u64,
    pub sessions_today: u64,
    pub active_ms: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn schema_cache() -> &'static Mutex<Option<SchemaBundle>> {
    static CACHE: OnceLock<Mutex<Option<SchemaBundle>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn consent_flag() -> &'static AtomicBool {
    static FLAG: OnceLock<AtomicBool> = OnceLock::new();
    FLAG.get_or_init(|| AtomicBool::new(false))
}

/// Sync in-memory gate from persisted config (call on load / pref set).
pub fn set_consent_enabled(enabled: bool) {
    consent_flag().store(enabled, Ordering::SeqCst);
}

pub fn consent_enabled() -> bool {
    consent_flag().load(Ordering::SeqCst)
}

fn global_vscdb_path() -> Option<PathBuf> {
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

fn vscdb_uri(path: &Path, query: &str) -> String {
    format!(
        "file:///{}?{}",
        path.to_string_lossy().replace('\\', "/"),
        query
    )
}

fn wal_path(db: &Path) -> PathBuf {
    PathBuf::from(format!("{}-wal", db.display()))
}

fn shm_path(db: &Path) -> PathBuf {
    PathBuf::from(format!("{}-shm", db.display()))
}

fn has_wal_sidecars(db: &Path) -> bool {
    wal_path(db).is_file() || shm_path(db).is_file()
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FileMarks {
    db_mtime_ms: u64,
    db_size: u64,
    wal_mtime_ms: u64,
    wal_size: u64,
    shm_mtime_ms: u64,
    shm_size: u64,
}

fn file_mtime_size(p: &Path) -> (u64, u64) {
    match std::fs::metadata(p) {
        Ok(m) => {
            let size = m.len();
            let mtime = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            (mtime, size)
        }
        Err(_) => (0, 0),
    }
}

fn collect_marks(db: &Path) -> FileMarks {
    let (db_mtime_ms, db_size) = file_mtime_size(db);
    let (wal_mtime_ms, wal_size) = file_mtime_size(&wal_path(db));
    let (shm_mtime_ms, shm_size) = file_mtime_size(&shm_path(db));
    FileMarks {
        db_mtime_ms,
        db_size,
        wal_mtime_ms,
        wal_size,
        shm_mtime_ms,
        shm_size,
    }
}

struct SnapshotCache {
    marks: FileMarks,
    dir: PathBuf,
}

fn snapshot_cache() -> &'static Mutex<Option<SnapshotCache>> {
    static CACHE: OnceLock<Mutex<Option<SnapshotCache>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn err_is_busy(err: &str) -> bool {
    let e = err.to_ascii_lowercase();
    e.contains("busy")
        || e.contains("locked")
        || e.contains("unable to open")
        || e.contains("disk i/o")
}

fn open_uri(uri: &str, query_only: bool) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(
        uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("open vscdb: {e}"))?;
    let _ = conn.busy_timeout(OPEN_BUSY_TIMEOUT);
    if query_only {
        let _ = conn.execute_batch("PRAGMA query_only=ON;");
    }
    Ok(conn)
}

/// Community ladder (carryover / ccopy / vscode): live RO → WAL-trio copy → VACUUM INTO.
/// Never use immutable=1 while -wal/-shm exist (moraine).
pub fn open_vscdb_ro(path: &Path) -> Result<Connection, String> {
    open_ro(path)
}

fn open_ro(path: &Path) -> Result<Connection, String> {
    let live_uri = vscdb_uri(path, "mode=ro");
    match open_uri(&live_uri, true) {
        Ok(c) => return Ok(c),
        Err(e) => {
            crate::app_log::sync_emergency_line(
                "cursor_activity",
                &format!("open: live failed ({e})"),
            );
            if !err_is_busy(&e) && !has_wal_sidecars(path) {
                // Cleanly closed DB on RO media — immutable is safe only without sidecars.
                match open_uri(&vscdb_uri(path, "mode=ro&immutable=1"), true) {
                    Ok(c) => {
                        crate::app_log::sync_emergency_line(
                            "cursor_activity",
                            "open: live miss → immutable (no sidecars)",
                        );
                        return Ok(c);
                    }
                    Err(ie) => {
                        crate::app_log::sync_emergency_line(
                            "cursor_activity",
                            &format!("open: immutable failed ({ie})"),
                        );
                    }
                }
            }
        }
    }

    match open_via_wal_trio_copy(path) {
        Ok(c) => {
            crate::app_log::sync_emergency_line("cursor_activity", "open: WAL-trio snapshot ok");
            return Ok(c);
        }
        Err(e) => {
            crate::app_log::sync_emergency_line(
                "cursor_activity",
                &format!("open: WAL-trio failed ({e})"),
            );
        }
    }

    match open_via_vacuum_into(path) {
        Ok(c) => {
            crate::app_log::sync_emergency_line("cursor_activity", "open: VACUUM INTO ok");
            Ok(c)
        }
        Err(e) => {
            crate::app_log::sync_emergency_line(
                "cursor_activity",
                &format!("open: VACUUM INTO failed ({e})"),
            );
            Err(e)
        }
    }
}

fn copy_wal_trio_to_dir(path: &Path, dir: &Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("snapshot mkdir: {e}"))?;
    let dest = dir.join("state.vscdb");
    std::fs::copy(path, &dest).map_err(|e| format!("snapshot copy db: {e}"))?;
    let wal = wal_path(path);
    if wal.is_file() {
        std::fs::copy(&wal, dir.join("state.vscdb-wal"))
            .map_err(|e| format!("snapshot copy wal: {e}"))?;
    }
    let shm = shm_path(path);
    if shm.is_file() {
        let _ = std::fs::copy(&shm, dir.join("state.vscdb-shm"));
    }
    Ok(dest)
}

fn open_via_wal_trio_copy(path: &Path) -> Result<Connection, String> {
    let marks = collect_marks(path);
    {
        let guard = snapshot_cache().lock().unwrap_or_else(|e| e.into_inner());
        if let Some(c) = guard.as_ref() {
            if c.marks == marks {
                let dest = c.dir.join("state.vscdb");
                if dest.is_file() {
                    return open_uri(&vscdb_uri(&dest, "mode=ro"), true);
                }
            }
        }
    }

    let dir = std::env::temp_dir().join(format!(
        "onetone-vscdb-{}-{}",
        std::process::id(),
        now_ms() % 1_000_000
    ));
    let dest = copy_wal_trio_to_dir(path, &dir)?;
    let conn = open_uri(&vscdb_uri(&dest, "mode=ro"), true)?;
    *snapshot_cache().lock().unwrap_or_else(|e| e.into_inner()) = Some(SnapshotCache { marks, dir });
    Ok(conn)
}

fn sql_path_literal(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .replace('\'', "''")
}

/// Consistent single-file snapshot (ccb). Source opened RO without query_only.
fn open_via_vacuum_into(path: &Path) -> Result<Connection, String> {
    let live = open_uri(&vscdb_uri(path, "mode=ro"), false)?;
    let dir = std::env::temp_dir().join(format!(
        "onetone-vscdb-vac-{}-{}",
        std::process::id(),
        now_ms() % 1_000_000
    ));
    std::fs::create_dir_all(&dir).map_err(|e| format!("vacuum mkdir: {e}"))?;
    let dest = dir.join("state.vscdb");
    if dest.exists() {
        let _ = std::fs::remove_file(&dest);
    }
    let lit = sql_path_literal(&dest);
    live.execute(&format!("VACUUM INTO '{lit}'"), [])
        .map_err(|e| format!("VACUUM INTO: {e}"))?;
    drop(live);
    open_uri(&vscdb_uri(&dest, "mode=ro"), true)
}

fn prior_ready_snap() -> Option<AgentUsageSnapshot> {
    let prev = agent_usage::snapshot(crate::soft_pad_runtime::AgentKind::Cursor);
    if prev.status == "ready" && prev.source == SRC_CURSOR_LOCAL {
        Some(prev)
    } else if prev.source == SRC_CURSOR_LOCAL
        && (prev.local_today_requests.is_some() || prev.local_today_sessions.is_some())
    {
        Some(prev)
    } else {
        None
    }
}

fn keep_prior_ready_snap() -> bool {
    prior_ready_snap().is_some()
}

fn kv_get(conn: &Connection, table: &str, key: &str) -> Option<Value> {
    // Only ItemTable / cursorDiskKV — never auth key names.
    if table != "ItemTable" && table != "cursorDiskKV" {
        return None;
    }
    if key.starts_with("cursorAuth/") || key.contains("accessToken") || key.contains("refreshToken")
    {
        return None;
    }
    let sql = format!("SELECT value FROM [{table}] WHERE key = ?1");
    let raw: Result<Vec<u8>, _> = conn.query_row(&sql, [key], |row| {
        let v: Vec<u8> = row.get(0)?;
        Ok(v)
    });
    let bytes = match raw {
        Ok(b) => b,
        Err(_) => {
            let s: Result<String, _> = conn.query_row(&sql, [key], |row| row.get(0));
            s.ok()?.into_bytes()
        }
    };
    let text = String::from_utf8_lossy(&bytes);
    serde_json::from_str(text.trim()).ok()
}

fn as_ms(v: &Value) -> Option<u64> {
    match v {
        Value::Number(n) => n.as_u64().or_else(|| n.as_i64().map(|i| i.max(0) as u64)),
        Value::String(s) => {
            let s = s.trim();
            if let Ok(n) = s.parse::<u64>() {
                return Some(n);
            }
            chrono_lite_parse(s).ok()
        }
        _ => None,
    }
}

/// Cursor bubbles use RFC3339 (`2026-08-08T02:02:29.170Z`). No chrono dep.
fn chrono_lite_parse(s: &str) -> Result<u64, ()> {
    let s = s.trim();
    let (date, time_and_off) = s.split_once('T').ok_or(())?;
    let mut dp = date.split('-');
    let y: i32 = dp.next().ok_or(())?.parse().map_err(|_| ())?;
    let m: u32 = dp.next().ok_or(())?.parse().map_err(|_| ())?;
    let d: u32 = dp.next().ok_or(())?.parse().map_err(|_| ())?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return Err(());
    }

    let (time_part, offset_secs) = parse_rfc3339_offset(time_and_off)?;
    let mut tp = time_part.split(':');
    let hh: u32 = tp.next().ok_or(())?.parse().map_err(|_| ())?;
    let mm: u32 = tp.next().ok_or(())?.parse().map_err(|_| ())?;
    let sec_raw = tp.next().ok_or(())?;
    let (sec_s, frac_s) = match sec_raw.split_once('.') {
        Some((a, b)) => (a, b),
        None => (sec_raw, ""),
    };
    let sec: u32 = sec_s.parse().map_err(|_| ())?;
    if hh > 23 || mm > 59 || sec > 60 {
        return Err(());
    }
    let mut frac_ms: u64 = 0;
    if !frac_s.is_empty() {
        let mut digits: String = frac_s
            .chars()
            .filter(|c| c.is_ascii_digit())
            .take(3)
            .collect();
        while digits.len() < 3 {
            digits.push('0');
        }
        frac_ms = digits.parse().map_err(|_| ())?;
    }

    let days = days_from_civil(y, m, d);
    let day_ms = days.saturating_mul(86_400) as i64;
    let tod = (hh as i64) * 3600 + (mm as i64) * 60 + (sec as i64);
    let utc_secs = day_ms + tod - offset_secs;
    if utc_secs < 0 {
        return Err(());
    }
    Ok((utc_secs as u64)
        .saturating_mul(1000)
        .saturating_add(frac_ms))
}

fn parse_rfc3339_offset(time_and_off: &str) -> Result<(&str, i64), ()> {
    let t = time_and_off.trim();
    if t.ends_with('Z') || t.ends_with('z') {
        return Ok((&t[..t.len() - 1], 0));
    }
    // Find +/- timezone after HH:MM:SS
    let bytes = t.as_bytes();
    let mut split_at = None;
    for i in (0..bytes.len()).rev() {
        if bytes[i] == b'+' || (bytes[i] == b'-' && i > 0) {
            // Prefer the offset marker (not a date dash — none here).
            if i >= 8 {
                split_at = Some(i);
                break;
            }
        }
    }
    let Some(i) = split_at else {
        // No Z / offset — treat as UTC (Cursor sometimes omits Z).
        return Ok((t, 0));
    };
    let (time_part, off) = t.split_at(i);
    let sign: i64 = if off.starts_with('+') { 1 } else { -1 };
    let off = &off[1..];
    let (oh, om) = off.split_once(':').ok_or(())?;
    let oh: i64 = oh.parse().map_err(|_| ())?;
    let om: i64 = om.parse().map_err(|_| ())?;
    Ok((time_part, sign * (oh * 3600 + om * 60)))
}

/// Howard Hinnant days_from_civil → days since Unix epoch.
fn days_from_civil(y: i32, m: u32, d: u32) -> i64 {
    let y = y as i64 - if m <= 2 { 1 } else { 0 };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let mp = if m > 2 { m as i64 - 3 } else { m as i64 + 9 };
    let doy = (153 * mp + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn local_day_bounds_ms(now: u64) -> (u64, u64) {
    let offset = local_utc_offset_secs();
    let secs = (now / 1000) as i64;
    let local = secs + offset;
    let day = local.div_euclid(86400);
    let today_start_local = day * 86400;
    let today_start = ((today_start_local - offset).max(0) as u64) * 1000;
    let yest_start = today_start.saturating_sub(86_400_000);
    (today_start, yest_start)
}

fn local_utc_offset_secs() -> i64 {
    #[cfg(windows)]
    {
        use std::mem::MaybeUninit;
        use winapi::um::minwinbase::SYSTEMTIME;
        use winapi::um::sysinfoapi::{GetLocalTime, GetSystemTime};
        unsafe {
            let mut local = MaybeUninit::<SYSTEMTIME>::zeroed();
            let mut utc = MaybeUninit::<SYSTEMTIME>::zeroed();
            GetLocalTime(local.as_mut_ptr());
            GetSystemTime(utc.as_mut_ptr());
            let local = local.assume_init();
            let utc = utc.assume_init();
            let lm = local.wHour as i64 * 60 + local.wMinute as i64;
            let um = utc.wHour as i64 * 60 + utc.wMinute as i64;
            let mut d = lm - um;
            if d > 12 * 60 {
                d -= 24 * 60;
            } else if d < -12 * 60 {
                d += 24 * 60;
            }
            d * 60
        }
    }
    #[cfg(not(windows))]
    {
        0
    }
}

/// Newer Cursor dropped ItemTable `composer.composerHeaders`; composers live only under
/// `cursorDiskKV` keys `composerData:<id>`. Aggregate synthesizes the list from that scan.
const COMPOSER_DATA_SCAN_KEY: &str = "__composerData_scan__";

fn is_composer_data_scan(headers: &HeadersLayout) -> bool {
    headers.key == COMPOSER_DATA_SCAN_KEY
}

fn detect_composer_headers(conn: &Connection) -> Option<HeadersLayout> {
    // Candidate keys — validate shape, don't assume name alone means schema.
    let candidates = ["composer.composerHeaders", "composer.composerData"];
    for key in candidates {
        let v = match kv_get(conn, "ItemTable", key) {
            Some(v) => v,
            None => continue,
        };
        let obj = v.as_object()?;
        let list_field = ["allComposers", "composers", "headers"]
            .into_iter()
            .find(|f| obj.get(*f).and_then(|x| x.as_array()).is_some())?;
        let list = obj.get(list_field)?.as_array()?;
        if list.is_empty() {
            // Empty install — still a valid layout if fields exist on empty array path:
            // require known list field name + object shape.
            return Some(HeadersLayout {
                table: "ItemTable".into(),
                key: key.into(),
                list_field: list_field.into(),
                id_field: "composerId".into(),
                ts_fields: vec!["lastUpdatedAt".into(), "createdAt".into()],
            });
        }
        let sample = list.iter().find_map(|x| x.as_object())?;
        let id_field = ["composerId", "id"]
            .into_iter()
            .find(|f| sample.get(*f).and_then(|x| x.as_str()).is_some())?;
        let mut ts_fields = Vec::new();
        for f in ["lastUpdatedAt", "createdAt", "updatedAt"] {
            if sample.get(f).map(|x| as_ms(x).is_some()).unwrap_or(false) {
                ts_fields.push(f.to_string());
            }
        }
        if ts_fields.is_empty() {
            continue;
        }
        return Some(HeadersLayout {
            table: "ItemTable".into(),
            key: key.into(),
            list_field: list_field.into(),
            id_field: id_field.into(),
            ts_fields,
        });
    }
    None
}

fn composer_data_layout_from_obj(obj: &serde_json::Map<String, Value>) -> Option<ComposerDataLayout> {
    let headers_field = [
        "fullConversationHeadersOnly",
        "conversationHeaders",
        "headers",
    ]
    .into_iter()
    .find(|f| obj.get(*f).and_then(|x| x.as_array()).is_some())?;
    let hdrs = obj.get(headers_field)?.as_array()?;
    let (bubble_id_field, type_field) = match hdrs.iter().find_map(|h| h.as_object()) {
        Some(sample) => {
            let bubble_id_field = ["bubbleId", "id"]
                .into_iter()
                .find(|f| sample.get(*f).and_then(|x| x.as_str()).is_some())
                .unwrap_or("bubbleId");
            let type_field = ["type", "bubbleType"]
                .into_iter()
                .find(|f| sample.get(*f).is_some())
                .unwrap_or("type");
            (bubble_id_field, type_field)
        }
        None => ("bubbleId", "type"),
    };
    Some(ComposerDataLayout {
        table: "cursorDiskKV".into(),
        key_prefix: "composerData:".into(),
        headers_field: headers_field.into(),
        bubble_id_field: bubble_id_field.into(),
        type_field: type_field.into(),
        user_type: 1,
    })
}

fn detect_composer_data(conn: &Connection, headers: &HeadersLayout) -> Option<ComposerDataLayout> {
    if is_composer_data_scan(headers) {
        return None; // filled by detect_schema_from_composer_data
    }
    let index = kv_get(conn, &headers.table, &headers.key)?;
    let list = index
        .get(&headers.list_field)
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    let sample_id = list.iter().find_map(|c| {
        c.get(&headers.id_field)
            .and_then(|x| x.as_str())
            .map(|s| s.to_string())
    })?;
    let key = format!("composerData:{sample_id}");
    let data = kv_get(conn, "cursorDiskKV", &key)?;
    composer_data_layout_from_obj(data.as_object()?)
}

/// ItemTable index gone — sample `composerData:*` rows for layout.
fn detect_schema_from_composer_data(conn: &Connection) -> Option<SchemaBundle> {
    let mut stmt = conn
        .prepare("SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%' LIMIT 32")
        .ok()?;
    let keys: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .ok()?
        .filter_map(|r| r.ok())
        .collect();
    if keys.is_empty() {
        return None;
    }
    let mut composer = None;
    for key in &keys {
        let Some(data) = kv_get(conn, "cursorDiskKV", key) else {
            continue;
        };
        let Some(obj) = data.as_object() else {
            continue;
        };
        if let Some(layout) = composer_data_layout_from_obj(obj) {
            composer = Some(layout);
            break;
        }
    }
    let composer = composer.unwrap_or(ComposerDataLayout {
        table: "cursorDiskKV".into(),
        key_prefix: "composerData:".into(),
        headers_field: "fullConversationHeadersOnly".into(),
        bubble_id_field: "bubbleId".into(),
        type_field: "type".into(),
        user_type: 1,
    });
    let headers = HeadersLayout {
        table: "cursorDiskKV".into(),
        key: COMPOSER_DATA_SCAN_KEY.into(),
        list_field: "allComposers".into(),
        id_field: "composerId".into(),
        ts_fields: vec!["lastUpdatedAt".into(), "createdAt".into()],
    };
    crate::app_log::sync_emergency_line(
        "cursor_activity",
        "schema: ItemTable headers miss → composerData scan",
    );
    Some(SchemaBundle {
        headers,
        composer,
        bubble: None, // light-first; bubble upgrade optional via later sample
        detected_at_ms: now_ms(),
    })
}

fn detect_bubble_schema(
    conn: &Connection,
    headers: &HeadersLayout,
    composer: &ComposerDataLayout,
) -> Option<BubbleLayout> {
    let list = composer_list_values(conn, headers).ok()?;
    for c in list.iter().take(8) {
        let cid = c.get(&headers.id_field)?.as_str()?;
        let data = kv_get(
            conn,
            &composer.table,
            &format!("{}{cid}", composer.key_prefix),
        )?;
        let hdrs = data.get(&composer.headers_field)?.as_array()?;
        let bid = hdrs.iter().find_map(|h| {
            let t = h
                .get(&composer.type_field)
                .and_then(|x| x.as_i64().or_else(|| x.as_u64().map(|u| u as i64)));
            if t != Some(composer.user_type) {
                return None;
            }
            h.get(&composer.bubble_id_field)
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
        })?;
        let prefix = "bubbleId:";
        let bkey = format!("{prefix}{cid}:{bid}");
        let bubble = kv_get(conn, "cursorDiskKV", &bkey)?;
        let created_at_field = ["createdAt", "timestamp", "created_at"]
            .into_iter()
            .find(|f| bubble.get(*f).and_then(as_ms).is_some())?;
        // Confirm we can read meta without requiring text field.
        return Some(BubbleLayout {
            table: "cursorDiskKV".into(),
            key_prefix: prefix.into(),
            created_at_field: created_at_field.into(),
        });
    }
    None
}

fn detect_schema(conn: &Connection) -> Option<SchemaBundle> {
    if let Some(headers) = detect_composer_headers(conn) {
        if let Some(composer) = detect_composer_data(conn, &headers) {
            let bubble = detect_bubble_schema(conn, &headers, &composer);
            return Some(SchemaBundle {
                headers,
                composer,
                bubble,
                detected_at_ms: now_ms(),
            });
        }
    }
    detect_schema_from_composer_data(conn)
}

/// Build the composer index list: ItemTable JSON or synthesized from `composerData:*`.
fn composer_list_values(
    conn: &Connection,
    headers: &HeadersLayout,
) -> Result<Vec<Value>, String> {
    if is_composer_data_scan(headers) {
        return scan_composer_data_index(conn);
    }
    let index = kv_get(conn, &headers.table, &headers.key)
        .ok_or_else(|| "headers missing".to_string())?;
    index
        .get(&headers.list_field)
        .and_then(|x| x.as_array())
        .cloned()
        .ok_or_else(|| "composer list missing".to_string())
}

fn scan_composer_data_index(conn: &Connection) -> Result<Vec<Value>, String> {
    // json_extract keeps cost ~seconds on multi-GB DBs vs full-blob scan.
    let sql = "SELECT key,
            json_extract(value, '$.composerId'),
            json_extract(value, '$.createdAt'),
            json_extract(value, '$.lastUpdatedAt'),
            json_extract(value, '$.conversationCheckpointLastUpdatedAt')
         FROM cursorDiskKV WHERE key LIKE 'composerData:%'";
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => {
            // JSON1 unavailable — fall back to key-only + full kv_get (slower).
            return scan_composer_data_index_fallback(conn);
        }
    };
    let rows = stmt
        .query_map([], |row| {
            let key: String = row.get(0)?;
            let cid: Option<String> = row.get(1)?;
            let created: Option<f64> = row.get(2)?;
            let updated: Option<f64> = row.get(3)?;
            let checkpoint: Option<f64> = row.get(4)?;
            Ok((key, cid, created, updated, checkpoint))
        })
        .map_err(|e| format!("composerData scan: {e}"))?;
    let mut out = Vec::new();
    for row in rows.flatten() {
        let (key, cid, created, updated, checkpoint) = row;
        let id = cid
            .filter(|s| !s.is_empty())
            .or_else(|| {
                key.strip_prefix("composerData:")
                    .map(|s| s.to_string())
                    .filter(|s| !s.is_empty())
            })
            .unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        let created_ms = created.and_then(|n| if n > 0.0 { Some(n as u64) } else { None });
        let updated_ms = updated
            .and_then(|n| if n > 0.0 { Some(n as u64) } else { None })
            .or_else(|| {
                checkpoint.and_then(|n| if n > 0.0 { Some(n as u64) } else { None })
            })
            .or(created_ms);
        let mut obj = serde_json::Map::new();
        obj.insert("composerId".into(), Value::String(id));
        if let Some(ms) = created_ms {
            obj.insert("createdAt".into(), Value::Number(ms.into()));
        }
        if let Some(ms) = updated_ms {
            obj.insert("lastUpdatedAt".into(), Value::Number(ms.into()));
        }
        out.push(Value::Object(obj));
    }
    Ok(out)
}

fn scan_composer_data_index_fallback(conn: &Connection) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare("SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%'")
        .map_err(|e| format!("composerData keys: {e}"))?;
    let keys: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("composerData keys: {e}"))?
        .filter_map(|r| r.ok())
        .collect();
    let mut out = Vec::new();
    for key in keys {
        let Some(data) = kv_get(conn, "cursorDiskKV", &key) else {
            continue;
        };
        let id = data
            .get("composerId")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                key.strip_prefix("composerData:")
                    .map(|s| s.to_string())
                    .filter(|s| !s.is_empty())
            })
            .unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        let mut obj = serde_json::Map::new();
        obj.insert("composerId".into(), Value::String(id));
        if let Some(ms) = data.get("createdAt").and_then(as_ms) {
            obj.insert("createdAt".into(), Value::Number(ms.into()));
        }
        if let Some(ms) = data
            .get("lastUpdatedAt")
            .and_then(as_ms)
            .or_else(|| data.get("conversationCheckpointLastUpdatedAt").and_then(as_ms))
        {
            obj.insert("lastUpdatedAt".into(), Value::Number(ms.into()));
        }
        out.push(Value::Object(obj));
    }
    Ok(out)
}

fn cached_schema(conn: &Connection) -> Option<SchemaBundle> {
    let stale = {
        let guard = schema_cache().lock().unwrap_or_else(|e| e.into_inner());
        guard.clone()
    };
    if let Some(ref s) = stale {
        if now_ms().saturating_sub(s.detected_at_ms) < SCHEMA_CACHE_MS {
            return Some(s.clone());
        }
    }
    if let Some(fresh) = detect_schema(conn) {
        *schema_cache().lock().unwrap_or_else(|e| e.into_inner()) = Some(fresh.clone());
        return Some(fresh);
    }
    // Live detect failed (often WAL busy) — reuse stale schema up to a day.
    if let Some(s) = stale {
        if now_ms().saturating_sub(s.detected_at_ms) < SCHEMA_STALE_MAX_MS {
            crate::app_log::sync_emergency_line(
                "cursor_activity",
                "schema: detect miss → reuse stale layout",
            );
            return Some(s);
        }
    }
    None
}

fn session_ts(c: &Value, layout: &HeadersLayout) -> u64 {
    for f in &layout.ts_fields {
        if let Some(ms) = c.get(f).and_then(as_ms) {
            return ms;
        }
    }
    0
}

fn bubble_created_at(
    conn: &Connection,
    layout: &BubbleLayout,
    cid: &str,
    bid: &str,
) -> Option<u64> {
    let key = format!("{}{cid}:{bid}", layout.key_prefix);
    let v = kv_get(conn, &layout.table, &key)?;
    as_ms(v.get(&layout.created_at_field)?)
}

/// Headers-only KPI: force no bubble lookups (composer-day attribution).
pub fn aggregate_activity_light(
    conn: &Connection,
    schema: &SchemaBundle,
) -> Result<ActivityTotals, String> {
    let mut light = schema.clone();
    light.bubble = None;
    aggregate_activity(conn, &light)
}

pub fn aggregate_activity(
    conn: &Connection,
    schema: &SchemaBundle,
) -> Result<ActivityTotals, String> {
    let list = composer_list_values(conn, &schema.headers)?;

    let now = now_ms();
    let (today_start, yest_start) = local_day_bounds_ms(now);

    let mut totals = ActivityTotals::default();
    let mut spans: Vec<(u64, u64)> = Vec::new();

    for c in &list {
        let ts = session_ts(c, &schema.headers);
        let active_today = ts >= today_start;
        if !active_today {
            // Still count yesterday turns from recently updated sessions that may span days.
            // Only skip composers with no activity in last 2 days.
            if ts < yest_start {
                continue;
            }
        }
        if active_today {
            totals.sessions_today = totals.sessions_today.saturating_add(1);
        }
        let cid = match c.get(&schema.headers.id_field).and_then(|x| x.as_str()) {
            Some(s) => s,
            None => continue,
        };
        let data = match kv_get(
            conn,
            &schema.composer.table,
            &format!("{}{cid}", schema.composer.key_prefix),
        ) {
            Some(v) => v,
            None => continue,
        };
        let hdrs = match data
            .get(&schema.composer.headers_field)
            .and_then(|x| x.as_array())
        {
            Some(h) => h,
            None => continue,
        };
        let mut day_ts = Vec::new();
        for h in hdrs {
            let t = h
                .get(&schema.composer.type_field)
                .and_then(|x| x.as_i64().or_else(|| x.as_u64().map(|u| u as i64)));
            if t != Some(schema.composer.user_type) {
                continue;
            }
            let bid = match h
                .get(&schema.composer.bubble_id_field)
                .and_then(|x| x.as_str())
            {
                Some(s) => s,
                None => continue,
            };
            let ca = schema
                .bubble
                .as_ref()
                .and_then(|b| bubble_created_at(conn, b, cid, bid));
            let ca = match ca {
                Some(ms) => ms,
                None => {
                    // Degraded / light: attribute user header to composer session day.
                    if active_today {
                        totals.turns_today = totals.turns_today.saturating_add(1);
                        if ts > 0 {
                            day_ts.push(ts);
                        }
                    } else if ts >= yest_start {
                        totals.turns_yesterday = totals.turns_yesterday.saturating_add(1);
                    }
                    continue;
                }
            };
            if ca >= today_start {
                totals.turns_today = totals.turns_today.saturating_add(1);
                day_ts.push(ca);
            } else if ca >= yest_start {
                totals.turns_yesterday = totals.turns_yesterday.saturating_add(1);
            }
        }
        if let (Some(a), Some(b)) = (day_ts.iter().min(), day_ts.iter().max()) {
            if *b >= *a {
                spans.push((*a, *b));
            }
        }
    }
    totals.active_ms = spans.iter().map(|(a, b)| b.saturating_sub(*a)).sum();
    Ok(totals)
}

fn disabled_snap(status: &str, message: &str) -> AgentUsageSnapshot {
    let now = now_ms();
    AgentUsageSnapshot {
        source: SRC_CURSOR_LOCAL.into(),
        // consent_off | busy | unavailable — never collapse busy into unavailable
        // (home strip treated unavailable as「未开启」and showed a dead 开启 CTA).
        status: status.into(),
        confidence: "local_only".into(),
        message: message.into(),
        console_url: CURSOR_USAGE_CONSOLE.into(),
        updated_at: now,
        ..Default::default()
    }
}

fn ready_snap(t: &ActivityTotals) -> AgentUsageSnapshot {
    let now = now_ms();
    AgentUsageSnapshot {
        source: SRC_CURSOR_LOCAL.into(),
        status: "ready".into(),
        confidence: "local_only".into(),
        local_today_requests: Some(t.turns_today),
        local_today_sessions: Some(t.sessions_today),
        local_today_active_ms: Some(t.active_ms),
        local_yesterday_requests: Some(t.turns_yesterday),
        message: format!("今日 {} 次对话 · 本地统计", t.turns_today),
        console_url: CURSOR_USAGE_CONSOLE.into(),
        updated_at: now,
        last_success_at: now,
        // remaining / windows intentionally empty — Activity ≠ Quota
        ..Default::default()
    }
}

fn put_busy_preserving_totals(detail: &str) {
    note_refresh_busy(true);
    let mut snap = disabled_snap(
        "busy",
        "Cursor 本地统计暂时读不到（库正忙），稍后自动重试",
    );
    if let Some(prev) = prior_ready_snap() {
        snap.local_today_requests = prev.local_today_requests;
        snap.local_today_sessions = prev.local_today_sessions;
        snap.local_today_active_ms = prev.local_today_active_ms;
        snap.local_yesterday_requests = prev.local_yesterday_requests;
        snap.last_success_at = prev.last_success_at;
        if prev.local_today_requests.is_some() {
            snap.message = format!(
                "今日 {} 次 · 刷新暂缓（库忙）",
                prev.local_today_requests.unwrap_or(0)
            );
        }
        crate::app_log::sync_emergency_line(
            "cursor_activity",
            &format!("busy keep prior totals ({detail})"),
        );
    } else {
        crate::app_log::sync_emergency_line(
            "cursor_activity",
            &format!("busy no prior ({detail})"),
        );
    }
    agent_usage::put_snapshot(crate::soft_pad_runtime::AgentKind::Cursor, snap);
}

fn put_schema_unknown() {
    note_refresh_busy(false);
    // Distinct from busy — never paint schema miss as「库正忙」.
    // Prior totals may ride along for the strip, but status is schema_unknown (not ready).
    let mut snap = disabled_snap(
        "schema_unknown",
        "Cursor 本地库结构暂时无法识别，稍后重试",
    );
    if let Some(prev) = prior_ready_snap() {
        snap.local_today_requests = prev.local_today_requests;
        snap.local_today_sessions = prev.local_today_sessions;
        snap.local_today_active_ms = prev.local_today_active_ms;
        snap.local_yesterday_requests = prev.local_yesterday_requests;
        snap.last_success_at = prev.last_success_at;
        crate::app_log::sync_emergency_line(
            "cursor_activity",
            "schema_unknown (totals kept if any)",
        );
    } else {
        crate::app_log::sync_emergency_line("cursor_activity", "schema_unknown");
    }
    agent_usage::put_snapshot(crate::soft_pad_runtime::AgentKind::Cursor, snap);
}

/// Refresh Cursor activity snapshot. Gated by consent only (not ONETONE_AGENT_USAGE).
pub fn refresh_once() {
    if !consent_enabled() {
        note_refresh_busy(false);
        agent_usage::put_snapshot(
            crate::soft_pad_runtime::AgentKind::Cursor,
            disabled_snap("consent_off", "未启用 Cursor 活动统计"),
        );
        crate::app_log::sync_emergency_line("cursor_activity", "refresh skipped: consent off");
        return;
    }
    let path = match global_vscdb_path() {
        Some(p) => p,
        None => {
            note_refresh_busy(false);
            agent_usage::put_snapshot(
                crate::soft_pad_runtime::AgentKind::Cursor,
                disabled_snap("unavailable", "未找到本机 Cursor 使用记录"),
            );
            crate::app_log::sync_emergency_line("cursor_activity", "refresh: no vscdb");
            return;
        }
    };

    for attempt in 0..2u32 {
        if attempt > 0 {
            std::thread::sleep(Duration::from_millis(500));
        }
        let conn = match open_ro(&path) {
            Ok(c) => c,
            Err(e) => {
                crate::app_log::sync_emergency_line(
                    "cursor_activity",
                    &format!("refresh: open failed attempt={attempt} {e}"),
                );
                if attempt == 0 {
                    continue;
                }
                if err_is_busy(&e) {
                    put_busy_preserving_totals(&e);
                } else if !keep_prior_ready_snap() {
                    note_refresh_busy(false);
                    agent_usage::put_snapshot(
                        crate::soft_pad_runtime::AgentKind::Cursor,
                        disabled_snap("unavailable", &format!("无法读取本地记录（{e}）")),
                    );
                }
                return;
            }
        };

        let schema = match cached_schema(&conn) {
            Some(s) => s,
            None => {
                crate::app_log::sync_emergency_line(
                    "cursor_activity",
                    &format!("refresh: schema miss attempt={attempt}"),
                );
                if attempt == 0 {
                    continue;
                }
                put_schema_unknown();
                return;
            }
        };

        // Light probe first — enough for KPI under WAL contention.
        let light = match aggregate_activity_light(&conn, &schema) {
            Ok(t) => t,
            Err(e) => {
                crate::app_log::sync_emergency_line(
                    "cursor_activity",
                    &format!("refresh: light aggregate failed attempt={attempt} {e}"),
                );
                if attempt == 0 {
                    continue;
                }
                if err_is_busy(&e) {
                    put_busy_preserving_totals(&e);
                } else if !keep_prior_ready_snap() {
                    note_refresh_busy(false);
                    agent_usage::put_snapshot(
                        crate::soft_pad_runtime::AgentKind::Cursor,
                        disabled_snap("unavailable", &format!("活动统计失败（{e}）")),
                    );
                }
                return;
            }
        };

        note_refresh_busy(false);
        let mut best = light;
        // Upgrade with bubble timestamps only when calm.
        if schema.bubble.is_some() {
            match aggregate_activity(&conn, &schema) {
                Ok(full) => best = full,
                Err(e) => {
                    crate::app_log::sync_emergency_line(
                        "cursor_activity",
                        &format!("refresh: full aggregate skipped ({e}); keeping light"),
                    );
                }
            }
        }

        crate::app_log::sync_emergency_line(
            "cursor_activity",
            &format!(
                "ready turns={} sessions={} active_ms={} bubble={}",
                best.turns_today,
                best.sessions_today,
                best.active_ms,
                schema.bubble.is_some()
            ),
        );
        agent_usage::put_snapshot(
            crate::soft_pad_runtime::AgentKind::Cursor,
            ready_snap(&best),
        );
        return;
    }
}

pub fn start_cursor_activity_poll(app: tauri::AppHandle, state: std::sync::Arc<crate::AppState>) {
    static STARTED: AtomicBool = AtomicBool::new(false);
    if STARTED.load(Ordering::SeqCst) {
        return;
    }
    let consent = consent_enabled();
    crate::app_log::sync_emergency_line(
        "cursor_activity",
        &format!("poll starting consent={consent}"),
    );
    let spawned = std::thread::Builder::new()
        .name("cursor-activity".into())
        .spawn(move || loop {
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                refresh_once();
            }));
            crate::codex_micro_overlay::request_overlay_push(&app, state.as_ref(), false);
            let secs = if last_busy_flag().load(Ordering::SeqCst) {
                REFRESH_BUSY_SECS
            } else {
                REFRESH_SECS
            };
            std::thread::sleep(Duration::from_secs(secs));
        });
    if spawned.is_ok() {
        STARTED.store(true, Ordering::SeqCst);
    } else {
        crate::app_log::sync_emergency_line("cursor_activity", "poll spawn failed");
    }
}

/// Probe helpers for unit tests / scripts (read-only).
pub fn probe_totals_for_path(path: &Path) -> Result<ActivityTotals, String> {
    let conn = open_ro(path)?;
    let schema = detect_schema(&conn).ok_or_else(|| "schema detect failed".to_string())?;
    aggregate_activity(&conn, &schema)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detectors_refuse_auth_keys() {
        // Sanity: kv_get guard on auth prefix without needing a live DB.
        assert!(kv_get(
            &Connection::open_in_memory().unwrap(),
            "ItemTable",
            "cursorAuth/accessToken"
        )
        .is_none());
    }

    #[test]
    fn ready_snap_never_sets_remaining() {
        let snap = ready_snap(&ActivityTotals {
            turns_today: 36,
            turns_yesterday: 30,
            sessions_today: 7,
            active_ms: 2 * 3600 * 1000 + 18 * 60 * 1000,
        });
        assert_eq!(snap.source, SRC_CURSOR_LOCAL);
        assert_eq!(snap.status, "ready");
        assert_eq!(snap.confidence, "local_only");
        assert_eq!(snap.local_today_requests, Some(36));
        assert_eq!(snap.local_today_sessions, Some(7));
        assert!(snap.remaining_percent.is_none());
        assert!(snap.windows.is_empty());
        assert!(snap.message.contains("本地统计"));
    }

    #[test]
    fn parses_cursor_bubble_iso_created_at() {
        // 2026-08-08T02:02:29.170Z == 1786154549170
        let ms = chrono_lite_parse("2026-08-08T02:02:29.170Z").unwrap();
        assert_eq!(ms, 1_786_154_549_170);
        let ms2 = as_ms(&Value::String("2026-08-08T10:02:29.170+08:00".into())).unwrap();
        assert_eq!(ms2, ms);
    }

    #[test]
    fn vscdb_uri_uses_ro_and_immutable_query() {
        let p = PathBuf::from(r"C:\Users\x\AppData\Roaming\Cursor\User\globalStorage\state.vscdb");
        let live = vscdb_uri(&p, "mode=ro");
        assert!(live.starts_with("file:///C:/Users/"));
        assert!(live.contains("mode=ro"));
        assert!(!live.contains("immutable"));
        let imm = vscdb_uri(&p, "mode=ro&immutable=1");
        assert!(imm.contains("immutable=1"));
    }

    #[test]
    fn stale_schema_survives_empty_db_detect_miss() {
        let bundle = SchemaBundle {
            headers: HeadersLayout {
                table: "ItemTable".into(),
                key: "composer.composerHeaders".into(),
                list_field: "allComposers".into(),
                id_field: "composerId".into(),
                ts_fields: vec!["lastUpdatedAt".into()],
            },
            composer: ComposerDataLayout {
                table: "cursorDiskKV".into(),
                key_prefix: "composerData:".into(),
                headers_field: "fullConversationHeadersOnly".into(),
                bubble_id_field: "bubbleId".into(),
                type_field: "type".into(),
                user_type: 1,
            },
            bubble: None,
            // Just outside fresh TTL, inside stale window.
            detected_at_ms: now_ms().saturating_sub(SCHEMA_CACHE_MS + 1_000),
        };
        *schema_cache().lock().unwrap() = Some(bundle.clone());
        let conn = Connection::open_in_memory().unwrap();
        let got = cached_schema(&conn).expect("stale schema reused");
        assert_eq!(got.headers.key, bundle.headers.key);
        assert!(got.bubble.is_none());
        *schema_cache().lock().unwrap() = None;
    }

    #[test]
    fn aggregate_without_bubble_uses_composer_day() {
        let schema = SchemaBundle {
            headers: HeadersLayout {
                table: "ItemTable".into(),
                key: "composer.composerHeaders".into(),
                list_field: "allComposers".into(),
                id_field: "composerId".into(),
                ts_fields: vec!["lastUpdatedAt".into()],
            },
            composer: ComposerDataLayout {
                table: "cursorDiskKV".into(),
                key_prefix: "composerData:".into(),
                headers_field: "fullConversationHeadersOnly".into(),
                bubble_id_field: "bubbleId".into(),
                type_field: "type".into(),
                user_type: 1,
            },
            bubble: None,
            detected_at_ms: now_ms(),
        };
        let now = now_ms();
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT);
             CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT);",
        )
        .unwrap();
        let headers = serde_json::json!({
            "allComposers": [{ "composerId": "c1", "lastUpdatedAt": now }]
        });
        conn.execute(
            "INSERT INTO ItemTable(key,value) VALUES (?1,?2)",
            rusqlite::params!["composer.composerHeaders", headers.to_string()],
        )
        .unwrap();
        let data = serde_json::json!({
            "fullConversationHeadersOnly": [
                { "bubbleId": "b1", "type": 1 },
                { "bubbleId": "b2", "type": 2 }
            ]
        });
        conn.execute(
            "INSERT INTO cursorDiskKV(key,value) VALUES (?1,?2)",
            rusqlite::params!["composerData:c1", data.to_string()],
        )
        .unwrap();
        let totals = aggregate_activity(&conn, &schema).unwrap();
        assert_eq!(totals.sessions_today, 1);
        assert_eq!(totals.turns_today, 1);
    }

    #[test]
    fn composer_data_scan_when_itemtable_headers_gone() {
        let now = now_ms();
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT);
             CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT);",
        )
        .unwrap();
        // Mimic new Cursor: version key only, no composer.composerHeaders.
        conn.execute(
            "INSERT INTO ItemTable(key,value) VALUES (?1,?2)",
            rusqlite::params!["composer.composerHeaders.version", "1"],
        )
        .unwrap();
        let data = serde_json::json!({
            "composerId": "c-scan",
            "createdAt": now,
            "fullConversationHeadersOnly": [
                { "bubbleId": "b1", "type": 1 },
                { "bubbleId": "b2", "type": 1 },
                { "bubbleId": "b3", "type": 2 }
            ]
        });
        conn.execute(
            "INSERT INTO cursorDiskKV(key,value) VALUES (?1,?2)",
            rusqlite::params!["composerData:c-scan", data.to_string()],
        )
        .unwrap();
        let schema = detect_schema(&conn).expect("composerData scan schema");
        assert_eq!(schema.headers.key, COMPOSER_DATA_SCAN_KEY);
        let totals = aggregate_activity_light(&conn, &schema).unwrap();
        assert_eq!(totals.sessions_today, 1);
        assert_eq!(totals.turns_today, 2);
    }

    #[test]
    fn err_is_busy_classifies_locks_only() {
        assert!(err_is_busy("database is locked"));
        assert!(err_is_busy("SQLITE_BUSY"));
        assert!(err_is_busy("unable to open database file"));
        assert!(!err_is_busy("schema detect failed"));
        assert!(!err_is_busy("headers missing"));
    }

    #[test]
    fn light_probe_ignores_bubble_layout() {
        let now = now_ms();
        let schema = SchemaBundle {
            headers: HeadersLayout {
                table: "ItemTable".into(),
                key: "composer.composerHeaders".into(),
                list_field: "allComposers".into(),
                id_field: "composerId".into(),
                ts_fields: vec!["lastUpdatedAt".into()],
            },
            composer: ComposerDataLayout {
                table: "cursorDiskKV".into(),
                key_prefix: "composerData:".into(),
                headers_field: "fullConversationHeadersOnly".into(),
                bubble_id_field: "bubbleId".into(),
                type_field: "type".into(),
                user_type: 1,
            },
            bubble: Some(BubbleLayout {
                table: "cursorDiskKV".into(),
                key_prefix: "bubbleId:".into(),
                created_at_field: "createdAt".into(),
            }),
            detected_at_ms: now,
        };
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT);
             CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT);",
        )
        .unwrap();
        let headers = serde_json::json!({
            "allComposers": [{ "composerId": "c1", "lastUpdatedAt": now }]
        });
        conn.execute(
            "INSERT INTO ItemTable(key,value) VALUES (?1,?2)",
            rusqlite::params!["composer.composerHeaders", headers.to_string()],
        )
        .unwrap();
        let data = serde_json::json!({
            "fullConversationHeadersOnly": [
                { "bubbleId": "b1", "type": 1 },
                { "bubbleId": "b2", "type": 1 }
            ]
        });
        conn.execute(
            "INSERT INTO cursorDiskKV(key,value) VALUES (?1,?2)",
            rusqlite::params!["composerData:c1", data.to_string()],
        )
        .unwrap();
        // No bubble rows — full aggregate would still fall back; light must not look them up.
        let light = aggregate_activity_light(&conn, &schema).unwrap();
        assert_eq!(light.sessions_today, 1);
        assert_eq!(light.turns_today, 2);
    }

    #[test]
    fn wal_trio_copy_and_marks_reuse() {
        let dir = std::env::temp_dir().join(format!(
            "onetone-vscdb-test-{}-{}",
            std::process::id(),
            now_ms() % 1_000_000
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("state.vscdb");
        // Keep writer open — SQLite drops -wal/-shm on clean close/checkpoint.
        let writer = Connection::open(&db).unwrap();
        writer
            .execute_batch(
                "PRAGMA journal_mode=WAL;
                 CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT);
                 INSERT INTO ItemTable(key,value) VALUES ('k','v');",
            )
            .unwrap();
        assert!(has_wal_sidecars(&db), "WAL mode should create sidecars");
        let snap_dir = dir.join("snap");
        let dest = copy_wal_trio_to_dir(&db, &snap_dir).unwrap();
        assert!(dest.is_file());
        assert!(
            snap_dir.join("state.vscdb-wal").is_file(),
            "trio copy must include -wal while writer holds it"
        );

        let marks = collect_marks(&db);
        *snapshot_cache().lock().unwrap() = Some(SnapshotCache {
            marks: marks.clone(),
            dir: snap_dir.clone(),
        });
        let again = open_via_wal_trio_copy(&db).expect("reuse cached WAL trio");
        drop(again);
        let marks2 = collect_marks(&db);
        assert_eq!(marks, marks2);
        drop(writer);
        *snapshot_cache().lock().unwrap() = None;
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn open_ro_never_needs_immutable_with_sidecars() {
        // With WAL sidecars present, live RO or trio/vacuum must succeed — immutable skipped.
        let dir = std::env::temp_dir().join(format!(
            "onetone-vscdb-open-{}-{}",
            std::process::id(),
            now_ms() % 1_000_000
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("state.vscdb");
        let writer = Connection::open(&db).unwrap();
        writer
            .execute_batch(
                "PRAGMA journal_mode=WAL;
                 CREATE TABLE t (x INTEGER);
                 INSERT INTO t VALUES (1);",
            )
            .unwrap();
        assert!(has_wal_sidecars(&db));
        let opened = open_ro(&db).expect("open_ro with WAL sidecars");
        drop(opened);
        drop(writer);
        *snapshot_cache().lock().unwrap() = None;
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn busy_snap_preserves_totals_schema_unknown_is_distinct() {
        agent_usage::put_snapshot(
            crate::soft_pad_runtime::AgentKind::Cursor,
            ready_snap(&ActivityTotals {
                turns_today: 9,
                turns_yesterday: 2,
                sessions_today: 1,
                active_ms: 0,
            }),
        );
        put_busy_preserving_totals("test");
        let busy = agent_usage::snapshot(crate::soft_pad_runtime::AgentKind::Cursor);
        assert_eq!(busy.status, "busy");
        assert_eq!(busy.local_today_requests, Some(9));
        assert!(busy.message.contains("9") || busy.message.contains("库正忙"));

        put_schema_unknown();
        let unknown = agent_usage::snapshot(crate::soft_pad_runtime::AgentKind::Cursor);
        assert_eq!(unknown.status, "schema_unknown");
        assert_ne!(unknown.status, "busy");
        assert_eq!(unknown.local_today_requests, Some(9));
    }
}
