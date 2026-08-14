# Soft Pad mini UI 与主题规范

这份规范只管最小化条。目标是让第一次改 UI 的人也能判断“能不能改、该改哪里、怎样算完成”。

## 一句话结构

```text
[ Codex●  Claude●  Cursor● ] [用量 pill] [展开] [关闭]
```

- Agent 按固定顺序排列（启用灯的才显示）；位置不随状态跳动。
- 图标回答“是谁”，右下状态点回答“现在怎样”；**chill pill** 回答“用量/额度”。
- **全屏悬停**：`#overlayAgentTip`（挂在 `.wrap`，不在 `.overlay-full`）——短 tip：状态 ·（失败诚实）·「悬停预览用量 · 点击跳转 …」。模型/额度不进 tip，看 chill。
- **迷你悬停**：禁止盖条。`pinUsageFocusOnHover` **只**改 chill 预览（`hoverUsageKind`），**禁止** `touchAgentBarRecency` / 重排 chip / persist pin / 抢前台。图标固定 `22×22`，focus 用 inset outline，不得外扩描边。
- **迷你模式点击**：chip 必须加入 drag 屏蔽；`needs_input` 穿透不得关掉迷你栏命中（Rust `!minimized` + FE/CSS）。
- **点击 chip**：pin + `cmd_soft_pad_focus_session` → 失败再 `focus_agent`；toast「跳转 Agent」；失败「未能聚焦」。
- **点击 chill pill**：只启用统计 / 配 MiniMax Key / `cmd_codex_micro_overlay_refresh_usage`；**禁止** focus_session。
- Soft Pad 底栏与 `#overlayAgentTip`：永远浅底深字，不跟深色 chrome 的 `--overlay-ink`。
- Soft Pad 底栏：主行 `Agent · 今日 N 次`；副行只放会话/活跃/本地统计/新鲜度（日环比进 tip）。
- mini 宽约 `320 × 44`（6 chip + `Cu · N次`）；用量 pill `min-width: 64px`，不要再挤成 `C.`。
- `PadStatus` 仍只控制主灯与主控，不用来复制三个 Agent 状态。

## 状态词与颜色

| 数据值 | 用户看到 | 颜色语义 |
|---|---|---|
| `idle` | 空闲 | 中性灰 |
| `running` | 执行中 | 蓝色 |
| `needs_input` | 等待输入 | 琥珀色 |
| `done` | 完成 | 绿色 |
| `failed` | 失败 | 红色 |

颜色必须复用 `codex-micro-hw-tokens.css` 的状态变量。不要为某个 Agent 发明另一套“品牌状态色”；品牌由图标表达，状态由统一颜色表达。

红点 = 本轮失败（Attention `Error`），**不是**「未接 Hook」。未接 Hook / 灯关 → 灰 idle 或隐藏 chip。

## 模型文案

- Codex：显示收到的 slug，如 `gpt-5.6-sol`。
- Claude：只表示会话开始时的模型；tooltip 必须提示“会话值，可能不精确”。
- Cursor：`default` 显示为 `Auto`；不要猜测 Auto 最终路由模型。
- 没有可靠值统一显示 `模型 --`，不要使用“未知错误”。

## 尺寸与间距

- 窗口：`320 × 44px`（含用量 pill；旧稿 156 已不够）。
- 外边距：`6px`。
- Agent 图标盒：`22 × 22px`，圆角 `7px`。
- 图标：`14 × 14px`。
- 状态点：主体 `6px`，加 `1.5px` 外圈。
- 三图标间距：`2px`；控件组间距：`5px`。
- 用量 pill：`min-width 64px` / `max-width 96px`，文案如 `Cu · 83次`。
- 展开按钮 `30px`，关闭按钮 `24px`。

如果新增内容导致拥挤，优先放入 tooltip 或 full overlay；不要继续缩小图标和点击目标。

## 主题规则

浅色主题使用冷雾蓝外壳、白灰图标底；深色主题使用石墨外壳、蓝灰图标底。两套主题只改变表面材质和对比度，状态颜色含义必须一致。

允许修改：

- 外壳透明度、阴影强度、图标底层明暗。
- 状态点 glow 强度。

禁止修改：

- Agent 固定顺序。
- 状态值和颜色的对应关系。
- 用模型名或 Agent 品牌色代替状态点。
- 把 `Auto` 展示成一个猜测的具体模型。

## 新手改动检查表

1. HTML 只负责固定 chip 和按钮；不在 HTML 写动态状态。
2. Rust `snapshot.agents[]` 是 mini 的唯一动态数据源（含 `laneId` / `sessionId` 聚焦提示）。
3. JavaScript 只把 snapshot 字段写到 `data-status`、`data-lane-id`、`data-session-id`、`aria-label`，不重新推断生命周期。迷你悬停可用短 `title`；禁止盖条 tip。
4. CSS 只按 `data-status` 上色，不读取事件名；`#overlayAgentTip` 保持 `pointer-events: none`；无 `is-hover-tip` 藏图标。
5. 同时检查浅色、深色、空闲、执行中、等待输入、完成、失败。
6. 悬停 chip：图标不位移、chill 预览该 Agent；title 含「点击跳转」；离开恢复 pill。
7. 点击 chip=跳转（toast「跳转 …」）；点击 chill=刷新/配置（不 focus）；无空 pointer。
8. 改完运行 `node scripts/soft-pad-mini-agents.test.js`，并做一次迷你条截图检查。

## 附录 · Slice D（+N / 多 Provider pill / 新鲜度）

- **VISIBLE_PAD = 6**：mini 一行最多 6 个 lit chip；`rest` 非空时显示 `#miniAgentMore`（`+N`），点击展开 Soft Pad（44px 高放不下 overflow）。
- **Catalog 顺序**：`codex → claude → cursor → copilotCli → gemini → minimax → workbuddy → trae → qoder`。
- **占位 chip**：`copilotCli` / `gemini` 在 `agents[]` 未 lit 时以 `data-placeholder=1` + `data-status=idle` 灰色禁用出现（等 B/C 接灯）；颜色仍只跟 `data-status`，不发明品牌色。
- **多 Provider pill**：snapshot 有 `providerQuotas[]` 时，pill 文案取首个 `status=ok` 的 `caption`，否则 `用量 ▾`；点击打开紧凑下拉（`icon` → ✓/⚠/✗ + caption）。部分失败也必须保留成功行。无 `providerQuotas` 时保持单 Agent 用量 / 刷新行为。
- **新鲜度点**：`#miniUsageFresh` 灰 ●；`now - providerQuotasUpdatedAt > 5min` 加淡黄 `is-stale`；`title` 为 `Updated Xm ago`。不 toast。
- 窗口仍 **320 × 44**。
