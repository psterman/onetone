use serde::Deserialize;
use serde_json::Value;
use std::time::Instant;

fn log_boundary(step: &str, started: Instant, detail: &str) {
    crate::app_log::sync_emergency_line(
        "research",
        &format!("{step} durationMs={} {detail}", started.elapsed().as_millis()),
    );
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSearchArgs {
    pub query: String,
    pub limit: Option<u32>,
    pub provider: Option<String>,
}

#[tauri::command]
pub async fn cmd_research_web_search(args: ResearchSearchArgs) -> Value {
    let started = Instant::now();
    let query = args.query.clone();
    let limit = args.limit;
    let provider = args.provider.clone();
    match tauri::async_runtime::spawn_blocking(move || {
        crate::research::web_search(&query, limit, provider.as_deref())
    }).await {
        Ok(value) => {
            log_boundary("ipc_search_end", started, "ok");
            value
        }
        Err(err) => {
            log_boundary("ipc_search_end", started, "worker_failed");
            serde_json::json!({
            "ok": false,
            "code": "search_worker_failed",
            "message": err.to_string(),
            "results": []
            })
        }
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResearchFetchArgs {
    pub url: String,
    pub provider: Option<String>,
    pub max_chars: Option<u32>,
}

#[tauri::command]
pub async fn cmd_research_fetch_url(args: ResearchFetchArgs) -> Value {
    let started = Instant::now();
    let url = args.url.clone();
    let provider = args.provider.clone();
    let max_chars = args.max_chars;
    match tauri::async_runtime::spawn_blocking(move || {
        crate::research::fetch_url(&url, provider.as_deref(), max_chars)
    }).await {
        Ok(value) => {
            log_boundary("ipc_fetch_end", started, "ok");
            value
        }
        Err(err) => {
            log_boundary("ipc_fetch_end", started, "worker_failed");
            serde_json::json!({
            "ok": false,
            "code": "fetch_worker_failed",
            "message": err.to_string()
            })
        }
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResearchExportArgs {
    pub format: Option<String>,
    pub filename_stem: Option<String>,
    pub markdown: Option<String>,
    pub html: Option<String>,
}

#[tauri::command]
pub fn cmd_research_export(args: ResearchExportArgs) -> Value {
    crate::research::export_report(
        args.format.as_deref().unwrap_or("markdown"),
        args.filename_stem.as_deref().unwrap_or("research-report"),
        args.markdown.as_deref().unwrap_or(""),
        args.html.as_deref().unwrap_or(""),
    )
}
