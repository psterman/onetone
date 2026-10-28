# Phase2 RC — 预检门与分层状态

> **产品状态：Phase2 RC（候选发布版）— 桌面 A/B 已人工通过；远程 C 保持 skipped**  
> 工程材料入口（「添加工程材料」）仅在 Phase2.0 预检通过 **且** `localStorage onetone.projectContext.enabled=1` 时对用户可见。  
> 详细验收清单：[phase2-rc-acceptance.md](./phase2-rc-acceptance.md)

## 分层状态（勿合并解读）

```text
Phase2 implementation: passed
Phase2 automated verification: passed
Phase2.0 preflight gate: passed
Phase2 local desktop verification: passed
Phase2 remote organize verification: skipped
Phase2 release acceptance: passed
```

| 可以说 | 不可以说 |
| --- | --- |
| 实现 + 自动化 + 桌面 A/B 真机点通 | 真实提供商整理已验证 |
| RC 在「C skipped」约定下可发布候选 | Phase2 含远程整理的完整产品已验收 |
| 本地工程材料 / 有限证据 / 无模型直发已实现 | NSIS 打包路径已验收（仍可选） |

## Phase2.0 预检门（七项）

| # | 条件 | 状态 |
| --- | --- | --- |
| 1 | Assist IPC `args` 包装 | **通过** — `npm run test:home-assist-ipc-contract`；`home-assist-client.js` 统一 `{ args }` |
| 2 | Project Context capability 仅 main | **通过** — `capabilities/project-context-main.json` windows=`["main"]` |
| 3 | 目录选择仅原生 dialog，禁止手输开 scope | **通过** — `open_with_dialog`；无路径字符串授权 |
| 4 | Windows junction / ADS / `../` / 前缀碰撞 | **通过** — `cargo test --lib project_context`（含 junction 实测） |
| 5 | 无 key / 无模型仍可直接发送 | **通过** — Phase1 直发路径；真机直发已点通 |
| 6 | Feature flag 默认关闭 | **通过** — 入口 `hidden` unless `onetone.projectContext.enabled=1` |
| 7 | Phase1 回归 | **通过** — ownership / ipc-contract / ui-checklist / prompt-prep / home-agent-v2 |

## 自动化 vs 真机

- `npm run verify:phase2-rc`：自动化层（2026-10-28 复验全绿）。
- 桌面 A/B：操作员主窗口引导九步全绿（2026-10-28）— 见 [phase2-rc-acceptance.md](./phase2-rc-acceptance.md)。
- 远程 C：无费用/提供商授权 → **skipped**。

## task_organize 验证分层

```text
task_organize: implemented
local/fake transport: verified
real provider: skipped
```

## 构建卫生（发布验收前）

- [x] `cargo check --no-default-features` 通过（2026-10-28）
- [x] `cargo build --no-default-features` 通过（含后续假死修复 / serde camelCase 重建）
- [x] `project-context-main.json` 仅 `main`
- [x] 启动后原生 dialog / Git / 非 Git 降级真机确认（引导台）
- [ ] NSIS 打包路径（可选，非 RC 硬门禁）

## 复验摘要（2026-10-28）

- 自动化：`npm run verify:phase2-rc` **ok**（含 `project_context` 11 tests）
- 桌面引导九步：**全绿**（目录 / 读片段 / adopt / 直发 / stale / Git unstaged / 非 Git 降级 / 截图）
- 远程 C：**skipped**
- Release acceptance：**passed**（A+B 人工通过 + C 约定跳过；debug exe，非 NSIS）
