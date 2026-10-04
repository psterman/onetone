use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{Manager, WebviewWindow};

use crate::app_identity::{self, AppIdentity};
use crate::config::{self, MappingEntry};
use crate::AppState;

#[tauri::command]
pub fn cmd_foreground_app() -> serde_json::Value {
    let Some(identity) = app_identity::foreground_app_identity() else {
        return serde_json::json!({
            "appId": serde_json::Value::Null,
        });
    };
    identity_to_json(&identity)
}

/// App the habit should follow. Live window when it is a real other app;
/// otherwise the last one (Chrome, Cursor, …) so opening OneTone does not
/// drop back to the universal habit.
#[tauri::command]
pub fn cmd_habit_foreground_app() -> serde_json::Value {
    let live = app_identity::foreground_app_identity();
    let self_fg = live
        .as_ref()
        .is_some_and(|id| app_identity::is_self_identity(id));
    let Some(identity) = app_identity::capture_tray_foreground_identity() else {
        return serde_json::json!({
            "appId": serde_json::Value::Null,
            "selfForeground": self_fg,
        });
    };
    let mut value = identity_to_json(&identity);
    if let Some(obj) = value.as_object_mut() {
        obj.insert(
            "selfForeground".to_string(),
            serde_json::json!(self_fg),
        );
    }
    value
}

/// Homepage foreground context — separate from AgentHomeSnapshot.
/// Light read: Win32 FG + config habit match. No Cursor DB scan.
#[tauri::command]
pub fn cmd_foreground_context_snapshot(
    state: tauri::State<'_, Arc<AppState>>,
) -> serde_json::Value {
    let detected_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let live = app_identity::foreground_app_identity();
    let self_fg = live
        .as_ref()
        .is_some_and(|id| app_identity::is_self_identity(id));
    let habit_identity = app_identity::capture_tray_foreground_identity();

    // Display row follows the live window (including OneTone itself).
    let display = live.as_ref();
    let app_id = display
        .and_then(|id| id.matched_preset_app_id.clone())
        .or_else(|| {
            habit_identity
                .as_ref()
                .and_then(|id| id.matched_preset_app_id.clone())
        });
    let app_name = display
        .map(app_identity::identity_display_name)
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            habit_identity
                .as_ref()
                .map(app_identity::identity_display_name)
                .filter(|s| !s.trim().is_empty())
        });
    let process_name = display
        .map(|id| id.exe_name.clone())
        .or_else(|| habit_identity.as_ref().map(|id| id.exe_name.clone()));
    let full_path = display
        .and_then(|id| id.full_path.clone())
        .or_else(|| habit_identity.as_ref().and_then(|id| id.full_path.clone()));
    let window_class = display
        .and_then(|id| id.window_class.clone())
        .or_else(|| habit_identity.as_ref().and_then(|id| id.window_class.clone()));
    let window_title = display
        .map(|id| id.window_title.clone())
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            habit_identity
                .as_ref()
                .map(|id| id.window_title.clone())
                .filter(|s| !s.trim().is_empty())
        });

    let (project_name, project_inferred) =
        project_hint_from_title(process_name.as_deref(), window_title.as_deref());

    let cfg = state.cfg.lock();
    let pack = habit_identity
        .as_ref()
        .and_then(|id| config::live_pack_mapping_for(&cfg, Some(id)));
    let baseline = config::find_global_baseline_mapping(&cfg);

    let (habit, match_kind): (Option<&MappingEntry>, &str) = if let Some(m) = pack {
        (Some(m), "exact")
    } else if let Some(m) = baseline {
        if app_id.is_some() {
            (Some(m), "probable")
        } else {
            (Some(m), "unknown")
        }
    } else {
        (None, "unknown")
    };

    let habit_id = habit.map(|m| m.id.clone());
    let habit_name = habit.map(habit_label);

    serde_json::json!({
        "appId": app_id,
        "appName": app_name,
        "processName": process_name,
        "fullPath": full_path,
        "windowClass": window_class,
        "windowTitle": window_title,
        "projectPath": serde_json::Value::Null,
        "projectName": project_name,
        "projectInferred": project_inferred,
        "habitId": habit_id,
        "habitName": habit_name,
        "match": match_kind,
        "selfForeground": self_fg,
        "detectedAt": detected_at,
    })
}

fn habit_label(m: &MappingEntry) -> String {
    let dn = m.display_name.trim();
    if !dn.is_empty() {
        return dn.to_string();
    }
    let group = m.group.trim();
    if !group.is_empty() {
        return group.to_string();
    }
    let label = m.label.trim();
    if !label.is_empty() {
        return label.to_string();
    }
    m.id.clone()
}

/// ponytail: title-split heuristic only; ceiling = wrong project on odd titles.
/// Upgrade: workspace_evidence / git root when available without DB scan.
fn project_hint_from_title(
    process_name: Option<&str>,
    window_title: Option<&str>,
) -> (Option<String>, bool) {
    let exe = process_name.unwrap_or("").to_ascii_lowercase();
    let editors = [
        "cursor.exe",
        "code.exe",
        "code - insiders.exe",
        "windsurf.exe",
        "trae.exe",
        "zed.exe",
        "webstorm64.exe",
        "idea64.exe",
        "pycharm64.exe",
        "devenv.exe",
    ];
    if !editors.iter().any(|e| exe == *e) {
        return (None, false);
    }
    let title = window_title.unwrap_or("").trim();
    if title.is_empty() {
        return (None, false);
    }
    // Match FE: split on " — " / " - " style separators, not bare hyphens in names.
    let parts: Vec<&str> = {
        let mut out = Vec::new();
        let mut rest = title;
        loop {
            let lower = rest;
            let idx = [" — ", " – ", " - "]
                .iter()
                .filter_map(|sep| lower.find(sep).map(|i| (i, sep.len())))
                .min_by_key(|(i, _)| *i);
            match idx {
                Some((i, sep_len)) => {
                    let (head, tail) = rest.split_at(i);
                    if !head.trim().is_empty() {
                        out.push(head.trim());
                    }
                    rest = tail[sep_len..].trim_start();
                }
                None => {
                    if !rest.trim().is_empty() {
                        out.push(rest.trim());
                    }
                    break;
                }
            }
        }
        out
    };
    let cand = if parts.len() >= 2 {
        parts[parts.len() - 2]
    } else {
        parts.first().copied().unwrap_or("")
    };
    let mut cand = cand
        .split(['·', '|'])
        .next()
        .unwrap_or(cand)
        .trim()
        .to_string();
    for ext in [".tsx", ".ts", ".jsx", ".js", ".rs", ".py", ".md", ".json", ".html", ".htm"] {
        if cand.to_ascii_lowercase().ends_with(ext) {
            cand.truncate(cand.len() - ext.len());
            break;
        }
    }
    cand = cand.trim().to_string();
    if cand.len() < 2 || cand.len() > 48 {
        return (None, false);
    }
    let lower = cand.to_ascii_lowercase();
    if matches!(
        lower.as_str(),
        "untitled" | "无标题" | "new folder" | "desktop"
    ) {
        return (None, false);
    }
    (Some(cand), true)
}

#[tauri::command]
pub fn cmd_app_icon(full_path: String) -> serde_json::Value {
    let path = full_path.trim();
    let icon = if path.is_empty() {
        None
    } else {
        app_identity::icon_data_url_for_path(Some(path))
    };
    serde_json::json!({ "iconDataUrl": icon })
}

#[tauri::command]
pub fn cmd_running_apps() -> serde_json::Value {
    let apps = app_identity::list_running_apps();
    serde_json::json!({ "apps": apps })
}

#[tauri::command]
pub fn cmd_set_setup_interaction_active(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    active: bool,
) {
    let changed = {
        let mut gate = state.setup_interaction_active.lock();
        if *gate == active {
            false
        } else {
            *gate = active;
            true
        }
    };
    if changed {
        crate::app_log::log_line(
            &state,
            "workflow",
            &format!("setup interaction active={active}"),
        );
        crate::codex_micro_overlay::push_state(&window.app_handle(), state.inner());
    }
}

/// Practice stage only: block *external* wake inject (`send_wake_to_target`) while on-stage.
/// Local IME activate still goes through `cmd_voice_practice_activate_ime`.
#[tauri::command]
pub fn cmd_voice_set_practice_hold_fg(
    state: tauri::State<Arc<AppState>>,
    enabled: bool,
) {
    use std::sync::atomic::Ordering;
    let prev = state
        .voice_practice_hold_fg
        .swap(enabled, Ordering::SeqCst);
    if prev != enabled {
        crate::app_log::log_line(
            &state,
            "voice",
            &format!("practice_hold_fg={enabled}"),
        );
    }
}

/// Practice stage: focus stays on OneTone; send configured IME chord into this window.
#[tauri::command]
pub fn cmd_voice_practice_activate_ime(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
) -> serde_json::Value {
    use std::sync::atomic::Ordering;
    if !state.voice_practice_hold_fg.load(Ordering::SeqCst) {
        return serde_json::json!({
            "ok": false,
            "reason": "not_in_practice",
        });
    }
    let (target_key, duration_ms) = {
        let cfg = state.cfg.lock();
        // Prefer the IME / voice-engine shortcut (Win+H, RAlt, …), not app-scenario chords.
        let key = crate::voice_end_runtime::resolve_voice_input_target_key(&cfg)
            .unwrap_or_else(|| crate::voice_end_runtime::resolve_wake_target_key(&cfg, ""));
        (key, cfg.key_press_duration_ms)
    };
    let ok = crate::voice_end_runtime::send_wake_to_practice(
        Some(state.inner()),
        Some(&app),
        &target_key,
        duration_ms,
    );
    serde_json::json!({
        "ok": ok,
        "targetKey": target_key,
    })
}

/// Voice settings: temporarily unpark wake + allow mic while user speaks the wake phrase.
#[tauri::command]
pub fn cmd_voice_wake_phrase_test_begin(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
) -> serde_json::Value {
    use std::sync::atomic::Ordering;
    state.settings_asr_quiet.store(false, Ordering::SeqCst);
    state.voice_practice_hold_fg.store(true, Ordering::SeqCst);
    crate::app_log::log_line(state.as_ref(), "voice", "wake_phrase_test begin");
    crate::voice_bootstrap::activate_desired_engine(
        &app,
        state.inner(),
        "force:wake_phrase_test",
    );
    serde_json::json!({ "ok": true })
}

#[tauri::command]
pub fn cmd_voice_wake_phrase_test_end(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    park_voice: Option<bool>,
    #[allow(non_snake_case)]
    parkVoice: Option<bool>,
) -> serde_json::Value {
    use std::sync::atomic::Ordering;
    state.voice_practice_hold_fg.store(false, Ordering::SeqCst);
    let want_park = park_voice.or(parkVoice).unwrap_or(false);
    crate::app_log::log_line(
        state.as_ref(),
        "voice",
        &format!("wake_phrase_test end park={want_park}"),
    );
    if want_park {
        state.settings_asr_quiet.store(true, Ordering::SeqCst);
        crate::voice_bootstrap::schedule_park_wake_for_settings(state.inner());
    }
    let _ = app;
    serde_json::json!({ "ok": true })
}

#[tauri::command]
pub fn cmd_set_settings_drawer_open(
    state: tauri::State<Arc<AppState>>,
    window: WebviewWindow,
    open: bool,
    park_voice: Option<bool>,
    #[allow(non_snake_case)]
    parkVoice: Option<bool>,
) {
    use std::sync::atomic::Ordering;
    let want_park = open && park_voice.or(parkVoice).unwrap_or(false);
    let open_changed = {
        let mut gate = state.settings_drawer_open.lock();
        if *gate == open {
            false
        } else {
            *gate = open;
            true
        }
    };
    let was_parked = state.settings_asr_quiet.swap(want_park, Ordering::SeqCst);
    let park_changed = was_parked != want_park;
    if open_changed {
        crate::app_log::log_line(
            &state,
            "workflow",
            &format!("settings drawer open={open} park={want_park}"),
        );
        if open {
            let _ = crate::codex_micro_overlay::dismiss_overlay(&window.app_handle(), state.inner());
        } else {
            crate::codex_micro_overlay::clear_overlay_session_dismissed();
            crate::codex_micro_overlay::push_state(&window.app_handle(), state.inner());
        }
        let app2 = window.app_handle().clone();
        let state2 = Arc::clone(state.inner());
        let _ = std::thread::Builder::new()
            .name("settings-acoustic-sync".into())
            .spawn(move || {
                crate::voice_acoustic_runtime::sync_acoustic_match_runtime(Some(&app2), &state2);
            });
    } else if open {
        let _ = crate::codex_micro_overlay::dismiss_overlay(&window.app_handle(), state.inner());
    }
    if park_changed {
        crate::app_log::log_line(
            &state,
            "voice",
            &format!("settings voice park={want_park} open={open}"),
        );
        if want_park {
            crate::voice_bootstrap::schedule_park_wake_for_settings(state.inner());
        } else {
            crate::voice_bootstrap::schedule_unpark_wake_for_settings(
                &window.app_handle(),
                state.inner(),
            );
        }
    }
}

fn identity_to_json(identity: &AppIdentity) -> serde_json::Value {
    let icon_data_url = app_identity::icon_data_url_for_path(identity.full_path.as_deref());
    let display_name = app_identity::identity_display_name(identity);
    serde_json::json!({
        "appId": identity.matched_preset_app_id.clone(),
        "pid": identity.pid,
        "exeName": identity.exe_name,
        "fullPath": identity.full_path,
        "windowTitle": identity.window_title,
        "displayName": display_name,
        "matchedPresetAppId": identity.matched_preset_app_id,
        "iconDataUrl": icon_data_url,
    })
}
