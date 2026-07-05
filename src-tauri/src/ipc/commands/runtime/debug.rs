use std::sync::Arc;

use crate::scene_config::{voice_runtime_fingerprint, SceneResolveContext};
use crate::AppState;

#[tauri::command]
pub fn cmd_debug_effective_scene(state: tauri::State<Arc<AppState>>) -> serde_json::Value {
    let cfg = state.cfg.lock();
    let ctx = SceneResolveContext {
        active_scene_id: &cfg.active_scene_id,
    };
    let effective = crate::scene_config::resolve_effective_scene(&cfg, &ctx);
    let fingerprint = voice_runtime_fingerprint(&cfg, &ctx);
    let snapshot = state.voice_session_snapshot.lock().clone();
    serde_json::json!({
        "activeSceneId": cfg.active_scene_id,
        "effective": effective,
        "fingerprint": fingerprint,
        "sessionSnapshot": snapshot,
    })
}
