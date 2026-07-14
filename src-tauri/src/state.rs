use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use crate::config::{mapping_timing, MappingEntry, TriggerMode, VoiceConfig};

#[derive(Debug, Clone)]
pub enum Action {
    SendKey { key: String },
    SendEsc,
    ScheduleEnter { delay_ms: u32, token: u64 },
    SendEnter,
    None,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RuntimeInfo {
    #[serde(rename = "count")]
    pub count: u32,
    #[serde(rename = "timerActive")]
    pub timer_active: bool,
    #[serde(rename = "lastAction")]
    pub last_action: String,
}

pub struct StateMachine {
    count: u32,
    last_tick: Option<Instant>,
    last_trigger: Option<Instant>,
    enter_timer_active: bool,
    enter_timer_gen: u64,
}

impl StateMachine {
    pub fn new() -> Self {
        Self {
            count: 0,
            last_tick: None,
            last_trigger: None,
            enter_timer_active: false,
            enter_timer_gen: 0,
        }
    }

    fn invalidate_enter_timer(&mut self) {
        if self.enter_timer_active {
            self.enter_timer_gen = self.enter_timer_gen.wrapping_add(1);
            self.enter_timer_active = false;
        }
    }

    pub fn trigger(
        &mut self,
        cfg: &VoiceConfig,
        mapping: &MappingEntry,
        _trigger_key: &str,
        now: Instant,
    ) -> Vec<Action> {
        let debounce_ms = cfg.debounce_ms as u64;
        let (interval_ms, enter_delay_ms, cancel_enabled, auto_enter_enabled) =
            mapping_timing(mapping, cfg);
        let target = mapping.target_key.clone();

        if mapping.trigger_mode == TriggerMode::PerPress
            || mapping.trigger_mode == TriggerMode::LongPress
        {
            if let Some(last) = self.last_trigger {
                if now.duration_since(last) < Duration::from_millis(debounce_ms) {
                    return vec![];
                }
            }
            self.last_trigger = Some(now);
            return vec![Action::SendKey { key: target }];
        }

        let delta = self
            .last_tick
            .map(|t| now.duration_since(t).as_millis() as u64)
            .unwrap_or(0);

        if let Some(last) = self.last_trigger {
            if now.duration_since(last) < Duration::from_millis(debounce_ms) {
                return vec![];
            }
        }
        self.last_trigger = Some(now);

        if self.last_tick.is_some() && delta < interval_ms as u64 && cancel_enabled {
            self.count = 0;
            self.last_tick = Some(now);
            self.invalidate_enter_timer();
            return vec![Action::SendEsc];
        }

        if self.enter_timer_active {
            self.invalidate_enter_timer();
        }

        self.last_tick = Some(now);
        self.count = self.count.saturating_add(1);
        if self.count >= 3 {
            self.count = 1;
        }

        let mut actions = vec![Action::SendKey { key: target }];

        if self.count == 2 && auto_enter_enabled {
            self.enter_timer_gen = self.enter_timer_gen.wrapping_add(1);
            let token = self.enter_timer_gen;
            self.enter_timer_active = true;
            actions.push(Action::ScheduleEnter {
                delay_ms: enter_delay_ms,
                token,
            });
        }

        actions
    }

    pub fn on_enter_timer(&mut self, token: u64) -> Action {
        if !self.enter_timer_active || self.enter_timer_gen != token {
            return Action::None;
        }
        self.enter_timer_active = false;
        self.count = 0;
        self.last_tick = None;
        Action::SendEnter
    }

    pub fn reset(&mut self) {
        self.count = 0;
        self.last_tick = None;
        self.invalidate_enter_timer();
    }

    pub fn runtime_info(&self) -> RuntimeInfo {
        RuntimeInfo {
            count: self.count,
            timer_active: self.enter_timer_active,
            last_action: String::new(),
        }
    }
}

pub struct StateMachinePool {
    machines: HashMap<String, StateMachine>,
}

impl StateMachinePool {
    pub fn new() -> Self {
        Self {
            machines: HashMap::new(),
        }
    }

    pub fn get_or_create(&mut self, mapping_id: &str) -> &mut StateMachine {
        self.machines
            .entry(mapping_id.to_string())
            .or_insert_with(StateMachine::new)
    }

    pub fn prune(&mut self, valid_ids: &HashSet<String>) {
        self.machines.retain(|id, _| valid_ids.contains(id));
    }

    pub fn reset_all(&mut self) {
        for sm in self.machines.values_mut() {
            sm.reset();
        }
    }

    pub fn any_timer_active(&self) -> bool {
        self.machines.values().any(|m| m.enter_timer_active)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{MappingEntry, TriggerMode};

    fn tap_mapping() -> MappingEntry {
        MappingEntry {
            id: "m1".into(),
            label: String::new(),
            group: "默认".into(),
            trigger_key: "Volume_Down".into(),
            target_key: "LAlt".into(),
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
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        }
    }

    fn cfg() -> VoiceConfig {
        VoiceConfig::default()
    }

    #[test]
    fn cancel_invalidates_scheduled_enter() {
        let mut sm = StateMachine::new();
        let mapping = tap_mapping();
        let cfg = cfg();
        let t0 = Instant::now();

        sm.trigger(&cfg, &mapping, "Volume_Down", t0);

        let a2 = sm.trigger(
            &cfg,
            &mapping,
            "Volume_Down",
            t0 + Duration::from_millis(1300),
        );
        let token = match a2.last() {
            Some(Action::ScheduleEnter { token, .. }) => *token,
            other => panic!("expected ScheduleEnter, got {other:?}"),
        };

        let a3 = sm.trigger(
            &cfg,
            &mapping,
            "Volume_Down",
            t0 + Duration::from_millis(1400),
        );
        assert!(matches!(a3.last(), Some(Action::SendEsc)));

        assert!(matches!(sm.on_enter_timer(token), Action::None));
    }

    #[test]
    fn enter_timer_fires_when_still_valid() {
        let mut sm = StateMachine::new();
        let mapping = tap_mapping();
        let cfg = cfg();
        let t0 = Instant::now();

        sm.trigger(&cfg, &mapping, "Volume_Down", t0);
        let actions = sm.trigger(
            &cfg,
            &mapping,
            "Volume_Down",
            t0 + Duration::from_millis(1300),
        );
        let token = match actions.last() {
            Some(Action::ScheduleEnter { token, .. }) => *token,
            other => panic!("expected ScheduleEnter, got {other:?}"),
        };

        assert!(matches!(sm.on_enter_timer(token), Action::SendEnter));
        assert!(matches!(sm.on_enter_timer(token), Action::None));
    }
}
