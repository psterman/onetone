//! Tray scene preset + custom switch snapshot persistence.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::config;

const FILE: &str = "tray_runtime.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TrayScenePreset {
    Custom,
    #[serde(rename = "allOn")]
    AllOn,
    #[serde(rename = "mute")]
    Mute,
}

impl Default for TrayScenePreset {
    fn default() -> Self {
        Self::AllOn
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayRuntime {
    #[serde(default)]
    pub tray_scene_preset: TrayScenePreset,
    #[serde(default)]
    pub custom_switch_snapshot: HashMap<String, bool>,
    /// Layout persona: beg | vibe | full
    #[serde(default = "default_persona")]
    pub persona_preset: String,
}

fn default_persona() -> String {
    "vibe".into()
}

impl Default for TrayRuntime {
    fn default() -> Self {
        Self {
            tray_scene_preset: TrayScenePreset::AllOn,
            custom_switch_snapshot: HashMap::new(),
            persona_preset: default_persona(),
        }
    }
}

pub fn runtime_path() -> PathBuf {
    let mut p = config::config_path();
    p.set_file_name(FILE);
    p
}

pub fn load() -> TrayRuntime {
    let path = runtime_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return TrayRuntime::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save(rt: &TrayRuntime) -> Result<(), String> {
    let path = runtime_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let body = serde_json::to_string_pretty(rt).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, body.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_all_on() {
        let rt = TrayRuntime::default();
        assert_eq!(rt.tray_scene_preset, TrayScenePreset::AllOn);
        assert_eq!(rt.persona_preset, "vibe");
    }
}
