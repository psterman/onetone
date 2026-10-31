//! ATR model provider ids + ready listing for free switching.

use serde_json::{json, Value};

use super::deepseek::{self, OpenAiCompatDriver};
use super::workbuddy::{self, WorkbuddyDriver};
use crate::soft_pad_quota::SoftPadQuotaProvider;

/// Soft Pad providers in catalog display order, then WorkBuddy (OAuth freemodel).
const SOFT_PAD_ORDER: [SoftPadQuotaProvider; 4] = [
    SoftPadQuotaProvider::DeepSeek,
    SoftPadQuotaProvider::Kimi,
    SoftPadQuotaProvider::SiliconFlow,
    SoftPadQuotaProvider::OpenRouter,
];

pub fn parse_provider_id(s: &str) -> Option<String> {
    let t = s.trim().to_ascii_lowercase();
    if t.is_empty() {
        return None;
    }
    if t == "workbuddy" || t == "wb" || t == "codebuddy" {
        return Some("workbuddy".into());
    }
    SoftPadQuotaProvider::from_str(&t).map(|p| p.as_str().to_string())
}

fn workbuddy_label(chat_ready: bool) -> String {
    if chat_ready {
        return "WorkBuddy".into();
    }
    if workbuddy::workbuddy_has_account() {
        "WorkBuddy · 请选模型".into()
    } else {
        "WorkBuddy · 未登录".into()
    }
}

/// tryEdit: preconditions for labeled verify/trial — not "safe normal edit".
fn soft_pad_try_edit(ready: bool) -> bool {
    ready
}

fn workbuddy_try_edit(chat_ready: bool, probe: &str) -> bool {
    chat_ready && probe != "fail"
}

pub fn provider_ready_snapshot() -> Value {
    let mut providers = Vec::new();
    for p in SOFT_PAD_ORDER {
        let chat_ready = deepseek::soft_pad_provider_ready(p);
        let try_edit = soft_pad_try_edit(chat_ready);
        providers.push(json!({
            "id": p.as_str(),
            "label": p.label(),
            // Legacy "ready" = chat/key present (not editCapable).
            "ready": chat_ready,
            "chatReady": chat_ready,
            "tryEdit": try_edit,
            // Normal project edit: backend acceptance only (see apply_acceptances).
            "editCapable": false,
            "locallyVerified": false,
            "modelId": deepseek::soft_pad_model_id(p),
            "kind": "soft_pad",
        }));
    }

    let wb_chat = workbuddy::workbuddy_chat_ready();
    let wb_probe = workbuddy::workbuddy_edit_probe_status();
    let wb_try = workbuddy_try_edit(wb_chat, wb_probe);
    let wb_model = workbuddy::workbuddy_model_id();
    providers.push(json!({
        "id": "workbuddy",
        "label": workbuddy_label(wb_chat),
        "ready": wb_chat,
        "chatReady": wb_chat,
        "tryEdit": wb_try,
        "editCapable": false,
        "locallyVerified": false,
        "editProbe": wb_probe,
        "modelId": wb_model,
        "kind": "workbuddy",
    }));

    // Backend acceptance (config fingerprint match) is the only editCapable grant.
    super::verify_accept::apply_acceptances_to_providers(&mut providers);

    let recommended = recommended_try_edit(&providers);
    json!({
        "implemented": true,
        "deepseekReady": deepseek::deepseek_ready(),
        "workbuddyReady": wb_chat,
        "workbuddyChatReady": wb_chat,
        "providers": providers,
        // Do not auto-pick a billing Soft Pad. FE keeps user choice; recommend is advisory.
        "selectedDefault": Value::Null,
        "recommendedProvider": recommended.0,
        "recommendReason": recommended.1,
        "defaultPermissionMode": "write_with_approval",
        "acceptSpecVersion": super::store::ACCEPT_SPEC_VERSION,
    })
}

/// Advisory only — never written by backend as the active engine.
fn recommended_try_edit(providers: &[Value]) -> (Value, Value) {
    if providers.iter().any(|p| {
        p.get("id").and_then(|v| v.as_str()) == Some("workbuddy")
            && p.get("tryEdit").and_then(|v| v.as_bool()) == Some(true)
    }) {
        return (
            json!("workbuddy"),
            json!("WorkBuddy 可聊天且工具探测未失败 — 建议先在隔离沙箱验证编辑"),
        );
    }
    let prefer = ["deepseek", "kimi", "siliconflow", "openrouter"];
    for id in prefer {
        if providers.iter().any(|p| {
            p.get("id").and_then(|v| v.as_str()) == Some(id)
                && p.get("tryEdit").and_then(|v| v.as_bool()) == Some(true)
        }) {
            return (
                json!(id),
                json!(format!(
                    "{id} Soft Pad 密钥已配置 — 建议先在隔离沙箱验证编辑（非 OAuth freemodel）"
                )),
            );
        }
    }
    (Value::Null, Value::Null)
}

/// Run WorkBuddy native tool-calling probe; returns updated ready snapshot.
pub fn probe_workbuddy_edit(force: bool) -> Result<Value, String> {
    let _ = workbuddy::probe_workbuddy_edit(force)?;
    Ok(provider_ready_snapshot())
}

pub fn make_driver(provider_id: &str) -> Result<Box<dyn super::engine::ModelDriver>, String> {
    let id = parse_provider_id(provider_id).ok_or_else(|| "unknown_provider".to_string())?;
    if id == "workbuddy" {
        if !workbuddy::workbuddy_chat_ready() {
            return Err("workbuddy_unconfigured".into());
        }
        return Ok(Box::new(WorkbuddyDriver::default()));
    }
    let p = SoftPadQuotaProvider::from_str(&id).ok_or("unknown_provider")?;
    if !deepseek::soft_pad_provider_ready(p) {
        return Err(format!("{}_unconfigured", p.as_str()));
    }
    Ok(Box::new(OpenAiCompatDriver::for_provider(p)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_known_ids() {
        assert_eq!(parse_provider_id("DeepSeek").as_deref(), Some("deepseek"));
        assert_eq!(parse_provider_id("wb").as_deref(), Some("workbuddy"));
        assert_eq!(parse_provider_id("kimi").as_deref(), Some("kimi"));
        assert!(parse_provider_id("cursor").is_none());
    }

    #[test]
    fn ready_snapshot_shape() {
        let v = provider_ready_snapshot();
        assert_eq!(v.get("implemented").and_then(|x| x.as_bool()), Some(true));
        let arr = v.get("providers").and_then(|x| x.as_array()).unwrap();
        assert!(arr.len() >= 5);
        assert!(arr
            .iter()
            .any(|p| p.get("id").and_then(|x| x.as_str()) == Some("deepseek")));
        let wb = arr
            .iter()
            .find(|p| p.get("id").and_then(|x| x.as_str()) == Some("workbuddy"))
            .expect("workbuddy row");
        assert!(wb.get("chatReady").and_then(|x| x.as_bool()).is_some());
        assert!(wb.get("tryEdit").and_then(|x| x.as_bool()).is_some());
        assert!(wb.get("editProbe").is_some());
        // Backend never claims normal editCapable without FE locallyVerified overlay.
        assert_eq!(wb.get("editCapable").and_then(|x| x.as_bool()), Some(false));
        assert!(v.get("selectedDefault").unwrap().is_null());
        let wb_chat = wb.get("chatReady").and_then(|x| x.as_bool()).unwrap_or(false);
        assert_eq!(
            v.get("workbuddyReady").and_then(|x| x.as_bool()),
            Some(wb_chat)
        );
        if wb_chat {
            assert!(make_driver("workbuddy").is_ok());
        } else {
            let err = make_driver("workbuddy").err().unwrap();
            assert!(
                err.contains("workbuddy_unconfigured"),
                "unexpected: {err}"
            );
        }
    }

    #[test]
    fn recommend_workbuddy_when_try_edit() {
        let providers = vec![
            json!({"id":"workbuddy","tryEdit":true,"kind":"workbuddy"}),
            json!({"id":"deepseek","tryEdit":true,"kind":"soft_pad"}),
        ];
        let (id, reason) = recommended_try_edit(&providers);
        assert_eq!(id.as_str(), Some("workbuddy"));
        assert!(reason.as_str().unwrap_or("").contains("隔离"));
    }

    #[test]
    fn recommend_soft_pad_when_workbuddy_not_try_edit() {
        let providers = vec![
            json!({"id":"workbuddy","tryEdit":false,"kind":"workbuddy"}),
            json!({"id":"deepseek","tryEdit":true,"kind":"soft_pad"}),
        ];
        let (id, _) = recommended_try_edit(&providers);
        assert_eq!(id.as_str(), Some("deepseek"));
    }

    #[test]
    fn make_driver_workbuddy_unconfigured_when_not_ready() {
        if workbuddy::workbuddy_chat_ready() {
            assert!(make_driver("workbuddy").is_ok());
        } else {
            let err = make_driver("workbuddy").err().unwrap();
            assert!(
                err.contains("workbuddy_unconfigured"),
                "unexpected: {err}"
            );
        }
    }
}
