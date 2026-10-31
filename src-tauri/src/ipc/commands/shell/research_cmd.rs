use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSearchArgs {
    pub query: String,
    pub limit: Option<u32>,
    pub provider: Option<String>,
}

#[tauri::command]
pub fn cmd_research_web_search(args: ResearchSearchArgs) -> Value {
    crate::research::web_search(&args.query, args.limit, args.provider.as_deref())
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResearchFetchArgs {
    pub url: String,
    pub provider: Option<String>,
    pub max_chars: Option<u32>,
}

#[tauri::command]
pub fn cmd_research_fetch_url(args: ResearchFetchArgs) -> Value {
    crate::research::fetch_url(&args.url, args.provider.as_deref(), args.max_chars)
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
