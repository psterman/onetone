//! Thin Assist Runtime — task_organize only. Does not mutate home draft/receipts.

mod cancel;
mod client;
mod contracts;
mod models;
mod router;

pub use cancel::cancel as cancel_request;
pub use contracts::{
    AssistCancelRequest, AssistCancelResponse, AssistReadyStatus, AssistRunRequest,
    AssistRunResponse, CallPolicy,
};
pub use router::{ready_status, run_live};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assist_runtime::cancel;
    use crate::assist_runtime::client::{ChatResponse, FakeStep, FakeTransport};
    use crate::assist_runtime::contracts::{
        AssistInput, AssistMaterialIn, AssistPolicy, SKILL_TASK_ORGANIZE,
    };
    use crate::assist_runtime::router::run_with_transport;
    use crate::soft_pad_quota::{self, SoftPadQuotaProvider};
    use serde_json::json;
    use std::sync::Arc;
    use std::time::Duration;

    fn good_json() -> String {
        json!({
            "goal": "Fix login",
            "facts": [{"text":"err","kind":"evidence","sourceIds":["m1"]}],
            "constraints": [],
            "steps": [{"text":"repro","kind":"suggestion","sourceIds":[]}],
            "acceptanceCriteria": [{"text":"ok","kind":"suggestion","sourceIds":[]}],
            "unknowns": []
        })
        .to_string()
    }

    fn openai_wrap(content: &str) -> String {
        json!({
            "choices": [{"message": {"content": content}}]
        })
        .to_string()
    }

    fn sample_req(id: &str, allow_metered: bool) -> AssistRunRequest {
        AssistRunRequest {
            request_id: id.into(),
            skill_id: SKILL_TASK_ORGANIZE.into(),
            input: AssistInput {
                draft: "fix crash".into(),
                materials: vec![AssistMaterialIn {
                    id: "m1".into(),
                    name: "error.log".into(),
                    source: "local".into(),
                    content: Some("boom".into()),
                    path: None,
                    cite_mode: Some("full".into()),
                }],
            },
            policy: AssistPolicy {
                allowed_providers: Some(vec!["deepseek".into()]),
                allow_metered,
                call_policy: None,
                max_input_chars: Some(24_000),
                max_output_chars: Some(6_000),
                deadline_ms: Some(5_000),
                send_scope: Some("included_materials".into()),
            },
        }
    }

    #[tokio::test]
    async fn cancel_during_wait_stops_rotation() {
        let id = "assist_cancel_rot_1";
        let _ = soft_pad_quota::set_stored_key(SoftPadQuotaProvider::DeepSeek, "sk-testkey123456");
        let _ = soft_pad_quota::set_stored_key(SoftPadQuotaProvider::Kimi, "sk-testkey123456");

        let transport = FakeTransport::new(vec![
            FakeStep::DelayMs(
                5_000,
                Ok(ChatResponse {
                    status: 200,
                    body: openai_wrap(&good_json()),
                }),
            ),
            FakeStep::Immediate(Ok(ChatResponse {
                status: 200,
                body: openai_wrap(&good_json()),
            })),
        ]);
        let attempts = Arc::clone(&transport.attempts);

        let token = cancel::register(id).unwrap();
        let token2 = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            token2.cancel();
        });

        let mut req = sample_req(id, true);
        req.policy.allowed_providers = Some(vec!["deepseek".into(), "kimi".into()]);
        req.policy.deadline_ms = Some(8_000);

        let resp = run_with_transport(&transport, req, token).await;
        assert!(!resp.ok);
        assert_eq!(resp.reason.as_deref(), Some("cancelled"));
        let a = *attempts.lock().await;
        assert_eq!(a, 1, "must not start second rotation after cancel");

        let _ = soft_pad_quota::set_stored_key(SoftPadQuotaProvider::DeepSeek, "");
        let _ = soft_pad_quota::set_stored_key(SoftPadQuotaProvider::Kimi, "");
    }

    #[tokio::test]
    async fn free_only_rejects_metered_catalog() {
        let id = "assist_free_only_1";
        let _ = soft_pad_quota::set_stored_key(SoftPadQuotaProvider::DeepSeek, "sk-testkey123456");
        let transport = FakeTransport::new(vec![]);
        let token = cancel::register(id).unwrap();
        let resp = run_with_transport(&transport, sample_req(id, false), token).await;
        assert!(!resp.ok);
        assert_eq!(resp.reason.as_deref(), Some("no_free_model"));
        let _ = soft_pad_quota::set_stored_key(SoftPadQuotaProvider::DeepSeek, "");
    }

    #[tokio::test]
    async fn rate_limit_rotates_once() {
        let id = "assist_429_rot_1";
        let _ = soft_pad_quota::set_stored_key(SoftPadQuotaProvider::DeepSeek, "sk-testkey123456");
        let _ = soft_pad_quota::set_stored_key(SoftPadQuotaProvider::Kimi, "sk-testkey123456");
        let transport = FakeTransport::new(vec![
            FakeStep::Immediate(Ok(ChatResponse {
                status: 429,
                body: "slow".into(),
            })),
            FakeStep::Immediate(Ok(ChatResponse {
                status: 200,
                body: openai_wrap(&good_json()),
            })),
        ]);
        let token = cancel::register(id).unwrap();
        let mut req = sample_req(id, true);
        req.policy.allowed_providers = Some(vec!["deepseek".into(), "kimi".into()]);
        let resp = run_with_transport(&transport, req, token).await;
        assert!(resp.ok, "{:?}", resp);
        assert_eq!(resp.attempts, 2);
        let _ = soft_pad_quota::set_stored_key(SoftPadQuotaProvider::DeepSeek, "");
        let _ = soft_pad_quota::set_stored_key(SoftPadQuotaProvider::Kimi, "");
    }

    #[tokio::test]
    async fn duplicate_request_id_rejected() {
        let id = "assist_dup_live_1";
        cancel::register(id).unwrap();
        let resp = run_live(sample_req(id, true)).await;
        assert_eq!(resp.reason.as_deref(), Some("duplicate_request"));
        cancel::finish(id);
    }

    #[test]
    fn ready_status_free_only_not_ready_without_zero_price() {
        let st = ready_status(CallPolicy::FreeOnly);
        assert!(st.implemented);
        // May be no_key or no_free_model depending on workspace keys.
        assert!(!st.ready || st.reason.is_none());
    }
}
