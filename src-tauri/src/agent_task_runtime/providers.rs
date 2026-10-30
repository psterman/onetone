//! ATR model provider ids + ready listing for free switching.

use serde_json::{json, Value};

use super::deepseek::{self, OpenAiCompatDriver};
use super::workbuddy::{self, WorkbuddyDriver};
use crate::soft_pad_quota::SoftPadQuotaProvider;

/// Soft Pad providers in catalog display order, then WorkBuddy (OAuth freemodel primary).
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

fn workbuddy_label(ready: bool) -> String {
    if ready {
        return "WorkBuddy".into();
    }
    if workbuddy::workbuddy_has_account() {
        "WorkBuddy · 请选模型".into()
    } else {
        "WorkBuddy · 未登录".into()
    }
}

pub fn provider_ready_snapshot() -> Value {
    let mut providers = Vec::new();
    for p in SOFT_PAD_ORDER {
        let ready = deepseek::soft_pad_provider_ready(p);
        providers.push(json!({
            "id": p.as_str(),
            "label": p.label(),
            "ready": ready,
            "editCapable": ready,
            "chatReady": ready,
            "modelId": deepseek::soft_pad_model_id(p),
            "kind": "soft_pad",
        }));
    }

    // OAuth freemodel path: account + selected model = ATR edit ready (probe is diagnostic only).
    let wb_ready = workbuddy::workbuddy_chat_ready();
    let wb_probe = workbuddy::workbuddy_edit_probe_status();
    let wb_model = workbuddy::workbuddy_model_id();
    providers.push(json!({
        "id": "workbuddy",
        "label": workbuddy_label(wb_ready),
        "ready": wb_ready,
        "editCapable": wb_ready,
        "chatReady": wb_ready,
        "editProbe": wb_probe,
        "modelId": wb_model,
        "kind": "workbuddy",
    }));

    let selected_default = preferred_edit_ready(&providers);
    json!({
        "implemented": true,
        "deepseekReady": deepseek::deepseek_ready(),
        "workbuddyReady": wb_ready,
        "workbuddyChatReady": wb_ready,
        "providers": providers,
        "selectedDefault": selected_default,
        "defaultPermissionMode": "write_with_approval",
    })
}

/// Prefer WorkBuddy (OAuth freemodel) when ready, else Soft Pad catalog order.
fn preferred_edit_ready(providers: &[Value]) -> Option<String> {
    if providers.iter().any(|p| {
        p.get("id").and_then(|v| v.as_str()) == Some("workbuddy")
            && p.get("ready").and_then(|v| v.as_bool()) == Some(true)
    }) {
        return Some("workbuddy".into());
    }
    let prefer = ["deepseek", "kimi", "siliconflow", "openrouter"];
    for id in prefer {
        if providers.iter().any(|p| {
            p.get("id").and_then(|v| v.as_str()) == Some(id)
                && p.get("ready").and_then(|v| v.as_bool()) == Some(true)
                && p.get("kind").and_then(|v| v.as_str()) == Some("soft_pad")
        }) {
            return Some(id.to_string());
        }
    }
    providers.iter().find_map(|p| {
        if p.get("ready").and_then(|v| v.as_bool()) == Some(true) {
            p.get("id").and_then(|v| v.as_str()).map(|s| s.to_string())
        } else {
            None
        }
    })
}

/// Run WorkBuddy native tool-calling probe; returns updated ready snapshot.
/// Probe is diagnostic only — editCapable follows atr_ready (login + model).
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
        assert_eq!(wb.get("chatReady").and_then(|x| x.as_bool()).is_some(), true);
        assert!(wb.get("editProbe").is_some());
        // ready/editCapable track atr_ready (login + model), not a hard false.
        let wb_ready = wb.get("ready").and_then(|x| x.as_bool()).unwrap_or(false);
        assert_eq!(
            wb.get("editCapable").and_then(|x| x.as_bool()),
            Some(wb_ready)
        );
        assert_eq!(
            v.get("workbuddyReady").and_then(|x| x.as_bool()),
            Some(wb_ready)
        );
        if wb_ready {
            assert_eq!(
                v.get("selectedDefault").and_then(|x| x.as_str()),
                Some("workbuddy")
            );
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
    fn preferred_workbuddy_over_soft_pad_when_ready() {
        let providers = vec![
            json!({"id":"workbuddy","ready":true,"kind":"workbuddy"}),
            json!({"id":"deepseek","ready":true,"kind":"soft_pad"}),
        ];
        assert_eq!(
            preferred_edit_ready(&providers).as_deref(),
            Some("workbuddy")
        );
    }

    #[test]
    fn preferred_soft_pad_when_workbuddy_not_ready() {
        let providers = vec![
            json!({"id":"workbuddy","ready":false,"kind":"workbuddy"}),
            json!({"id":"deepseek","ready":true,"kind":"soft_pad"}),
        ];
        assert_eq!(
            preferred_edit_ready(&providers).as_deref(),
            Some("deepseek")
        );
    }

    #[test]
    fn make_driver_workbuddy_unconfigured_when_not_ready() {
        // Without a logged-in account this machine returns unconfigured.
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
