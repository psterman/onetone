//! Codex Micro numpad physical-key layer — scanCode + extended normalization,
//! conservative hook swallow, and runtime dispatch for Codex foreground only.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use crate::app_chat_workflow::CODEX_APP_TARGET_ID;
use crate::config::{agent_key_binding_for_slot, CodexMicroPadConfig, CodexMicroPadKeyRoute, MappingEntry, VoiceConfig};

const EVENT_PREFIX: &str = "codexNumpad:";
const MICRO_EVENT_PREFIX: &str = "codexMicroKey:";

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct NumpadSourceKey {
    pub scan: u16,
    pub extended: bool,
}

impl NumpadSourceKey {
    pub fn id(&self) -> String {
        format!("sc{:02X}:ext{}", self.scan, if self.extended { 1 } else { 0 })
    }

    pub fn from_id(raw: &str) -> Option<Self> {
        let s = raw.trim();
        let (scan_part, ext_part) = s.split_once(":ext")?;
        let scan = u16::from_str_radix(scan_part.strip_prefix("sc")?, 16).ok()?;
        let extended = ext_part == "1";
        Some(Self { scan, extended })
    }
}

#[derive(Debug, Clone)]
pub struct CodexNumpadRouteSnapshot {
    pub mapping_id: String,
    pub slot_id: String,
    pub action_id: String,
    pub provider_id: String,
    pub trigger_binding: String,
    pub micro_key_id: String,
    pub is_hold: bool,
}

#[derive(Debug, Clone, Default)]
struct HookGate {
    require_num_lock_off: bool,
    routes: HashMap<String, CodexNumpadRouteSnapshot>,
    routes_by_micro: HashMap<String, CodexNumpadRouteSnapshot>,
}

static HOOK_GATE: OnceLock<Mutex<HookGate>> = OnceLock::new();

fn hook_gate() -> &'static Mutex<HookGate> {
    HOOK_GATE.get_or_init(|| Mutex::new(HookGate::default()))
}

/// Map LL keyboard hook scan + extended to a numpad physical key, if any.
pub fn normalize_numpad_physical(scan: u16, extended: bool) -> Option<NumpadSourceKey> {
    match scan {
        0x45 => None,
        0x1C if extended => Some(NumpadSourceKey { scan, extended: true }),
        0x1C => None,
        0x35 if extended => Some(NumpadSourceKey { scan, extended: true }),
        0x35 if !extended => None,
        0x47 | 0x48 | 0x49 | 0x4B | 0x4C | 0x4D | 0x4F | 0x50 | 0x51 | 0x52 | 0x53 => {
            Some(NumpadSourceKey {
                scan,
                extended: false,
            })
        }
        0x4A | 0x4E | 0x37 => Some(NumpadSourceKey {
            scan,
            extended: false,
        }),
        _ => None,
    }
}

pub fn format_micro_key_event(micro_key_id: &str, key_down: bool) -> String {
    format!(
        "{}{}:{}",
        MICRO_EVENT_PREFIX,
        micro_key_id.trim(),
        if key_down { "down" } else { "up" }
    )
}

pub fn parse_micro_key_event(raw: &str) -> Option<(String, bool)> {
    let rest = raw.strip_prefix(MICRO_EVENT_PREFIX)?;
    let (micro_key_id, phase) = rest.rsplit_once(':')?;
    let id = micro_key_id.trim();
    if id.is_empty() {
        return None;
    }
    Some((id.to_string(), phase.eq_ignore_ascii_case("down")))
}

pub fn lookup_route_by_micro_key(micro_key_id: &str) -> Option<CodexNumpadRouteSnapshot> {
    let id = micro_key_id.trim();
    if id.is_empty() {
        return None;
    }
    hook_gate()
        .lock()
        .unwrap()
        .routes_by_micro
        .get(id)
        .cloned()
}

/// Vendor HID / fttawa Micro hardware — Codex foreground + pad enabled.
pub fn vendor_micro_should_dispatch(micro_key_id: &str) -> bool {
    if !codex_is_foreground() {
        return false;
    }
    let gate = hook_gate().lock().unwrap();
    if gate.routes_by_micro.is_empty() && gate.routes.is_empty() {
        return false;
    }
    gate.routes_by_micro.contains_key(micro_key_id.trim())
}

pub fn format_event(source: &NumpadSourceKey, key_down: bool) -> String {
    format!(
        "{}{}:{}",
        EVENT_PREFIX,
        source.id(),
        if key_down { "down" } else { "up" }
    )
}

pub fn parse_event(raw: &str) -> Option<(NumpadSourceKey, bool)> {
    let rest = raw.strip_prefix(EVENT_PREFIX)?;
    let (source_id, phase) = rest.rsplit_once(':')?;
    let source = NumpadSourceKey::from_id(source_id)?;
    let key_down = phase.eq_ignore_ascii_case("down");
    Some((source, key_down))
}

#[cfg(windows)]
fn num_lock_is_off() -> bool {
    use winapi::um::winuser::{GetKeyState, VK_NUMLOCK};
    unsafe { GetKeyState(VK_NUMLOCK as i32) & 0x0001 == 0 }
}

#[cfg(not(windows))]
fn num_lock_is_off() -> bool {
    true
}

#[cfg(windows)]
fn codex_is_foreground() -> bool {
    crate::app_identity::foreground_app_target_id()
        .is_some_and(|id| id.trim() == CODEX_APP_TARGET_ID)
}

#[cfg(not(windows))]
fn codex_is_foreground() -> bool {
    false
}

/// Public FG check for screen/overlay Micro fire (M2).
pub fn codex_foreground_for_micro() -> bool {
    codex_is_foreground()
}

/// Five-condition conservative swallow check for the LL keyboard hook.
pub fn hook_should_swallow(source: &NumpadSourceKey) -> bool {
    let gate = hook_gate().lock().unwrap();
    if gate.routes.is_empty() {
        return false;
    }
    if !codex_is_foreground() {
        return false;
    }
    if gate.require_num_lock_off && !num_lock_is_off() {
        return false;
    }
    gate.routes.contains_key(&source.id())
}

pub fn sync_hook_cache(cfg: &VoiceConfig) {
    let mut gate = HookGate::default();
    for m in cfg.active_mappings() {
        let Some(pad) = m.codex_micro_pad.as_ref() else {
            continue;
        };
        if !pad.enabled {
            continue;
        }
        merge_pad_routes(&mut gate, m, pad);
    }
    *hook_gate().lock().unwrap() = gate;
}

fn merge_pad_routes(gate: &mut HookGate, mapping: &MappingEntry, pad: &CodexMicroPadConfig) {
    if pad.require_num_lock_off {
        gate.require_num_lock_off = true;
    }
    for route in &pad.keys {
        if !route.enabled || route.slot_id.trim().is_empty() {
            continue;
        }
        let Some(binding) = agent_key_binding_for_slot(mapping, &route.slot_id) else {
            continue;
        };
        if binding.trigger_binding.trim().is_empty() || !binding.enabled {
            continue;
        }
        let provider = if mapping.agent_provider_id.trim().is_empty() {
            "codex".to_string()
        } else {
            mapping.agent_provider_id.clone()
        };
        let is_hold = binding.action_id == "startDictation"
            || binding.slot_id.eq_ignore_ascii_case("pushToTalk");
        let snapshot = CodexNumpadRouteSnapshot {
            mapping_id: mapping.id.clone(),
            slot_id: binding.slot_id.clone(),
            action_id: binding.action_id.clone(),
            provider_id: provider,
            trigger_binding: binding.trigger_binding.clone(),
            micro_key_id: route.micro_key_id.clone(),
            is_hold,
        };
        // Physical numpad swallow table: never invent sc00:ext0 for unbound scans (e.g. JOY).
        if route.source_scan > 0 {
            let source = NumpadSourceKey {
                scan: route.source_scan,
                extended: route.source_extended,
            };
            gate.routes.insert(source.id(), snapshot.clone());
        }
        if !route.micro_key_id.trim().is_empty() {
            gate.routes_by_micro
                .insert(route.micro_key_id.clone(), snapshot);
        }
    }
}

pub fn lookup_route(source: &NumpadSourceKey) -> Option<CodexNumpadRouteSnapshot> {
    hook_gate().lock().unwrap().routes.get(&source.id()).cloned()
}

pub fn default_codex_micro_pad() -> CodexMicroPadConfig {
    CodexMicroPadConfig {
        enabled: true,
        require_foreground: true,
        require_num_lock_off: false,
        overlay_enabled: false,
        keys: default_codex_micro_pad_routes(),
    }
}

pub fn default_codex_micro_pad_routes() -> Vec<CodexMicroPadKeyRoute> {
    vec![
        route("AG00", 0x47, false, "status"),
        route("AG01", 0x48, false, "plan"),
        route("AG02", 0x49, false, "review"),
        route("AG03", 0x4B, false, "permissions"),
        route("AG04", 0x4C, false, "switchAgent"),
        route("AG05", 0x4D, false, "appsOrPlugins"),
        route("ACT06", 0x37, false, "quickChat"),
        route("ACT07", 0x35, true, "commandPalette"),
        route("ACT08", 0x4A, false, "cancel"),
        route("ACT09", 0x4F, false, "newThread"),
        route("ACT10", 0x50, false, "pushToTalk"),
        route("ACT12", 0x51, false, "stopOrSend"),
        route("ENC", 0x52, false, "summonCodex"),
        // JOY: bindable in UI; no default scan/slot (added by frontend ensurePad).
    ]
}

fn route(micro_key_id: &str, scan: u16, extended: bool, slot_id: &str) -> CodexMicroPadKeyRoute {
    let ui_icon_id = match micro_key_id {
        "ACT06" => "fast",
        "ACT07" => "palette",
        "ACT08" => "reject",
        "ACT09" => "fork",
        "ACT10" => "mic",
        "ACT12" => "send",
        "AG00" => "status",
        "AG01" => "plan",
        "AG02" => "review",
        "AG03" => "folder",
        "AG04" => "agent",
        "AG05" => "cloud",
        "ENC" => "codex",
        "JOY" => "empty",
        _ => "",
    };
    CodexMicroPadKeyRoute {
        micro_key_id: micro_key_id.into(),
        source_scan: scan,
        source_extended: extended,
        slot_id: slot_id.into(),
        ui_icon_id: ui_icon_id.into(),
        enabled: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_numpad_enter_vs_main() {
        assert!(normalize_numpad_physical(0x1C, true).is_some());
        assert!(normalize_numpad_physical(0x1C, false).is_none());
    }

    #[test]
    fn normalize_numpad_divide_vs_main() {
        assert!(normalize_numpad_physical(0x35, true).is_some());
        assert!(normalize_numpad_physical(0x35, false).is_none());
    }

    #[test]
    fn normalize_numlock_never_mapped() {
        assert!(normalize_numpad_physical(0x45, false).is_none());
    }

    #[test]
    fn source_id_roundtrip() {
        let s = NumpadSourceKey {
            scan: 0x50,
            extended: false,
        };
        assert_eq!(NumpadSourceKey::from_id(&s.id()).unwrap(), s);
    }

    #[test]
    fn parse_event_roundtrip() {
        let s = NumpadSourceKey {
            scan: 0x1C,
            extended: true,
        };
        let ev = format_event(&s, true);
        let (parsed, down) = parse_event(&ev).unwrap();
        assert_eq!(parsed, s);
        assert!(down);
    }

    #[test]
    fn parse_micro_key_event_roundtrip() {
        let wire = format_micro_key_event("AG00", true);
        let (id, down) = parse_micro_key_event(&wire).unwrap();
        assert_eq!(id, "AG00");
        assert!(down);
    }

    #[test]
    fn default_routes_use_real_micro_ids() {
        let keys = default_codex_micro_pad_routes();
        assert!(keys.iter().any(|k| k.micro_key_id == "ENC"));
        assert!(keys.iter().any(|k| k.micro_key_id == "ACT07"));
        assert!(!keys.iter().any(|k| k.micro_key_id == "NPAD0"));
        assert!(!keys.iter().any(|k| k.micro_key_id == "NPAD_ENTER"));
        assert!(!keys.iter().any(|k| k.micro_key_id == "DIAL"));
        let enc = keys.iter().find(|k| k.micro_key_id == "ENC").unwrap();
        assert_eq!(enc.slot_id, "summonCodex");
        assert_eq!(enc.source_scan, 0x52);
        let act07 = keys.iter().find(|k| k.micro_key_id == "ACT07").unwrap();
        assert_eq!(act07.slot_id, "commandPalette");
        assert_eq!(act07.source_scan, 0x35);
        assert!(act07.source_extended);
    }
}
