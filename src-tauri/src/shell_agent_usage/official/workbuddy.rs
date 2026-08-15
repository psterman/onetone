use crate::agent_usage::{self, AgentUsageSnapshot, UsageWindow};
use crate::shell_agent_usage::http::http_post_json;
use crate::shell_agent_usage::models::{
    attach_local, credits_message, format_reset_ymd, manual_snap, now_ms, number, utc_ymdhms_now,
    window_from_remaining_pct, SRC_WB_LOCAL, SRC_WB_MANUAL, WORKBUDDY_CONSOLE,
};
use crate::soft_pad_runtime::AgentKind;
use serde_json::Value;

const WB_ENDPOINT: &str = "https://copilot.tencent.com";
const WB_ENDPOINT_INTL: &str = "https://copilot.tencent.com";
const WB_PRODUCT: &str = "p_tcaca";
const WB_SECRET_KEY: &str =
    r#"secret://{"extensionId":"tencent-cloud.coding-copilot","key":"planning-genie.new.accessTokencn"}"#;
const WB_SECRET_KEY_ALT: &str =
    r#"secret://{"extensionId":"tencent-cloud.coding-copilot","key":"planning-genie.new.accessToken"}"#;

/// Official PackageCode constants (CodeBuddy / WorkBuddy web client).
const PKG_FREE: &str = "TCACA_code_001_PqouKr6QWV";
const PKG_PRO_MON: &str = "TCACA_code_002_AkiJS3ZHF5";
const PKG_PRO_YEAR: &str = "TCACA_code_003_FTant7lcmRT";
const PKG_GIFT: &str = "TCACA_code_006_DbXS0lrypC";
const PKG_ACTIVITY: &str = "TCACA_code_007_nzdH5h4Nl0";
const PKG_FREE_MON: &str = "TCACA_code_008_cfWoLwvjU4";
const PKG_EXTRA: &str = "TCACA_code_009_0XmEQc2xOf";

/// Refill packs reset long before resource expiry (CycleEnd ≪ DeductionEnd).
const REFILL_GAP_MS: u64 = 2 * 24 * 60 * 60 * 1000;

#[derive(Clone, Copy)]
enum PkgKind {
    Trial,
    Free,
    Pro,
    Activity,
    Extra,
    Other,
}

struct PkgAgg {
    kind: PkgKind,
    label: String,
    remain: f64,
    total: f64,
    /// Next cycle reset (refill) or expiry (bonus).
    at_ms: Option<u64>,
    refill: bool,
}

#[derive(Clone, Copy)]
pub struct WorkbuddyParseMeta<'a> {
    pub account_type: Option<&'a str>,
    pub nickname: Option<&'a str>,
    pub dosage_notify_zh: Option<&'a str>,
}

pub fn parse_workbuddy_personal(
    value: &Value,
    meta: WorkbuddyParseMeta<'_>,
) -> Result<AgentUsageSnapshot, String> {
    let accounts = [
        "/data/data/Response/Data/Accounts",
        "/data/Response/Data/Accounts",
        "/Response/Data/Accounts",
        "/data/Accounts",
        "/Accounts",
    ]
    .iter()
    .find_map(|p| value.pointer(p)?.as_array())
    .ok_or_else(|| "WorkBuddy response missing Accounts".to_string())?;

    let mut groups: Vec<PkgAgg> = Vec::new();
    for account in accounts {
        let status = number(account.get("Status").unwrap_or(&Value::Null)).unwrap_or(-1.0);
        // 0=valid, 3=usedUp (still show)
        if status != 0.0 && status != 3.0 {
            continue;
        }
        let Some(row) = package_row(account) else {
            continue;
        };
        if let Some(existing) = groups.iter_mut().find(|g| g.label == row.label) {
            existing.remain += row.remain;
            existing.total += row.total;
            existing.at_ms = min_opt(existing.at_ms, row.at_ms);
            existing.refill = existing.refill || row.refill;
        } else {
            groups.push(row);
        }
    }
    if groups.is_empty() {
        return Err("WorkBuddy has no active personal quota".into());
    }
    // Stable order: trial → free → pro → activity → extra → other
    groups.sort_by_key(|g| match g.kind {
        PkgKind::Trial => 0,
        PkgKind::Free => 1,
        PkgKind::Pro => 2,
        PkgKind::Activity => 3,
        PkgKind::Extra => 4,
        PkgKind::Other => 5,
    });

    let remaining: f64 = groups.iter().map(|g| g.remain).sum();
    let total: f64 = groups.iter().map(|g| g.total).sum();
    let rem_pct = if total > 0.0 {
        (remaining / total * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };

    let plan = wb_membership_label(meta.account_type, &groups);
    let package_bits: Vec<String> = groups
        .iter()
        .map(|g| {
            let rem = fmt_cred(g.remain);
            match (g.at_ms.and_then(format_reset_ymd), g.refill) {
                (Some(d), true) => format!("{}余{}（{}重置）", g.label, rem, short_md(&d)),
                (Some(d), false) => format!("{}余{}（{}到期）", g.label, rem, short_md(&d)),
                (None, _) => format!("{}余{}", g.label, rem),
            }
        })
        .collect();
    let mut message = format!("{plan} · {}", package_bits.join("/"));
    if let Some(zh) = meta
        .dosage_notify_zh
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        message.push_str(" · ");
        message.push_str(zh);
    }

    let windows: Vec<UsageWindow> = groups
        .iter()
        .enumerate()
        .map(|(i, g)| {
            let pct = if g.total > 0.0 {
                (g.remain / g.total * 100.0).clamp(0.0, 100.0)
            } else {
                0.0
            };
            let kind = if i == 0 { "primary" } else { "secondary" };
            let id = match g.kind {
                PkgKind::Trial => "wb_trial",
                PkgKind::Free => "wb_free",
                PkgKind::Pro => "wb_pro",
                PkgKind::Activity => "wb_activity",
                PkgKind::Extra => "wb_extra",
                PkgKind::Other => "wb_other",
            };
            window_from_remaining_pct(id, kind, pct, g.at_ms)
        })
        .collect();

    let resets_at = groups.iter().filter_map(|g| g.at_ms).min();
    let now = now_ms();
    let account_label = meta
        .nickname
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("WorkBuddy")
        .to_string();

    Ok(AgentUsageSnapshot {
        source: SRC_WB_LOCAL.into(),
        status: "ready".into(),
        confidence: "official".into(),
        message,
        remaining_percent: Some(rem_pct),
        resets_at,
        windows,
        plan_type: plan,
        account_type: "workbuddy".into(),
        account_label,
        console_url: WORKBUDDY_CONSOLE.into(),
        updated_at: now,
        last_success_at: now,
        ..Default::default()
    })
}

pub fn parse_workbuddy_enterprise(
    value: &Value,
    meta: WorkbuddyParseMeta<'_>,
) -> Result<AgentUsageSnapshot, String> {
    let usage = [
        "/data/data",
        "/data/Response/Data",
        "/data",
        "/Response/Data",
    ]
    .iter()
    .find_map(|p| {
        let c = value.pointer(p)?;
        c.get("limitNum").map(|_| c)
    })
    .or_else(|| value.get("limitNum").map(|_| value))
    .ok_or_else(|| "WorkBuddy enterprise quota missing".to_string())?;

    let limit = number(usage.get("limitNum").unwrap_or(&Value::Null))
        .ok_or_else(|| "missing limitNum".to_string())?;
    let used = number(usage.get("credit").unwrap_or(&Value::Null)).unwrap_or(0.0);
    let now = now_ms();
    let account_label = meta
        .nickname
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("WorkBuddy")
        .to_string();
    let dosage = meta
        .dosage_notify_zh
        .map(str::trim)
        .filter(|s| !s.is_empty());

    if limit < 0.0 {
        let mut message = "企业 · 企业额度不限".to_string();
        if let Some(zh) = dosage {
            message.push_str(" · ");
            message.push_str(zh);
        }
        return Ok(AgentUsageSnapshot {
            source: SRC_WB_LOCAL.into(),
            status: "ready".into(),
            confidence: "official".into(),
            message,
            plan_type: "企业".into(),
            account_type: "workbuddy".into(),
            account_label,
            console_url: WORKBUDDY_CONSOLE.into(),
            updated_at: now,
            last_success_at: now,
            ..Default::default()
        });
    }
    let rem = (limit - used).max(0.0);
    let rem_pct = if limit > 0.0 {
        (rem / limit * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };
    let mut message = format!("企业 · {}", credits_message(rem, "Credits"));
    if let Some(zh) = dosage {
        message.push_str(" · ");
        message.push_str(zh);
    }
    Ok(AgentUsageSnapshot {
        source: SRC_WB_LOCAL.into(),
        status: "ready".into(),
        confidence: "official".into(),
        message,
        remaining_percent: Some(rem_pct),
        windows: vec![window_from_remaining_pct(
            "plan_credits",
            "primary",
            rem_pct,
            None,
        )],
        plan_type: "企业".into(),
        account_type: "workbuddy".into(),
        account_label,
        console_url: WORKBUDDY_CONSOLE.into(),
        updated_at: now,
        last_success_at: now,
        ..Default::default()
    })
}

fn package_row(account: &Value) -> Option<PkgAgg> {
    let code = account
        .get("PackageCode")
        .and_then(|x| x.as_str())
        .unwrap_or("");
    let name = account
        .get("PackageName")
        .and_then(|x| x.as_str())
        .unwrap_or("");
    let cycle_end = parse_wb_instant_ms(account.get("CycleEndTime").unwrap_or(&Value::Null));
    let deduction_end = parse_wb_instant_ms(
        account
            .get("DeductionEndTime")
            .or_else(|| account.get("ExpiredTime"))
            .unwrap_or(&Value::Null),
    );
    let refill = match (cycle_end, deduction_end) {
        (Some(ce), Some(de)) => de.saturating_sub(ce) > REFILL_GAP_MS,
        _ => false,
    };
    let (total, remain) = if refill {
        (
            number(
                account
                    .get("CycleCapacitySizePrecise")
                    .or_else(|| account.get("CycleCapacitySize"))
                    .unwrap_or(&Value::Null),
            )
            .unwrap_or(0.0),
            number(
                account
                    .get("CycleCapacityRemainPrecise")
                    .or_else(|| account.get("CycleCapacityRemain"))
                    .unwrap_or(&Value::Null),
            )
            .unwrap_or(0.0),
        )
    } else {
        (
            number(
                account
                    .get("CapacitySizePrecise")
                    .or_else(|| account.get("CapacitySize"))
                    .or_else(|| account.get("CycleCapacitySizePrecise"))
                    .unwrap_or(&Value::Null),
            )
            .unwrap_or(0.0),
            number(
                account
                    .get("CapacityRemainPrecise")
                    .or_else(|| account.get("CapacityRemain"))
                    .or_else(|| account.get("CycleCapacityRemainPrecise"))
                    .unwrap_or(&Value::Null),
            )
            .unwrap_or(0.0),
        )
    };
    if total <= 0.0 && remain <= 0.0 {
        return None;
    }
    let (kind, label) = classify_package(code, name);
    let at_ms = if refill {
        cycle_end
    } else {
        deduction_end.or(cycle_end)
    };
    Some(PkgAgg {
        kind,
        label: label.to_string(),
        remain: remain.max(0.0),
        total: total.max(0.0),
        at_ms,
        refill,
    })
}

fn classify_package(code: &str, name: &str) -> (PkgKind, &'static str) {
    let lower = name.to_ascii_lowercase();
    if code == PKG_ACTIVITY || name.contains("裂变") || lower.contains("activity") {
        return (PkgKind::Activity, "裂变包");
    }
    if code == PKG_EXTRA || name.contains("加量") {
        return (PkgKind::Extra, "加量包");
    }
    if code == PKG_PRO_MON || code == PKG_PRO_YEAR || name.contains("专业") || lower.contains("pro")
    {
        return (PkgKind::Pro, "Pro");
    }
    if code == PKG_FREE_MON || code == PKG_GIFT || name.contains("体验") {
        return (PkgKind::Trial, "体验版");
    }
    if code == PKG_FREE || name.contains("免费") || lower.contains("free") {
        return (PkgKind::Free, "免费");
    }
    (PkgKind::Other, "其他包")
}

fn wb_membership_label(account_type: Option<&str>, groups: &[PkgAgg]) -> String {
    let at = account_type.unwrap_or("").to_ascii_lowercase();
    if at.contains("ultimate") || at.contains("exclusive") || at.contains("enterprise") || at.contains("premise")
    {
        return "企业".into();
    }
    if groups.iter().any(|g| matches!(g.kind, PkgKind::Pro)) {
        return "Pro".into();
    }
    if groups
        .iter()
        .any(|g| matches!(g.kind, PkgKind::Trial))
    {
        return "体验版".into();
    }
    if groups.iter().any(|g| matches!(g.kind, PkgKind::Free)) {
        return "免费".into();
    }
    "免费".into()
}

fn fmt_cred(n: f64) -> String {
    if n.fract().abs() < 0.05 {
        format!("{}", n.round() as i64)
    } else {
        format!("{n:.1}")
    }
}

/// `2026年8月31日` → `8月31日` for compact tip.
fn short_md(ymd: &str) -> String {
    if let Some(i) = ymd.find('年') {
        ymd[i + '年'.len_utf8()..].to_string()
    } else {
        ymd.to_string()
    }
}

fn min_opt(a: Option<u64>, b: Option<u64>) -> Option<u64> {
    match (a, b) {
        (Some(x), Some(y)) => Some(x.min(y)),
        (Some(x), None) | (None, Some(x)) => Some(x),
        (None, None) => None,
    }
}

fn parse_wb_instant_ms(v: &Value) -> Option<u64> {
    if let Some(n) = number(v) {
        if !n.is_finite() || n <= 0.0 {
            return None;
        }
        let n = n as u64;
        let ms = if n > 1_000_000_000_000 { n } else { n * 1000 };
        return Some(ms);
    }
    let s = v.as_str()?.trim();
    if s.len() < 10 {
        return None;
    }
    let y: i32 = s.get(0..4)?.parse().ok()?;
    let m: u32 = s.get(5..7)?.parse().ok()?;
    let d: u32 = s.get(8..10)?.parse().ok()?;
    let (hh, mm, ss) = if s.len() >= 19 {
        (
            s.get(11..13)?.parse().ok()?,
            s.get(14..16)?.parse().ok()?,
            s.get(17..19)?.parse().ok()?,
        )
    } else {
        (0u32, 0u32, 0u32)
    };
    let days = days_from_civil(y, m, d)?;
    // CodeBuddy CN times are China local (UTC+8).
    let secs = days * 86_400 + i64::from(hh) * 3600 + i64::from(mm) * 60 + i64::from(ss) - 8 * 3600;
    if secs < 0 {
        return None;
    }
    Some((secs as u64) * 1000)
}

fn days_from_civil(y: i32, m: u32, d: u32) -> Option<i64> {
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let mp = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * mp as u64 + 2) / 5 + d as u64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era as i64 * 146097 + doe as i64 - 719468)
}

fn string_at(value: &Value, pointers: &[&str]) -> Option<String> {
    pointers
        .iter()
        .find_map(|p| value.pointer(p)?.as_str().map(str::to_owned))
}

/// New WorkBuddy Desktop stores login at:
/// `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info`
#[cfg(windows)]
fn load_workbuddy_desktop_auth() -> Option<Value> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    let dir = std::path::PathBuf::from(local)
        .join("CodeBuddyExtension")
        .join("Data")
        .join("Public")
        .join("auth");
    if !dir.is_dir() {
        return None;
    }
    let preferred = dir.join("workbuddy-desktop.info");
    let candidates: Vec<std::path::PathBuf> = if preferred.is_file() {
        vec![preferred]
    } else {
        let mut files = Vec::new();
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for ent in rd.flatten() {
                let p = ent.path();
                if p.extension().and_then(|e| e.to_str()) == Some("info") {
                    files.push(p);
                }
            }
        }
        files.sort_by_key(|p| {
            std::cmp::Reverse(
                std::fs::metadata(p)
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
            )
        });
        files
    };
    for path in candidates {
        if let Ok(raw) = std::fs::read(&path) {
            if let Ok(v) = serde_json::from_slice::<Value>(&raw) {
                if v.pointer("/auth/accessToken")
                    .and_then(Value::as_str)
                    .is_some_and(|t| !t.is_empty())
                {
                    return Some(v);
                }
            }
        }
    }
    None
}

#[cfg(windows)]
fn load_workbuddy_legacy_electron_auth() -> Result<Value, String> {
    use crate::shell_agent_usage::chromium_secret::{
        encryption_key, find_electron_root, read_secret,
    };

    // Legacy IDE profile roots: WorkBuddy / CodeBuddy (Roaming Electron).
    // Hook settings live under ~/.codebuddy — not a quota source.
    let root = find_electron_root(&["WorkBuddy", "CodeBuddy"])
        .ok_or_else(|| "WorkBuddy Electron not installed".to_string())?;
    let key = encryption_key(&root)?;
    read_secret(&root, &key, WB_SECRET_KEY).or_else(|_| read_secret(&root, &key, WB_SECRET_KEY_ALT))
}

fn fetch_dosage_notify_zh(headers: &[(&str, String)]) -> Option<String> {
    let body = serde_json::json!({});
    for ep in [WB_ENDPOINT, WB_ENDPOINT_INTL] {
        let Ok(text) = http_post_json(
            &format!("{ep}/v2/billing/meter/get-dosage-notify"),
            headers,
            &body,
        ) else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        let zh = v
            .pointer("/data/dosageNotifyZh")
            .and_then(|x| x.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())?;
        return Some(zh.to_string());
    }
    None
}

#[cfg(windows)]
fn workbuddy_from_disk_and_api() -> Result<AgentUsageSnapshot, String> {
    let value = load_workbuddy_desktop_auth()
        .ok_or_else(|| "WorkBuddy desktop login missing".to_string())
        .or_else(|_| load_workbuddy_legacy_electron_auth())?;

    let access_token = string_at(&value, &["/auth/accessToken", "/accessToken"])
        .ok_or_else(|| "WorkBuddy login expired".to_string())?;
    let user_id = string_at(&value, &["/account/uid", "/uid"])
        .ok_or_else(|| "WorkBuddy user id missing".to_string())?;
    let account_type = string_at(
        &value,
        &["/account/type", "/account/accountType", "/type"],
    );
    let nickname = string_at(&value, &["/account/nickname", "/nickname"]);
    let enterprise_id = string_at(&value, &["/account/enterpriseId", "/enterpriseId"]);
    let domain = string_at(&value, &["/auth/domain", "/domain"]);

    let mut headers: Vec<(&str, String)> = vec![
        ("Authorization", format!("Bearer {access_token}")),
        ("x-user-id", user_id),
    ];
    if let Some(eid) = enterprise_id.as_deref() {
        headers.push(("x-enterprise-id", eid.to_string()));
        headers.push(("x-tenant-id", eid.to_string()));
    }
    if let Some(domain) = domain.as_deref() {
        headers.push(("x-domain", domain.to_string()));
    }

    let dosage_zh = fetch_dosage_notify_zh(&headers);
    let meta = WorkbuddyParseMeta {
        account_type: account_type.as_deref(),
        nickname: nickname.as_deref(),
        dosage_notify_zh: dosage_zh.as_deref(),
    };

    let is_enterprise = account_type.as_deref().is_some_and(|v| {
        let v = v.to_ascii_lowercase();
        v.contains("enterprise")
            || v.contains("ultimate")
            || v.contains("exclusive")
            || v.contains("premise")
    });

    let endpoints = [WB_ENDPOINT, WB_ENDPOINT_INTL];
    if is_enterprise {
        let body = serde_json::json!({});
        let mut last_err = String::new();
        for ep in endpoints {
            match http_post_json(
                &format!("{ep}/v2/billing/meter/get-enterprise-user-usage"),
                &headers,
                &body,
            ) {
                Ok(text) => {
                    let v: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
                    return parse_workbuddy_enterprise(&v, meta);
                }
                Err(e) => last_err = e,
            }
        }
        return Err(last_err);
    }

    let body = serde_json::json!({
        "PageNumber": 1,
        "PageSize": 100,
        "ProductCode": WB_PRODUCT,
        "Status": [0, 3],
        "PackageStartTimeRangeBegin": "2024-12-01 21:25:00",
        "PackageStartTimeRangeEnd": utc_ymdhms_now(),
    });
    let mut last_err = String::new();
    for ep in endpoints {
        match http_post_json(
            &format!("{ep}/v2/billing/meter/get-user-resource"),
            &headers,
            &body,
        ) {
            Ok(text) => {
                let v: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
                match parse_workbuddy_personal(&v, meta) {
                    Ok(snap) => return Ok(snap),
                    Err(personal_err) => {
                        // Empty personal Accounts → try enterprise usage (community pattern).
                        let ent_body = serde_json::json!({});
                        for ep2 in endpoints {
                            if let Ok(ent_text) = http_post_json(
                                &format!("{ep2}/v2/billing/meter/get-enterprise-user-usage"),
                                &headers,
                                &ent_body,
                            ) {
                                if let Ok(ent_v) = serde_json::from_str::<Value>(&ent_text) {
                                    if let Ok(snap) = parse_workbuddy_enterprise(&ent_v, meta) {
                                        return Ok(snap);
                                    }
                                }
                            }
                        }
                        return Err(personal_err);
                    }
                }
            }
            Err(e) => last_err = e,
        }
    }
    Err(last_err)
}

pub fn refresh(local: (Option<u64>, Option<u64>)) {
    #[cfg(windows)]
    {
        match workbuddy_from_disk_and_api() {
            Ok(mut snap) => {
                attach_local(&mut snap, local.0, local.1);
                agent_usage::put_snapshot(AgentKind::WorkBuddy, snap);
            }
            Err(e) => {
                let prev = agent_usage::snapshot(AgentKind::WorkBuddy);
                if prev.source.starts_with("workbuddy")
                    && prev.confidence == "official"
                    && prev.last_success_at > 0
                {
                    let mut stale = prev;
                    stale.status = "stale".into();
                    stale.confidence = "stale".into();
                    stale.updated_at = now_ms();
                    stale.message = format!(
                        "{}（刷新失败：{}）",
                        if stale.message.is_empty() {
                            "WorkBuddy".into()
                        } else {
                            stale.message.clone()
                        },
                        e.chars().take(60).collect::<String>()
                    );
                    attach_local(&mut stale, local.0, local.1);
                    agent_usage::put_snapshot(AgentKind::WorkBuddy, stale);
                    return;
                }
                let mut snap = manual_snap(
                    SRC_WB_MANUAL,
                    "WorkBuddy",
                    WORKBUDDY_CONSOLE,
                    &if e.contains("login") || e.contains("auth") || e.contains("Electron") {
                        "请登录 WorkBuddy 查看额度".to_string()
                    } else if e.len() <= 80 {
                        e
                    } else {
                        format!("{}…", e.chars().take(72).collect::<String>())
                    },
                );
                attach_local(&mut snap, local.0, local.1);
                agent_usage::put_snapshot(AgentKind::WorkBuddy, snap);
            }
        }
    }
    #[cfg(not(windows))]
    {
        let mut snap = manual_snap(
            SRC_WB_MANUAL,
            "WorkBuddy",
            WORKBUDDY_CONSOLE,
            "官方剩余请到控制台",
        );
        attach_local(&mut snap, local.0, local.1);
        agent_usage::put_snapshot(AgentKind::WorkBuddy, snap);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_trial_and_fission_packages() {
        let v = json!({
            "data": { "data": { "Response": { "Data": {
                "TotalDosage": 1100,
                "Accounts": [
                    {
                        "PackageCode": "TCACA_code_008_cfWoLwvjU4",
                        "PackageName": "CodeBuddy个人体验版",
                        "CycleCapacitySizePrecise": "500",
                        "CycleCapacityRemainPrecise": "500",
                        "CapacitySizePrecise": "500",
                        "CapacityRemainPrecise": "500",
                        "CycleEndTime": "2026-08-31 23:59:59",
                        "DeductionEndTime": 2044395560000u64,
                        "Status": 0
                    },
                    {
                        "PackageCode": "TCACA_code_007_nzdH5h4Nl0",
                        "PackageName": "CodeBuddy个人版国内运营裂变包",
                        "CycleCapacitySizePrecise": "100",
                        "CycleCapacityRemainPrecise": "100",
                        "CapacitySizePrecise": "100",
                        "CapacityRemainPrecise": "100",
                        "CycleEndTime": "2026-08-19 08:55:48",
                        "DeductionEndTime": 1787100948000u64,
                        "Status": 0
                    },
                    {
                        "PackageCode": "TCACA_code_007_nzdH5h4Nl0",
                        "PackageName": "CodeBuddy个人版国内运营裂变包",
                        "CycleCapacitySizePrecise": "100",
                        "CycleCapacityRemainPrecise": "100",
                        "CapacitySizePrecise": "100",
                        "CapacityRemainPrecise": "100",
                        "CycleEndTime": "2026-08-29 07:43:49",
                        "DeductionEndTime": 1787960629000u64,
                        "Status": 0
                    }
                ]
            }}}}
        });
        let snap = parse_workbuddy_personal(
            &v,
            WorkbuddyParseMeta {
                account_type: Some("personal"),
                nickname: Some("测试昵称"),
                dosage_notify_zh: Some("额度偏低，请关注"),
            },
        )
        .expect("parse");
        assert_eq!(snap.plan_type, "体验版");
        assert_eq!(snap.account_label, "测试昵称");
        assert!(snap.message.starts_with("体验版 · "), "{}", snap.message);
        assert!(snap.message.contains("体验版余500"), "{}", snap.message);
        assert!(snap.message.contains("裂变包余200"), "{}", snap.message);
        assert!(snap.message.contains("重置"), "{}", snap.message);
        assert!(snap.message.contains("到期"), "{}", snap.message);
        assert!(snap.message.contains("额度偏低"), "{}", snap.message);
        assert_eq!(snap.windows.len(), 2);
        assert!(snap.resets_at.is_some());
    }

    #[test]
    fn parse_enterprise_unlimited() {
        let v = json!({ "data": { "limitNum": -1, "credit": 0 } });
        let snap = parse_workbuddy_enterprise(
            &v,
            WorkbuddyParseMeta {
                account_type: Some("exclusive"),
                nickname: None,
                dosage_notify_zh: None,
            },
        )
        .expect("parse");
        assert_eq!(snap.plan_type, "企业");
        assert!(snap.message.contains("企业额度不限"), "{}", snap.message);
    }
}
