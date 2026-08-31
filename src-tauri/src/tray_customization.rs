//! Tray menu layout persistence — blocks + controls (v2).

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::config;

const FILE: &str = "tray_customization.json";
pub const VERSION_V2: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayBlockItem {
    pub id: String,
    pub visible: bool,
    pub order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayControlItem {
    pub id: String,
    pub visible: bool,
    pub order: u32,
    pub channel: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayCustomization {
    pub version: u32,
    #[serde(default)]
    pub blocks: Vec<TrayBlockItem>,
    #[serde(default)]
    pub controls: Vec<TrayControlItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayCustomizationV1 {
    #[serde(default = "default_version_v1")]
    version: u32,
    #[serde(default = "default_true")]
    show_event: bool,
    #[serde(default = "default_show_in_tray_v1")]
    show_in_tray: TrayShowInTrayV1,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayShowInTrayV1 {
    #[serde(default = "default_true")]
    voice: bool,
    #[serde(default = "default_true")]
    keys: bool,
    #[serde(rename = "softPad", default = "default_true")]
    soft_pad: bool,
    #[serde(default)]
    camera: bool,
}

fn default_version_v1() -> u32 {
    1
}
fn default_true() -> bool {
    true
}
fn default_show_in_tray_v1() -> TrayShowInTrayV1 {
    TrayShowInTrayV1 {
        voice: true,
        keys: true,
        soft_pad: true,
        camera: false,
    }
}

const BLOCK_IDS: &[&str] = &[
    "block:hero",
    "block:event",
    "block:habit",
    "block:quick",
    "block:channel:voice",
    "block:channel:keys",
    "block:channel:softPad",
    "block:channel:camera",
    "block:mic",
    "block:footer",
];

const CONTROL_IDS: &[&str] = &[
    "ctrl:voice:voiceMaster",
    "ctrl:voice:voiceEnd",
    "ctrl:keys:keysEnabled",
    "ctrl:keys:keysCancel",
    "ctrl:keys:keysAutoSend",
    "ctrl:softPad:padEnabled",
    "ctrl:softPad:padOverlay",
    "ctrl:camera:camPresence",
    "ctrl:camera:camAutoMute",
];

impl Default for TrayCustomization {
    fn default() -> Self {
        default_v2()
    }
}

pub fn default_v2() -> TrayCustomization {
    TrayCustomization {
        version: VERSION_V2,
        blocks: default_blocks(),
        controls: default_controls(),
    }
}

pub fn default_blocks() -> Vec<TrayBlockItem> {
    vec![
        block_item("block:hero", true, 0),
        block_item("block:event", true, 1),
        block_item("block:habit", true, 2),
        block_item("block:quick", true, 3),
        block_item("block:channel:voice", true, 4),
        block_item("block:channel:keys", true, 5),
        block_item("block:channel:softPad", true, 6),
        block_item("block:channel:camera", false, 7),
        block_item("block:mic", true, 8),
        block_item("block:footer", true, 9),
    ]
}

pub fn default_controls() -> Vec<TrayControlItem> {
    vec![
        control_item("ctrl:voice:voiceMaster", "voice", true, 0),
        control_item("ctrl:voice:voiceEnd", "voice", true, 1),
        control_item("ctrl:keys:keysEnabled", "keys", true, 0),
        control_item("ctrl:keys:keysCancel", "keys", true, 1),
        control_item("ctrl:keys:keysAutoSend", "keys", false, 2),
        control_item("ctrl:softPad:padEnabled", "softPad", true, 0),
        control_item("ctrl:softPad:padOverlay", "softPad", true, 1),
        control_item("ctrl:camera:camPresence", "camera", true, 0),
        control_item("ctrl:camera:camAutoMute", "camera", false, 1),
    ]
}

fn block_item(id: &str, visible: bool, order: u32) -> TrayBlockItem {
    TrayBlockItem {
        id: id.into(),
        visible,
        order,
    }
}

fn control_item(id: &str, channel: &str, visible: bool, order: u32) -> TrayControlItem {
    TrayControlItem {
        id: id.into(),
        visible,
        order,
        channel: channel.into(),
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
        return default_v2();
    };
    let value: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return default_v2(),
    };
    if value.get("version").and_then(|v| v.as_u64()) == Some(VERSION_V2 as u64) {
        serde_json::from_value(value).unwrap_or_else(|_| default_v2())
    } else {
        migrate_v1_value(value)
    }
}

fn migrate_v1_value(value: serde_json::Value) -> TrayCustomization {
    let v1: TrayCustomizationV1 = serde_json::from_value(value).unwrap_or(TrayCustomizationV1 {
        version: 1,
        show_event: true,
        show_in_tray: TrayShowInTrayV1 {
            voice: true,
            keys: true,
            soft_pad: true,
            camera: false,
        },
    });
    let mut cfg = default_v2();
    for b in &mut cfg.blocks {
        match b.id.as_str() {
            "block:event" => b.visible = v1.show_event,
            "block:channel:voice" => b.visible = v1.show_in_tray.voice,
            "block:channel:keys" => b.visible = v1.show_in_tray.keys,
            "block:channel:softPad" => b.visible = v1.show_in_tray.soft_pad,
            "block:channel:camera" => b.visible = v1.show_in_tray.camera,
            _ => {}
        }
    }
    cfg
}

pub fn validate(cfg: &TrayCustomization) -> Result<(), String> {
    if cfg.version != VERSION_V2 {
        return Err("unsupported tray customization version".into());
    }
    let visible_blocks = cfg.blocks.iter().filter(|b| b.visible).count();
    if visible_blocks == 0 {
        return Err("trayEditorMinBlocks".into());
    }
    let allowed_blocks: HashSet<&str> = BLOCK_IDS.iter().copied().collect();
    let allowed_controls: HashSet<&str> = CONTROL_IDS.iter().copied().collect();
    for b in &cfg.blocks {
        if !allowed_blocks.contains(b.id.as_str()) {
            return Err(format!("invalid block id: {}", b.id));
        }
    }
    for c in &cfg.controls {
        if !allowed_controls.contains(c.id.as_str()) {
            return Err(format!("invalid control id: {}", c.id));
        }
    }
    Ok(())
}

pub fn save(cfg: &TrayCustomization) -> Result<(), String> {
    validate(cfg)?;
    let path = customization_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut out = cfg.clone();
    out.version = VERSION_V2;
    let body = serde_json::to_string_pretty(&out).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, body.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

pub fn block_visible(cfg: &TrayCustomization, id: &str) -> bool {
    cfg.blocks
        .iter()
        .find(|b| b.id == id)
        .map(|b| b.visible)
        .unwrap_or(true)
}

pub fn visible_block_count(cfg: &TrayCustomization) -> usize {
    cfg.blocks.iter().filter(|b| b.visible).count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_v2_has_blocks_and_controls() {
        let d = default_v2();
        assert_eq!(d.version, VERSION_V2);
        assert_eq!(d.blocks.len(), 10);
        assert!(!d.controls.is_empty());
    }

    #[test]
    fn validate_rejects_all_blocks_hidden() {
        let mut cfg = default_v2();
        for b in &mut cfg.blocks {
            b.visible = false;
        }
        assert!(validate(&cfg).is_err());
    }

    #[test]
    fn migrate_v1_show_in_tray() {
        let v1 = serde_json::json!({
            "version": 1,
            "showEvent": false,
            "showInTray": { "voice": true, "keys": false, "softPad": true, "camera": true }
        });
        let cfg = migrate_v1_value(v1);
        assert!(!block_visible(&cfg, "block:event"));
        assert!(!block_visible(&cfg, "block:channel:keys"));
        assert!(block_visible(&cfg, "block:channel:camera"));
    }
}
