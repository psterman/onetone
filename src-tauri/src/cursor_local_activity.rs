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
const SCHEMA_CACHE_MS: u64 = 10 * 60 * 1000;

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
    bubble: BubbleLayout,
    detected_at_ms: u64,
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

fn open_ro(path: &Path) -> Result<Connection, String> {
    // URI mode=ro matches Cursor's live WAL readers (plain READ_ONLY can stall on Windows).
    let uri = format!(
        "file:///{}?mode=ro",
        path.to_string_lossy().replace('\\', "/")
    );
    let conn = Connection::open_with_flags(
        &uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("open vscdb: {e}"))?;
    // ponytail: short busy wait — upgrade to snapshot-copy if Cursor holds exclusive locks longer
    let _ = conn.busy_timeout(Duration::from_secs(3));
    Ok(conn)
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
        let mut digits: String = frac_s.chars().filter(|c| c.is_ascii_digit()).take(3).collect();
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
    Ok((utc_secs as u64).saturating_mul(1000).saturating_add(frac_ms))
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

fn detect_composer_data(conn: &Connection, headers: &HeadersLayout) -> Option<ComposerDataLayout> {
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
    let prefix = "composerData:";
    let key = format!("{prefix}{sample_id}");
    let data = kv_get(conn, "cursorDiskKV", &key)?;
    let obj = data.as_object()?;
    let headers_field = ["fullConversationHeadersOnly", "conversationHeaders", "headers"]
        .into_iter()
        .find(|f| obj.get(*f).and_then(|x| x.as_array()).is_some())?;
    let hdrs = obj.get(headers_field)?.as_array()?;
    let sample = hdrs.iter().find_map(|h| h.as_object())?;
    let bubble_id_field = ["bubbleId", "id"]
        .into_iter()
        .find(|f| sample.get(*f).and_then(|x| x.as_str()).is_some())?;
    let type_field = ["type", "bubbleType"]
        .into_iter()
        .find(|f| sample.get(*f).is_some())?;
    // User turns historically type==1
    let user_type = 1i64;
    let has_user = hdrs.iter().any(|h| {
        h.get(type_field)
            .and_then(|t| t.as_i64().or_else(|| t.as_u64().map(|u| u as i64)))
            == Some(user_type)
    });
    if !has_user && !hdrs.is_empty() {
        // Still accept layout if type field exists — empty chat edge case.
        let _ = has_user;
    }
    Some(ComposerDataLayout {
        table: "cursorDiskKV".into(),
        key_prefix: prefix.into(),
        headers_field: headers_field.into(),
        bubble_id_field: bubble_id_field.into(),
        type_field: type_field.into(),
        user_type,
    })
}

fn detect_bubble_schema(
    conn: &Connection,
    headers: &HeadersLayout,
    composer: &ComposerDataLayout,
) -> Option<BubbleLayout> {
    let index = kv_get(conn, &headers.table, &headers.key)?;
    let list = index.get(&headers.list_field)?.as_array()?;
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
    let headers = detect_composer_headers(conn)?;
    let composer = detect_composer_data(conn, &headers)?;
    let bubble = detect_bubble_schema(conn, &headers, &composer)?;
    Some(SchemaBundle {
        headers,
        composer,
        bubble,
        detected_at_ms: now_ms(),
    })
}

fn cached_schema(conn: &Connection) -> Option<SchemaBundle> {
    {
        let guard = schema_cache().lock().unwrap_or_else(|e| e.into_inner());
        if let Some(s) = guard.as_ref() {
            if now_ms().saturating_sub(s.detected_at_ms) < SCHEMA_CACHE_MS {
                return Some(s.clone());
            }
        }
    }
    let fresh = detect_schema(conn)?;
    *schema_cache().lock().unwrap_or_else(|e| e.into_inner()) = Some(fresh.clone());
    Some(fresh)
}

fn session_ts(c: &Value, layout: &HeadersLayout) -> u64 {
    for f in &layout.ts_fields {
        if let Some(ms) = c.get(f).and_then(as_ms) {
            return ms;
        }
    }
    0
}

fn bubble_created_at(conn: &Connection, layout: &BubbleLayout, cid: &str, bid: &str) -> Option<u64> {
    let key = format!("{}{cid}:{bid}", layout.key_prefix);
    let v = kv_get(conn, &layout.table, &key)?;
    as_ms(v.get(&layout.created_at_field)?)
}

pub fn aggregate_activity(conn: &Connection, schema: &SchemaBundle) -> Result<ActivityTotals, String> {
    let index = kv_get(conn, &schema.headers.table, &schema.headers.key)
        .ok_or_else(|| "headers missing".to_string())?;
    let list = index
        .get(&schema.headers.list_field)
        .and_then(|x| x.as_array())
        .ok_or_else(|| "composer list missing".to_string())?;

    let now = now_ms();
    let (today_start, yest_start) = local_day_bounds_ms(now);

    let mut totals = ActivityTotals::default();
    let mut spans: Vec<(u64, u64)> = Vec::new();

    for c in list {
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
        let cid = match c
            .get(&schema.headers.id_field)
            .and_then(|x| x.as_str())
        {
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
            let ca = match bubble_created_at(conn, &schema.bubble, cid, bid) {
                Some(ms) => ms,
                None => continue,
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

fn disabled_snap(message: &str) -> AgentUsageSnapshot {
    let now = now_ms();
    AgentUsageSnapshot {
        source: SRC_CURSOR_LOCAL.into(),
        status: "unavailable".into(),
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

/// Refresh Cursor activity snapshot. Gated by consent only (not ONETONE_AGENT_USAGE).
pub fn refresh_once() {
    if !consent_enabled() {
        agent_usage::put_snapshot(
            crate::soft_pad_runtime::AgentKind::Cursor,
            disabled_snap("未启用 Cursor 活动统计"),
        );
        crate::app_log::sync_emergency_line("cursor_activity", "refresh skipped: consent off");
        return;
    }
    let path = match global_vscdb_path() {
        Some(p) => p,
        None => {
            agent_usage::put_snapshot(
                crate::soft_pad_runtime::AgentKind::Cursor,
                disabled_snap("未找到本机 Cursor 使用记录"),
            );
            crate::app_log::sync_emergency_line("cursor_activity", "refresh: no vscdb");
            return;
        }
    };
    let conn = match open_ro(&path) {
        Ok(c) => c,
        Err(e) => {
            agent_usage::put_snapshot(
                crate::soft_pad_runtime::AgentKind::Cursor,
                disabled_snap(&format!("无法读取本地记录（{e}）")),
            );
            crate::app_log::sync_emergency_line(
                "cursor_activity",
                &format!("refresh: open failed {e}"),
            );
            return;
        }
    };
    let schema = match cached_schema(&conn) {
        Some(s) => s,
        None => {
            agent_usage::put_snapshot(
                crate::soft_pad_runtime::AgentKind::Cursor,
                disabled_snap("Cursor 本地库结构无法识别"),
            );
            crate::app_log::sync_emergency_line("cursor_activity", "refresh: schema detect failed");
            return;
        }
    };
    match aggregate_activity(&conn, &schema) {
        Ok(t) => {
            crate::app_log::sync_emergency_line(
                "cursor_activity",
                &format!(
                    "ready turns={} sessions={} active_ms={}",
                    t.turns_today, t.sessions_today, t.active_ms
                ),
            );
            agent_usage::put_snapshot(
                crate::soft_pad_runtime::AgentKind::Cursor,
                ready_snap(&t),
            );
        }
        Err(e) => {
            agent_usage::put_snapshot(
                crate::soft_pad_runtime::AgentKind::Cursor,
                disabled_snap(&format!("活动统计失败（{e}）")),
            );
            crate::app_log::sync_emergency_line(
                "cursor_activity",
                &format!("refresh: aggregate failed {e}"),
            );
        }
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
            std::thread::sleep(Duration::from_secs(REFRESH_SECS));
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
}
