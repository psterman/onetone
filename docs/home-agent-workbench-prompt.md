# 首页任务辅助工作台 — 开发 Prompt

> 可直接交给开发 Agent。  
> 产品主线：**把编程任务准备好、交接准、接续下去**（不是首页完整代码 Agent / 权限控制台）。  
> 能力矩阵：[home-agent-capability-matrix.md](./home-agent-capability-matrix.md)。

---

## 产品定位

OneTone 帮助用户整理材料、可选地用 Soft Pad 密钥调用 `task_organize`、把可编辑任务投递给选定编程 Agent，并记录诚实投递回执。

```text
用户输入或语音
→ 收集当前任务材料
→ 按需整理（task_organize）
→ 生成可预览、可编辑的 organizedDraft.body
→ 交给用户选定的编程 Agent
→ 保存投递回执（≠ 执行完成）
→ 下次继续
```

原则：

1. 明确任务可直接发送；整理是可选操作。
2. 工程理解只依据实际纳入的材料正文；路径不能冒充文件内容。
3. 免费调用仅接受经核实的零价模型或「仅赠送额度耗尽即停」的保证；余额查询不能推断免费。
4. 用户约束、关键错误、验收标准必须保留；用户编辑后的 body 是发送依据。
5. 投递、执行、验证是不同状态。
6. 分阶段交付可运行闭环。

## Phase1 状态

```text
Phase1 status: accepted
Assist Runtime: implemented
Task organize: implemented, conditionally ready
  local/fake transport: verified
  real provider: unverified
Free-only remote path: ready when eligible model exists
Direct send path: ready
Engineering context: Phase2 RC (flag default off; desktop pending)
```

已实现：

- `buildAssistInputSnapshot`（citeMode + sendScope）
- Assist Runtime：`cmd_assist_run` / `cmd_assist_cancel` / ready
- `rawDraft` / `organizedDraft` / `activeDraft`；迟到结果与 editGeneration 守卫
- 首页「整理任务」+「允许计量额度」勾选 +「密钥」入口 +「直接发送」；失败提示含原因与下一步（禁止裸「整理失败」）
- 回执绑并展示 snapshotId；异步取消 / deadline / 轮换；fake transport 单测

发布前：`npm run test:home-assist-ui-checklist`（**模拟**，≠ 真机点击）；真机走通收集→整理/发送→回执仍待补；确认 `no_free_model` 与「允许计量额度」入口清楚。

仍明确未完成：真实远程整理、真机截图 / 八步点击、Phase2 桌面真机验收、Phase3 接续记忆 / Skill 导出。

## Phase2 RC（selective materials）

```text
Phase2 implementation: passed
Phase2 automated verification: passed
Phase2.0 preflight gate: passed
Phase2 local desktop verification: pending
Phase2 remote organize verification: pending
Phase2 release acceptance: pending

Product status: Phase2 RC — 等待桌面真机验收
```

工程材料入口文案：**添加工程材料**（非「读取项目」）。能力：选定文件片段、项目名片（根白名单）、Git 变更摘要/有限 patch、有限字面搜索；经 Prep 出站。Feature flag：`localStorage onetone.projectContext.enabled=1`。绝对路径永不进 prompt。

- 自动化：`npm run test:home-project-context`；`cargo test --manifest-path src-tauri/Cargo.toml --lib project_context --no-default-features`；`npm run test:home-assist-ipc-contract`
- 预检与分层状态：[phase2-gate-record.md](./phase2-gate-record.md)
- 真机清单 A/B/C：[phase2-rc-acceptance.md](./phase2-rc-acceptance.md)

`task_organize`：`implemented`；本地假传输已验证；**真实提供商未验证**（本地通过 ≠ 远程调用成功）。

## Phase3（not_wired）

结构化接续记忆、流程 / SKILL.md 导出。

## 实现约束摘要

- Assist 只返回结果，不改草稿/投递状态。
- 取消与 HTTP、deadline 竞争；本地取消不保证停计费。
- 用户编辑 organized body 后禁止用 structured 重渲覆盖。
- 材料变化后整理稿标 stale；发送前提示。
- `task_organize`：`implemented` 与 `ready` 分开；不得因整理把 `read_project` 标 available。

## 验证

- `npm run test:home-assist-ownership`
- `npm run test:home-assist-ui-checklist`
- `npm run test:home-prompt-prep` / `npm run test:home-agent-v2`
- `cargo test --manifest-path src-tauri/Cargo.toml --lib assist_runtime`
- 真实首页：收集 → 整理或直接发送 → 回执；外部 API 不可用时区分已验证 / 模拟 / 未验证。

## 相关代码

- FE：`home-assist-ownership.js`、`home-assist-client.js`、`home-prompt-prep.js`、`home-agent-v2.js`
- BE：`src-tauri/src/assist_runtime/`
- Soft Pad 密钥：`soft_pad_quota::read_stored_key`
