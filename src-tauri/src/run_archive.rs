use serde_json::{json, Map, Value};
use std::fs;
use std::path::PathBuf;

fn safe_id(id: &str) -> Result<String, String> {
    let value = id.trim();
    if value.is_empty()
        || value.len() > 160
        || value.contains('/')
        || value.contains('\\')
        || value.contains("..")
    {
        return Err("invalid_run_id".into());
    }
    Ok(value.to_string())
}

fn run_dir(id: &str) -> Result<PathBuf, String> {
    Ok(crate::data_root::effective_data_root()
        .join("research")
        .join("runs")
        .join(safe_id(id)?))
}

const SECRET_KEYS: &[&str] = &[
    "apiKey",
    "accessToken",
    "authorization",
    "Authorization",
    "headers",
    "rawRequest",
    "rawResponse",
    "messages",
    "prompt",
    "password",
    "token",
    "secret",
];

fn is_secret_key(k: &str) -> bool {
    SECRET_KEYS.iter().any(|s| *s == k)
}

/// Deep-scrub secrets from snapshot before persist / after load.
pub fn scrub_secrets(value: Value) -> Value {
    scrub_secrets_depth(value, 0)
}

fn scrub_secrets_depth(value: Value, depth: usize) -> Value {
    if depth > 24 {
        return Value::Null;
    }
    match value {
        Value::Object(map) => {
            let mut out = Map::new();
            for (k, v) in map {
                if is_secret_key(&k) {
                    continue;
                }
                out.insert(k, scrub_secrets_depth(v, depth + 1));
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(
            arr.into_iter()
                .map(|v| scrub_secrets_depth(v, depth + 1))
                .collect(),
        ),
        other => other,
    }
}

/// Disk `running` must never hydrate as live running after process restart.
pub fn coerce_interrupted(mut snapshot: Value) -> Value {
    let status = snapshot
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if status != "running" {
        return snapshot;
    }
    if let Some(obj) = snapshot.as_object_mut() {
        obj.insert("status".into(), json!("interrupted"));
        if obj.get("stopReason").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
            obj.insert("stopReason".into(), json!("process_restart"));
        }
        obj.insert("resumeAvailable".into(), json!(true));
        if let Some(actions) = obj.get_mut("actions").and_then(|v| v.as_array_mut()) {
            for action in actions {
                if action.get("status").and_then(|v| v.as_str()) == Some("running") {
                    if let Some(a) = action.as_object_mut() {
                        a.insert("status".into(), json!("failed"));
                        if !a.contains_key("error") || a.get("error").map(|e| e.is_null()).unwrap_or(true)
                        {
                            a.insert(
                                "error".into(),
                                json!({ "code": "interrupted", "message": "process_restart" }),
                            );
                        }
                    }
                }
            }
        }
    }
    snapshot
}

pub fn save(run_id: &str, snapshot: Value) -> Result<Value, String> {
    let dir = run_dir(run_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("run.json");
    let tmp = dir.join("run.json.tmp");
    let cleaned = scrub_secrets(snapshot);
    fs::write(
        &tmp,
        serde_json::to_vec_pretty(&cleaned).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        let _ = fs::remove_file(&path);
    }
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(json!({ "runId": run_id, "path": path.display().to_string() }))
}

pub fn load(run_id: &str) -> Result<Option<Value>, String> {
    let path = run_dir(run_id)?.join("run.json");
    match fs::read_to_string(path) {
        Ok(raw) => {
            let parsed: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
            Ok(Some(coerce_interrupted(scrub_secrets(parsed))))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn list() -> Result<Vec<Value>, String> {
    let root = crate::data_root::effective_data_root()
        .join("research")
        .join("runs");
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path().join("run.json");
        if let Ok(raw) = fs::read_to_string(path) {
            if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                let value = coerce_interrupted(scrub_secrets(value));
                out.push(json!({
                    "runId": value.get("runId").cloned().unwrap_or(Value::Null),
                    "mode": value.get("mode").cloned().unwrap_or(Value::Null),
                    "status": value.get("status").cloned().unwrap_or(Value::Null),
                    "phase": value.get("phase").cloned().unwrap_or(Value::Null),
                    "updatedAt": value.get("updatedAt").cloned().unwrap_or(Value::Null),
                    "stopReason": value.get("stopReason").cloned().unwrap_or(Value::Null),
                    "resumeAvailable": value.get("resumeAvailable").cloned().unwrap_or(Value::Null)
                }));
            }
        }
    }
    Ok(out)
}

pub fn remove(run_id: &str) -> Result<bool, String> {
    let dir = run_dir(run_id)?;
    if !dir.exists() {
        return Ok(false);
    }
    fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrub_strips_secrets_keeps_provider_meta() {
        let raw = json!({
            "runId": "r1",
            "status": "completed",
            "apiKey": "SECRET",
            "providerCalls": [{
                "callId": "c1",
                "providerId": "workbuddy",
                "model": "m",
                "messages": [{"role":"user","content":"hi"}],
                "prompt": "leak",
                "durationMs": 12,
                "ok": true
            }]
        });
        let cleaned = scrub_secrets(raw);
        assert!(cleaned.get("apiKey").is_none());
        let call = &cleaned["providerCalls"][0];
        assert_eq!(call["providerId"], "workbuddy");
        assert_eq!(call["callId"], "c1");
        assert!(call.get("messages").is_none());
        assert!(call.get("prompt").is_none());
        assert_eq!(call["durationMs"], 12);
    }

    #[test]
    fn running_coerces_to_interrupted() {
        let raw = json!({
            "runId": "r1",
            "status": "running",
            "actions": [{ "actionId": "a1", "status": "running", "toolId": "web_search" }]
        });
        let out = coerce_interrupted(raw);
        assert_eq!(out["status"], "interrupted");
        assert_eq!(out["stopReason"], "process_restart");
        assert_eq!(out["resumeAvailable"], true);
        assert_eq!(out["actions"][0]["status"], "failed");
    }

    #[test]
    fn safe_id_rejects_path() {
        assert!(safe_id("../x").is_err());
        assert!(safe_id("ok-run_1").is_ok());
    }
}
