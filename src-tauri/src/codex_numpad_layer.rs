//! Codex Micro numpad physical-key layer — scanCode + extended normalization,
//! conservative hook swallow, and runtime dispatch for Codex foreground only.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;

use crate::agent::bindings_build::build_codex_micro_13_bindings;
use crate::agent::templates::{CODEX_MICRO_13_TEMPLATE_ID, CODEX_PROVIDER_ID};
use crate::app_chat_workflow::CODEX_APP_TARGET_ID;
use crate::config::{
    agent_key_binding_for_slot, CodexMicroPadConfig, CodexMicroPadKeyRoute, MappingEntry, VoiceConfig,
};

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
    pad_active: bool,
    software_enhance_enabled: bool,
    /// Overlay session: JOY NAV rail open — physical arrows only hijacked when true.
    joy_nav_panel_open: bool,
    /// Any Soft Pad mapping opted into Claude CLI key inject.
    claude_cli_inject_pref_enabled: bool,
    routes: HashMap<String, CodexNumpadRouteSnapshot>,
    routes_by_micro: HashMap<String, CodexNumpadRouteSnapshot>,
}

static HOOK_GATE: OnceLock<Mutex<HookGate>> = OnceLock::new();

fn hook_gate() -> &'static Mutex<HookGate> {
    HOOK_GATE.get_or_init(|| Mutex::new(HookGate::default()))
}

/// Map LL keyboard hook scan + extended to a numpad physical key, if any.
///
/// Dedicated cursor keys share scancodes with numpad 8/2/4/6 but set LLKHF_EXTENDED.
/// Those must return `None` here so the arrow → NAV_* path can claim them independently.
pub fn normalize_numpad_physical(scan: u16, extended: bool) -> Option<NumpadSourceKey> {
    match scan {
        0x45 => None,
        0x1C if extended => Some(NumpadSourceKey { scan, extended: true }),
        0x1C => None,
        0x35 if extended => Some(NumpadSourceKey { scan, extended: true }),
        0x35 if !extended => None,
        // Numpad 8/2/4/6 (same scans as ↑↓←→). Extended = dedicated arrows → not Soft Pad.
        0x48 | 0x50 | 0x4B | 0x4D if extended => None,
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

pub fn arrow_nav_micro_key(name: &str) -> Option<&'static str> {
    match name.trim() {
        "Up" => Some("NAV_UP"),
        "Down" => Some("NAV_DOWN"),
        "Left" => Some("NAV_LEFT"),
        "Right" => Some("NAV_RIGHT"),
        _ => None,
    }
}

/// Physical arrows → NAV_* when Soft Pad session is active and pad mapping is on
/// (no longer requires JOY side-rail open — NAV lives on the main pad).
pub fn pad_should_capture_arrows() -> bool {
    if !codex_foreground_for_micro() {
        return false;
    }
    hook_gate().lock().unwrap().pad_active
}

/// Whether Codex Micro pad mapping is currently active (pad.enabled).
pub fn pad_mapping_active() -> bool {
    hook_gate().lock().unwrap().pad_active
}

/// Numpad-mode fire rule: ENC still summons Codex; NP* inject digits; other Micro keys blocked.
pub fn numpad_mode_allows_fire(micro_key_id: &str) -> bool {
    if pad_mapping_active() {
        return true;
    }
    let id = micro_key_id.trim();
    id == "ENC" || is_overlay_numpad_key(id)
}

/// Soft-pad digit keys shown only in 数字键模式 (not Codex AG/ACT routes).
pub fn is_overlay_numpad_key(micro_key_id: &str) -> bool {
    matches!(
        micro_key_id.trim(),
        "NP0" | "NP1" | "NP2" | "NP3" | "NP4" | "NP5" | "NP6" | "NP7" | "NP8" | "NP9"
            | "NP_DOT" | "NP_ENTER" | "NP_DIV" | "NP_MUL" | "NP_SUB" | "NP_ADD"
    )
}

pub fn joy_nav_panel_open() -> bool {
    hook_gate().lock().unwrap().joy_nav_panel_open
}

pub fn set_joy_nav_panel_open(open: bool) {
    hook_gate().lock().unwrap().joy_nav_panel_open = open;
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

/// Resolve ENC → summonCodex from config even when `pad.enabled=false` (numpad-mode exception).
pub fn resolve_enc_summon_route(cfg: &VoiceConfig) -> Option<CodexNumpadRouteSnapshot> {
    for m in cfg.active_mappings() {
        if m.app_target_id.trim() != CODEX_APP_TARGET_ID {
            continue;
        }
        let Some(pad) = m.codex_micro_pad.as_ref() else {
            continue;
        };
        let route = pad
            .keys
            .iter()
            .find(|k| k.micro_key_id == "ENC" && k.enabled)
            .cloned()
            .unwrap_or_else(|| CodexMicroPadKeyRoute {
                micro_key_id: "ENC".into(),
                source_scan: 0,
                source_extended: false,
                slot_id: "summonCodex".into(),
                ui_icon_id: String::new(),
                enabled: true,
                advanced: false,
                agent_light_id: String::new(),
            });
        let slot = if route.slot_id.trim().is_empty() {
            "summonCodex"
        } else {
            route.slot_id.trim()
        };
        let binding = agent_key_binding_for_slot(m, slot);
        let action_id = binding
            .map(|b| b.action_id.clone())
            .unwrap_or_else(|| "openAgent".into());
        let trigger_binding = binding
            .map(|b| b.trigger_binding.clone())
            .unwrap_or_else(|| {
                crate::agent::bindings_build::default_key_for_slot(slot).to_string()
            });
        let provider = if m.agent_provider_id.trim().is_empty() {
            CODEX_PROVIDER_ID.to_string()
        } else {
            m.agent_provider_id.clone()
        };
        return Some(CodexNumpadRouteSnapshot {
            mapping_id: m.id.clone(),
            slot_id: slot.to_string(),
            action_id,
            provider_id: provider,
            trigger_binding,
            micro_key_id: "ENC".into(),
            is_hold: false,
        });
    }
    None
}

/// True when an enabled Codex Micro pad has software enhance on.
pub fn software_enhance_enabled() -> bool {
    let gate = hook_gate().lock().unwrap();
    gate.pad_active && gate.software_enhance_enabled
}

/// Advanced micro keys that may fire without a slot when software enhance is on.
pub fn is_software_enhance_micro_key(micro_key_id: &str) -> bool {
    matches!(
        micro_key_id.trim(),
        "ENC_CW"
            | "ENC_CC"
            | "NAV_UP"
            | "NAV_DOWN"
            | "NAV_LEFT"
            | "NAV_RIGHT"
            | "NAV_PRESS"
    )
}

/// Vendor HID / fttawa Micro hardware — Codex foreground + pad enabled.
pub fn vendor_micro_should_dispatch(micro_key_id: &str) -> bool {
    if !codex_is_foreground() {
        return false;
    }
    let id = micro_key_id.trim();
    if id.is_empty() {
        return false;
    }
    let gate = hook_gate().lock().unwrap();
    if !gate.pad_active {
        return false;
    }
    if gate.routes_by_micro.contains_key(id) {
        return true;
    }
    // M3 protocol NAV / encoder rotate: only when software enhance is on.
    if gate.software_enhance_enabled {
        return matches!(
            id,
            "NAV_UP" | "NAV_DOWN" | "NAV_LEFT" | "NAV_RIGHT" | "ENC_CW" | "ENC_CC" | "NAV_PRESS"
        );
    }
    false
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
/// Uses stable Codex latch + overlay HWND tree so overlay taps don't fail spuriously.
pub fn codex_foreground_for_micro() -> bool {
    crate::codex_micro_overlay::micro_pad_session_active()
}

/// Five-condition conservative swallow check for the LL keyboard hook.
pub fn hook_should_swallow(source: &NumpadSourceKey) -> bool {
    let gate = hook_gate().lock().unwrap();
    if gate.routes.is_empty() {
        return false;
    }
    // Match overlay/screen Micro fire: Codex FG, Soft Pad overlay FG, or recent Codex latch.
    // Strict `codex_is_foreground()` alone meant clicking the Soft Pad stole FG and
    // physical numpad stopped driving the pad (看起来「虚拟键盘没反应」).
    if !codex_foreground_for_micro() {
        return false;
    }
    if gate.require_num_lock_off && !num_lock_is_off() {
        return false;
    }
    gate.routes.contains_key(&source.id())
}

pub fn sync_hook_cache(cfg: &VoiceConfig) {
    // Preserve overlay-session JOY rail state across config-driven cache rebuilds.
    let prev_joy = hook_gate()
        .lock()
        .unwrap()
        .joy_nav_panel_open;
    let mut gate = HookGate::default();
    gate.joy_nav_panel_open = prev_joy;
    for m in cfg.active_mappings() {
        let Some(pad) = m.codex_micro_pad.as_ref() else {
            continue;
        };
        if pad.claude_cli_inject_pref_enabled {
            gate.claude_cli_inject_pref_enabled = true;
        }
        if !pad.enabled {
            continue;
        }
        merge_pad_routes(&mut gate, m, pad);
    }
    // Numpad mode: never leave arrow capture armed.
    if !gate.pad_active {
        gate.joy_nav_panel_open = false;
    }
    *hook_gate().lock().unwrap() = gate;
}

/// Soft Pad user preference: allow Claude CLI key inject when latch is high.
pub fn claude_cli_inject_pref_enabled() -> bool {
    hook_gate().lock().unwrap().claude_cli_inject_pref_enabled
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPadReadiness {
    pub codex_foreground: bool,
    pub mapping_found: bool,
    pub mapping_enabled: bool,
    pub pad_enabled: bool,
    pub overlay_enabled: bool,
    pub num_lock_blocking: bool,
    pub hook_routes: u32,
    pub layout_profile: String,
    pub ready: bool,
    /// User-facing blocker id: none | no_mapping | pad_off | not_foreground | num_lock | no_routes
    pub blocker: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPadEnsureResult {
    pub changed: bool,
    pub readiness: CodexPadReadiness,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mapping_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codex_micro_pad: Option<CodexMicroPadConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_bindings: Option<Vec<crate::config::AgentBinding>>,
}

fn is_codex_scenario(m: &MappingEntry) -> bool {
    m.app_target_id.trim() == CODEX_APP_TARGET_ID
        || m.agent_template_id.trim() == CODEX_MICRO_13_TEMPLATE_ID
}

fn needs_auto_ready(m: &MappingEntry) -> bool {
    if !m.enabled || !is_codex_scenario(m) {
        return false;
    }
    if m.agent_bindings.is_empty() {
        return true;
    }
    match &m.codex_micro_pad {
        None => true,
        Some(pad) => {
            // Dismiss (X) persists overlay_enabled=false; re-open when Codex FG triggers ensure.
            if !pad.overlay_enabled {
                return true;
            }
            // pad.enabled=false is intentional numpad mode — do not auto-re-enable.
            if !pad.enabled {
                return pad.keys.is_empty();
            }
            if pad.keys.is_empty() {
                return true;
            }
            pad_routes_need_heal(m, pad)
        }
    }
}

fn pad_routes_need_heal(m: &MappingEntry, pad: &CodexMicroPadConfig) -> bool {
    pad.keys.iter().any(|route| {
        route.enabled
            && !route.slot_id.trim().is_empty()
            && agent_key_binding_for_slot(m, &route.slot_id).is_none()
    })
}

/// True when pad route + agent key binding exist (same gate as hook merge / fire).
pub fn micro_key_routable(mapping: &MappingEntry, pad: &CodexMicroPadConfig, micro_key_id: &str) -> bool {
    let id = micro_key_id.trim();
    let Some(route) = pad
        .keys
        .iter()
        .find(|k| k.micro_key_id == id && k.enabled)
    else {
        return false;
    };
    if route.slot_id.trim().is_empty() {
        return false;
    }
    agent_key_binding_for_slot(mapping, &route.slot_id).is_some()
}

fn default_route_for_micro_key(micro_key_id: &str) -> Option<CodexMicroPadKeyRoute> {
    default_codex_micro_pad_routes()
        .into_iter()
        .find(|r| r.micro_key_id == micro_key_id)
}

/// Ensure pad route exists and is enabled; returns (slot_id, changed).
fn heal_pad_route_for_micro_key(
    pad: &mut CodexMicroPadConfig,
    micro_key_id: &str,
) -> Option<(String, bool)> {
    let id = micro_key_id.trim();
    let def = default_route_for_micro_key(id);
    let mut changed = false;

    if let Some(idx) = pad.keys.iter().position(|k| k.micro_key_id == id) {
        let route = &mut pad.keys[idx];
        if let Some(ref d) = def {
            if route.slot_id.trim().is_empty() && !d.slot_id.trim().is_empty() {
                route.slot_id = d.slot_id.clone();
                changed = true;
            }
            if !route.enabled && !route.slot_id.trim().is_empty() {
                route.enabled = true;
                changed = true;
            }
            if route.source_scan == 0 && d.source_scan > 0 {
                route.source_scan = d.source_scan;
                route.source_extended = d.source_extended;
                changed = true;
            }
            if route.ui_icon_id.trim().is_empty() && !d.ui_icon_id.is_empty() {
                route.ui_icon_id = d.ui_icon_id.clone();
                changed = true;
            }
        }
        let slot = route.slot_id.trim().to_string();
        if slot.is_empty() {
            return None;
        }
        Some((slot, changed))
    } else if let Some(d) = def {
        let slot = d.slot_id.clone();
        pad.keys.push(d);
        Some((slot, true))
    } else {
        None
    }
}

fn heal_slot_key_bindings(m: &mut MappingEntry, slot_id: &str, locale: &str) -> bool {
    let slot_id = slot_id.trim();
    if slot_id.is_empty() {
        return false;
    }
    let mut changed = false;
    let seed_key = build_codex_micro_13_bindings(locale).into_iter().find(|s| {
        s.slot_id == slot_id && s.trigger_type.eq_ignore_ascii_case("key")
    });
    if let Some(seed) = seed_key {
        match m.agent_bindings.iter_mut().find(|b| {
            b.slot_id == slot_id && b.trigger_type.eq_ignore_ascii_case("key")
        }) {
            Some(existing) => {
                if !existing.enabled {
                    existing.enabled = true;
                    changed = true;
                }
                if existing.trigger_binding.trim().is_empty() {
                    existing.trigger_binding = seed.trigger_binding;
                    changed = true;
                }
            }
            None => {
                m.agent_bindings.push(seed);
                changed = true;
            }
        }
    }
    if agent_key_binding_for_slot(m, slot_id).is_none() {
        for seed in build_codex_micro_13_bindings(locale) {
            if agent_key_binding_for_slot(m, &seed.slot_id).is_none() {
                m.agent_bindings.push(seed);
                changed = true;
            }
        }
    }
    changed
}

/// Patch missing/disabled pad route + agent key binding (in-memory + hook cache).
pub fn try_heal_micro_route(state: &crate::AppState, micro_key_id: &str, locale: &str) -> bool {
    let id = micro_key_id.trim();
    if id.is_empty() {
        return false;
    }
    let mut changed = false;
    {
        let mut cfg = state.cfg.lock();
        for m in cfg.mappings.iter_mut() {
            if !m.enabled || !is_codex_scenario(m) {
                continue;
            }
            if seed_codex_scenario_meta(m) {
                changed = true;
            }
            let slot_id = {
                let pad = m.codex_micro_pad.get_or_insert_with(default_codex_micro_pad);
                // Heal routes without forcing Codex mode back on.
                let Some((slot_id, route_changed)) = heal_pad_route_for_micro_key(pad, id) else {
                    continue;
                };
                if route_changed {
                    changed = true;
                }
                slot_id
            };
            if heal_slot_key_bindings(m, &slot_id, locale) {
                changed = true;
            }
            if let Some(pad) = m.codex_micro_pad.as_mut() {
                if heal_stock_mic_on_numpad0(pad) {
                    changed = true;
                }
            }
            break;
        }
        if changed {
            sync_hook_cache(&cfg);
        }
    }
    changed
}

/// One-click heal for binding diagnose: restore missing routes/slots/chords, ENC screen-only,
/// and reset scan conflicts to stock defaults. Does not rewrite intentional non-empty chords.
pub fn heal_codex_pad_bindings(
    cfg: &mut VoiceConfig,
    mapping_id: Option<&str>,
    locale: &str,
) -> CodexPadEnsureResult {
    let id = mapping_id.map(|s| s.trim()).filter(|s| !s.is_empty());
    let mapping_idx = if let Some(want) = id {
        cfg.mappings.iter().position(|m| m.id == want)
    } else {
        cfg.mappings
            .iter()
            .position(|m| m.enabled && is_codex_scenario(m))
            .or_else(|| cfg.mappings.iter().position(is_codex_scenario))
    };

    let Some(idx) = mapping_idx else {
        return CodexPadEnsureResult {
            changed: false,
            readiness: readiness_snapshot(cfg),
            mapping_id: id.map(|s| s.to_string()),
            codex_micro_pad: None,
            agent_bindings: None,
        };
    };

    let mut changed = false;
    {
        let m = &mut cfg.mappings[idx];
        if seed_codex_scenario_meta(m) {
            changed = true;
        }
        if m.agent_bindings.is_empty() {
            m.agent_bindings = build_codex_micro_13_bindings(locale);
            changed = true;
        }
        {
            let pad = m.codex_micro_pad.get_or_insert_with(default_codex_micro_pad);
            if pad.layout_profile.trim().is_empty() {
                pad.layout_profile = "standard".into();
                changed = true;
            }
            if heal_stock_mic_on_numpad0(pad) {
                changed = true;
            }
            // Heal every stock primary route (AG/ACT/ENC).
            let primary_ids: Vec<String> = default_codex_micro_pad_routes()
                .into_iter()
                .map(|r| r.micro_key_id)
                .collect();
            for mid in &primary_ids {
                if let Some((slot, route_changed)) = heal_pad_route_for_micro_key(pad, mid) {
                    if route_changed {
                        changed = true;
                    }
                    // Slot heal needs &mut mapping; collect and apply below.
                    let _ = slot;
                }
            }
            // ENC must stay screen-only.
            if let Some(enc) = pad.keys.iter_mut().find(|k| k.micro_key_id == "ENC") {
                if enc.source_scan != 0 || enc.source_extended {
                    enc.source_scan = 0;
                    enc.source_extended = false;
                    changed = true;
                }
                if enc.slot_id.trim().is_empty() {
                    enc.slot_id = "summonCodex".into();
                    changed = true;
                }
                if !enc.enabled {
                    enc.enabled = true;
                    changed = true;
                }
            }
            // Reset scan conflicts to stock defaults.
            if heal_scan_conflicts_to_defaults(pad) {
                changed = true;
            }
        }
        // Heal key bindings for all routed slots.
        let slots: Vec<String> = m
            .codex_micro_pad
            .as_ref()
            .map(|p| {
                p.keys
                    .iter()
                    .filter(|k| k.enabled && !k.slot_id.trim().is_empty())
                    .map(|k| k.slot_id.trim().to_string())
                    .collect()
            })
            .unwrap_or_default();
        for slot in slots {
            if heal_slot_key_bindings(m, &slot, locale) {
                changed = true;
            }
        }
    }

    if changed {
        sync_hook_cache(cfg);
    }
    let m = &cfg.mappings[idx];
    CodexPadEnsureResult {
        changed,
        readiness: readiness_snapshot(cfg),
        mapping_id: Some(m.id.clone()),
        codex_micro_pad: m.codex_micro_pad.clone(),
        agent_bindings: Some(m.agent_bindings.clone()),
    }
}

/// When two enabled routes share the same physical scan, reset both to stock defaults.
fn heal_scan_conflicts_to_defaults(pad: &mut CodexMicroPadConfig) -> bool {
    let defaults = default_codex_micro_pad_routes();
    let mut changed = false;
    // Collect conflicted micro ids.
    let mut seen: Vec<(u16, bool, String)> = Vec::new();
    let mut conflicted: Vec<String> = Vec::new();
    for r in &pad.keys {
        if !r.enabled || r.source_scan == 0 {
            continue;
        }
        if let Some((_, _, other)) = seen
            .iter()
            .find(|(s, e, _)| *s == r.source_scan && *e == r.source_extended)
        {
            conflicted.push(other.clone());
            conflicted.push(r.micro_key_id.clone());
        } else {
            seen.push((r.source_scan, r.source_extended, r.micro_key_id.clone()));
        }
    }
    conflicted.sort();
    conflicted.dedup();
    for id in conflicted {
        let Some(def) = defaults.iter().find(|d| d.micro_key_id == id) else {
            continue;
        };
        if let Some(route) = pad.keys.iter_mut().find(|k| k.micro_key_id == id) {
            if route.source_scan != def.source_scan || route.source_extended != def.source_extended {
                route.source_scan = def.source_scan;
                route.source_extended = def.source_extended;
                changed = true;
            }
        }
    }
    changed
}

fn seed_codex_scenario_meta(m: &mut MappingEntry) -> bool {
    let mut changed = false;
    if m.app_target_id.trim().is_empty() {
        m.app_target_id = CODEX_APP_TARGET_ID.into();
        changed = true;
    }
    if m.agent_template_id.trim().is_empty() {
        m.agent_template_id = CODEX_MICRO_13_TEMPLATE_ID.into();
        changed = true;
    }
    if m.agent_provider_id.trim().is_empty() {
        m.agent_provider_id = CODEX_PROVIDER_ID.into();
        changed = true;
    }
    changed
}

/// Out-of-box: seed Codex Micro pad + bindings when a Codex scenario exists but was never wired.
pub fn ensure_codex_pad_ready(cfg: &mut VoiceConfig, locale: &str) -> CodexPadEnsureResult {
    let mut changed = false;
    let mut touched_mapping_id: Option<String> = None;
    let mut touched_pad: Option<CodexMicroPadConfig> = None;
    let mut touched_bindings: Option<Vec<crate::config::AgentBinding>> = None;

    for m in cfg.mappings.iter_mut() {
        if !needs_auto_ready(m) {
            continue;
        }
        if seed_codex_scenario_meta(m) {
            changed = true;
        }
        if m.agent_bindings.is_empty() {
            m.agent_bindings = build_codex_micro_13_bindings(locale);
            touched_bindings = Some(m.agent_bindings.clone());
            changed = true;
        } else if m
            .codex_micro_pad
            .as_ref()
            .is_some_and(|pad| pad_routes_need_heal(m, pad))
        {
            let seeds = build_codex_micro_13_bindings(locale);
            for seed in seeds {
                if agent_key_binding_for_slot(m, &seed.slot_id).is_none() {
                    m.agent_bindings.push(seed);
                    changed = true;
                }
            }
            if changed {
                touched_bindings = Some(m.agent_bindings.clone());
            }
        }
        let pad = m
            .codex_micro_pad
            .get_or_insert_with(default_codex_micro_pad);
        // Do not force pad.enabled=true — numpad mode is a user choice.
        if !pad.overlay_enabled {
            pad.overlay_enabled = true;
            changed = true;
        }
        if pad.layout_profile.trim().is_empty() {
            pad.layout_profile = "standard".into();
            changed = true;
        }
        pad.software_enhance_enabled = false;
        if pad.keys.is_empty() {
            pad.keys = default_codex_micro_pad_routes();
            changed = true;
        }
        if heal_stock_mic_on_numpad0(pad) {
            changed = true;
        }
        touched_mapping_id = Some(m.id.clone());
        touched_pad = Some(pad.clone());
        // First matching Codex scenario only — same as overlay / hook merge priority.
        break;
    }

    let readiness = readiness_snapshot(cfg);
    CodexPadEnsureResult {
        changed,
        readiness,
        mapping_id: touched_mapping_id,
        codex_micro_pad: touched_pad,
        agent_bindings: touched_bindings,
    }
}

pub fn readiness_snapshot(cfg: &VoiceConfig) -> CodexPadReadiness {
    let codex_fg = codex_is_foreground();
    let (num_lock_blocking, hook_routes) = {
        let gate = hook_gate().lock().unwrap();
        (
            gate.require_num_lock_off && !num_lock_is_off(),
            gate.routes.len() as u32,
        )
    };

    let mapping = cfg
        .active_mappings()
        .into_iter()
        .find(|m| is_codex_scenario(m));

    let (mapping_found, mapping_enabled, pad_enabled, overlay_enabled, layout_profile) =
        if let Some(m) = mapping {
            let pad = m.codex_micro_pad.as_ref();
            (
                true,
                true,
                pad.is_some_and(|p| p.enabled),
                pad.is_some_and(|p| p.overlay_enabled),
                pad.map(|p| p.layout_profile.clone())
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| "standard".into()),
            )
        } else {
            // Still report disabled pad state when scenario exists but mapping is off.
            let dormant = cfg.mappings.iter().find(|m| is_codex_scenario(m));
            let pad = dormant.and_then(|m| m.codex_micro_pad.as_ref());
            (
                dormant.is_some(),
                dormant.is_some_and(|m| m.enabled),
                pad.is_some_and(|p| p.enabled),
                pad.is_some_and(|p| p.overlay_enabled),
                pad.map(|p| p.layout_profile.clone())
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| "standard".into()),
            )
        };

    let blocker = if !mapping_found {
        "no_mapping".into()
    } else if !mapping_enabled {
        "mapping_off".into()
    } else if !pad_enabled {
        "pad_off".into()
    } else if !codex_fg {
        "not_foreground".into()
    } else if num_lock_blocking {
        "num_lock".into()
    } else if hook_routes == 0 {
        "no_routes".into()
    } else {
        "none".into()
    };

    let ready = blocker == "none";

    CodexPadReadiness {
        codex_foreground: codex_fg,
        mapping_found,
        mapping_enabled,
        pad_enabled,
        overlay_enabled,
        num_lock_blocking,
        hook_routes,
        layout_profile,
        ready,
        blocker,
    }
}

fn merge_pad_routes(gate: &mut HookGate, mapping: &MappingEntry, pad: &CodexMicroPadConfig) {
    gate.pad_active = true;
    if pad.software_enhance_enabled {
        gate.software_enhance_enabled = true;
    }
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
        // Soft Pad / Numpad0 mic: hold Ctrl+Shift+D down until release (historical path).
        // Tap + focus_then_hotkey pulse re-entered dispatch/FG and caused 循环假死风暴.
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
        overlay_enabled: true,
        layout_profile: "custom".into(),
        software_enhance_enabled: true,
        codex_status_lights_enabled: false,
        claude_cli_inject_pref_enabled: false,
        presentation: "full".into(),
        skin: "default".into(),
        keys: default_codex_micro_pad_routes(),
    }
}

pub fn default_codex_micro_pad_routes() -> Vec<CodexMicroPadKeyRoute> {
    vec![
        // AG zone: one-press Codex App shortcuts (Soft Pad beginner defaults).
        route("AG00", 0x47, false, "commandPalette"),
        route("AG01", 0x48, false, "newThread"),
        route("AG02", 0x49, false, "quickChat"),
        route("AG03", 0x4B, false, "quickSearch"),
        route("AG04", 0x4C, false, "stopOrSend"),
        route("AG05", 0x4D, false, "cancel"),
        route("ACT06", 0x37, false, "quickChat"),
        route("ACT07", 0x35, true, "commandPalette"),
        route("ACT08", 0x4A, false, "cancel"),
        route("ACT09", 0x4F, false, "newThread"),
        // Soft physical: Numpad 2 / 3 (not on Micro 13 face; fire via scan).
        // UNDO unbound — not in Codex Soft Pad one-press picker; heal must not restore undo.
        route("UNDO", 0x50, false, ""),
        route("SEARCH", 0x51, false, "quickSearch"),
        route("ACT10", 0x52, false, "pushToTalk"),
        // Send / confirm → Numpad Enter (region 4 preview; frees 3 for search).
        route("ACT12", 0x1C, true, "stopOrSend"),
        // ENC: vendor HID / overlay only — do not steal physical Numpad 0 (mic).
        route("ENC", 0, false, "summonCodex"),
        // Right numpad column + decimal (face keys; bindable, no default slot).
        route("PLUS", 0x4E, false, ""),
        route("DOT", 0x53, false, ""),
        // JOY: bindable in UI; no default scan/slot (added by frontend ensurePad).
    ]
}

/// Stock layout used to put mic on Numpad 2 and ENC on Numpad 0.
/// Heal so physical Numpad 0 holds push-to-talk (matches wide mic keycap).
pub fn heal_stock_mic_on_numpad0(pad: &mut CodexMicroPadConfig) -> bool {
    let mut act10_i = None;
    let mut enc_i = None;
    for (i, k) in pad.keys.iter().enumerate() {
        match k.micro_key_id.as_str() {
            "ACT10" => act10_i = Some(i),
            "ENC" => enc_i = Some(i),
            _ => {}
        }
    }
    let (Some(ai), Some(ei)) = (act10_i, enc_i) else {
        return false;
    };
    let act10 = &pad.keys[ai];
    let enc = &pad.keys[ei];
    if act10.source_scan == 0x50
        && !act10.source_extended
        && enc.source_scan == 0x52
        && !enc.source_extended
    {
        pad.keys[ai].source_scan = 0x52;
        pad.keys[ei].source_scan = 0;
        pad.keys[ei].source_extended = false;
        return true;
    }
    false
}

fn route(micro_key_id: &str, scan: u16, extended: bool, slot_id: &str) -> CodexMicroPadKeyRoute {
    let ui_icon_id = match micro_key_id {
        "ACT06" => "fast",
        "ACT07" => "palette",
        "ACT08" => "reject",
        "ACT09" => "fork",
        "UNDO" => "undo",
        "SEARCH" => "search",
        "ACT10" => "mic",
        "ACT12" => "send",
        "PLUS" => "plus",
        "DOT" => "dot",
        "AG00" => "palette",
        "AG01" => "fork",
        "AG02" => "fast",
        "AG03" => "search",
        "AG04" => "send",
        "AG05" => "reject",
        "ENC" => "power",
        "JOY" => "empty",
        "NAV_UP" => "navUp",
        "NAV_DOWN" => "navDown",
        "NAV_LEFT" => "navLeft",
        "NAV_RIGHT" => "navRight",
        _ => "",
    };
    CodexMicroPadKeyRoute {
        micro_key_id: micro_key_id.into(),
        source_scan: scan,
        source_extended: extended,
        slot_id: slot_id.into(),
        ui_icon_id: ui_icon_id.into(),
        enabled: true,
        advanced: false,
        agent_light_id: String::new(),
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
    fn dedicated_arrows_not_mapped_as_numpad_digits() {
        // Main-keyboard ↑↓←→ share scans with numpad 8/2/4/6 but set extended.
        for scan in [0x48u16, 0x50, 0x4B, 0x4D] {
            assert!(
                normalize_numpad_physical(scan, true).is_none(),
                "extended scan {scan:#x} must be NAV, not Soft Pad digit"
            );
            let key = normalize_numpad_physical(scan, false).expect("non-ext numpad digit");
            assert_eq!(key.scan, scan);
            assert!(!key.extended);
        }
        // Neighbor numpad keys (7/9/5/1/3/0) stay Soft Pad regardless of extended flag
        // (dedicated Home/PageUp etc. are not Soft Pad NAV targets here).
        assert_eq!(
            normalize_numpad_physical(0x47, false).unwrap().id(),
            "sc47:ext0"
        );
        assert_eq!(
            normalize_numpad_physical(0x52, false).unwrap().id(),
            "sc52:ext0"
        );
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
        assert_eq!(enc.source_scan, 0);
        let act10 = keys.iter().find(|k| k.micro_key_id == "ACT10").unwrap();
        assert_eq!(act10.slot_id, "pushToTalk");
        assert_eq!(act10.source_scan, 0x52);
        assert!(!act10.source_extended);
        let act07 = keys.iter().find(|k| k.micro_key_id == "ACT07").unwrap();
        assert_eq!(act07.slot_id, "commandPalette");
        assert_eq!(act07.source_scan, 0x35);
        assert!(act07.source_extended);
        let ag00 = keys.iter().find(|k| k.micro_key_id == "AG00").unwrap();
        assert_eq!(ag00.slot_id, "commandPalette");
        let ag01 = keys.iter().find(|k| k.micro_key_id == "AG01").unwrap();
        assert_eq!(ag01.slot_id, "newThread");
        let ag02 = keys.iter().find(|k| k.micro_key_id == "AG02").unwrap();
        assert_eq!(ag02.slot_id, "quickChat");
        let ag04 = keys.iter().find(|k| k.micro_key_id == "AG04").unwrap();
        assert_eq!(ag04.slot_id, "stopOrSend");
        let ag03 = keys.iter().find(|k| k.micro_key_id == "AG03").unwrap();
        assert_eq!(ag03.slot_id, "quickSearch");
        let ag05 = keys.iter().find(|k| k.micro_key_id == "AG05").unwrap();
        assert_eq!(ag05.slot_id, "cancel");
        let act09 = keys.iter().find(|k| k.micro_key_id == "ACT09").unwrap();
        assert_eq!(act09.slot_id, "newThread");
        assert_eq!(act09.source_scan, 0x4F);
        let undo = keys.iter().find(|k| k.micro_key_id == "UNDO").unwrap();
        assert_eq!(undo.slot_id, "");
        assert_eq!(undo.source_scan, 0x50);
        assert!(keys.iter().all(|k| k.slot_id != "status"));
        assert!(keys.iter().all(|k| k.slot_id != "undo"));
        assert!(keys.iter().all(|k| k.slot_id != "claudeModel"));
        let search = keys.iter().find(|k| k.micro_key_id == "SEARCH").unwrap();
        assert_eq!(search.slot_id, "quickSearch");
        assert_eq!(search.source_scan, 0x51);
        let act12 = keys.iter().find(|k| k.micro_key_id == "ACT12").unwrap();
        assert_eq!(act12.slot_id, "stopOrSend");
        assert_eq!(act12.source_scan, 0x1C);
        assert!(act12.source_extended);
    }

    #[test]
    fn heal_moves_mic_from_numpad2_to_numpad0() {
        let mut pad = default_codex_micro_pad();
        // Simulate legacy stock layout.
        for k in &mut pad.keys {
            if k.micro_key_id == "ACT10" {
                k.source_scan = 0x50;
            }
            if k.micro_key_id == "ENC" {
                k.source_scan = 0x52;
            }
        }
        assert!(heal_stock_mic_on_numpad0(&mut pad));
        let act10 = pad.keys.iter().find(|k| k.micro_key_id == "ACT10").unwrap();
        let enc = pad.keys.iter().find(|k| k.micro_key_id == "ENC").unwrap();
        assert_eq!(act10.source_scan, 0x52);
        assert_eq!(enc.source_scan, 0);
        assert!(!heal_stock_mic_on_numpad0(&mut pad));
    }

    #[test]
    fn ensure_ready_seeds_pad_and_bindings() {
        use crate::config::{MappingEntry, TriggerMode};

        let mut cfg = VoiceConfig::default();
        cfg.mappings.push(MappingEntry {
            id: "codex-1".into(),
            label: String::new(),
            group: "默认".into(),
            app_target_id: CODEX_APP_TARGET_ID.into(),
            trigger_key: "F1".into(),
            target_key: "RAlt".into(),
            enabled: true,
            order: 0,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: 500,
            double_click_ms: 400,
            ime_preset_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
            codex_micro_pad: None,
        });
        let result = ensure_codex_pad_ready(&mut cfg, "zh-CN");
        assert!(result.changed);
        assert!(result.readiness.mapping_found);
        let m = cfg.mappings.iter().find(|m| m.id == "codex-1").unwrap();
        assert!(!m.agent_bindings.is_empty());
        let pad = m.codex_micro_pad.as_ref().unwrap();
        assert!(pad.enabled);
        assert_eq!(pad.layout_profile, "standard");
        assert!(pad.keys.iter().any(|k| k.micro_key_id == "ACT10"));
        sync_hook_cache(&cfg);
        let snap = readiness_snapshot(&cfg);
        assert!(snap.hook_routes > 0);
    }

    #[test]
    fn heal_disabled_act10_route_and_missing_binding() {
        use crate::config::{AgentBinding, MappingEntry, TriggerMode};

        let mut pad = default_codex_micro_pad();
        for k in pad.keys.iter_mut() {
            if k.micro_key_id == "ACT10" {
                k.enabled = false;
            }
        }
        let mut m = MappingEntry {
            id: "codex-heal".into(),
            label: String::new(),
            group: "默认".into(),
            app_target_id: CODEX_APP_TARGET_ID.into(),
            trigger_key: "F1".into(),
            target_key: "RAlt".into(),
            enabled: true,
            order: 0,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: 500,
            double_click_ms: 400,
            ime_preset_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![AgentBinding {
                slot_id: "pushToTalk".into(),
                action_id: "startDictation".into(),
                trigger_type: "key".into(),
                trigger_binding: String::new(),
                enabled: false,
                execution_mode: None,
                activation_scope: "global".into(),
            }],
            codex_micro_pad: Some(pad),
        };
        let (slot, route_changed) = {
            let pad = m.codex_micro_pad.as_mut().unwrap();
            heal_pad_route_for_micro_key(pad, "ACT10").unwrap()
        };
        assert_eq!(slot, "pushToTalk");
        assert!(route_changed);
        assert!(heal_slot_key_bindings(&mut m, &slot, "zh-CN"));
        let pad = m.codex_micro_pad.as_ref().unwrap();
        let act10 = pad.keys.iter().find(|k| k.micro_key_id == "ACT10").unwrap();
        assert!(act10.enabled);
        assert!(agent_key_binding_for_slot(&m, "pushToTalk").is_some());
        let cfg = VoiceConfig {
            mappings: vec![m],
            ..VoiceConfig::default()
        };
        sync_hook_cache(&cfg);
        assert!(lookup_route_by_micro_key("ACT10").is_some());
    }

    #[test]
    fn heal_codex_pad_bindings_fixes_empty_chord_and_enc_scan() {
        use crate::config::{MappingEntry, TriggerMode};

        let mut pad = default_codex_micro_pad();
        for k in &mut pad.keys {
            if k.micro_key_id == "ENC" {
                k.source_scan = 0x10;
            }
        }
        let mut bindings = build_codex_micro_13_bindings("zh-CN");
        for b in &mut bindings {
            if b.slot_id == "pushToTalk" && b.trigger_type == "key" {
                b.trigger_binding.clear();
            }
        }
        let m = MappingEntry {
            id: "codex-heal-all".into(),
            label: String::new(),
            group: "默认".into(),
            app_target_id: CODEX_APP_TARGET_ID.into(),
            trigger_key: "F1".into(),
            target_key: "RAlt".into(),
            enabled: true,
            order: 0,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: 500,
            double_click_ms: 400,
            ime_preset_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: bindings,
            codex_micro_pad: Some(pad),
        };
        let mut cfg = VoiceConfig {
            mappings: vec![m],
            ..VoiceConfig::default()
        };
        let before = crate::codex_pad_binding_diagnose::diagnose_codex_pad_bindings_for_cfg(
            &cfg,
            Some("codex-heal-all"),
        );
        assert!(!before.ok);
        let result = heal_codex_pad_bindings(&mut cfg, Some("codex-heal-all"), "zh-CN");
        assert!(result.changed);
        let after = crate::codex_pad_binding_diagnose::diagnose_codex_pad_bindings_for_cfg(
            &cfg,
            Some("codex-heal-all"),
        );
        assert!(after.ok, "issues={:?}", after.issues);
        let enc = cfg.mappings[0]
            .codex_micro_pad
            .as_ref()
            .unwrap()
            .keys
            .iter()
            .find(|k| k.micro_key_id == "ENC")
            .unwrap();
        assert_eq!(enc.source_scan, 0);
        assert!(agent_key_binding_for_slot(&cfg.mappings[0], "pushToTalk").is_some());
    }

    #[test]
    fn push_to_talk_ctrl_shift_d_is_hold() {
        use crate::config::{MappingEntry, TriggerMode};

        let mut pad = default_codex_micro_pad();
        pad.enabled = true;
        let cfg = VoiceConfig {
            mappings: vec![MappingEntry {
                id: "codex-ptt-hold".into(),
                label: String::new(),
                group: "默认".into(),
                app_target_id: CODEX_APP_TARGET_ID.into(),
                trigger_key: "F1".into(),
                target_key: "RAlt".into(),
                enabled: true,
                order: 0,
                trigger_mode: TriggerMode::Tap,
                trigger_source: None,
                source_key: String::new(),
                source_time: String::new(),
                interval_ms: 1200,
                enter_delay_ms: 5000,
                cancel_enabled: true,
                auto_enter_enabled: true,
                switch_keys: vec![],
                native_key_restore: false,
                trigger_device: String::new(),
                long_press_ms: 500,
                double_click_ms: 400,
                ime_preset_id: String::new(),
                app_behavior_rules: vec![],
                voice_override: None,
                camera_override: None,
                voice_commands: vec![],
                acoustic_voice_commands: vec![],
                agent_template_id: String::new(),
                agent_provider_id: CODEX_PROVIDER_ID.into(),
                agent_bindings: build_codex_micro_13_bindings("zh-CN"),
                codex_micro_pad: Some(pad),
            }],
            ..VoiceConfig::default()
        };
        sync_hook_cache(&cfg);
        let route = lookup_route_by_micro_key("ACT10").expect("ACT10 route");
        assert_eq!(route.slot_id, "pushToTalk");
        assert_eq!(route.action_id, "startDictation");
        assert!(
            crate::key_chord::is_hold_to_talk_chord(&route.trigger_binding),
            "default pushToTalk uses Ctrl+Shift+D"
        );
        assert!(
            route.is_hold,
            "Soft Pad ACT10 must hold Ctrl+Shift+D until release (tap pulse caused 循环假死)"
        );
    }

    #[test]
    fn numpad_mode_blocks_all_keys_except_enc() {
        set_joy_nav_panel_open(true);
        // Empty cache → pad inactive (numpad mode).
        *hook_gate().lock().unwrap() = HookGate {
            joy_nav_panel_open: true,
            ..HookGate::default()
        };
        assert!(!pad_mapping_active());
        assert!(numpad_mode_allows_fire("ENC"));
        assert!(numpad_mode_allows_fire("NP7"));
        assert!(numpad_mode_allows_fire("NP_ENTER"));
        assert!(numpad_mode_allows_fire("NP_ADD"));
        assert!(numpad_mode_allows_fire("NP_DIV"));
        assert!(numpad_mode_allows_fire("NP_DOT"));
        assert!(!numpad_mode_allows_fire("ACT10"));
        assert!(!numpad_mode_allows_fire("AG00"));
        assert!(!numpad_mode_allows_fire("NAV_UP"));
        assert!(!numpad_mode_allows_fire("JOY"));
        // Arrows never captured when pad inactive, even if joy flag stale.
        assert!(!pad_should_capture_arrows());
    }

    #[test]
    fn arrow_capture_requires_pad_active_not_rail() {
        use crate::config::{MappingEntry, TriggerMode};

        let mut cfg = VoiceConfig::default();
        let mut pad = default_codex_micro_pad();
        pad.enabled = true;
        cfg.mappings = vec![MappingEntry {
            id: "codex-arrows".into(),
            label: String::new(),
            group: "默认".into(),
            app_target_id: CODEX_APP_TARGET_ID.into(),
            trigger_key: "F1".into(),
            target_key: "RAlt".into(),
            enabled: true,
            order: 0,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: 500,
            double_click_ms: 400,
            ime_preset_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: CODEX_PROVIDER_ID.into(),
            agent_bindings: build_codex_micro_13_bindings("zh-CN"),
            codex_micro_pad: Some(pad),
        }];
        sync_hook_cache(&cfg);
        assert!(pad_mapping_active());
        // Capture depends on Soft Pad session (Codex/overlay FG latch) + pad_active.
        set_joy_nav_panel_open(false);
        assert!(!pad_should_capture_arrows(), "no Soft Pad session → false");
        set_joy_nav_panel_open(true);
        assert!(!pad_should_capture_arrows(), "rail open still needs Soft Pad session");
    }
}
