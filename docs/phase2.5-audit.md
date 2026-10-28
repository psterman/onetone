# Phase2.5 核对表（以代码为准）

> 开工基线：与 [phase2-gate-record.md](./phase2-gate-record.md) / [home-agent-capability-matrix.md](./home-agent-capability-matrix.md) 对齐。
>
> **产品结论：尚未标「Phase2.5 验收通过」。** 自动化已绿；桌面 A′ 人手证据未齐。

| 能力 | 状态 |
|------|------|
| rawDraft / organizedDraft / activeDraft 出站链 | 已有且可用 |
| adoptEvidence → Prep → outbound | 已有且可用 |
| Project Context open(dialog)/query/search/passport/git | 已有且可用 |
| Assist 仅 `task_organize` | 已有且可用（硬边界） |
| Soft Pad key；`no_free_model` | 已有；真实 provider 未验证 |
| Agent Center 诚实回执 | 已有且可用 |
| Home Focus「确认项目」 | 仅身份，不授予读盘 |
| 后端「查找材料」临时 grant | 已实现；`cargo test --lib project_context` **15 passed**（含授权后打开 / 根变更拒绝） |
| 流程 Skill / 会诊骨架 / suggested≠confirmed | 已实现；`npm run test:home-context-concierge` 绿 |
| Concierge 按需证据 | 已实现；候选须 adopt 才进 outbound |
| OCR | 缺失（不宣传） |
| 桌面 A′ / Git B′ / 远程 C′ | A′ **待操作员点验**；B′ 引用 Phase2（本轮未复测）；C′ **skipped** |

## 硬规则摘要

- 会诊结论等级：问题定义 → 调查方向 → 条件修改 → 验证结果
- 模型输出 = suggested；用户确认后 = user_confirmed
- `user_reported_resolved` ≠ `verified`
- 查找材料须后端 grant；无 grant 不得 `open_confirmed`

## 自动化核对（本机 · 2026-10-28）

- 绿：`npm run verify:phase2-rc`（含 `test:home-context-concierge` + `cargo test --lib project_context`）
- `project_context`：**15 passed**，含
  - `grant_then_open_confirmed_ok`
  - `open_confirmed_rejects_when_confirmed_root_changed`
  - `open_confirmed_without_grant_rejected`
  - `non_main_cannot_grant`
- `RC.EXE`：本机用 `C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64` 入 PATH（或设 `RC`）后 cargo 可编

## 桌面验收清单（人手 · 未标 passed）

**可视化点验台：** 主窗口按 `Ctrl+Shift+A` 打开验收台 → 默认 Tab **「2.5 A′」**。每步有操作按钮（开关 flag / 刷新 / 查找材料 / 澄清 / 确认…）+「本步通过」。截图仍用 `Win+Shift+S`，存 `docs/phase2.5-evidence/`。

前置：`src-tauri/target/debug/onetone.exe` 主窗口；也可用面板「开 flag」+「刷新」。

### A′ 会诊 + grant

| # | 步骤 | 期望 | 结果 |
|---|------|------|------|
| 1 | flag 开后 UI | 会诊条 +「为此项目查找材料」可见；复述文案诚实 | **部分证据** — [a-prime-main-20261028-171624.png](./phase2.5-evidence/a-prime-main-20261028-171624.png) 可见「修复问题 / 帮我说清楚问题 / 确认理解 / 生成检查单 / 为此项目查找材料」与「先复述问题…不臆测根因」；**未做 flag 关对照** |
| 2 | 仅 Home Focus 确认项目 | 未点「查找材料」确认前不得读工程候选 | 待点 |
| 3 | 确认查找材料 → 候选 → adopt | 未 adopt 不进发送正文；adopt 后进 Prep outbound | 待点 |
| 4 | 整理 → 确认理解 | brief 先 suggested；确认后 `user_confirmed`；无「诊断完成/已找到病因」 | 待点（文案「不臆测根因」已在截图出现） |
| 5 | 仅截图材料 | 不宣称 OCR / 不据此给根因 | 待点 |
| 6 | 证据 | 截图或操作记录 | 部分交：`docs/phase2.5-evidence/`；完整 A′ 仍缺 |

### B′ Git

- Phase2 RC 桌面 B 已于 2026-10-28 通过（见 [phase2-rc-acceptance.md](./phase2-rc-acceptance.md)）。
- 本轮未改 Git 证据路径 → **本轮未复测，引用 Phase2**。

### C′ 远程整理

- **skipped**（未授权真实提供商费用）。

### 回填规则

- 仅当 A′ 表全过 + 有截图/操作记录后，才可将本页结论改为：`Phase2.5 桌面验收：passed（日期；C skipped）`。
- 自动化绿 **不构成** 验收通过。
