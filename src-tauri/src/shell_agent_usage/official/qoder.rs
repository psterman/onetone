use crate::agent_usage::{self, AgentUsageSnapshot};
use crate::shell_agent_usage::http::http_get_bearer;
use crate::shell_agent_usage::models::{
    attach_local, credits_message, env_str, format_reset_ymd, manual_snap, now_ms, number,
    unavailable_snap, window_from_remaining_pct, QODER_CONSOLE, SRC_QODER_LOCAL, SRC_QODER_MANUAL,
    SRC_QODER_OPENAPI,
};
use serde_json::Value;

/// Parse Qoder `secret://aicoding.auth.creditUsage` (+ optional userInfo/userPlan).
pub fn parse_qoder_local_session(
    credit_usage: &Value,
    user_info: Option<&Value>,
    user_plan: Option<&Value>,
) -> Result<AgentUsageSnapshot, String> {
    let uq = credit_usage.get("userQuota").unwrap_or(credit_usage);
    let remaining = number(uq.get("remaining").unwrap_or(&Value::Null))
        .or_else(|| number(credit_usage.get("quota").unwrap_or(&Value::Null)))
        .or_else(|| user_info.and_then(|u| number(u.get("quota").unwrap_or(&Value::Null))));
    let total = number(uq.get("total").unwrap_or(&Value::Null));
    let used = number(uq.get("used").unwrap_or(&Value::Null));
    let unit = uq
        .get("unit")
        .and_then(|x| x.as_str())
        .or_else(|| credit_usage.get("usageType").and_then(|x| x.as_str()))
        .unwrap_or("credits");
    let exceeded = credit_usage
        .get("isQuotaExceeded")
        .and_then(|x| x.as_bool())
        .or_else(|| user_info.and_then(|u| u.get("isQuotaExceeded").and_then(|x| x.as_bool())))
        .unwrap_or(false);

    let rem = remaining.unwrap_or(if exceeded { 0.0 } else { -1.0 });
    if rem < 0.0 && total.is_none() && used.is_none() {
        return Err("Qoder local session missing quota fields".into());
    }
    let rem = rem.max(0.0);

    let rem_pct = if let Some(t) = total.filter(|t| *t > 0.0) {
        Some((rem / t * 100.0).clamp(0.0, 100.0))
    } else if exceeded || (total == Some(0.0) && rem == 0.0) {
        Some(0.0)
    } else if let Some(used_pct) = number(uq.get("percentage").unwrap_or(&Value::Null))
        .or_else(|| number(credit_usage.get("totalUsagePercentage").unwrap_or(&Value::Null)))
    {
        Some((100.0 - used_pct).clamp(0.0, 100.0))
    } else {
        None
    };

    let plan = user_plan
        .and_then(|p| p.get("plan_tier_name").and_then(|x| x.as_str()))
        .or_else(|| user_info.and_then(|u| u.get("userTag").and_then(|x| x.as_str())))
        .unwrap_or("")
        .to_string();
    let email = user_info
        .and_then(|u| u.get("email").and_then(|x| x.as_str()))
        .unwrap_or("");
    let account = agent_usage::mask_email(email);
    let account = if account.is_empty() {
        "Qoder".into()
    } else {
        account
    };

    let addon = number(
        credit_usage
            .pointer("/addonQuota/remaining")
            .or_else(|| credit_usage.pointer("/addOnQuota/remaining"))
            .or_else(|| credit_usage.pointer("/resourcePackageQuota/remaining"))
            .unwrap_or(&Value::Null),
    );
    let resets_at = credit_usage
        .get("expiresAt")
        .and_then(number)
        .map(|n| n as u64)
        .or_else(|| {
            user_plan
                .and_then(|p| p.get("end_date").and_then(number))
                .map(|n| n as u64)
        });

    let mut windows = Vec::new();
    if let Some(pct) = rem_pct {
        windows.push(window_from_remaining_pct(
            "plan_credits",
            "primary",
            pct,
            resets_at.filter(|&ms| ms > 1_000_000_000_000 && ms < 4_102_444_800_000),
        ));
    }

    let message = human_qoder_message(used, total, rem, unit, addon, resets_at);

    let now = now_ms();
    Ok(AgentUsageSnapshot {
        source: SRC_QODER_LOCAL.into(),
        status: "ready".into(),
        confidence: "official".into(),
        message,
        remaining_percent: rem_pct,
        windows,
        account_label: account,
        plan_type: plan,
        account_type: "qoder".into(),
        console_url: credit_usage
            .get("upgradeUrl")
            .and_then(|x| x.as_str())
            .unwrap_or(QODER_CONSOLE)
            .into(),
        resets_at: resets_at.filter(|&ms| ms > 1_000_000_000_000 && ms < 4_102_444_800_000),
        updated_at: now,
        last_success_at: now,
        ..Default::default()
    })
}

fn human_qoder_message(
    used: Option<f64>,
    total: Option<f64>,
    rem: f64,
    unit: &str,
    addon: Option<f64>,
    resets_at: Option<u64>,
) -> String {
    let mut bits = Vec::new();
    if let (Some(u), Some(t)) = (used, total.filter(|t| *t > 0.0)) {
        bits.push(format!("套餐额度 {} / {}", fmt_cred(u), fmt_cred(t)));
    } else {
        bits.push(credits_message(
            rem,
            if unit.eq_ignore_ascii_case("credits") {
                "Credits"
            } else {
                unit
            },
        ));
    }
    if let Some(a) = addon.filter(|a| *a > 0.0) {
        bits.push(format!("额外购买 {}", fmt_cred(a)));
    }
    if let Some(ms) = resets_at {
        if let Some(label) = format_reset_ymd(ms) {
            bits.push(format!("下次恢复 {label}"));
        }
    }
    bits.join(" · ")
}

fn fmt_cred(n: f64) -> String {
    if n.fract().abs() < 0.05 {
        format!("{}", n.round() as i64)
    } else {
        format!("{n:.1}")
    }
}

/// Parse Teams OpenAPI member quota JSON.
pub fn parse_qoder_openapi_quota(raw: &str) -> Result<AgentUsageSnapshot, String> {
    let v: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let plan_summary = v.pointer("/planQuota/quotaSummary");
    let total_summary = v
        .pointer("/totalQuota/quotaSummary")
        .or(plan_summary)
        .ok_or_else(|| "missing quotaSummary".to_string())?;
    let used = number(total_summary.get("usedValue").unwrap_or(&Value::Null)).unwrap_or(0.0);
    let limit = number(total_summary.get("limitValue").unwrap_or(&Value::Null))
        .ok_or_else(|| "missing limitValue".to_string())?;
    let unit = total_summary
        .get("unit")
        .and_then(|x| x.as_str())
        .unwrap_or("credits");
    let rem = (limit - used).max(0.0);
    let rem_pct = if limit > 0.0 {
        (rem / limit * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };

    let plan_used = plan_summary
        .and_then(|s| number(s.get("usedValue").unwrap_or(&Value::Null)))
        .unwrap_or(used);
    let plan_limit = plan_summary
        .and_then(|s| number(s.get("limitValue").unwrap_or(&Value::Null)))
        .unwrap_or(limit);
    let addon = v
        .pointer("/resourcePackageQuota/quotaSummary")
        .and_then(|s| {
            let used_a = number(s.get("usedValue").unwrap_or(&Value::Null)).unwrap_or(0.0);
            let lim_a = number(s.get("limitValue").unwrap_or(&Value::Null))?;
            Some((lim_a - used_a).max(0.0))
        });

    let resets_at = v
        .get("nextResetAt")
        .and_then(|x| x.as_str())
        .and_then(parse_rfc3339_approx_ms);

    let message = human_qoder_message(
        Some(plan_used),
        Some(plan_limit),
        rem,
        unit,
        addon,
        resets_at,
    );

    let now = now_ms();
    Ok(AgentUsageSnapshot {
        source: SRC_QODER_OPENAPI.into(),
        status: "ready".into(),
        confidence: "official".into(),
        message,
        remaining_percent: Some(rem_pct),
        windows: vec![window_from_remaining_pct(
            "plan_credits",
            "primary",
            rem_pct,
            resets_at,
        )],
        plan_type: "Teams".into(),
        account_type: "qoder".into(),
        account_label: "Qoder Teams".into(),
        console_url: QODER_CONSOLE.into(),
        resets_at,
        updated_at: now,
        last_success_at: now,
        ..Default::default()
    })
}

fn parse_rfc3339_approx_ms(s: &str) -> Option<u64> {
    let s = s.trim();
    if s.len() < 10 {
        return None;
    }
    let y: i32 = s.get(0..4)?.parse().ok()?;
    let m: u32 = s.get(5..7)?.parse().ok()?;
    let d: u32 = s.get(8..10)?.parse().ok()?;
    let days = days_from_civil(y, m, d)?;
    Some((days as u64) * 86_400 * 1000)
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

fn try_qoder_openapi() -> Option<AgentUsageSnapshot> {
    let key = env_str("QODER_TEAMS_API_KEY").or_else(|| env_str("QODER_API_KEY"))?;
    let org = env_str("QODER_ORG_ID")?;
    let member = env_str("QODER_MEMBER_ID")?;
    let url = format!("https://api.qoder.com/v1/organizations/{org}/members/{member}/quota");
    match http_get_bearer(&url, &key) {
        Ok(body) => parse_qoder_openapi_quota(&body).ok(),
        Err(_) => None,
    }
}

#[cfg(windows)]
fn qoder_from_disk() -> Result<AgentUsageSnapshot, String> {
    use crate::shell_agent_usage::chromium_secret::{
        encryption_key, find_electron_root, read_secret,
    };

    let root = find_electron_root(&["Qoder", "QoderCN"])
        .ok_or_else(|| "Qoder not installed".to_string())?;
    let key = encryption_key(&root)?;
    let credit = read_secret(&root, &key, "secret://aicoding.auth.creditUsage").or_else(|_| {
        let user = read_secret(&root, &key, "secret://aicoding.auth.userInfo")?;
        let quota = number(user.get("quota").unwrap_or(&Value::Null)).unwrap_or(0.0);
        Ok::<Value, String>(serde_json::json!({
            "isQuotaExceeded": user.get("isQuotaExceeded").and_then(|x| x.as_bool()).unwrap_or(false),
            "userQuota": { "remaining": quota, "total": null, "used": null, "unit": "credits" },
            "upgradeUrl": QODER_CONSOLE,
        }))
    })?;
    let user = read_secret(&root, &key, "secret://aicoding.auth.userInfo").ok();
    let plan = read_secret(&root, &key, "secret://aicoding.auth.userPlan").ok();
    parse_qoder_local_session(&credit, user.as_ref(), plan.as_ref())
}

pub fn refresh(local: (Option<u64>, Option<u64>)) {
    let mut snap = if let Some(s) = try_qoder_openapi() {
        s
    } else {
        #[cfg(windows)]
        {
            match qoder_from_disk() {
                Ok(s) => s,
                Err(e) => {
                    let prev = agent_usage::snapshot(crate::soft_pad_runtime::AgentKind::Qoder);
                    if prev.source.starts_with("qoder")
                        && prev.status == "ready"
                        && prev.last_success_at > 0
                    {
                        let mut stale = prev;
                        stale.status = "stale".into();
                        stale.confidence = "stale".into();
                        stale.message = format!(
                            "{}（刷新失败）",
                            if stale.message.is_empty() {
                                "Qoder".into()
                            } else {
                                stale.message.clone()
                            }
                        );
                        stale.updated_at = now_ms();
                        attach_local(&mut stale, local.0, local.1);
                        agent_usage::put_snapshot(
                            crate::soft_pad_runtime::AgentKind::Qoder,
                            stale,
                        );
                        return;
                    }
                    if e.contains("not installed") {
                        unavailable_snap(SRC_QODER_LOCAL, "未检测到 Qoder", QODER_CONSOLE)
                    } else {
                        manual_snap(
                            SRC_QODER_MANUAL,
                            "Qoder",
                            QODER_CONSOLE,
                            "官方剩余请到控制台",
                        )
                    }
                }
            }
        }
        #[cfg(not(windows))]
        {
            manual_snap(
                SRC_QODER_MANUAL,
                "Qoder",
                QODER_CONSOLE,
                "官方剩余请到控制台",
            )
        }
    };
    attach_local(&mut snap, local.0, local.1);
    agent_usage::put_snapshot(crate::soft_pad_runtime::AgentKind::Qoder, snap);
}