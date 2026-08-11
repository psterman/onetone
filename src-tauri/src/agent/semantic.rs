//! Semantic action IDs, channels, aliases, and catalog DTOs (Rust = source of truth).

use serde::Serialize;

use super::actions::{action_by_id, all_actions, AgentActionDef, RiskLevel};

/// Feature gates — B-final.7 formal: Picker + Dynamic Context both on.
pub const FEATURE_DYNAMIC_CONTEXT_ACTIONS: bool = true;
pub const FEATURE_ACTION_PICKER_UI: bool = true;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionLayer {
    OneToneBase,
    AgentControl,
    PromptTemplate,
    /// Legacy catalog rows still executable; prefer canonical dotted ids.
    LegacyCompat,
}

impl ActionLayer {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OneToneBase => "onetoneBase",
            Self::AgentControl => "agentControl",
            Self::PromptTemplate => "promptTemplate",
            Self::LegacyCompat => "legacyCompat",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionChannel {
    Key,
    Voice,
    Camera,
    SoftPad,
}

impl ActionChannel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Key => "key",
            Self::Voice => "voice",
            Self::Camera => "camera",
            Self::SoftPad => "softPad",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim() {
            "key" => Some(Self::Key),
            "voice" => Some(Self::Voice),
            "camera" => Some(Self::Camera),
            "softPad" | "softpad" | "soft_pad" => Some(Self::SoftPad),
            _ => None,
        }
    }
}

pub const ALL_CHANNELS: &[ActionChannel] = &[
    ActionChannel::Key,
    ActionChannel::Voice,
    ActionChannel::Camera,
    ActionChannel::SoftPad,
];

/// Layer1 + Layer2 canonical ids (closed set for A phase).
pub const LAYER1_ACTION_IDS: &[&str] = &[
    "input.start",
    "input.pause",
    "input.cancel",
    "input.commit",
    "input.send",
    "onetone.pause",
    "onetone.resume",
    "overlay.toggle",
    "status.read",
];

pub const LAYER2_CORE_ACTION_IDS: &[&str] = &[
    "agent.focus",
    "agent.focus_waiting",
    "agent.continue",
    "agent.interrupt",
    "agent.retry",
    "agent.respond",
    "choice.select",
    "agent.approve",
    "agent.reject",
    "session.new",
    "session.next",
    "agent.status",
];

/// Finish policy for resolving `stopOrSendDictation` alias.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FinishPolicy {
    /// Map alias → `input.commit`
    Commit,
    /// Map alias → `input.send` (`voice_end.send_mode == auto`)
    Send,
}

impl FinishPolicy {
    pub fn from_send_mode(send_mode: &str) -> Self {
        if send_mode.trim().eq_ignore_ascii_case("auto") {
            Self::Send
        } else {
            Self::Commit
        }
    }
}

/// Resolve legacy / alias ids to canonical dotted ids.
pub fn resolve_canonical_action_id(raw: &str, finish: FinishPolicy) -> String {
    let id = raw.trim();
    match id {
        "startDictation" => "input.start".into(),
        "cancel" => "input.cancel".into(),
        "openAgent" | "focusComposer" => "agent.focus".into(),
        "stopOrSendDictation" => match finish {
            FinishPolicy::Send => "input.send".into(),
            FinishPolicy::Commit => "input.commit".into(),
        },
        // Legacy status slash → Layer1 status.read when used as semantic status
        other => other.to_string(),
    }
}

/// Map canonical id to agent-adapter handler id (Layer2 / legacy).
/// Layer1 `input.commit` / `input.send` / `status.read` use native handlers — not here.
pub fn provider_handler_id(canonical: &str) -> &str {
    match canonical {
        "input.start" => "startDictation",
        "input.cancel" => "cancel",
        "agent.focus" => "focusComposer",
        "agent.status" => "status",
        "session.new" => "newThread",
        "agent.interrupt" | "agent.reject" => "cancel",
        "agent.approve" => "agent.approve",
        other => other,
    }
}

/// Intent category for Picker grouping.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionCategory {
    Input,
    Agent,
    Decision,
    Session,
    System,
}

impl ActionCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Input => "input",
            Self::Agent => "agent",
            Self::Decision => "decision",
            Self::Session => "session",
            Self::System => "system",
        }
    }
}

/// none | currentTarget | providerAdapter
pub type ProviderScope = &'static str;

#[derive(Debug, Clone, Copy)]
pub struct SemanticActionMeta {
    pub id: &'static str,
    pub layer: ActionLayer,
    pub category: ActionCategory,
    pub label_zh: &'static str,
    pub label_en: &'static str,
    pub risk: RiskLevel,
    pub channels: &'static [ActionChannel],
    /// False → route returns unsupported; future Picker must hide.
    pub implemented: bool,
    /// onetoneRuntime | agentAdapter | unsupported
    pub executor: &'static str,
    /// When this action is contextually relevant. `"none"` = idle; empty = unrestricted.
    pub available_when: &'static [&'static str],
    /// Channels that must create Pending instead of direct execute (e.g. `["camera"]`).
    /// Authority for RouteDisposition / cameraDirectForbidden DTO.
    pub requires_second_channel_from: &'static [&'static str],
    /// none | currentTarget | providerAdapter
    pub provider_scope: ProviderScope,
}

/// Whether this channel must Pending instead of direct execute (authority: requiresSecondChannelFrom).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RouteDisposition {
    Execute,
    PendingConfirmation,
}

impl RouteDisposition {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Execute => "execute",
            Self::PendingConfirmation => "pendingConfirmation",
        }
    }
}

/// Single authority for Options / Route / cameraDirectForbidden DTO projection.
pub fn route_disposition(meta: &SemanticActionMeta, channel: ActionChannel) -> RouteDisposition {
    if meta
        .requires_second_channel_from
        .iter()
        .any(|c| *c == channel.as_str())
    {
        RouteDisposition::PendingConfirmation
    } else {
        RouteDisposition::Execute
    }
}

/// Thin wrapper: Camera may direct-execute iff disposition is Execute.
pub fn camera_may_execute_directly(canonical: &str) -> bool {
    match semantic_meta_by_id(canonical) {
        Some(meta) => route_disposition(meta, ActionChannel::Camera) == RouteDisposition::Execute,
        None => true,
    }
}

const AW_IDLE: &[&str] = &["none"];
const AW_DICTATING: &[&str] = &["dictating"];
const AW_APPROVAL: &[&str] = &["waitingApproval"];
const AW_TEXT: &[&str] = &["waitingText"];
const AW_RUNNING: &[&str] = &["agentRunning"];
const AW_IDLE_OR_TEXT: &[&str] = &["none", "waitingText"];
const AW_ANY_V1: &[&str] = &["none", "waitingText", "waitingApproval", "agentRunning", "dictating"];
const REQ_NONE: &[&str] = &[];
const REQ_CAMERA: &[&str] = &["camera"];

const KEY_VOICE_PAD: &[ActionChannel] = &[
    ActionChannel::Key,
    ActionChannel::Voice,
    ActionChannel::SoftPad,
];

/// Key / Voice / SoftPad / Camera — bindable on all four; Camera may still Pending via requiresSecondChannelFrom.
const KEY_VOICE_PAD_CAMERA: &[ActionChannel] = &[
    ActionChannel::Key,
    ActionChannel::Voice,
    ActionChannel::Camera,
    ActionChannel::SoftPad,
];

const ALL_FOUR: &[ActionChannel] = &[
    ActionChannel::Key,
    ActionChannel::Voice,
    ActionChannel::Camera,
    ActionChannel::SoftPad,
];

const VOICE_PAD: &[ActionChannel] = &[ActionChannel::Voice, ActionChannel::SoftPad];

const SEMANTIC_META: &[SemanticActionMeta] = &[
    SemanticActionMeta {
        id: "input.start",
        layer: ActionLayer::OneToneBase,
        category: ActionCategory::Input,
        label_zh: "开始听写",
        label_en: "Start dictation",
        risk: RiskLevel::Confirm,
        channels: ALL_FOUR,
        implemented: true,
        executor: "onetoneRuntime",
        available_when: AW_IDLE_OR_TEXT,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "currentTarget",
    },
    SemanticActionMeta {
        id: "input.pause",
        layer: ActionLayer::OneToneBase,
        category: ActionCategory::Input,
        label_zh: "暂停听写",
        label_en: "Pause dictation",
        risk: RiskLevel::Safe,
        channels: KEY_VOICE_PAD,
        implemented: true,
        executor: "onetoneRuntime",
        available_when: AW_DICTATING,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "none",
    },
    SemanticActionMeta {
        id: "input.cancel",
        layer: ActionLayer::OneToneBase,
        category: ActionCategory::Input,
        label_zh: "取消本轮",
        label_en: "Cancel round",
        risk: RiskLevel::Safe,
        channels: ALL_FOUR,
        implemented: true,
        executor: "onetoneRuntime",
        available_when: AW_ANY_V1,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "none",
    },
    SemanticActionMeta {
        id: "input.commit",
        layer: ActionLayer::OneToneBase,
        category: ActionCategory::Input,
        label_zh: "完成本轮",
        label_en: "Commit round",
        risk: RiskLevel::Confirm,
        channels: KEY_VOICE_PAD,
        implemented: true,
        executor: "onetoneRuntime",
        available_when: AW_DICTATING,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "none",
    },
    SemanticActionMeta {
        id: "input.send",
        layer: ActionLayer::OneToneBase,
        category: ActionCategory::Input,
        label_zh: "完成并发送",
        label_en: "Commit and send",
        risk: RiskLevel::Dangerous,
        channels: KEY_VOICE_PAD_CAMERA,
        implemented: true,
        executor: "onetoneRuntime",
        available_when: AW_DICTATING,
        requires_second_channel_from: REQ_CAMERA,
        provider_scope: "currentTarget",
    },
    SemanticActionMeta {
        id: "onetone.pause",
        layer: ActionLayer::OneToneBase,
        category: ActionCategory::System,
        label_zh: "暂停 OneTone",
        label_en: "Pause OneTone",
        risk: RiskLevel::Safe,
        channels: KEY_VOICE_PAD,
        implemented: true,
        executor: "onetoneRuntime",
        available_when: AW_ANY_V1,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "none",
    },
    SemanticActionMeta {
        id: "onetone.resume",
        layer: ActionLayer::OneToneBase,
        category: ActionCategory::System,
        label_zh: "恢复 OneTone",
        label_en: "Resume OneTone",
        risk: RiskLevel::Safe,
        channels: KEY_VOICE_PAD,
        implemented: true,
        executor: "onetoneRuntime",
        available_when: AW_ANY_V1,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "none",
    },
    SemanticActionMeta {
        id: "overlay.toggle",
        layer: ActionLayer::OneToneBase,
        category: ActionCategory::System,
        label_zh: "显示/隐藏控制面板",
        label_en: "Toggle control overlay",
        risk: RiskLevel::Safe,
        channels: ALL_FOUR,
        implemented: true,
        executor: "onetoneRuntime",
        available_when: AW_ANY_V1,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "none",
    },
    SemanticActionMeta {
        id: "status.read",
        layer: ActionLayer::OneToneBase,
        category: ActionCategory::System,
        label_zh: "告诉我当前状态",
        label_en: "Read current status",
        risk: RiskLevel::Safe,
        channels: VOICE_PAD,
        implemented: true,
        executor: "onetoneRuntime",
        available_when: AW_ANY_V1,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "none",
    },
    SemanticActionMeta {
        id: "agent.focus",
        layer: ActionLayer::AgentControl,
        category: ActionCategory::Agent,
        label_zh: "回到当前 Agent",
        label_en: "Focus current agent",
        risk: RiskLevel::Safe,
        channels: ALL_FOUR,
        implemented: true,
        executor: "agentAdapter",
        available_when: AW_ANY_V1,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "providerAdapter",
    },
    SemanticActionMeta {
        id: "agent.focus_waiting",
        layer: ActionLayer::AgentControl,
        category: ActionCategory::Agent,
        label_zh: "打开正在等我的 Agent",
        label_en: "Focus waiting agent",
        risk: RiskLevel::Safe,
        channels: KEY_VOICE_PAD,
        implemented: false,
        executor: "unsupported",
        available_when: AW_TEXT,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "providerAdapter",
    },
    SemanticActionMeta {
        id: "agent.continue",
        layer: ActionLayer::AgentControl,
        category: ActionCategory::Agent,
        label_zh: "向 Agent 发送「继续」",
        label_en: "Send “Continue” to agent",
        risk: RiskLevel::Confirm,
        channels: KEY_VOICE_PAD,
        implemented: true,
        executor: "onetoneRuntime",
        available_when: AW_IDLE,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "providerAdapter",
    },
    SemanticActionMeta {
        id: "agent.interrupt",
        layer: ActionLayer::AgentControl,
        category: ActionCategory::Agent,
        label_zh: "中断",
        label_en: "Interrupt",
        risk: RiskLevel::Safe,
        channels: ALL_FOUR,
        implemented: true,
        executor: "agentAdapter",
        available_when: AW_RUNNING,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "providerAdapter",
    },
    SemanticActionMeta {
        id: "agent.retry",
        layer: ActionLayer::AgentControl,
        category: ActionCategory::Agent,
        label_zh: "重试上一步",
        label_en: "Retry last step",
        risk: RiskLevel::Confirm,
        channels: KEY_VOICE_PAD,
        implemented: false,
        executor: "unsupported",
        available_when: AW_IDLE,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "providerAdapter",
    },
    SemanticActionMeta {
        id: "agent.respond",
        layer: ActionLayer::AgentControl,
        category: ActionCategory::Decision,
        label_zh: "回答 Agent",
        label_en: "Respond to agent",
        risk: RiskLevel::Confirm,
        channels: VOICE_PAD,
        implemented: true,
        executor: "onetoneRuntime",
        available_when: AW_TEXT,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "providerAdapter",
    },
    SemanticActionMeta {
        id: "choice.select",
        layer: ActionLayer::AgentControl,
        category: ActionCategory::Decision,
        label_zh: "选择第几个选项",
        label_en: "Select choice by index",
        risk: RiskLevel::Confirm,
        channels: KEY_VOICE_PAD,
        implemented: false,
        executor: "unsupported",
        available_when: AW_TEXT,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "providerAdapter",
    },
    SemanticActionMeta {
        id: "agent.approve",
        layer: ActionLayer::AgentControl,
        category: ActionCategory::Decision,
        label_zh: "批准",
        label_en: "Approve",
        risk: RiskLevel::Dangerous,
        channels: KEY_VOICE_PAD_CAMERA,
        implemented: true,
        executor: "agentAdapter",
        available_when: AW_APPROVAL,
        requires_second_channel_from: REQ_CAMERA,
        provider_scope: "providerAdapter",
    },
    SemanticActionMeta {
        id: "agent.reject",
        layer: ActionLayer::AgentControl,
        category: ActionCategory::Decision,
        label_zh: "拒绝",
        label_en: "Reject",
        risk: RiskLevel::Safe,
        channels: ALL_FOUR,
        implemented: true,
        executor: "agentAdapter",
        available_when: AW_APPROVAL,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "providerAdapter",
    },
    SemanticActionMeta {
        id: "session.new",
        layer: ActionLayer::AgentControl,
        category: ActionCategory::Session,
        label_zh: "新建任务",
        label_en: "New session",
        risk: RiskLevel::Confirm,
        channels: KEY_VOICE_PAD,
        implemented: true,
        executor: "agentAdapter",
        available_when: AW_IDLE,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "providerAdapter",
    },
    SemanticActionMeta {
        id: "session.next",
        layer: ActionLayer::AgentControl,
        category: ActionCategory::Session,
        label_zh: "下一个会话",
        label_en: "Next session",
        risk: RiskLevel::Safe,
        channels: KEY_VOICE_PAD,
        implemented: false,
        executor: "unsupported",
        available_when: AW_IDLE,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "providerAdapter",
    },
    SemanticActionMeta {
        id: "agent.status",
        layer: ActionLayer::AgentControl,
        category: ActionCategory::Agent,
        label_zh: "Agent 在做什么",
        label_en: "Agent status",
        risk: RiskLevel::Safe,
        channels: VOICE_PAD,
        implemented: true,
        executor: "agentAdapter",
        available_when: AW_ANY_V1,
        requires_second_channel_from: REQ_NONE,
        provider_scope: "providerAdapter",
    },
];

pub fn semantic_meta_by_id(id: &str) -> Option<&'static SemanticActionMeta> {
    let id = id.trim();
    SEMANTIC_META.iter().find(|m| m.id == id)
}

pub fn all_semantic_metas() -> &'static [SemanticActionMeta] {
    SEMANTIC_META
}

pub fn channel_allowed(meta: &SemanticActionMeta, channel: ActionChannel) -> bool {
    meta.channels.iter().any(|c| *c == channel)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntryDto {
    pub id: String,
    pub layer: String,
    pub category: String,
    pub label_zh: String,
    pub label_en: String,
    pub risk: String,
    pub channels: Vec<String>,
    pub camera_direct_forbidden: bool,
    pub implemented: bool,
    pub executor: String,
    pub legacy: bool,
    pub available_when: Vec<&'static str>,
    pub requires_second_channel_from: Vec<&'static str>,
    /// none | currentTarget | providerAdapter
    pub provider_scope: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticCatalogDto {
    pub version: u32,
    pub feature_dynamic_context_actions: bool,
    pub feature_action_picker_ui: bool,
    pub channels: Vec<&'static str>,
    pub aliases: Vec<AliasDto>,
    pub entries: Vec<CatalogEntryDto>,
    /// Legacy AgentAction rows still in execute catalog (compat).
    pub legacy_action_ids: Vec<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AliasDto {
    pub from: &'static str,
    pub to: &'static str,
    /// When set, `to` depends on finish policy (`commit` | `send`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_policy: Option<&'static str>,
}

pub fn public_catalog_dto() -> SemanticCatalogDto {
    let mut entries: Vec<CatalogEntryDto> = SEMANTIC_META
        .iter()
        .map(|m| CatalogEntryDto {
            id: m.id.to_string(),
            layer: m.layer.as_str().to_string(),
            category: m.category.as_str().to_string(),
            label_zh: m.label_zh.to_string(),
            label_en: m.label_en.to_string(),
            risk: m.risk.as_str().to_string(),
            channels: m.channels.iter().map(|c| c.as_str().to_string()).collect(),
            // Projected from requiresSecondChannelFrom — not a separate hand-written flag.
            camera_direct_forbidden: m.requires_second_channel_from.contains(&"camera"),
            implemented: m.implemented,
            executor: m.executor.to_string(),
            legacy: false,
            available_when: m.available_when.to_vec(),
            requires_second_channel_from: m.requires_second_channel_from.to_vec(),
            provider_scope: m.provider_scope,
        })
        .collect();

    for a in all_actions() {
        if semantic_meta_by_id(a.id).is_some() {
            continue;
        }
        if matches!(
            a.id,
            "startDictation" | "cancel" | "openAgent" | "focusComposer" | "stopOrSendDictation"
        ) {
            continue; // aliases only — not dual-listed as entries
        }
        entries.push(legacy_entry_dto(a));
    }

    SemanticCatalogDto {
        version: 2,
        feature_dynamic_context_actions: FEATURE_DYNAMIC_CONTEXT_ACTIONS,
        feature_action_picker_ui: FEATURE_ACTION_PICKER_UI,
        channels: ALL_CHANNELS.iter().map(|c| c.as_str()).collect(),
        aliases: vec![
            AliasDto {
                from: "startDictation",
                to: "input.start",
                finish_policy: None,
            },
            AliasDto {
                from: "cancel",
                to: "input.cancel",
                finish_policy: None,
            },
            AliasDto {
                from: "openAgent",
                to: "agent.focus",
                finish_policy: None,
            },
            AliasDto {
                from: "focusComposer",
                to: "agent.focus",
                finish_policy: None,
            },
            AliasDto {
                from: "stopOrSendDictation",
                to: "input.commit",
                finish_policy: Some("commitOrSend"),
            },
        ],
        entries,
        legacy_action_ids: super::actions::AGENT_ACTION_IDS.to_vec(),
    }
}

fn legacy_entry_dto(a: &AgentActionDef) -> CatalogEntryDto {
    let mut channels: Vec<String> = a
        .allowed_triggers
        .iter()
        .map(|s| (*s).to_string())
        .collect();
    if !channels.iter().any(|c| c == "softPad") {
        channels.push("softPad".into());
    }
    CatalogEntryDto {
        id: a.id.to_string(),
        layer: ActionLayer::LegacyCompat.as_str().to_string(),
        category: ActionCategory::Agent.as_str().to_string(),
        label_zh: a.label.zh.to_string(),
        label_en: a.label.en.to_string(),
        risk: a.risk_level.as_str().to_string(),
        channels,
        camera_direct_forbidden: false,
        implemented: true,
        executor: "agentAdapter".into(),
        legacy: true,
        available_when: AW_IDLE.to_vec(),
        requires_second_channel_from: REQ_NONE.to_vec(),
        provider_scope: "providerAdapter",
    }
}

/// Known in semantic meta OR legacy execute catalog (after alias resolve).
pub fn is_known_action_id(canonical_or_legacy: &str) -> bool {
    semantic_meta_by_id(canonical_or_legacy).is_some() || action_by_id(canonical_or_legacy).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn soft_pad_is_formal_channel() {
        assert!(ALL_CHANNELS.contains(&ActionChannel::SoftPad));
        let dto = public_catalog_dto();
        assert!(dto.channels.contains(&"softPad"));
    }

    #[test]
    fn camera_can_bind_send_approve_but_pending_disposition() {
        let send = semantic_meta_by_id("input.send").unwrap();
        let approve = semantic_meta_by_id("agent.approve").unwrap();
        assert!(channel_allowed(send, ActionChannel::Camera));
        assert!(channel_allowed(approve, ActionChannel::Camera));
        assert_eq!(
            route_disposition(send, ActionChannel::Camera),
            RouteDisposition::PendingConfirmation
        );
        assert_eq!(
            route_disposition(approve, ActionChannel::Camera),
            RouteDisposition::PendingConfirmation
        );
        assert_eq!(
            route_disposition(send, ActionChannel::Key),
            RouteDisposition::Execute
        );
        assert!(!camera_may_execute_directly("input.send"));
        assert!(!camera_may_execute_directly("agent.approve"));
        let dto = public_catalog_dto();
        let send_e = dto.entries.iter().find(|e| e.id == "input.send").unwrap();
        assert!(send_e.camera_direct_forbidden);
        assert!(send_e.channels.iter().any(|c| c == "camera"));
    }

    #[test]
    fn route_disposition_follows_requires_second_channel_only() {
        let cancel = semantic_meta_by_id("input.cancel").unwrap();
        assert_eq!(
            route_disposition(cancel, ActionChannel::Camera),
            RouteDisposition::Execute
        );
        assert!(camera_may_execute_directly("input.cancel"));
    }

    #[test]
    fn stop_or_send_alias_depends_on_finish_policy() {
        assert_eq!(
            resolve_canonical_action_id("stopOrSendDictation", FinishPolicy::Commit),
            "input.commit"
        );
        assert_eq!(
            resolve_canonical_action_id("stopOrSendDictation", FinishPolicy::Send),
            "input.send"
        );
        assert_eq!(
            resolve_canonical_action_id("startDictation", FinishPolicy::Commit),
            "input.start"
        );
        assert_eq!(
            resolve_canonical_action_id("openAgent", FinishPolicy::Commit),
            "agent.focus"
        );
    }

    #[test]
    fn no_choice_select_explosion() {
        let dto = public_catalog_dto();
        assert!(dto.entries.iter().any(|e| e.id == "choice.select"));
        assert!(!dto.entries.iter().any(|e| {
            e.id.starts_with("choice.select") && e.id != "choice.select"
        }));
        for i in 1..10 {
            let bogus = format!("choice.select{i}");
            assert!(
                semantic_meta_by_id(&bogus).is_none(),
                "must not define {bogus}"
            );
        }
    }

    #[test]
    fn feature_gates_bfinal_dynamic_on() {
        assert!(FEATURE_DYNAMIC_CONTEXT_ACTIONS);
        assert!(FEATURE_ACTION_PICKER_UI);
    }
}
