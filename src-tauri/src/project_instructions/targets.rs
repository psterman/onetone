//! 输出目标定义。渲染器是 IR → 格式的纯函数；加一个目标 = 加一条定义。

#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetDef {
    pub id: &'static str,
    pub label: &'static str,
    pub relative_path: &'static str,
    /// "agents_md" | "cursor_mdc"
    pub kind: &'static str,
}

pub const TARGET_AGENTS_MD: &str = "agents_md";
pub const TARGET_CURSOR_MDC: &str = "cursor_mdc";

/// v1 只有两个目标：公共主文件 + Cursor 薄适配。
/// CLAUDE.md / GEMINI.md 是可选目标——Claude Code 2.1.277+ 在没有 CLAUDE.md 时
/// 原生读 AGENTS.md；只有存在「该 Agent 专属段」时才需要建（v1 不做）。
pub const TARGETS: &[TargetDef] = &[
    TargetDef {
        id: TARGET_AGENTS_MD,
        label: "AGENTS.md（公共主文件）",
        relative_path: "AGENTS.md",
        kind: TARGET_AGENTS_MD,
    },
    TargetDef {
        id: TARGET_CURSOR_MDC,
        label: "Cursor 规则",
        relative_path: ".cursor/rules/onetone-project.mdc",
        kind: TARGET_CURSOR_MDC,
    },
];
