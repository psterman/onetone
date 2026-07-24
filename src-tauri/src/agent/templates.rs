//! Codex Micro 13 application-scenario template (OneTone recommended layout).

use super::actions::{action_by_id, ActivationScope, ExecutionMode};

pub const CODEX_MICRO_13_TEMPLATE_ID: &str = "codex-micro-13";
pub const CODEX_PROVIDER_ID: &str = "codex";

/// Newbie essentials — enabled by default after apply (3–5 items).
pub const ESSENTIAL_SLOT_IDS: &[&str] = &[
    "summonCodex",
    "pushToTalk",
    "cancel",
    "commandPalette",
    "status",
];

#[derive(Debug, Clone, Copy)]
pub struct AgentSlotDef {
    pub slot_id: &'static str,
    pub action_id: &'static str,
    /// Extra action chained after primary (e.g. focusComposer after openAgent).
    pub secondary_action_id: Option<&'static str>,
    pub execution_mode: ExecutionMode,
    pub activation_scope: ActivationScope,
    /// Slash text for insertOnly actions.
    pub insert_text: Option<&'static str>,
    pub label_zh: &'static str,
    pub label_en: &'static str,
}

#[derive(Debug, Clone, Copy)]
pub struct AgentTemplateDef {
    pub template_id: &'static str,
    pub provider_id: &'static str,
    pub app_target_id: &'static str,
    /// User-facing note: OneTone recommended, not official fixed layout.
    pub disclaimer_zh: &'static str,
    pub disclaimer_en: &'static str,
    pub slots: &'static [AgentSlotDef],
}

const CODEX_MICRO_13_SLOTS: &[AgentSlotDef] = &[
    AgentSlotDef {
        slot_id: "summonCodex",
        action_id: "openAgent",
        secondary_action_id: Some("focusComposer"),
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::Global,
        insert_text: None,
        label_zh: "召唤 Codex",
        label_en: "Summon Codex",
    },
    AgentSlotDef {
        slot_id: "pushToTalk",
        action_id: "startDictation",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::Global,
        insert_text: None,
        label_zh: "开始说话",
        label_en: "Start talking",
    },
    AgentSlotDef {
        slot_id: "stopOrSend",
        action_id: "stopOrSendDictation",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "结束或发送",
        label_en: "Stop or send",
    },
    AgentSlotDef {
        slot_id: "cancel",
        action_id: "cancel",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::Global,
        insert_text: None,
        label_zh: "取消",
        label_en: "Cancel",
    },
    AgentSlotDef {
        slot_id: "newThread",
        action_id: "newThread",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "上下文",
        label_en: "Context",
    },
    AgentSlotDef {
        slot_id: "undo",
        action_id: "undo",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "撤销",
        label_en: "Undo",
    },
    AgentSlotDef {
        slot_id: "quickSearch",
        action_id: "quickSearch",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "快速搜索",
        label_en: "Quick search",
    },
    AgentSlotDef {
        slot_id: "quickChat",
        action_id: "quickChat",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "快速聊天",
        label_en: "Quick chat",
    },
    AgentSlotDef {
        slot_id: "commandPalette",
        action_id: "commandPalette",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "命令菜单",
        label_en: "Command palette",
    },
    AgentSlotDef {
        slot_id: "openReviewTab",
        action_id: "openReviewTab",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "打开审查选项卡",
        label_en: "Open review tab",
    },
    AgentSlotDef {
        slot_id: "toggleReviewPanel",
        action_id: "toggleReviewPanel",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "显示/隐藏当前聊天审阅面板",
        label_en: "Toggle review panel",
    },
    AgentSlotDef {
        slot_id: "toggleSidebar",
        action_id: "toggleSidebar",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "切换边栏",
        label_en: "Toggle sidebar",
    },
    AgentSlotDef {
        slot_id: "openSettings",
        action_id: "openSettings",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "打开设置",
        label_en: "Open settings",
    },
    AgentSlotDef {
        slot_id: "navBack",
        action_id: "navBack",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "返回",
        label_en: "Go back",
    },
    AgentSlotDef {
        slot_id: "navForward",
        action_id: "navForward",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "前进",
        label_en: "Go forward",
    },
    AgentSlotDef {
        slot_id: "openTerminal",
        action_id: "openTerminal",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "打开终端",
        label_en: "Open terminal",
    },
    AgentSlotDef {
        slot_id: "toggleBrowserPanel",
        action_id: "toggleBrowserPanel",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "显示/隐藏浏览器面板",
        label_en: "Toggle browser panel",
    },
    AgentSlotDef {
        slot_id: "newBrowserTab",
        action_id: "newBrowserTab",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "打开浏览器标签",
        label_en: "New browser tab",
    },
    AgentSlotDef {
        slot_id: "focusBrowserAddressBar",
        action_id: "focusBrowserAddressBar",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: None,
        label_zh: "聚焦浏览器地址栏",
        label_en: "Focus browser address bar",
    },
    AgentSlotDef {
        slot_id: "status",
        action_id: "status",
        secondary_action_id: None,
        execution_mode: ExecutionMode::InsertOnly,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: Some("/status"),
        label_zh: "查看状态",
        label_en: "Status",
    },
    AgentSlotDef {
        slot_id: "plan",
        action_id: "plan",
        secondary_action_id: None,
        execution_mode: ExecutionMode::InsertOnly,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: Some("/plan"),
        label_zh: "制定计划",
        label_en: "Plan",
    },
    AgentSlotDef {
        slot_id: "review",
        action_id: "review",
        secondary_action_id: None,
        execution_mode: ExecutionMode::InsertOnly,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: Some("/review"),
        label_zh: "审查",
        label_en: "Review",
    },
    AgentSlotDef {
        slot_id: "permissions",
        action_id: "permissions",
        secondary_action_id: None,
        execution_mode: ExecutionMode::InsertOnly,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: Some("/permissions"),
        label_zh: "权限",
        label_en: "Permissions",
    },
    AgentSlotDef {
        slot_id: "switchAgent",
        action_id: "switchAgent",
        secondary_action_id: None,
        execution_mode: ExecutionMode::InsertOnly,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: Some("/agent"),
        label_zh: "切换 Agent",
        label_en: "Switch agent",
    },
    AgentSlotDef {
        slot_id: "claudeModel",
        action_id: "claudeModel",
        secondary_action_id: None,
        execution_mode: ExecutionMode::Execute,
        activation_scope: ActivationScope::Global,
        insert_text: Some("/model"),
        label_zh: "Claude 模型",
        label_en: "Claude model",
    },
    AgentSlotDef {
        slot_id: "switchModel",
        action_id: "switchModel",
        secondary_action_id: None,
        execution_mode: ExecutionMode::InsertOnly,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: Some("/model"),
        label_zh: "切换模型",
        label_en: "Switch model",
    },
    AgentSlotDef {
        slot_id: "appsOrPlugins",
        action_id: "appsOrPlugins",
        secondary_action_id: None,
        execution_mode: ExecutionMode::InsertOnly,
        activation_scope: ActivationScope::ForegroundApp,
        insert_text: Some("/apps"),
        label_zh: "应用与插件",
        label_en: "Apps",
    },
];

const CODEX_MICRO_13: AgentTemplateDef = AgentTemplateDef {
    template_id: CODEX_MICRO_13_TEMPLATE_ID,
    provider_id: CODEX_PROVIDER_ID,
    app_target_id: crate::app_chat_workflow::CODEX_APP_TARGET_ID,
    disclaimer_zh: "OneTone 推荐模板，非官方固定布局",
    disclaimer_en: "OneTone recommended layout — not an official fixed keymap",
    slots: CODEX_MICRO_13_SLOTS,
};

pub fn codex_micro_13_template() -> &'static AgentTemplateDef {
    &CODEX_MICRO_13
}

pub fn essential_slot_ids() -> &'static [&'static str] {
    ESSENTIAL_SLOT_IDS
}

pub fn slot_by_id(slot_id: &str) -> Option<&'static AgentSlotDef> {
    let id = slot_id.trim();
    CODEX_MICRO_13_SLOTS.iter().find(|s| s.slot_id == id)
}

pub fn is_essential_slot(slot_id: &str) -> bool {
    ESSENTIAL_SLOT_IDS.iter().any(|s| *s == slot_id.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_micro_13_has_expected_slots() {
        let t = codex_micro_13_template();
        assert_eq!(t.slots.len(), 23);
        assert_eq!(t.template_id, CODEX_MICRO_13_TEMPLATE_ID);
        assert_eq!(t.provider_id, CODEX_PROVIDER_ID);
        assert_eq!(t.app_target_id, "codex-chat");
        assert!(slot_by_id("claudeModel").is_some());
        assert!(slot_by_id("switchModel").is_some());
        assert!(slot_by_id("undo").is_some());
        assert!(slot_by_id("quickSearch").is_some());
        assert!(slot_by_id("openReviewTab").is_some());
        assert!(slot_by_id("openTerminal").is_some());
        assert!(slot_by_id("toggleBrowserPanel").is_some());
        assert_eq!(
            crate::agent::bindings_build::default_key_for_slot("openTerminal"),
            "Ctrl+`"
        );
        for slot in t.slots {
            assert!(
                action_by_id(slot.action_id).is_some(),
                "slot {} missing action {}",
                slot.slot_id,
                slot.action_id
            );
        }
    }

    #[test]
    fn essentials_are_subset_of_thirteen() {
        assert!(ESSENTIAL_SLOT_IDS.len() >= 3 && ESSENTIAL_SLOT_IDS.len() <= 5);
        for id in ESSENTIAL_SLOT_IDS {
            assert!(slot_by_id(id).is_some(), "essential missing: {id}");
            assert!(is_essential_slot(id));
        }
    }
}
