//! Context Snapshot — 跨传感器统一状态模型（Phase 1）。
//!
//! 设计原则：**不新增真相，只做投影**。
//! 本模块不拥有任何状态，它把已有的各源投影成一份原子快照，供 UI 与
//! Automation Engine 消费。禁止在此模块内缓存业务状态。
//!
//! 分层（禁止跨层直连）：
//! ```text
//! Evidence（各源事实）→ Context（本模块）→ Decision → Action
//! ```
//!
//! Phase 1 接入：AttentionState / ForegroundEvidence / TmStatus / InputObs。
//! Phase 2 起：PresenceEvidence（摄像头）接入，presence 将压过其余全部维度。

use serde::Serialize;

/// 快照版本。字段语义变更时递增，消费方可据此判断兼容性。
pub const CONTEXT_SNAPSHOT_VERSION: u32 = 1;

// ---------------------------------------------------------------------------
// 证据层：各源事实的最小投影
// ---------------------------------------------------------------------------

/// 在场证据。Phase 2 由摄像头上报；当前恒为 `Unknown`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PresenceEvidence {
    /// 人不在摄像头范围内。
    Away,
    /// 人在。
    Here,
    /// 传感器不可用或数据过期。**默认值**——宁可不知道，不可猜错。
    #[default]
    Unknown,
}

impl PresenceEvidence {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Here => "here",
            Self::Away => "away",
            Self::Unknown => "unknown",
        }
    }
}

impl From<super::presence::Presence> for PresenceEvidence {
    fn from(p: super::presence::Presence) -> Self {
        match p {
            super::presence::Presence::Here => Self::Here,
            super::presence::Presence::Away => Self::Away,
            super::presence::Presence::Unknown => Self::Unknown,
        }
    }
}

// ---------------------------------------------------------------------------
// 上下文维度
// ---------------------------------------------------------------------------

/// 人在不在。**最高优先级维度**：人不在时其余维度一律降级为不可见。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PresenceState {
    Here,
    Away,
    /// 传感器未接入。**不得推断为 Here 或 Away**——宁可不知道，不可猜错。
    Unknown,
}

impl PresenceState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Here => "here",
            Self::Away => "away",
            Self::Unknown => "unknown",
        }
    }

    pub fn from_evidence(e: PresenceEvidence) -> Self {
        match e {
            PresenceEvidence::Here => Self::Here,
            PresenceEvidence::Away => Self::Away,
            PresenceEvidence::Unknown => Self::Unknown,
        }
    }
}

/// 在做什么。由前台应用 + 代码库状态 + AI 活动联合推断。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ActivityState {
    /// 正在写代码：有 git 仓库且有改动，或前台是编辑器且 AI 忙碌。
    Coding,
    /// 在读/在看，前台是文档或浏览器。
    Reading,
    /// 会议中：检测到会议应用或多人同框。
    Meeting,
    /// 在但不活跃。
    Idle,
    Unknown,
}

impl ActivityState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Coding => "coding",
            Self::Reading => "reading",
            Self::Meeting => "meeting",
            Self::Idle => "idle",
            Self::Unknown => "unknown",
        }
    }
}

/// 专注程度。**Phase 1 只给保守结论**——不做评分，只给「可打断 / 不宜打断」。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FocusState {
    /// 不宜打断。
    DeepWork,
    /// 正常。
    Normal,
    /// 已分心。
    Distracted,
    Unknown,
}

impl FocusState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::DeepWork => "deepWork",
            Self::Normal => "normal",
            Self::Distracted => "distracted",
            Self::Unknown => "unknown",
        }
    }

    /// 是否允许弹窗打断。人不在时恒为 false。
    pub fn may_interrupt(self) -> bool {
        !matches!(self, Self::DeepWork)
    }
}

/// AI 助手状态。直接由 `AttentionPublicSnapshot` 投影，不重复定义真相。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentContextState {
    /// 归一化后的统一态。
    pub state: AgentState,
    /// 正在等待你处理的 Agent（如 "codex"）。
    pub waiting_agent: Option<String>,
    /// 等待的具体类型，沿用 `NeedsInputKind` 字符串。
    pub waiting_kind: Option<String>,
    /// 是否正在运行。
    pub busy: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentState {
    Working,
    NeedsInput,
    Complete,
    Error,
    Idle,
    Unknown,
}

impl AgentState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Working => "working",
            Self::NeedsInput => "needsInput",
            Self::Complete => "complete",
            Self::Error => "error",
            Self::Idle => "idle",
            Self::Unknown => "unknown",
        }
    }
}

/// 环境：前台与多屏。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentState {
    /// 前台是否为 OneTone 管理的 Agent。
    pub foreground_is_agent: bool,
    /// 命中的习惯目标 id（如 `cursor-chat`）。
    pub app_target_id: Option<String>,
    /// 前台是外部应用（非 OneTone、非 Agent、非托盘噪声）。
    pub foreign_host: bool,
}

impl Default for EnvironmentState {
    fn default() -> Self {
        Self {
            foreground_is_agent: false,
            app_target_id: None,
            foreign_host: false,
        }
    }
}

/// 隐私相关上下文。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyState {
    /// 人不在场时是否应处于保护态。
    pub shielded: bool,
    /// 麦克风是否应保持静音。
    pub mic_muted: bool,
}

/// 代码库上下文（来自 TmStatus 投影）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoState {
    pub is_git: bool,
    /// 有未提交改动。
    pub dirty: bool,
    pub changed_count: u32,
    /// AI 正在操作该仓库。
    pub agent_busy: bool,
}

impl Default for RepoState {
    fn default() -> Self {
        Self {
            is_git: false,
            dirty: false,
            changed_count: 0,
            agent_busy: false,
        }
    }
}

// ---------------------------------------------------------------------------
// 快照
// ---------------------------------------------------------------------------

/// 跨传感器原子快照。
///
/// **一致性契约**：所有维度来自同一次求值，读到的时间点一致。
/// 任何消费方都应只读本快照，不要回头去问单个数据源。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSnapshot {
    pub version: u32,
    /// 单调递增的求值序号。
    pub revision: u64,
    /// 墙钟毫秒，仅用于展示；不用于仲裁。
    pub observed_at_ms: u64,

    pub presence: PresenceState,
    pub activity: ActivityState,
    pub focus: FocusState,
    pub agent: AgentContextState,
    pub environment: EnvironmentState,
    pub repo: RepoState,
    pub privacy: PrivacyState,

    /// 本次求值实际用到的源。缺席的源意味着该维度是 Unknown 而非默认值。
    pub sources: Vec<&'static str>,
    /// 人不在时为 true：任何可见性动作都应被抑制。
    pub suppress_visible_interrupts: bool,
}

impl ContextSnapshot {
    /// 构造一份「什么都不��」的快照。仅在所有源均不可用时使用。
    pub fn empty(now_ms: u64) -> Self {
        Self {
            version: CONTEXT_SNAPSHOT_VERSION,
            revision: 0,
            observed_at_ms: now_ms,
            presence: PresenceState::Unknown,
            activity: ActivityState::Unknown,
            focus: FocusState::Unknown,
            agent: AgentContextState {
                state: AgentState::Unknown,
                waiting_agent: None,
                waiting_kind: None,
                busy: false,
            },
            environment: EnvironmentState::default(),
            repo: RepoState::default(),
            privacy: PrivacyState {
                shielded: false,
                mic_muted: false,
            },
            sources: Vec::new(),
            suppress_visible_interrupts: false,
        }
    }

    /// 面向用户的当前处境描述。
    /// 优先讲「发生什么」，不讲「检测到什么」——用户不需要知道底层信号。
    pub fn headline_zh(&self) -> &'static str {
        if self.presence == PresenceState::Away {
            return "你不在电脑前，已进入保护状态";
        }
        match (self.activity, self.agent.state) {
            (ActivityState::Coding, AgentState::Working) => "你在写代码，AI 正在运行",
            (ActivityState::Coding, AgentState::NeedsInput) => "你在写代码，AI 在等你批准",
            (ActivityState::Meeting, _) => "你在会议中",
            (ActivityState::Reading, _) => "你在阅读",
            (ActivityState::Idle, _) => "你在，但暂时没在做什么",
            _ => match self.agent.state {
                AgentState::NeedsInput => "有 AI 在等你处理",
                AgentState::Working => "AI 正在运行",
                AgentState::Error => "有任务出错了",
                _ => "空闲中",
            },
        }
    }

    /// 是否应该压住可见的打断（弹窗、声音、浮层）。
    /// 人不在 → 一定压。深度专注 → 压。其余 → 不压。
    pub fn should_suppress_interrupt(&self) -> bool {
        self.suppress_visible_interrupts || !self.focus.may_interrupt()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_snapshot_is_not_confident() {
        let s = ContextSnapshot::empty(0);
        assert_eq!(s.presence, PresenceState::Unknown);
        assert_eq!(s.activity, ActivityState::Unknown);
        assert!(s.sources.is_empty());
    }

    #[test]
    fn deep_work_blocks_interrupt() {
        let mut s = ContextSnapshot::empty(0);
        s.focus = FocusState::DeepWork;
        assert!(s.should_suppress_interrupt());
        s.focus = FocusState::Normal;
        assert!(!s.should_suppress_interrupt());
    }

    #[test]
    fn away_headline_says_protected() {
        let mut s = ContextSnapshot::empty(0);
        s.presence = PresenceState::Away;
        assert!(s.headline_zh().contains("保护"));
    }

    #[test]
    fn headline_mentions_ai_waiting() {
        let mut s = ContextSnapshot::empty(0);
        s.activity = ActivityState::Coding;
        s.agent.state = AgentState::NeedsInput;
        assert!(s.headline_zh().contains("等你"));
    }
}
