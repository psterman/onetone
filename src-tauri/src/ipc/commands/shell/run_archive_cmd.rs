use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunArchiveSaveArgs {
    pub run_id: String,
    pub snapshot: Value,
}

#[tauri::command]
pub fn cmd_run_archive_save(args: RunArchiveSaveArgs) -> Result<Value, String> {
    crate::run_archive::save(&args.run_id, args.snapshot)
}

#[tauri::command]
pub fn cmd_run_archive_load(run_id: String) -> Result<Option<Value>, String> {
    crate::run_archive::load(&run_id)
}

#[tauri::command]
pub fn cmd_run_archive_list() -> Result<Vec<Value>, String> {
    crate::run_archive::list()
}

#[tauri::command]
pub fn cmd_run_archive_remove(run_id: String) -> Result<bool, String> {
    crate::run_archive::remove(&run_id)
}
