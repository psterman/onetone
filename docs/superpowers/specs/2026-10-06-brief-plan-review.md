# 首页改造方案评审（2026-10-06）

评审对象：用户提出的「思路准备与简报系统」前后端实施方案（定位 / 前端九节 / 后端十节 / IPC 边界 / 缺口 / 四阶段）。

## 结论

**认可。方向、边界、数据结构、阶段划分均成立，建议按此推进。**

方案最强的一点是**交付状态的事实口径**（已复制 / 已打开 / 已填入 / 已上传 / 用户确认已发送 / 系统确认已发送 / 发送状态未知 / 失败），明确"不能把打开 Agent 记为已发送"。这是整个方案里最硬的一条，也是这个产品唯一有满分潜质的维度（诚实可核验）在数据模型上的落地。
生产侧已印证这条区分是真实存在的：`insert_text.rs:27 insert_text_no_enter` 的实现是 focus_agent → 写剪贴板 → Ctrl+V → 恢复，**不发 Enter**——所以"已填入"和"已发送"确实是两种不同事实。

以下四处需要修正后再进入编码。

---

## 修正一（事实错误）：「已有截图基础能力」不成立

方案第五节写"已有语音和截图相关基础能力"。核实结果：

- 全仓库 `screenshot / capture_screen / 截屏 / PrintWindow / BitBlt` 仅 2 处命中，且**都是注释里在规避系统截图快捷键**：
  - `codex_numpad_layer.rs:796` — "Migrate off screenshot / pin collision chord"
  - `agent/bindings_build.rs:77` — "Ctrl+Alt+P collides with screenshot / pin shortcuts"
- **没有任何实现。** `capture_screenshot` 是从零开始。

同一节里"已有项目、会话、文件变化等部分事实来源"中的**文件变化也不成立**：`notify = "6"` 已装但 `src-tauri/src` 零使用。

→ 第一阶段若把截图放进范围，需要预留从零实现的工期（GDI / `PrintWindow` / `windows-capture` 三选一）。

**但同一节里有一条被低估的好消息**：命令 + 退出码采集**有先例**——`codex_smoke_task.rs:79` 已有 `exit_code` 字段、`:255/:354 Command::new`、`:491` 状态写入。所以"回得来"里的命令/退出码不是从零，可复用 smoke task 的基础设施。（这修正了早前"零命令采集"的判断。）

## 修正二（结构性风险，最重要）：采集点必须前置到第一阶段

第四阶段「回得来」依赖 Diff、命令、测试结果、预览归档。这些数据**无法事后补采**——第一阶段不埋点，第四阶段打开时是空的，且历史永远补不回来。

**建议改为「埋点前置，展示后置」**：
- 第一阶段：把 `changed_files / 命令 + 退出码 / 测试输出 / 预览 URL` 的原始记录先落库（**哪怕暂时不在 UI 上展示**）；
- 第四阶段：只做展示、归档、与简报关联。

成本差异很小（多几行 insert），收益是整个第四阶段从"空壳"变成"有数据"。

## 修正三（漏了最高频入口）：剪贴板不该走"点击收集"

方案把剪贴板放进悬浮栏「点击收集 → 读取剪贴板」，需要**两下**。而剪贴板是唯一能做到 **0 额外动作** 的入口——用户本来就在按 Ctrl+C。

建议拆成两条通路：

| 通路 | 触发 | 说明 |
|---|---|---|
| **被动**：复制即收集 | 0 动作 | `AddClipboardFormatListener`（事件驱动，优于轮询）；受决策三「本地暂存」层约束，默认不自动进简报 |
| **主动**：收集菜单 | 1 动作 | 文件 / 文件夹 / 截图 / 网址 —— 保留现有设计 |

否则第一阶段做完，最高频路径仍然是最慢的那条。

## 修正四（IPC 名单缺隐私控制）

决策三要求的感知控制在 IPC 名单里**一个都没有**：

- 核实：`exclusion / exclude / allowlist` 在 `src-tauri/src` 的命中全部属于 `agent_install_inventory.rs` 的**进程名白名单**（用于 agent 探测），与感知隐私无关。

需要补：

```text
set_sensing_enabled       暂停 / 恢复感知
get_sensing_state         当前正在监听什么（常驻状态条的数据源）
list_sensing_rules        应用排除列表 / 目录白名单
update_sensing_rules      敏感字段过滤规则
purge_candidates          清空候选托盘（含过期）
```

另外补两个前端已经要用、后端没有对应命令的：
- `diff_material_versions` —— 素材版本对比（前端「查看差异」）
- `get_material_provenance` —— 单个素材的来源 / 指纹 / 版本链（只读溯源卡）

---

## 已核实的能力现状（供排期用）

| 项 | 现状 | 依据 |
|---|---|---|
| 悬浮栏 | 🟢 已有 | `codex_micro_overlay.rs` |
| 置顶 + 无激活 + 鼠标穿透 | 🟢 已有 | `codex_micro_overlay.rs:203 WS_EX_TRANSPARENT`、`:210 WS_EX_NOACTIVATE` |
| 全局热键 | 🟢 已有 | `hotkey_win.rs` `RegisterHotKey` |
| 托盘 | 🟢 已有 | `tray.rs` |
| 透明置顶浮窗 | 🟢 已有先例 | `input_aim_calibrate.rs:152 decorations(false)` + `set_always_on_top` |
| 开机常驻 | 🟢 已有 | `tauri-plugin-autostart`（`lib.rs:439`） |
| 会话聚焦 | 🟢 已有 | `cmd_soft_pad_focus_agent`（`codex_micro_overlay_cmd.rs:171`，`lib.rs:1190` 注册） |
| 内容指纹 | 🟢 依赖已装 | `sha2 = "0.10"`（`Cargo.toml:55`） |
| 命令 + 退出码 | 🟠 有先例可复用 | `codex_smoke_task.rs:79 / :255 / :491` |
| 剪贴板读取 | 🟠 仅文本 | `insert_text.rs:106` 只有 `CF_UNICODETEXT`，读不了图，无监听 |
| 文件变化 | 🔴 未接线 | `notify` 已装，源码零使用 |
| 拖放 | 🔴 未启用 | `WM_DROPFILES / IDropTarget` 零命中；`tauri.conf.json` 未开 dragDrop（Tauri 2 默认关闭） |
| 截图 | 🔴 零实现 | 见修正一 |
| tokenizer | 🔴 无 | 全仓库零命中 → `is_exact` 恒为 false，UI 必须强制显示"约" |
| 简报表 | 🔴 无 | `agent_memory` 需新建 MIGRATION |

---

## 对阶段划分的意见

四阶段顺序（收得到存得住 → 组织得清楚 → 交得出去 → 回得来）**认可**，只加一条：把「回得来」的**采集埋点**挪到第一阶段，「回得来」本身仍留在第四阶段做展示与归档。

第二阶段里「常驻预算条」建议**提到第一阶段末尾**先做一个只有总数、没有分项的版本——因为它是唯一一条会在后期改变素材默认档位（全文/摘要）的约束，越早出现，越早暴露"素材默认给全文→预算爆掉"这类设计问题。
