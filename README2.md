# README2

> OneTone ATR — 更新说明（基于最新情况）

本文档根据项目最新变更（CHANGELOG `[Unreleased]` 以及当前工作区已修改文件）整理，说明本次更新的主要内容。

## 本次更新说明

### 新增（Added）

- **Soft Pad 多供应商配额**：支持 Soft-Pad 保存的 OpenRouter / DeepSeek / Kimi / SiliconFlow 密钥（`soft_pad_quota`）；含 60s TTL 缓存 + 429 冷却 + 并行刷新；设置密钥时异步校验；迷你胶囊提供多供应商下拉与新鲜度指示点。
- **Copilot CLI Soft Pad 钩子**：通过共享 shell 探测/安装器实现 `copilot_cli_hook`；含开关切换与设置文档。
- **Gemini CLI Soft Pad 钩子（Phase 3）**：新增 `AgentKind::Gemini` / `gemini_hook`；标准化 BeforeTool/AfterTool/AfterAgent；当前仅 CLI（IDE 中途会话需另行测量）。
- **迷你栏（Mini bar）**：`VISIBLE_PAD=6` 带 `+N` 折叠；目录包含 Copilot/Gemini（灯未亮前为灰色占位）。
- **使用场景（config v6）**：`activeSceneId` 作为运行时真相；稀疏的每场景 `voiceOverride`（语音快捷键、唤醒词、结束词）。
- **设置 → 使用场景**：四个标签页（密钥 / 语音 / 目标 / 高级）、生效预览、**设为当前场景** 与仅浏览选择。
- **设置 → 全局语音**：全局引擎/麦克风/短语不变；场景底部栏链接到此以排查设备问题。
- **Coach HUD**：底部居中浮层，提供触发 → 目标提示与简短成功闪烁；可在 **设置 → 基础 → 场景教练浮层** 开关。
- **Rule C 同步确认**：当变更全局语音快捷键而当前场景存在 `targetKey` 覆盖时，弹出三选一对话框（仅全局 / 全局并清除覆盖 / 取消）。
- **配置备份说明**：设置 → 常规 显示 `settings.json` 路径提示。
- **引导流程**：首个场景获得 `voiceOverride: null` 与 `activeSceneId`；引导完成时启用 Coach HUD。

### 变更（Changed）

- Coach HUD、托盘模式与触发模式编辑均遵循 **当前场景** 的按键（而非首个启用映射）。
- Coach HUD 目标显示：场景 `voiceOverride.targetKey` 优先，否则取映射的物理 `targetKey`。
- 在列表中浏览场景不再改变运行时语音，需显式激活。
- 听写停止/提交使用 **会话开始时的快照**（中途切换场景不改变结束规则）。
- 引导第 3 步的物理触发成功要求 **目标按键成功发送**（`mvp_onboarding_trigger_fired` 且 `ok: true`）。
- 新用户引导完成后默认启用 Coach HUD；升级用户默认 `coachHudEnabled: false` 直至手动开启。
- 首页 hero 在听写时显示结束词提示（`结束输入`）。

### 修复（Fixed）

- 物理触发在已听写时再次按下可正确关闭听写（第二次按下结束会话）。

### 已知限制（Soft Pad 本批次）

- 供应商 API 密钥仍以明文保存在 `{data_root}/<provider>-api-key.txt`，待 P2 后密钥环迁移。
- Gemini Soft Pad 灯仅 **CLI**；IDE 中途会话需另行测量（见 `docs/gemini-hook-onetone-setup.md`）。
- P1/P2（Aider、OpenCode、通义捕获、admin-key Anthropic/OpenAI、环境聚合、会话持久化）不在本批次。

## 说明

- 原 `README.md` 目标为「复制一个 readme 到桌面上」；本文档 `README2.md` 在其基础上补充了最新的功能更新说明。
- 当前工作区存在较多已修改文件（README、docs、scripts、src-tauri、src 等），本次仅更新文档说明，不涉及代码改动。
