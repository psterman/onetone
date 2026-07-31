//! Soft Pad runtime store: ShadowDecision (always) + Applied+routes (cutover).

use crate::codex_numpad_layer::{
    self, CodexNumpadRouteSnapshot, HookGateInstall, NumpadSourceKey,
};
use crate::config::{agent_key_binding_for_slot, MappingEntry, VoiceConfig};
use crate::soft_pad_runtime::model::{
    now_ms, AgentKind, ApplyError, AppliedDecisionInternal, AppliedSoftPadDecision, CandidateDecision,
    FollowMode, RuntimeAvailability, RuntimeHealth, SelectionReason, ShadowDecision,
    SoftPadPublicSnapshot,
};
use crate::soft_pad_runtime::platform::read_foreground_evidence;
use crate::soft_pad_runtime::resolver::{
    resolve_candidate, CandidateInput, DispatchReadyEntry,
};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

/// When true, HookGate agent routes come only from Applied (Phase 1B).
static CUTOVER: AtomicBool = AtomicBool::new(true);
static RECOMPUTE_GUARD: AtomicBool = AtomicBool::new(false);

static CONFIG_REVISION: AtomicU64 = AtomicU64::new(1);
static GENERATION: AtomicU64 = AtomicU64::new(0);
static RUNTIME: Mutex<Option<SoftPadRuntimeState>> = Mutex::new(None);
static USER_PIN: Mutex<Option<AgentKind>> = Mutex::new(None);

fn runtime_mut<R>(f: impl FnOnce(&mut SoftPadRuntimeState) -> R) -> R {
    let mut g = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());
    if g.is_none() {
        *g = Some(SoftPadRuntimeState::default());
    }
    f(g.as_mut().unwrap())
}

#[derive(Debug)]
pub struct SoftPadRuntimeState {
    pub config_revision: u64,
    pub applied: Option<AppliedDecisionInternal>,
    pub shadow: Option<ShadowDecision>,
    pub agent_routes: HashMap<String, CodexNumpadRouteSnapshot>,
    pub agent_routes_by_micro: HashMap<String, CodexNumpadRouteSnapshot>,
    pub system_routes: HashMap<String, CodexNumpadRouteSnapshot>,
    pub availability: RuntimeAvailability,
    pub health: RuntimeHealth,
    pub last_recompute_error: Option<ApplyError>,
    pub status_revision: u64,
    pub pad_active: bool,
    pub nav_keys_enabled: bool,
    pub software_enhance_enabled: bool,
    pub require_num_lock_off: bool,
    pub claude_cli_inject_pref_enabled: bool,
    pub joy_nav_panel_open: bool,
    pub legacy_dispatch_mapping: Option<String>,
    pub foreground_kind: Option<AgentKind>,
}

impl Default for SoftPadRuntimeState {
    fn default() -> Self {
        Self {
            config_revision: 1,
            applied: None,
            shadow: None,
            agent_routes: HashMap::new(),
            agent_routes_by_micro: HashMap::new(),
            system_routes: HashMap::new(),
            availability: RuntimeAvailability::Ready,
            health: RuntimeHealth::Ready,
            last_recompute_error: None,
            status_revision: 0,
            pad_active: false,
            nav_keys_enabled: false,
            software_enhance_enabled: false,
            require_num_lock_off: false,
            claude_cli_inject_pref_enabled: false,
            joy_nav_panel_open: false,
            legacy_dispatch_mapping: None,
            foreground_kind: None,
        }
    }
}

pub fn soft_pad_cutover_enabled() -> bool {
    CUTOVER.load(Ordering::Relaxed)
}

pub fn set_soft_pad_cutover(enabled: bool) {
    CUTOVER.store(enabled, Ordering::Relaxed);
}

pub fn note_config_revision_bump() -> u64 {
    CONFIG_REVISION.fetch_add(1, Ordering::AcqRel) + 1
}

pub fn current_config_revision() -> u64 {
    CONFIG_REVISION.load(Ordering::Acquire)
}

pub fn set_follow_pin(kind: Option<AgentKind>) {
    if let Ok(mut g) = USER_PIN.lock() {
        *g = kind;
    }
}

pub fn get_follow_pin() -> Option<AgentKind> {
    USER_PIN.lock().ok().and_then(|g| *g)
}

pub fn with_runtime<R>(f: impl FnOnce(&SoftPadRuntimeState) -> R) -> R {
    runtime_mut(|rt| f(rt))
}

pub fn get_shadow_decision() -> Option<ShadowDecision> {
    with_runtime(|rt| rt.shadow.clone())
}

pub fn get_public_snapshot() -> SoftPadPublicSnapshot {
    let attention = crate::agent_attention::public_snapshot();
    with_runtime(|rt| SoftPadPublicSnapshot {
        decision_revision: rt
            .applied
            .as_ref()
            .map(|a| a.public.revision)
            .unwrap_or(0),
        status_revision: rt.status_revision,
        cutover: soft_pad_cutover_enabled(),
        availability: rt.availability,
        health: rt.health,
        mode: rt
            .applied
            .as_ref()
            .map(|a| a.public.mode)
            .or_else(|| rt.shadow.as_ref().map(|s| s.mode))
            .unwrap_or(FollowMode::Auto),
        user_lane_id: get_follow_pin().map(|k| k.as_str().to_string()),
        applied: if soft_pad_cutover_enabled() {
            rt.applied.as_ref().map(|a| a.public.clone())
        } else {
            None
        },
        shadow: rt.shadow.clone(),
        last_recompute_error: rt.last_recompute_error.clone(),
        legacy_dispatch_mapping: rt.legacy_dispatch_mapping.clone(),
        foreground_kind: rt.foreground_kind,
        attention_waiting_kinds: attention.waiting_kinds,
        attention_revision: attention.revision,
    })
}

/// Entry from config apply / heal / pin / FG. Builds Candidate off-lock; applies under lock.
pub fn request_soft_pad_recompute(cfg: &VoiceConfig) {
    if RECOMPUTE_GUARD.swap(true, Ordering::AcqRel) {
        return;
    }
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        request_soft_pad_recompute_body(cfg);
    }));
    RECOMPUTE_GUARD.store(false, Ordering::Release);
    if let Err(e) = result {
        std::panic::resume_unwind(e);
    }
}

fn request_soft_pad_recompute_body(cfg: &VoiceConfig) {
    let based_on = current_config_revision();
    let generation = GENERATION.fetch_add(1, Ordering::AcqRel) + 1;
    let fg = read_foreground_evidence();
    let pin = get_follow_pin();

    // Prune invalid pin against dispatchReady pool.
    let entries = collect_dispatch_ready(cfg);
    let effective_pin = pin.filter(|p| entries.iter().any(|e| e.kind == *p));
    if pin.is_some() && effective_pin.is_none() {
        set_follow_pin(None);
    }

    let current_lane = with_runtime(|rt| {
        rt.applied
            .as_ref()
            .and_then(|a| a.public.lane_kind)
            .or_else(|| rt.shadow.as_ref().and_then(|s| s.lane_kind))
    });

    let (waiting_kinds, waiting_observed_at) =
        crate::agent_attention::project_waiting_kinds();

    let input = CandidateInput {
        entries: entries.clone(),
        user_pin: effective_pin,
        foreground: Some(fg.clone()),
        waiting_kinds,
        waiting_observed_at,
        now: Instant::now(),
        current_lane,
    };
    let candidate = resolve_candidate(&input);

    let (agent_routes, agent_by_micro, flags) =
        build_agent_routes_for_candidate(cfg, &candidate);

    let legacy_mapping = peek_legacy_dispatch_mapping();
    let candidate_valid = match (&candidate.lane_kind, &candidate.mapping_id) {
        (None, None) => true,
        (Some(_), Some(id)) => cfg
            .find_mapping_by_id(id)
            .is_some_and(is_dispatch_ready),
        _ => false,
    };

    let mut discard = false;
    runtime_mut(|rt| {
        if based_on != current_config_revision()
            || generation != GENERATION.load(Ordering::Acquire)
        {
            discard = true;
            return;
        }
        apply_build_locked(
            rt,
            based_on,
            generation,
            &candidate,
            candidate_valid,
            agent_routes,
            agent_by_micro,
            flags,
            fg.agent_kind,
            legacy_mapping,
        );
    });

    if discard {
        // Stale build discarded. A newer sync_hook_cache / recompute will run after guard clears,
        // or we immediately rebuild once with the latest revision while still holding the guard.
        let latest = current_config_revision();
        if based_on != latest {
            let generation = GENERATION.fetch_add(1, Ordering::AcqRel) + 1;
            let fg = read_foreground_evidence();
            let pin = get_follow_pin();
            let entries = collect_dispatch_ready(cfg);
            let effective_pin = pin.filter(|p| entries.iter().any(|e| e.kind == *p));
            let current_lane = with_runtime(|rt| {
                rt.applied
                    .as_ref()
                    .and_then(|a| a.public.lane_kind)
                    .or_else(|| rt.shadow.as_ref().and_then(|s| s.lane_kind))
            });
            let (waiting_kinds, waiting_observed_at) =
                crate::agent_attention::project_waiting_kinds();
            let candidate = resolve_candidate(&CandidateInput {
                entries,
                user_pin: effective_pin,
                foreground: Some(fg.clone()),
                waiting_kinds,
                waiting_observed_at,
                now: Instant::now(),
                current_lane,
            });
            let candidate_valid = match (&candidate.lane_kind, &candidate.mapping_id) {
                (None, None) => true,
                (Some(_), Some(id)) => cfg
                    .find_mapping_by_id(id)
                    .is_some_and(is_dispatch_ready),
                _ => false,
            };
            let (agent_routes, agent_by_micro, flags) =
                build_agent_routes_for_candidate(cfg, &candidate);
            let legacy_mapping = peek_legacy_dispatch_mapping();
            runtime_mut(|rt| {
                if latest != current_config_revision()
                    || generation != GENERATION.load(Ordering::Acquire)
                {
                    return;
                }
                apply_build_locked(
                    rt,
                    latest,
                    generation,
                    &candidate,
                    candidate_valid,
                    agent_routes,
                    agent_by_micro,
                    flags,
                    fg.agent_kind,
                    legacy_mapping,
                );
            });
        }
    }

    if soft_pad_cutover_enabled() {
        install_hook_gate_from_runtime();
    }
}

struct PadFlags {
    pad_active: bool,
    nav_keys_enabled: bool,
    software_enhance_enabled: bool,
    require_num_lock_off: bool,
    claude_cli_inject_pref_enabled: bool,
}

fn apply_build_locked(
    rt: &mut SoftPadRuntimeState,
    based_on: u64,
    generation: u64,
    candidate: &CandidateDecision,
    candidate_valid: bool,
    agent_routes: HashMap<String, CodexNumpadRouteSnapshot>,
    agent_by_micro: HashMap<String, CodexNumpadRouteSnapshot>,
    flags: PadFlags,
    foreground_kind: Option<AgentKind>,
    legacy_mapping: Option<String>,
) {
    let _ = generation;
    rt.config_revision = based_on;
    rt.foreground_kind = foreground_kind;
    rt.legacy_dispatch_mapping = legacy_mapping;
    rt.pad_active = flags.pad_active;
    rt.nav_keys_enabled = flags.nav_keys_enabled;
    rt.software_enhance_enabled = flags.software_enhance_enabled;
    rt.require_num_lock_off = flags.require_num_lock_off;
    rt.claude_cli_inject_pref_enabled = flags.claude_cli_inject_pref_enabled;

    let shadow_rev = rt.shadow.as_ref().map(|s| s.revision).unwrap_or(0) + 1;
    rt.shadow = Some(ShadowDecision {
        revision: shadow_rev,
        lane_kind: candidate.lane_kind,
        mapping_id: candidate.mapping_id.clone(),
        reason: candidate.reason,
        mode: candidate.mode,
        applied_at_ms: now_ms(),
        based_on_config_revision: based_on,
        generation,
    });

    if !soft_pad_cutover_enabled() {
        rt.status_revision = rt.status_revision.saturating_add(1);
        return;
    }

    if !candidate_valid {
        let old_still_ready = rt.applied.as_ref().is_some_and(|a| {
            a.public.lane_kind.is_some()
                && a.public.mapping_id.as_ref().is_some_and(|id| {
                    rt.agent_routes_by_micro
                        .values()
                        .any(|r| &r.mapping_id == id)
                })
        });
        if old_still_ready {
            rt.last_recompute_error = Some(ApplyError {
                code: "candidate_invalid".into(),
                message: "candidate rejected; keeping previous Applied".into(),
            });
            rt.health = RuntimeHealth::Degraded;
            rt.status_revision = rt.status_revision.saturating_add(1);
            return;
        }
        let next_rev = rt
            .applied
            .as_ref()
            .map(|a| a.public.revision)
            .unwrap_or(0)
            .saturating_add(1);
        rt.applied = Some(AppliedDecisionInternal::none(next_rev));
        rt.agent_routes.clear();
        rt.agent_routes_by_micro.clear();
        rt.availability = RuntimeAvailability::RouteApplyFailed;
        rt.health = RuntimeHealth::Unavailable;
        rt.last_recompute_error = Some(ApplyError {
            code: "candidate_invalid".into(),
            message: "candidate rejected; previous Applied invalid".into(),
        });
        rt.status_revision = rt.status_revision.saturating_add(1);
        return;
    }

    let prev_rev = rt
        .applied
        .as_ref()
        .map(|a| a.public.revision)
        .unwrap_or(0);
    let changed = rt
        .applied
        .as_ref()
        .map(|a| {
            a.public.lane_kind != candidate.lane_kind
                || a.public.mapping_id != candidate.mapping_id
                || a.public.reason != candidate.reason
                || a.public.mode != candidate.mode
        })
        .unwrap_or(true);

    let next_rev = if changed {
        prev_rev + 1
    } else {
        prev_rev.max(1)
    };

    let (routes, by_micro) = if candidate.lane_kind.is_none() {
        (HashMap::new(), HashMap::new())
    } else {
        (agent_routes, agent_by_micro)
    };

    rt.applied = Some(AppliedDecisionInternal {
        applied_instant: Instant::now(),
        public: AppliedSoftPadDecision {
            revision: next_rev,
            lane_kind: candidate.lane_kind,
            mapping_id: candidate.mapping_id.clone(),
            reason: candidate.reason,
            mode: candidate.mode,
            applied_at_ms: now_ms(),
        },
    });
    rt.agent_routes = routes;
    rt.agent_routes_by_micro = by_micro;
    rt.availability = RuntimeAvailability::Ready;
    rt.health = RuntimeHealth::Ready;
    rt.last_recompute_error = None;
    rt.status_revision = rt.status_revision.saturating_add(1);
}

pub fn collect_dispatch_ready(cfg: &VoiceConfig) -> Vec<DispatchReadyEntry> {
    let mut out = Vec::new();
    for m in &cfg.mappings {
        if !is_dispatch_ready(m) {
            continue;
        }
        let Some(kind) = crate::agent_catalog::kind_from_mapping(
            &m.app_target_id,
            &m.agent_provider_id,
        ) else {
            continue;
        };
        let pad = m.codex_micro_pad.as_ref().unwrap();
        out.push(DispatchReadyEntry {
            kind,
            mapping_id: m.id.clone(),
            overlay_enabled: pad.overlay_enabled,
            order: m.order,
        });
    }
    out
}

/// padEnabled && faceCompatible && capabilities.soft_pad_dispatch_ready.
pub fn is_dispatch_ready(m: &MappingEntry) -> bool {
    if !m.enabled {
        return false;
    }
    let Some(pad) = m.codex_micro_pad.as_ref() else {
        return false;
    };
    if !pad.enabled {
        return false;
    }
    crate::agent_catalog::mapping_dispatch_ready(
        m.enabled,
        pad.enabled,
        &m.app_target_id,
        &m.agent_provider_id,
        None,
    )
    .is_some()
}

fn build_agent_routes_for_candidate(
    cfg: &VoiceConfig,
    candidate: &CandidateDecision,
) -> (
    HashMap<String, CodexNumpadRouteSnapshot>,
    HashMap<String, CodexNumpadRouteSnapshot>,
    PadFlags,
) {
    let mut flags = PadFlags {
        pad_active: false,
        nav_keys_enabled: false,
        software_enhance_enabled: false,
        require_num_lock_off: false,
        claude_cli_inject_pref_enabled: false,
    };
    // Pref flags OR across all enabled pads (inject pref), routes only from Applied mapping.
    for m in &cfg.mappings {
        if let Some(pad) = m.codex_micro_pad.as_ref() {
            if pad.claude_cli_inject_pref_enabled {
                flags.claude_cli_inject_pref_enabled = true;
            }
        }
    }

    let mut routes = HashMap::new();
    let mut by_micro = HashMap::new();
    let Some(mid) = candidate.mapping_id.as_ref() else {
        return (routes, by_micro, flags);
    };
    let Some(m) = cfg.find_mapping_by_id(mid) else {
        return (routes, by_micro, flags);
    };
    let Some(pad) = m.codex_micro_pad.as_ref() else {
        return (routes, by_micro, flags);
    };
    if !pad.enabled || !m.enabled {
        return (routes, by_micro, flags);
    }

    flags.pad_active = true;
    if pad.nav_keys_enabled {
        flags.nav_keys_enabled = true;
    }
    if pad.software_enhance_enabled {
        flags.software_enhance_enabled = true;
    }
    if pad.require_num_lock_off {
        flags.require_num_lock_off = true;
    }

    for route in &pad.keys {
        if !route.enabled || route.slot_id.trim().is_empty() {
            continue;
        }
        let Some(binding) = agent_key_binding_for_slot(m, &route.slot_id) else {
            continue;
        };
        if binding.trigger_binding.trim().is_empty() || !binding.enabled {
            continue;
        }
        let provider = if m.agent_provider_id.trim().is_empty() {
            "codex".to_string()
        } else {
            m.agent_provider_id.clone()
        };
        let is_hold = binding.action_id == "startDictation"
            || binding.slot_id.eq_ignore_ascii_case("pushToTalk");
        let snapshot = CodexNumpadRouteSnapshot {
            mapping_id: m.id.clone(),
            slot_id: binding.slot_id.clone(),
            action_id: binding.action_id.clone(),
            provider_id: provider,
            trigger_binding: binding.trigger_binding.clone(),
            micro_key_id: route.micro_key_id.clone(),
            is_hold,
        };
        if route.source_scan > 0 {
            let source = NumpadSourceKey {
                scan: route.source_scan,
                extended: route.source_extended,
            };
            routes.insert(source.id(), snapshot.clone());
        }
        if !route.micro_key_id.trim().is_empty() {
            by_micro.insert(route.micro_key_id.clone(), snapshot);
        }
    }
    (routes, by_micro, flags)
}

fn peek_legacy_dispatch_mapping() -> Option<String> {
    // Sample first micro route from live HookGate for 1A comparison.
    codex_numpad_layer::peek_first_route_mapping_id()
}

fn install_hook_gate_from_runtime() {
    let joy = codex_numpad_layer::joy_nav_panel_open();
    let install = with_runtime(|rt| HookGateInstall {
        routes: rt.agent_routes.clone(),
        routes_by_micro: rt.agent_routes_by_micro.clone(),
        pad_active: rt.pad_active,
        nav_keys_enabled: rt.nav_keys_enabled,
        software_enhance_enabled: rt.software_enhance_enabled,
        require_num_lock_off: rt.require_num_lock_off,
        claude_cli_inject_pref_enabled: rt.claude_cli_inject_pref_enabled,
        joy_nav_panel_open: joy,
    });
    codex_numpad_layer::install_hook_gate(install);
}

/// Preserve JOY panel flag across recomputes.
pub fn set_joy_nav_panel_open(open: bool) {
    runtime_mut(|rt| {
        rt.joy_nav_panel_open = open;
    });
}

#[cfg(test)]
mod attention_feed_tests {
    use super::*;
    use crate::agent_attention::store::{
        raise_needs_input, reset_for_test, test_lock as attention_lock,
    };
    use crate::agent_attention::{AttentionCause, SignalSource};
    use crate::codex_numpad_layer::default_codex_micro_pad;
    use crate::config::{MappingEntry, TriggerMode};

    fn mapping(id: &str, app: &str, order: u32) -> MappingEntry {
        let mut pad = default_codex_micro_pad();
        pad.enabled = true;
        pad.overlay_enabled = true;
        MappingEntry {
            id: id.into(),
            label: String::new(),
            group: "默认".into(),
            app_target_id: app.into(),
            trigger_key: "F1".into(),
            target_key: "RAlt".into(),
            enabled: true,
            order,
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
            codex_micro_pad: Some(pad),
        }
    }

    #[test]
    fn recompute_waiting_kinds_from_attention_not_empty() {
        let _g = attention_lock();
        reset_for_test();
        set_follow_pin(None);
        raise_needs_input(
            AgentKind::Claude,
            Some("s"),
            Some("r"),
            AttentionCause::Permission,
            SignalSource::OfficialHook,
        );
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![
            mapping("m-codex", "codex-chat", 0),
            mapping("m-claude", "claude-code", 1),
        ];
        request_soft_pad_recompute(&cfg);
        let snap = get_public_snapshot();
        assert!(
            snap.attention_waiting_kinds.iter().any(|k| k == "claude"),
            "expected claude in attention_waiting_kinds: {:?}",
            snap.attention_waiting_kinds
        );
        assert_eq!(
            snap.applied.as_ref().and_then(|a| a.lane_kind),
            Some(AgentKind::Claude)
        );
        assert_eq!(
            snap.applied.as_ref().map(|a| a.reason),
            Some(SelectionReason::Waiting)
        );
    }
}
