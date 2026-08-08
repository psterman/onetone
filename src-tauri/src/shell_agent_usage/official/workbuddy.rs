use crate::agent_usage::{self, AgentUsageSnapshot};
use crate::shell_agent_usage::http::http_post_json;
use crate::shell_agent_usage::models::{
    attach_local, credits_message, manual_snap, now_ms, number, utc_ymdhms_now,
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

pub fn parse_workbuddy_personal(
    value: &Value,
    account_type: Option<&str>,
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

    let mut remaining = 0.0;
    let mut total = 0.0;
    let mut best_package: Option<(&str, f64)> = None;
    for account in accounts {
        let item_total =
            number(account.get("CycleCapacitySizePrecise").unwrap_or(&Value::Null)).unwrap_or(0.0);
        let item_remaining =
            number(account.get("CycleCapacityRemainPrecise").unwrap_or(&Value::Null))
                .unwrap_or(0.0);
        if item_total <= 0.0 && item_remaining <= 0.0 {
            continue;
        }
        total += item_total.max(0.0);
        remaining += item_remaining.max(0.0);
        if let Some(code) = account.get("PackageCode").and_then(|x| x.as_str()) {
            if best_package.map(|(_, c)| item_total > c).unwrap_or(true) {
                best_package = Some((code, item_total));
            }
        }
    }
    if total <= 0.0 && remaining <= 0.0 {
        return Err("WorkBuddy has no active personal quota".into());
    }
    let rem_pct = if total > 0.0 {
        (remaining / total * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };
    let plan = friendly_wb_plan(account_type, best_package.map(|(c, _)| c));
    let now = now_ms();
    Ok(AgentUsageSnapshot {
        source: SRC_WB_LOCAL.into(),
        status: "ready".into(),
        confidence: "official".into(),
        message: credits_message(remaining, "Credits"),
        remaining_percent: Some(rem_pct),
        windows: vec![window_from_remaining_pct(
            "plan_credits",
            "primary",
            rem_pct,
            None,
        )],
        plan_type: plan,
        account_type: "workbuddy".into(),
        account_label: "WorkBuddy".into(),
        console_url: WORKBUDDY_CONSOLE.into(),
        updated_at: now,
        last_success_at: now,
        ..Default::default()
    })
}

pub fn parse_workbuddy_enterprise(value: &Value) -> Result<AgentUsageSnapshot, String> {
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
    if limit < 0.0 {
        return Ok(AgentUsageSnapshot {
            source: SRC_WB_LOCAL.into(),
            status: "ready".into(),
            confidence: "official".into(),
            message: "企业额度不限".into(),
            plan_type: "Enterprise Unlimited".into(),
            account_type: "workbuddy".into(),
            account_label: "WorkBuddy".into(),
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
    Ok(AgentUsageSnapshot {
        source: SRC_WB_LOCAL.into(),
        status: "ready".into(),
        confidence: "official".into(),
        message: credits_message(rem, "Credits"),
        remaining_percent: Some(rem_pct),
        windows: vec![window_from_remaining_pct(
            "plan_credits",
            "primary",
            rem_pct,
            None,
        )],
        plan_type: "Enterprise".into(),
        account_type: "workbuddy".into(),
        account_label: "WorkBuddy".into(),
        console_url: WORKBUDDY_CONSOLE.into(),
        updated_at: now,
        last_success_at: now,
        ..Default::default()
    })
}

fn friendly_wb_plan(account_type: Option<&str>, package_code: Option<&str>) -> String {
    let source = package_code.or(account_type).unwrap_or("personal");
    let lower = source.to_ascii_lowercase();
    if lower.contains("ultimate") {
        "Ultimate".into()
    } else if lower.contains("exclusive") || lower.contains("enterprise") {
        "Enterprise".into()
    } else if lower.contains("pro") {
        "Pro".into()
    } else if lower.contains("free") {
        "Free".into()
    } else {
        "Personal".into()
    }
}

#[cfg(windows)]
fn workbuddy_from_disk_and_api() -> Result<AgentUsageSnapshot, String> {
    use crate::shell_agent_usage::chromium_secret::{
        encryption_key, find_electron_root, read_secret,
    };

    // Low-investment profile roots: WorkBuddy / CodeBuddy (Roaming Electron).
    // Hook settings live under ~/.codebuddy — not a quota source.
    let root = find_electron_root(&["WorkBuddy", "CodeBuddy"])
        .ok_or_else(|| "WorkBuddy Electron not installed".to_string())?;
    let key = encryption_key(&root)?;
    let value = read_secret(&root, &key, WB_SECRET_KEY)
        .or_else(|_| read_secret(&root, &key, WB_SECRET_KEY_ALT))?;

    fn string_at(value: &Value, pointers: &[&str]) -> Option<String> {
        pointers
            .iter()
            .find_map(|p| value.pointer(p)?.as_str().map(str::to_owned))
    }

    let access_token = string_at(&value, &["/auth/accessToken", "/accessToken"])
        .ok_or_else(|| "WorkBuddy login expired".to_string())?;
    let user_id = string_at(&value, &["/account/uid", "/uid"])
        .ok_or_else(|| "WorkBuddy user id missing".to_string())?;
    let account_type = string_at(&value, &["/account/type", "/type"]);
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

    let is_enterprise = account_type.as_deref().is_some_and(|v| {
        let v = v.to_ascii_lowercase();
        v.contains("enterprise") || v.contains("ultimate") || v.contains("exclusive")
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
                    return parse_workbuddy_enterprise(&v);
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
                return parse_workbuddy_personal(&v, account_type.as_deref());
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
                    "官方剩余请到控制台",
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
