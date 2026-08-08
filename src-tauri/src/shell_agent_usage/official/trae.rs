//! Trae official entitlement via local login JWT (not SQLCipher).
//!
//! Path: storage.json → iCubeAuthInfo → Cloud-IDE-JWT → ide_user_ent_usage
//! source = trae_entitlement_api

use crate::agent_usage::{self, AgentUsageSnapshot};
use crate::shell_agent_usage::http::http_post_json_auth_header;
use crate::shell_agent_usage::models::{
    credits_message, manual_snap, now_ms, number, window_from_remaining_pct, SRC_TRAE_ENTITLEMENT,
    SRC_TRAE_MANUAL, TRAE_CONSOLE,
};
use crate::soft_pad_runtime::AgentKind;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;
use sha2::{Digest, Sha512};
use std::fs;
use std::path::PathBuf;

const USAGE_URL: &str = "https://api.trae.cn/trae/api/v2/pay/ide_user_ent_usage";
const STORAGE_KEY: &str = "iCubeAuthInfo://icube.cloudide";
const MAX_STORAGE_BYTES: u64 = 4 * 1024 * 1024;

const NORMAL_HEADER: [u8; 6] = [116, 99, 5, 16, 0, 0];
const PRIVATE_HEADER: [u8; 6] = [18, 57, 32, 32, 2, 3];

const NORMAL_LEFT: [u8; 64] = [
    82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251, 124, 227, 57, 130, 155,
    47, 255, 135, 52, 142, 67, 68, 196, 222, 233, 203, 84, 123, 148, 50, 166, 194, 35, 61, 238, 76,
    149, 11, 66, 250, 195, 78, 8, 46, 161, 102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209,
    37,
];
const NORMAL_RIGHT: [u8; 64] = [
    31, 221, 168, 51, 136, 7, 199, 49, 177, 18, 16, 89, 39, 128, 236, 95, 96, 81, 127, 169, 25, 181,
    74, 13, 45, 229, 122, 159, 147, 201, 156, 239, 160, 224, 59, 77, 174, 42, 245, 176, 200, 235,
    187, 60, 131, 83, 153, 97, 23, 43, 4, 126, 186, 119, 214, 38, 225, 105, 20, 99, 85, 33, 12, 125,
];
const PRIVATE_LEFT: [u8; 64] = [
    191, 192, 216, 250, 122, 246, 220, 97, 31, 254, 98, 27, 8, 72, 71, 176, 135, 99, 96, 18, 127,
    101, 203, 104, 211, 102, 191, 125, 37, 72, 150, 156, 51, 229, 121, 35, 17, 153, 141, 177, 110,
    131, 150, 128, 172, 255, 254, 6, 18, 140, 55, 62, 236, 249, 135, 64, 135, 12, 117, 4, 89, 149,
    168, 209,
];
const PRIVATE_RIGHT: [u8; 64] = [
    246, 204, 26, 232, 232, 70, 129, 109, 223, 146, 169, 242, 23, 241, 105, 145, 50, 196, 165, 42,
    254, 120, 3, 54, 244, 207, 209, 85, 53, 6, 138, 106, 175, 148, 31, 204, 186, 186, 165, 182, 87,
    142, 49, 10, 39, 110, 26, 154, 86, 56, 173, 125, 18, 64, 198, 225, 99, 99, 83, 82, 191, 134, 76,
    170,
];

fn trae_roots() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        let base = PathBuf::from(appdata);
        for name in ["TRAE SOLO CN", "Trae CN", "Trae"] {
            out.push(base.join(name));
        }
    }
    out
}

fn find_storage() -> Option<PathBuf> {
    trae_roots().into_iter().find_map(|root| {
        let p = root
            .join("User")
            .join("globalStorage")
            .join("storage.json");
        if p.is_file() {
            Some(p)
        } else {
            None
        }
    })
}

fn derive_key_iv(random_key: &[u8], private: bool) -> ([u8; 16], [u8; 16]) {
    let first = Sha512::digest(random_key);
    let (left, right) = if private {
        (&PRIVATE_LEFT, &PRIVATE_RIGHT)
    } else {
        (&NORMAL_LEFT, &NORMAL_RIGHT)
    };
    let mut seed = [0u8; 128];
    seed[..64].copy_from_slice(&first);
    for i in 0..64 {
        seed[64 + i] = left[i] ^ right[i];
    }
    let digest = Sha512::digest(seed);
    let mut key = [0u8; 16];
    let mut iv = [0u8; 16];
    key.copy_from_slice(&digest[..16]);
    iv.copy_from_slice(&digest[16..32]);
    (key, iv)
}

pub fn decrypt_storage_value(encoded: &str) -> Result<Vec<u8>, String> {
    use aes::Aes128;
    use cbc::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};

    let bytes = STANDARD
        .decode(encoded.trim())
        .map_err(|_| "TRAE login data is not valid base64".to_string())?;
    if bytes.len() <= 38 {
        return Err("TRAE login data incomplete".into());
    }
    let private = if bytes.starts_with(&NORMAL_HEADER) {
        false
    } else if bytes.starts_with(&PRIVATE_HEADER) {
        true
    } else {
        return Err("TRAE unsupported credential format".into());
    };
    let (key, iv) = derive_key_iv(&bytes[6..38], private);
    let decrypted = cbc::Decryptor::<Aes128>::new_from_slices(&key, &iv)
        .map_err(|_| "TRAE cipher invalid".to_string())?
        .decrypt_padded_vec_mut::<Pkcs7>(&bytes[38..])
        .map_err(|_| "TRAE credentials decrypt failed".to_string())?;
    if decrypted.len() < 64 {
        return Err("TRAE credential payload incomplete".into());
    }
    let payload = &decrypted[64..];
    if Sha512::digest(payload).as_slice() != &decrypted[..64] {
        return Err("TRAE credential integrity check failed".into());
    }
    Ok(payload.to_vec())
}

fn load_auth() -> Result<Value, String> {
    let path = find_storage().ok_or_else(|| "TRAE is not installed".to_string())?;
    let meta = fs::metadata(&path).map_err(|_| "TRAE login data unavailable".to_string())?;
    if !meta.is_file() || meta.len() > MAX_STORAGE_BYTES {
        return Err("TRAE login data unavailable".into());
    }
    let storage: Value = serde_json::from_slice(
        &fs::read(&path).map_err(|_| "TRAE login data could not be read".to_string())?,
    )
    .map_err(|_| "TRAE login data unsupported format".to_string())?;
    let encoded = storage
        .get(STORAGE_KEY)
        .and_then(Value::as_str)
        .ok_or_else(|| "请登录 Trae 查看额度".to_string())?;
    let plain = decrypt_storage_value(encoded)?;
    serde_json::from_slice(&plain).map_err(|_| "TRAE account data unsupported".to_string())
}

fn auth_token(value: &Value) -> Option<&str> {
    ["/token", "/auth/token", "/accessToken", "/auth/accessToken"]
        .iter()
        .find_map(|p| value.pointer(p)?.as_str())
}

fn active_pack(pack: &Value) -> bool {
    let Some(end_time) = pack
        .get("expire_time")
        .or_else(|| pack.pointer("/entitlement_base_info/end_time"))
        .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|t| t.parse().ok())))
    else {
        return true;
    };
    if end_time <= 0 {
        return true;
    }
    let seconds = if end_time > 10_000_000_000 {
        end_time / 1000
    } else {
        end_time
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    seconds >= now
}

fn plan_name(product_type: i64) -> (&'static str, u8) {
    match product_type {
        100 => ("Express", 7),
        6 => ("Ultra", 6),
        4 | 5 => ("Pro+", 5),
        1 => ("Pro", 4),
        8 => ("Lite", 3),
        9 => ("Solo Invite", 2),
        2 => ("Package", 1),
        3 => ("Promo", 1),
        _ => ("Free", 0),
    }
}

fn response_payload(value: &Value) -> &Value {
    value
        .get("data")
        .and_then(|data| {
            if data.get("user_entitlement_pack_list").is_some() {
                Some(data)
            } else {
                data.get("data")
            }
        })
        .unwrap_or(value)
}

/// Parse Trae entitlement API JSON into Soft Pad snapshot.
pub fn parse_trae_entitlement(value: &Value) -> Result<AgentUsageSnapshot, String> {
    if value
        .get("code")
        .and_then(Value::as_i64)
        .is_some_and(|code| code != 0)
    {
        return Err("TRAE quota request rejected".into());
    }
    let payload = response_payload(value);
    let packs = payload
        .get("user_entitlement_pack_list")
        .and_then(Value::as_array)
        .ok_or_else(|| "TRAE missing entitlement packs".to_string())?;

    let mut fast_total = 0.0;
    let mut fast_used = 0.0;
    let mut basic_total = 0.0;
    let mut basic_used = 0.0;
    let mut has_credit_quota = false;
    let mut current_credit_remaining = 0.0;
    let mut has_current_credit_quota = false;
    let mut unlimited_current_credits = false;
    let mut best_plan = ("Free", 0u8);
    let mut active_packs = 0usize;

    for pack in packs.iter().filter(|p| active_pack(p)) {
        active_packs += 1;
        let base = pack.get("entitlement_base_info").unwrap_or(pack);
        let quota = base.get("quota").unwrap_or(base);
        let usage = pack.get("usage").unwrap_or(pack);
        let product_type = number(base.get("product_type").unwrap_or(&Value::Null))
            .unwrap_or(0.0)
            .round() as i64;
        let plan = plan_name(product_type);
        if plan.1 > best_plan.1 {
            best_plan = plan;
        }

        match number(quota.get("credits_limit").unwrap_or(&Value::Null)) {
            Some(limit) if (limit + 1.0).abs() < f64::EPSILON => {
                has_current_credit_quota = true;
                unlimited_current_credits = true;
            }
            Some(limit) if limit > 0.0 => {
                has_current_credit_quota = true;
                let used = number(usage.get("credits_amount").unwrap_or(&Value::Null))
                    .unwrap_or(0.0)
                    .max(0.0);
                current_credit_remaining += (limit - used).max(0.0);
            }
            _ => {}
        }

        let fast_limit =
            number(quota.get("premium_model_fast_request_limit").unwrap_or(&Value::Null))
                .unwrap_or(0.0);
        if fast_limit > 0.0 {
            fast_total += fast_limit;
            fast_used += number(
                usage
                    .get("premium_model_fast_amount")
                    .or_else(|| usage.get("premium_model_fast_request_usage"))
                    .unwrap_or(&Value::Null),
            )
            .unwrap_or(0.0)
            .max(0.0);
        }

        let no_bonus = quota
            .get("no_bonus_quota")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        for (limit_key, used_key, enabled) in [
            ("basic_usage_limit", "basic_usage_amount", true),
            ("bonus_usage_limit", "bonus_usage_amount", !no_bonus),
        ] {
            let limit = if enabled {
                number(quota.get(limit_key).unwrap_or(&Value::Null))
            } else {
                None
            };
            if let Some(limit) = limit.filter(|l| *l >= 0.0) {
                has_credit_quota = true;
                basic_total += limit;
                basic_used += number(usage.get(used_key).unwrap_or(&Value::Null))
                    .unwrap_or(0.0)
                    .max(0.0);
            }
        }
    }

    let (remaining, unit, rem_pct, message) = if unlimited_current_credits {
        (0.0, "unlimited", None, "企业额度不限".to_string())
    } else if has_current_credit_quota {
        let rem = current_credit_remaining;
        (rem, "credits", None, credits_message(rem, "Credits"))
    } else if has_credit_quota {
        let rem = (basic_total - basic_used).max(0.0);
        let pct = if basic_total > 0.0 {
            Some((rem / basic_total * 100.0).clamp(0.0, 100.0))
        } else {
            Some(0.0)
        };
        (rem, "credits", pct, credits_message(rem, "Credits"))
    } else if fast_total > 0.0 {
        let rem = (fast_total - fast_used).max(0.0);
        let pct = Some((rem / fast_total * 100.0).clamp(0.0, 100.0));
        let msg = format!(
            "速通请求 {} / {}",
            rem.round() as i64,
            fast_total.round() as i64
        );
        (rem, "requests", pct, msg)
    } else if active_packs > 0 && best_plan.1 == 0 {
        (0.0, "unlimited", None, "免费额度不限".to_string())
    } else {
        return Err("TRAE has no active measurable quota".into());
    };

    let rem_pct = rem_pct.or_else(|| {
        if unit == "credits" && remaining >= 0.0 {
            // absolute credits without known total → no fake %
            None
        } else {
            None
        }
    });

    // For current_credit_quota without total, leave % empty; Soft Pad uses message.
    // If we have rem_pct from basic/fast, set windows.
    let mut windows = Vec::new();
    if let Some(pct) = rem_pct {
        windows.push(window_from_remaining_pct("plan_credits", "primary", pct, None));
    }

    let now = now_ms();
    Ok(AgentUsageSnapshot {
        source: SRC_TRAE_ENTITLEMENT.into(),
        status: "ready".into(),
        confidence: "official".into(),
        message,
        remaining_percent: rem_pct,
        windows,
        plan_type: best_plan.0.into(),
        account_type: "trae".into(),
        account_label: "Trae".into(),
        console_url: TRAE_CONSOLE.into(),
        updated_at: now,
        last_success_at: now,
        ..Default::default()
    })
}

fn fetch_official() -> Result<AgentUsageSnapshot, String> {
    let auth = load_auth()?;
    let token = auth_token(&auth).ok_or_else(|| "请登录 Trae 查看额度".to_string())?;
    let text = http_post_json_auth_header(
        USAGE_URL,
        &format!("Cloud-IDE-JWT {token}"),
        &serde_json::json!({ "require_usage": true }),
    )?;
    let v: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    parse_trae_entitlement(&v)
}

pub fn refresh() {
    match fetch_official() {
        Ok(snap) => agent_usage::put_snapshot(AgentKind::Trae, snap),
        Err(e) => {
            let prev = agent_usage::snapshot(AgentKind::Trae);
            if prev.source == SRC_TRAE_ENTITLEMENT
                && prev.status == "ready"
                && prev.last_success_at > 0
            {
                let mut stale = prev;
                stale.status = "stale".into();
                stale.confidence = "stale".into();
                stale.updated_at = now_ms();
                stale.message = format!(
                    "{}（刷新失败）",
                    if stale.message.is_empty() {
                        "Trae".into()
                    } else {
                        stale.message.clone()
                    }
                );
                agent_usage::put_snapshot(AgentKind::Trae, stale);
                return;
            }
            let msg = if e.contains("请登录") || e.contains("not installed") || e.contains("Sign")
            {
                "请登录 Trae 查看额度"
            } else {
                "请登录 Trae 查看额度"
            };
            agent_usage::put_snapshot(
                AgentKind::Trae,
                manual_snap(SRC_TRAE_MANUAL, "Trae", TRAE_CONSOLE, msg),
            );
        }
    }
}
