//! Provider-agnostic AgentAction catalog.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskLevel {
    Safe,
    Confirm,
    Dangerous,
}

impl RiskLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Safe => "safe",
            Self::Confirm => "confirm",
            Self::Dangerous => "dangerous",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionMode {
    Execute,
    InsertOnly,
    ConfirmThenExecute,
}

impl ExecutionMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Execute => "execute",
            Self::InsertOnly => "insertOnly",
            Self::ConfirmThenExecute => "confirmThenExecute",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim() {
            "execute" => Some(Self::Execute),
            "insertOnly" => Some(Self::InsertOnly),
            "confirmThenExecute" => Some(Self::ConfirmThenExecute),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transport {
    Workflow,
    Hotkey,
    DeepLink,
    InsertText,
    Unsupported,
}

impl Transport {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Workflow => "workflow",
            Self::Hotkey => "hotkey",
            Self::DeepLink => "deepLink",
            Self::InsertText => "insertText",
            Self::Unsupported => "unsupported",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderSupport {
    Native,
    Workflow,
    Hotkey,
    DeepLink,
    InsertOnly,
    Unsupported,
}

impl ProviderSupport {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Native => "native",
            Self::Workflow => "workflow",
            Self::Hotkey => "hotkey",
            Self::DeepLink => "deepLink",
            Self::InsertOnly => "insertOnly",
            Self::Unsupported => "unsupported",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActivationScope {
    /// Usable from any foreground app (summon / start dictation / cancel).
    Global,
    /// Only when Codex (or matching provider app) is foreground.
    ForegroundApp,
}

impl ActivationScope {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Global => "global",
            Self::ForegroundApp => "foregroundApp",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim() {
            "global" => Some(Self::Global),
            "foregroundApp" => Some(Self::ForegroundApp),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct LocalizedText {
    pub zh: &'static str,
    pub en: &'static str,
}

#[derive(Debug, Clone, Copy)]
pub struct AgentActionDef {
    pub id: &'static str,
    pub label: LocalizedText,
    pub description: LocalizedText,
    pub risk_level: RiskLevel,
    pub allowed_triggers: &'static [&'static str],
    pub default_execution_mode: ExecutionMode,
    pub default_voice_phrases: LocalizedText,
    pub transport: Transport,
    pub codex_support: ProviderSupport,
    pub default_activation_scope: ActivationScope,
}

pub const AGENT_ACTION_IDS: &[&str] = &[
    "openAgent",
    "focusComposer",
    "startDictation",
    "stopOrSendDictation",
    "cancel",
    "newThread",
    "undo",
    "quickSearch",
    "quickChat",
    "commandPalette",
    "openReviewTab",
    "toggleReviewPanel",
    "toggleSidebar",
    "openSettings",
    "navBack",
    "navForward",
    "openTerminal",
    "toggleBrowserPanel",
    "newBrowserTab",
    "focusBrowserAddressBar",
    "status",
    "plan",
    "review",
    "permissions",
    "switchAgent",
    "claudeModel",
    "switchModel",
    "appsOrPlugins",
];

// Future (not in default 13 / not enabled): acceptChanges, rejectOutput, approvePermissions,
// yoloMode, reasoningLevel — keep out of P0 catalog entries below.

const ACTIONS: &[AgentActionDef] = &[
    AgentActionDef {
        id: "openAgent",
        label: LocalizedText {
            zh: "召唤 Codex",
            en: "Summon Codex",
        },
        description: LocalizedText {
            zh: "打开并聚焦 Codex 输入框",
            en: "Open and focus the Codex composer",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice", "camera"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "打开 Codex",
            en: "open Codex",
        },
        transport: Transport::Workflow,
        codex_support: ProviderSupport::Workflow,
        default_activation_scope: ActivationScope::Global,
    },
    AgentActionDef {
        id: "focusComposer",
        label: LocalizedText {
            zh: "聚焦输入框",
            en: "Focus composer",
        },
        description: LocalizedText {
            zh: "聚焦 Codex 输入框，不启动语音",
            en: "Focus the Codex composer without starting voice",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice", "camera"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "聚焦输入框",
            en: "focus composer",
        },
        transport: Transport::Workflow,
        codex_support: ProviderSupport::Workflow,
        default_activation_scope: ActivationScope::Global,
    },
    AgentActionDef {
        id: "startDictation",
        label: LocalizedText {
            zh: "开始说话",
            en: "Start talking",
        },
        description: LocalizedText {
            zh: "发送 Codex 开始听写快捷键 Ctrl+Shift+D",
            en: "Send Codex Start dictation shortcut Ctrl+Shift+D",
        },
        risk_level: RiskLevel::Confirm,
        allowed_triggers: &["key", "voice", "camera"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "开始说话",
            en: "start talking",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::Global,
    },
    AgentActionDef {
        id: "stopOrSendDictation",
        label: LocalizedText {
            zh: "结束或发送",
            en: "Stop or send",
        },
        description: LocalizedText {
            zh: "按当前结束策略停止或发送语音输入",
            en: "Stop or send dictation using current finish policy",
        },
        risk_level: RiskLevel::Confirm,
        allowed_triggers: &["key", "voice", "camera"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "结束输入",
            en: "stop dictation",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "cancel",
        label: LocalizedText {
            zh: "取消",
            en: "Cancel",
        },
        description: LocalizedText {
            zh: "发送 Esc 取消当前操作",
            en: "Send Escape to cancel",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice", "camera"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "取消",
            en: "cancel",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::Global,
    },
    AgentActionDef {
        id: "newThread",
        label: LocalizedText {
            zh: "上下文",
            en: "Context",
        },
        description: LocalizedText {
            zh: "新建对话上下文",
            en: "Start a new chat context",
        },
        risk_level: RiskLevel::Confirm,
        allowed_triggers: &["key", "voice", "camera"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "新建对话",
            en: "new chat",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "undo",
        label: LocalizedText {
            zh: "撤销",
            en: "Undo",
        },
        description: LocalizedText {
            zh: "发送 Ctrl+Z 撤销",
            en: "Send Ctrl+Z to undo",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "撤销",
            en: "undo",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "quickSearch",
        label: LocalizedText {
            zh: "快速搜索",
            en: "Quick search",
        },
        description: LocalizedText {
            zh: "发送 Ctrl+F 打开搜索",
            en: "Send Ctrl+F to search",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "搜索",
            en: "search",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "quickChat",
        label: LocalizedText {
            zh: "快速聊天",
            en: "Quick chat",
        },
        description: LocalizedText {
            zh: "打开快速聊天",
            en: "Open quick chat",
        },
        risk_level: RiskLevel::Confirm,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "快速聊天",
            en: "quick chat",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "commandPalette",
        label: LocalizedText {
            zh: "命令菜单",
            en: "Command palette",
        },
        description: LocalizedText {
            zh: "打开命令菜单",
            en: "Open the command palette",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice", "camera"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "打开命令菜单",
            en: "open command palette",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "openReviewTab",
        label: LocalizedText {
            zh: "打开审查选项卡",
            en: "Open review tab",
        },
        description: LocalizedText {
            zh: "发送 Ctrl+Shift+G 打开审查选项卡（入口）",
            en: "Send Ctrl+Shift+G to open the review tab (entry)",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "打开审查",
            en: "open review tab",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "toggleReviewPanel",
        label: LocalizedText {
            zh: "显示/隐藏当前聊天审阅面板",
            en: "Toggle review panel",
        },
        description: LocalizedText {
            zh: "发送 Ctrl+Alt+B 切换当前聊天审阅面板（入口）",
            en: "Send Ctrl+Alt+B to toggle the current-chat review panel (entry)",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "切换审阅面板",
            en: "toggle review panel",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "toggleSidebar",
        label: LocalizedText {
            zh: "切换边栏",
            en: "Toggle sidebar",
        },
        description: LocalizedText {
            zh: "发送 Ctrl+B 显示或隐藏边栏",
            en: "Send Ctrl+B to show or hide the sidebar",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "切换边栏",
            en: "toggle sidebar",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "openSettings",
        label: LocalizedText {
            zh: "打开设置",
            en: "Open settings",
        },
        description: LocalizedText {
            zh: "聚焦 Codex 后发送 Ctrl+, 打开设置（先离开输入法）",
            en: "Focus Codex then send Ctrl+, to open settings (clear IME first)",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "打开设置",
            en: "open settings",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "navBack",
        label: LocalizedText {
            zh: "返回",
            en: "Go back",
        },
        description: LocalizedText {
            zh: "发送 Ctrl+[ 在导航历史中后退",
            en: "Send Ctrl+[ to go back in navigation history",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "返回",
            en: "go back",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "navForward",
        label: LocalizedText {
            zh: "前进",
            en: "Go forward",
        },
        description: LocalizedText {
            zh: "发送 Ctrl+] 在导航历史中前进",
            en: "Send Ctrl+] to go forward in navigation history",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "前进",
            en: "go forward",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "openTerminal",
        label: LocalizedText {
            zh: "打开终端",
            en: "Open terminal",
        },
        description: LocalizedText {
            zh: "发送 Ctrl+` 打开终端面板（入口）",
            en: "Send Ctrl+` to open the terminal panel (entry)",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "打开终端",
            en: "open terminal",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "toggleBrowserPanel",
        label: LocalizedText {
            zh: "显示/隐藏浏览器面板",
            en: "Toggle browser panel",
        },
        description: LocalizedText {
            zh: "发送 Ctrl+Shift+B 切换浏览器面板（入口）",
            en: "Send Ctrl+Shift+B to toggle the browser panel (entry)",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "切换浏览器面板",
            en: "toggle browser panel",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "newBrowserTab",
        label: LocalizedText {
            zh: "打开浏览器标签",
            en: "New browser tab",
        },
        description: LocalizedText {
            zh: "发送 Ctrl+T 打开浏览器标签（入口）",
            en: "Send Ctrl+T to open a browser tab (entry)",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "打开浏览器标签",
            en: "new browser tab",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "focusBrowserAddressBar",
        label: LocalizedText {
            zh: "聚焦浏览器地址栏",
            en: "Focus browser address bar",
        },
        description: LocalizedText {
            zh: "发送 Ctrl+L 聚焦应用内浏览器地址栏（入口）",
            en: "Send Ctrl+L to focus the in-app browser address bar (entry)",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "聚焦地址栏",
            en: "focus address bar",
        },
        transport: Transport::Hotkey,
        codex_support: ProviderSupport::Hotkey,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "status",
        label: LocalizedText {
            zh: "查看状态",
            en: "Status",
        },
        description: LocalizedText {
            zh: "在输入框插入 /status（不自动发送）",
            en: "Insert /status into the composer (no Enter)",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice", "camera"],
        default_execution_mode: ExecutionMode::InsertOnly,
        default_voice_phrases: LocalizedText {
            zh: "查看状态",
            en: "show status",
        },
        transport: Transport::InsertText,
        codex_support: ProviderSupport::InsertOnly,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "plan",
        label: LocalizedText {
            zh: "制定计划",
            en: "Plan",
        },
        description: LocalizedText {
            zh: "在输入框插入 /plan（不自动发送）",
            en: "Insert /plan into the composer (no Enter)",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::InsertOnly,
        default_voice_phrases: LocalizedText {
            zh: "制定计划",
            en: "make a plan",
        },
        transport: Transport::InsertText,
        codex_support: ProviderSupport::InsertOnly,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "review",
        label: LocalizedText {
            zh: "审查",
            en: "Review",
        },
        description: LocalizedText {
            zh: "在输入框插入 /review（不自动发送）",
            en: "Insert /review into the composer (no Enter)",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::InsertOnly,
        default_voice_phrases: LocalizedText {
            zh: "开始审查",
            en: "start review",
        },
        transport: Transport::InsertText,
        codex_support: ProviderSupport::InsertOnly,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "permissions",
        label: LocalizedText {
            zh: "权限",
            en: "Permissions",
        },
        description: LocalizedText {
            zh: "在输入框插入 /permissions（不自动发送）",
            en: "Insert /permissions into the composer (no Enter)",
        },
        risk_level: RiskLevel::Confirm,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::InsertOnly,
        default_voice_phrases: LocalizedText {
            zh: "打开权限",
            en: "open permissions",
        },
        transport: Transport::InsertText,
        codex_support: ProviderSupport::InsertOnly,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "switchAgent",
        label: LocalizedText {
            zh: "切换 Agent",
            en: "Switch agent",
        },
        description: LocalizedText {
            zh: "在输入框插入 /agent（不自动发送）",
            en: "Insert /agent into the composer (no Enter)",
        },
        risk_level: RiskLevel::Confirm,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::InsertOnly,
        default_voice_phrases: LocalizedText {
            zh: "切换助手",
            en: "switch agent",
        },
        transport: Transport::InsertText,
        codex_support: ProviderSupport::InsertOnly,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "claudeModel",
        label: LocalizedText {
            zh: "Claude 模型",
            en: "Claude model",
        },
        description: LocalizedText {
            zh: "聚焦 Claude；已前台时插入 /model（不自动发送）",
            en: "Focus Claude; if already foreground, insert /model (no Enter)",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::Execute,
        default_voice_phrases: LocalizedText {
            zh: "切换 Claude 模型",
            en: "claude model",
        },
        transport: Transport::Workflow,
        codex_support: ProviderSupport::Workflow,
        default_activation_scope: ActivationScope::Global,
    },
    AgentActionDef {
        id: "switchModel",
        label: LocalizedText {
            zh: "切换模型",
            en: "Switch model",
        },
        description: LocalizedText {
            zh: "在 Codex 输入框插入 /model（不自动发送）",
            en: "Insert /model into the Codex composer (no Enter)",
        },
        risk_level: RiskLevel::Confirm,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::InsertOnly,
        default_voice_phrases: LocalizedText {
            zh: "切换模型",
            en: "switch model",
        },
        transport: Transport::InsertText,
        codex_support: ProviderSupport::InsertOnly,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
    AgentActionDef {
        id: "appsOrPlugins",
        label: LocalizedText {
            zh: "应用与插件",
            en: "Apps",
        },
        description: LocalizedText {
            zh: "在输入框插入 /apps（不自动发送）",
            en: "Insert /apps into the composer (no Enter)",
        },
        risk_level: RiskLevel::Safe,
        allowed_triggers: &["key", "voice"],
        default_execution_mode: ExecutionMode::InsertOnly,
        default_voice_phrases: LocalizedText {
            zh: "打开应用",
            en: "open apps",
        },
        transport: Transport::InsertText,
        codex_support: ProviderSupport::InsertOnly,
        default_activation_scope: ActivationScope::ForegroundApp,
    },
];

pub fn all_actions() -> &'static [AgentActionDef] {
    ACTIONS
}

pub fn action_by_id(id: &str) -> Option<&'static AgentActionDef> {
    let id = id.trim();
    ACTIONS.iter().find(|a| a.id == id)
}

pub fn activation_scope_for(action_id: &str) -> ActivationScope {
    action_by_id(action_id)
        .map(|a| a.default_activation_scope)
        .unwrap_or(ActivationScope::ForegroundApp)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_covers_expected_ids() {
        for id in AGENT_ACTION_IDS {
            assert!(action_by_id(id).is_some(), "missing action {id}");
        }
        assert_eq!(ACTIONS.len(), AGENT_ACTION_IDS.len());
    }

    #[test]
    fn essentials_are_global_or_safe_foreground() {
        assert_eq!(
            action_by_id("openAgent").unwrap().default_activation_scope,
            ActivationScope::Global
        );
        assert_eq!(
            action_by_id("startDictation")
                .unwrap()
                .default_activation_scope,
            ActivationScope::Global
        );
        assert_eq!(
            action_by_id("cancel").unwrap().default_activation_scope,
            ActivationScope::Global
        );
        assert_eq!(
            action_by_id("status").unwrap().default_activation_scope,
            ActivationScope::ForegroundApp
        );
    }
}
