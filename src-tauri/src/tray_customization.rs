//! Tray menu layout persistence — section / channel visibility (no presets).

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::config;

const FILE: &str = "tray_customization.json";
const VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayCustomization {
    pub version: u32,
    pub show_event: bool,
    pub show_in_tray: TrayShowInTray,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayShowInTray {
    pub voice: bool,
    pub keys: bool,
    #[serde(rename = "softPad")]
    pub soft_pad: bool,
    pub camera: bool,
}

impl Default for TrayShowInTray {
    fn default() -> Self {
        Self {
            voice: true,
            keys: true,
            soft_pad: true,
            camera: false,
        }
    }
}

impl Default for TrayCustomization {
    fn default() -> Self {
        Self {
            version: VERSION,
            show_event: true,
            show_in_tray: TrayShowInTray::default(),
        }
    }
}

pub fn customization_path() -> PathBuf {
    let mut p = config::config_path();
    p.set_file_name(FILE);
    p
}

pub fn load() -> TrayCustomization {
    let path = customization_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return TrayCustomization::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save(cfg: &TrayCustomization) -> Result<(), String> {
    let path = customization_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut out = cfg.clone();
    out.version = VERSION;
    let body = serde_json::to_string_pretty(&out).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, body.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_show_in_tray() {
        let d = TrayCustomization::default();
        assert!(d.show_event);
        assert!(d.show_in_tray.voice);
        assert!(d.show_in_tray.soft_pad);
        assert!(!d.show_in_tray.camera);
    }
}
