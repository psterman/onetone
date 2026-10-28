//! Provider rotation, inference 429 cooldown (separate from quota cooldown), budgets.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use crate::soft_pad_quota::{self, SoftPadQuotaProvider};

use super::cancel::{self, AssistCancel};
use super::client::{
    chat_request_for, extract_assistant_text, parse_task_organize_json, safe_log_fragment,
    AssistHttpError, AssistTransport, ChatResponse,
};
use super::contracts::{
    AssistReason, AssistRunRequest, AssistRunResponse, AssistUsage, CallPolicy, SKILL_TASK_ORGANIZE,
    MAX_ATTEMPTS,
};
use super::models::{
    build_task_organize_user_prompt, eligible_for_policy, model_catalog, task_organize_system_prompt,
    ModelEntry,
};

fn inference_cooldown() -> &'static Mutex<HashMap<&'static str, Instant>> {
    static C: OnceLock<Mutex<HashMap<&'static str, Instant>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

const INFER_COOLDOWN: Duration = Duration::from_secs(30);

fn provider_cooling(p: SoftPadQuotaProvider) -> bool {
    let g = inference_cooldown().lock().unwrap_or_else(|e| e.into_inner());
    g.get(p.as_str())
        .map(|until| Instant::now() < *until)
        .unwrap_or(false)
}

fn mark_429(p: SoftPadQuotaProvider) {
    let mut g = inference_cooldown().lock().unwrap_or_else(|e| e.into_inner());
    g.insert(p.as_str(), Instant::now() + INFER_COOLDOWN);
}

fn clear_429(p: SoftPadQuotaProvider) {
    let mut g = inference_cooldown().lock().unwrap_or_else(|e| e.into_inner());
    g.remove(p.as_str());
}

fn has_key(p: SoftPadQuotaProvider) -> bool {
    soft_pad_quota::read_stored_key(p).is_some()
}

pub fn ready_status(call_policy: CallPolicy) -> super::contracts::AssistReadyStatus {
    let candidates = select_candidates(None, call_policy);
    let (ready, reason) = if candidates.is_empty() {
        let any_key = SoftPadQuotaProvider::all().iter().any(|p| has_key(*p));
        if !any_key {
            (false, Some(AssistReason::NoKey.as_str().to_string()))
        } else if call_policy == CallPolicy::FreeOnly {
            (false, Some(AssistReason::NoFreeModel.as_str().to_string()))
        } else {
            (false, Some(AssistReason::ProviderDisabled.as_str().to_string()))
        }
    } else {
        (true, None)
    };
    super::contracts::AssistReadyStatus {
        skill_id: SKILL_TASK_ORGANIZE.into(),
        implemented: true,
        ready,
        reason,
        call_policy: match call_policy {
            CallPolicy::FreeOnly => "free_only".into(),
            CallPolicy::AllowMetered => "allow_metered".into(),
        },
    }
}

fn select_candidates(
    allowed: Option<&[String]>,
    policy: CallPolicy,
) -> Vec<ModelEntry> {
    model_catalog()
        .into_iter()
        .filter(|e| {
            if let Some(list) = allowed {
                if !list.is_empty()
                    && !list
                        .iter()
                        .any(|a| a.eq_ignore_ascii_case(e.provider.as_str()))
                {
                    return false;
                }
            }
            eligible_for_policy(e, policy) && has_key(e.provider) && !provider_cooling(e.provider)
        })
        .collect()
}

fn input_byte_len(req: &AssistRunRequest) -> usize {
    let mut n = req.input.draft.len();
    for m in &req.input.materials {
        if let Some(c) = &m.content {
            n += c.len();
        }
        if let Some(p) = &m.path {
            n += p.len();
        }
    }
    n
}

fn allowed_source_ids(req: &AssistRunRequest) -> Vec<String> {
    req.input.materials.iter().map(|m| m.id.clone()).collect()
}

fn materials_json(req: &AssistRunRequest) -> String {
    let arr: Vec<Value> = req
        .input
        .materials
        .iter()
        .map(|m| {
            json!({
                "id": m.id,
                "name": m.name,
                "source": m.source,
                "citeMode": m.cite_mode,
                "content": m.content,
                "path": m.path,
            })
        })
        .collect();
    serde_json::to_string(&arr).unwrap_or_else(|_| "[]".into())
}

fn classify_http(status: u16, body: &str) -> Result<String, AssistReason> {
    match status {
        200..=299 => extract_assistant_text(body),
        401 | 403 => Err(AssistReason::NoKey),
        429 => Err(AssistReason::RateLimited),
        _ if status == 0 => Err(AssistReason::Offline),
        _ => {
            let _ = safe_log_fragment(body);
            Err(AssistReason::BadResponse)
        }
    }
}

/// Run skill with injectable transport. On cancel/timeout: no further rotation.
pub async fn run_with_transport<T: AssistTransport + ?Sized>(
    transport: &T,
    req: AssistRunRequest,
    cancel: AssistCancel,
) -> AssistRunResponse {
    let request_id = req.request_id.clone();
    if req.skill_id != SKILL_TASK_ORGANIZE {
        cancel::finish(&request_id);
        return AssistRunResponse::fail(&request_id, AssistReason::InvalidRequest, 0);
    }
    if input_byte_len(&req) > req.policy.max_input_bytes() {
        cancel::finish(&request_id);
        return AssistRunResponse::fail(&request_id, AssistReason::InvalidRequest, 0);
    }

    let policy = req.policy.effective_call_policy();
    let allowed = req.policy.allowed_providers.as_deref();
    let candidates = select_candidates(allowed, policy);
    if candidates.is_empty() {
        let reason = if SoftPadQuotaProvider::all().iter().any(|p| has_key(*p)) {
            if policy == CallPolicy::FreeOnly {
                AssistReason::NoFreeModel
            } else {
                AssistReason::ProviderDisabled
            }
        } else {
            AssistReason::NoKey
        };
        cancel::finish(&request_id);
        return AssistRunResponse::fail(&request_id, reason, 0);
    }

    let deadline = Instant::now() + Duration::from_millis(req.policy.deadline_ms_clamped());
    let source_ids = allowed_source_ids(&req);
    let user_prompt = build_task_organize_user_prompt(&req.input.draft, &materials_json(&req));
    let messages = vec![
        json!({"role":"system","content": task_organize_system_prompt()}),
        json!({"role":"user","content": user_prompt}),
    ];

    let mut attempts: u32 = 0;
    let mut last_reason = AssistReason::NoFreeModel;

    for entry in &candidates {
        if cancel.is_cancelled() {
            cancel::finish(&request_id);
            return AssistRunResponse::fail(&request_id, AssistReason::Cancelled, attempts);
        }
        if Instant::now() >= deadline {
            cancel::finish(&request_id);
            return AssistRunResponse::fail(&request_id, AssistReason::Timeout, attempts);
        }
        if attempts >= MAX_ATTEMPTS {
            break;
        }

        let Some(key) = soft_pad_quota::read_stored_key(entry.provider) else {
            continue;
        };
        attempts += 1;
        let chat_req = chat_request_for(entry, &key, messages.clone());
        // Drop key from scope for logs — chat_req holds it but we never log it.
        drop(key);

        let resp = match transport
            .post_chat(chat_req, cancel.clone(), deadline)
            .await
        {
            Ok(r) => r,
            Err(AssistHttpError::Reason(AssistReason::Cancelled)) => {
                cancel::finish(&request_id);
                return AssistRunResponse::fail(&request_id, AssistReason::Cancelled, attempts);
            }
            Err(AssistHttpError::Reason(AssistReason::Timeout)) => {
                // Do not rotate after timeout — prior request may have been processed.
                cancel::finish(&request_id);
                return AssistRunResponse::fail(&request_id, AssistReason::Timeout, attempts);
            }
            Err(e) => {
                last_reason = e.reason();
                if last_reason == AssistReason::RateLimited {
                    mark_429(entry.provider);
                    continue; // rotate within budget
                }
                if last_reason == AssistReason::NoKey {
                    cancel::finish(&request_id);
                    return AssistRunResponse::fail(&request_id, AssistReason::NoKey, attempts);
                }
                // Bad request shape — do not rotate blindly.
                if last_reason == AssistReason::InvalidRequest {
                    cancel::finish(&request_id);
                    return AssistRunResponse::fail(&request_id, last_reason, attempts);
                }
                continue;
            }
        };

        if cancel.is_cancelled() {
            cancel::finish(&request_id);
            return AssistRunResponse::fail(&request_id, AssistReason::Cancelled, attempts);
        }

        match handle_response(entry, &resp, &source_ids) {
            Ok((result, usage)) => {
                clear_429(entry.provider);
                cancel::finish(&request_id);
                return AssistRunResponse::ok_result(
                    &request_id,
                    SKILL_TASK_ORGANIZE,
                    entry.provider.as_str(),
                    entry.model_id,
                    result,
                    usage,
                    attempts,
                );
            }
            Err(AssistReason::RateLimited) => {
                mark_429(entry.provider);
                last_reason = AssistReason::RateLimited;
                continue;
            }
            Err(r) => {
                last_reason = r;
                if matches!(r, AssistReason::InvalidOutput | AssistReason::BadResponse) {
                    // One invalid output — do not infinite-repair same model; try next candidate once.
                    continue;
                }
                cancel::finish(&request_id);
                return AssistRunResponse::fail(&request_id, r, attempts);
            }
        }
    }

    cancel::finish(&request_id);
    AssistRunResponse::fail(&request_id, last_reason, attempts)
}

fn handle_response(
    _entry: &ModelEntry,
    resp: &ChatResponse,
    source_ids: &[String],
) -> Result<(Value, AssistUsage), AssistReason> {
    let text = classify_http(resp.status, &resp.body)?;
    let result = parse_task_organize_json(&text, source_ids)?;
    // Usage: mark estimated unless provider returned usage (not parsed yet → estimated).
    let usage = AssistUsage {
        input_tokens: None,
        output_tokens: None,
        estimated: true,
    };
    Ok((result, usage))
}

pub async fn run_live(req: AssistRunRequest) -> AssistRunResponse {
    match cancel::register(&req.request_id) {
        Ok(token) => {
            let transport = super::client::ReqwestTransport;
            run_with_transport(&transport, req, token).await
        }
        Err(AssistReason::DuplicateRequest) => {
            AssistRunResponse::fail(&req.request_id, AssistReason::DuplicateRequest, 0)
        }
        Err(r) => AssistRunResponse::fail(&req.request_id, r, 0),
    }
}
