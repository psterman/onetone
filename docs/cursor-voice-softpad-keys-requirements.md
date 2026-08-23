# Cursor 语音 · Soft Pad · 按键需求说明

> 整理自产品讨论（2026-08）。首版聚焦 **Cursor 桌面客户端** vibe-coding 工作流。  
> 关联契约：[HABIT_UNIFIED_CONTRACT.md](./HABIT_UNIFIED_CONTRACT.md)、[SEMANTIC_ACTION_CONTRACT.md](./SEMANTIC_ACTION_CONTRACT.md)

---

## 1. 你要解决什么问题

在 Cursor 里做 vibe coding 时，经常要在这些操作之间来回切换：

- 聚焦输入框 / 切 Plan 或 Agent 模式  
- 点按钮或按快捷键  
- 口述需求、改意见、总结、继续、审 diff、跑测试、重开会话  

希望 **OneTone 替你在 Cursor 里完成「点 / 按键 / 快捷键」**，同时：

- **Soft Pad + 迷你栏**：看得见、按得到（视觉 + 按键双重能力）  
- **麦克风**：说 **固定口令**，**精确匹配** Soft Pad 上的能力卡，**一步执行**  
- **不做自然语言意图识别**（无 NLU），减少误触、减少步骤  
- 与 **Cursor Hook / 快捷键** 绑定，完成或出错时有 **状态灯 / 提示音**，并提示此刻可以说或按什么  
- **长 prompt 听写**走第三方输入法（PTT），与能力卡口令分层，不抢同一套识别器  

### 1.1 小白（Cursor / AI 编程 < 1 个月）怎么用语音才不卸载

他们的痛点是 **「我不会用、下一步点哪」**，不是熟手的「来回切」。把 6～12 个口令 + 状态灯 + Hook 配置一次性交给他们 = 又一套课，装完看一眼就会卸。

| 维度 | 小白策略 |
|---|---|
| **真正提速** | **按住说话（PTT）**：不会打英文 prompt、打字慢。零口令，按住说需求，字进 Composer |
| **真正掌控** | 迷你栏只亮 **此刻那 1 张卡**（下一步），不是 12 张菜单。点一下就执行，学会「原来是这个」 |
| **语音命令的角色** | **chip 上那几个字的朗读版**，不是第二套 CLI。先点会，再说同一词；grammar = 当前能看见的 3～4 张卡 |
| **不发给他们的** | Hook 安装、needs_input gate、跑测试 / 下一处 / 命令 / 接受、全表「说：xxx」 |

**小白默认只露出 4 张卡（点 = 说，同一 `slotId`）：**

| 卡 | 解决的真实慌张 | 为什么是这 4 张 |
|---|---|---|
| **说话** | 不知道 prompt 怎么写、打字慢 | 唯一零词汇语音；效率来自听写不是口令 |
| **发送** | 说完/写完不知道怎么交出去 | 闭环 |
| **继续** | Agent 停了，以为坏了 | 第一周最高频卡壳 |
| **新会话** | 聊乱了找不到 X、不敢重来 | 一键重开，降低「搞砸了」的焦虑 |

**定计划 / 开工** 第二周才从「更多」露出来：小白分不清 Plan 和 Agent，应用 **视觉 chip 教模式**，不要用两个口令先上课。

**教会路径（点 → 看见同一词 → 才说）：**

1. 开箱迷你栏 4 个可点 chip，**不写口令清单、不要求装 Hook**  
2. 点「继续」执行成功后，该 chip 短暂变成「也可以说：继续」（一次一句，不是全表）  
3. 此后 KWS 只收 **当前亮着的那几张**；说了不在画面上的词 → 不执行、不报错课  
4. 副标题最多一句人话：「写完了，点 继续 或说 继续」——不教状态机  

语音帮小白高效的本质：**听写替打字；口令只复读屏幕上已点过的下一步。** 熟手那 12 张卡是进阶面，默认折叠。

### 1.2 怎么抽出小白工作流（不要另做「语音跳转工作流」）

**不要做一套可跳转的工作流引擎。** 「说第 3 步 / 跳到开工」是熟手快捷方式，小白会迷路。小白只要 **一条环**，语音只打 **当前节点**，跳转不是目标。

抽出方法：从 §5 的 11 条 **做减法**，不是再发明一张命令表。

| 过滤 | 留下 | 丢掉 |
|---|---|---|
| 第一周每周都会卡住 | 说话、发送、继续、新会话 | 跑测试、下一处、命令、Git、搜索 |
| 不用先懂 Cursor 术语 | 说话 / 发送 | 定计划、开工（第二周 chip 再露） |
| 能用一句话说清 | 「说完点发送」 | 任何要解释 Plan vs Agent 的口令 |
| 失败能重来 | 新会话 | 接受 / 全部接受 / Hook |

抽出结果就是 **一条环，不是多条工作流：**

```text
说话（PTT） → 发送 → 等 Agent → 继续 ─┐
     ↑                    或 新会话 ─┴─ 回到说话
```

常见命令 = 环上 4 个节点的名字，与 chip 文案相同。没有第 5 条「工作流口令」。

| 问 | 答 |
|---|---|
| 要不要做一个工作流让语音跳转最快？ | **不要。** 最快跳转 = 熟手 live pack（任意卡随时说）。小白要的是 **此刻只能走下一步** |
| 工作流存在哪？ | 已有 `cursor-chat` 习惯场景 + 迷你栏 4 chip。不新做向导、不新做「语音跳步骤」 |
| 以后怎么加命令？ | 看 chip 点击：同一张卡被连点、且用户已点过「也可以说」→ 才进默认 grammar。不要拍脑袋加口令 |

熟手「跳得快」= 展开更多后 12 卡随时说。和小白环共用同一套 `slotId`，只是默认可见集不同。

### 1.3 小白全局跳转（Windows v0 · 定稿）

**平台：** v0 **仅 Windows**。macOS 不装半残；焦点层以后若做 Mac 再抽。

**听 vs 做：**

| 阶段 | 行为 |
|---|---|
| **激活（arm）** | **Cursor 前台自动 arm**（离开 Cursor 立即 disarm）/ 说「小助手」/ 长按侧键 1s / 展开 Soft Pad → **只开 KWS**，**不抢** Cursor 前台 |
| **执行（点卡 / 已 arm 口令）** | `probe` → `focus_composer_only(cursor-chat)` → dispatch slot → **留在 Cursor** |

**迷你栏（Cursor 进程在跑）：** `[ Cu● ] [mic] [send] [cont] [new*] [展开] [关]` — 22×22 图标；**Pad 形态记忆上次 mini/展开**；arm 时醒目文案「聆听中 · 可说：发送、继续、新建、麦克风」。

**语音口令（exact match）：** `发送` / `继续` / `麦克风`（同「说话」）/ `新建`（同「新会话」）/ `取消` 退出 arm / `小助手` 手动 arm。

**探测失败：** 迷你栏仍可见；**不画 4 卡**；文案「未检测到 Cursor，请先安装 / 登录」。点卡失败同文案 toast，禁止静默。

**侧键状态机（验收）：**

| 当前态 | 短按侧键 | 长按侧键 1s | 说「继续」 |
|---|---|---|---|
| Cursor 焦点（auto-arm） | 往 Composer 打字 | 保持 arm | Cursor 执行并留下 |
| 未 arm，WeChat 焦点 | 往 WeChat 打字 | arm（Pad 出现，不抢焦点） | 无视 |
| 已 arm，WeChat 焦点 | 往 WeChat 打字 | 保持 arm | 切 Cursor 执行并留下 |

**arm 退出：** 离开 Cursor 前台（立即）/ 说「取消」/ 收起 Pad / 30s 无语音 → 退 arm（4 卡仍在，进程在时）。

**新会话 hold：** 点 Pad 或迷你栏须 **按住 0.5s**；语音「新会话」或「新建」命中即执行，不再二次 hold。

**首装 1 屏：** 遮罩钉在真实迷你栏 4 图标；点 mic → 真进 Cursor → 真出字 →「懂了」后不再出现。

**实现入口：**

```text
arm_cursor_beginner()          // Cursor FG 自动 / 小助手 / 长按 1s / 展开 Pad
run_cursor_beginner_slot(slot) // probe → focus_composer_only → dispatch
```

---

## 2. 核心原则

| 原则 | 说明 |
|---|---|
| **能力卡在 Pad 上** | 每个常见操作 = 一张「能力卡」= 一个 Pad 槽位（`slotId`） |
| **语音 = 按 Pad** | 说固定口令与按 Pad 键走 **同一条 dispatch**，不是两套逻辑 |
| **固定口令 only** | Vosk/KWS **exact match**；grammar 为闭集，不解析自由说法 |
| **迷你栏 = Pad 的条形投影** | chip 与 Pad 键 **同一 slotId**；键帽下写「说：定计划」 |
| **Hook 管状态，卡管动作** | Hook 决定 **现在什么态**；每一态 **高亮哪些能力卡** 可说/可按 |
| **诚实灰掉** | Cursor 做不到的（Build、@ 文件、gate 关时的 approve）不假装能语音 |
| **听写走 IME，口令走 KWS** | 触发器可共用（侧键 / Pad 麦）；引擎不融合；不用 Cursor 自带麦当第二 STT |
| **不改「打开应用」启动器页** | Tab2 展示能力卡对照；不把 11 条拆成 11 个独立 NL 命令 |
| **小白默认 4 卡** | 说话 / 发送 / 继续 / 新会话；其余进「更多」。口令不比画面多 |

---

## 3. 三通道如何分工

```text
┌─────────────────────────────────────────────────────────────┐
│  能力卡（slotId）                                            │
│  · 视觉：Soft Pad 键帽 + 迷你栏 chip                         │
│  · 按键：Soft Pad 物理/屏幕键 → channel: softPad             │
│  · 语音：固定口令 exact match → channel: voice               │
│  · 实体键：习惯页 agentBindings(key) → channel: key（可选）   │
│  · 执行：route_semantic_action → Cursor 快捷键 / 聚焦 / Hook  │
└─────────────────────────────────────────────────────────────┘
```

| 通道 | 用途 | 识别方式 |
|---|---|---|
| **Soft Pad 按键** | 主操作入口；看得见按得着 | 扫描码 / microKeyId |
| **固定口令（麦克风）** | 与 Pad **同动作**；免找键 | 闭集 grammar，exact match |
| **实体键（习惯页）** | 高级用户；与 Pad 可复用同 slot | 物理热键 |
| **侧键 / Pad 麦 PTT** | 仅 **长内容听写** 进输入框 | 注入 IME 快捷键；与命令 grammar **分离** |

**不要：** 用自然语言猜「用户想干什么」；不要语音页另建一套能力目录。

### 3.1 PTT · 能力卡口令 · Cursor 自带麦

**定稿：听写接入第三方输入法；能力卡与听写两层并存。不要把 Cursor 自带麦做成第二套 STT，也不做成用户可切换的「兼容双模式」。**

```text
麦克风
  ├─ 闭集口令（KWS exact match）→ 能力卡 dispatch（定计划 / 开工 / 跑测试）
  └─ 侧键 / Pad 麦 PTT         → 注入 IME 快捷键 → 第三方 STT 打进 Composer
Cursor Composer 自带麦          → 不接、不并列、不抢同一把麦
```

| 方案 | 判定 |
|---|---|
| 融合成本地一套 STT（Vosk 打进 Composer + 兼听口令） | **不做。** 中文长听写不如讯飞/Typeless；口令与正文抢同一 decoder |
| Cursor 自带麦 + OneTone 双模式 | **不做。** 两把麦、两套结束键；Cursor 无稳定公开 PTT chord |
| 听写走 IME，口令走 KWS | **采用。** 触发器融合，引擎不融合（现状即此） |

**运行时互斥：**

- **idle / 非听写**：KWS 只认能力卡闭集；grammar 按 Hook 态过滤  
- **PTT 听写中**：IME 负责出字；KWS 只留结束/取消词，**不**把「定计划」听成口令  
- **Pad 麦 / 侧键**：发的是 **IME `target_key`**（默认跟用户选过的输入法，Cursor 场景 heal 为 `RAlt` 一类），**不是** Cursor 原生 voice toggle。误拷过来的 Codex `Ctrl+Shift+D` 应被改掉  

**若用户坚持用 Cursor 自带麦：** 不新开引擎。仅当 Cursor 有稳定、可录的激活快捷键时，把它当成一张 **未验证 IME 预设**（与搜狗同级），仍走「按键 → 注入 chord」。默认推荐讯飞 / Typeless / Win+H。

代码现状（实现时勿回退）：

- `CURSOR_DEFAULT_KEY_BY_SLOT.pushToTalk`：跟 OneTone IME，不跟 Cursor native  
- `ensure_codex_pad_ready_rewrites_cursor_codex_mic_chord`：Cursor Pad 麦 chord heal  
- `voice_end_runtime`：通用唤醒「开始输入」只打全局 IME 键，不走 Soft Pad PTT  
- `ime-presets.js`：讯飞 / 微信 / Typeless / Win+H 等预设  

---

## 4. 能力卡模型（Cursor 首版）

每一张卡 **四重绑定**：

| 绑定 | 内容 |
|---|---|
| 视觉 | Pad 键帽标签 + 迷你栏 chip |
| 按键 | Soft Pad 一键 |
| 固定口令 | 如「定计划」「开工」（与 Pad 同槽） |
| Cursor | 快捷键 / 聚焦 / Hook 反馈 |

存储：`agentBindings` 中同一 `slotId` 可同时有 `triggerType: softPad | voice | key`。

### 4.1 Cursor 能力卡表

**12 张活跃 + 2 张 gate 卡 + 1 张灰掉。** 11 条工作流 **复用下表**，不是 11 套识别逻辑。

| 能力卡 | slotId | Pad 键 | 固定口令 | Cursor 侧 | 覆盖需求 # |
|---|---|---|---|---|---|
| **定计划** | `plan` | Plan | 「定计划」 | 聚焦 + `Ctrl+Alt+Shift+P` | 1、5 |
| **开工** | `switchAgent` | Agent | 「开工」 | `Ctrl+Alt+.` | 2、5 |
| **回 Cursor** | `focusComposer` | 聚焦 | 「回 Cursor」 | focus Composer | 1、4 |
| **发送** | `stopOrSend` | 发送 | 「发送」 | Enter / stopOrSend | 1 |
| **继续** | （continue 槽） | 继续 | 「继续」 | 固定模板句注入 | 6 |
| **总结改动** | （模板槽） | 模板 | 「总结改动」 | 固定模板句（非 NLU） | 3 |
| **跑测试** | `runChecks`（新） | 跑测 | 「跑测试」 | 固定模板句：请运行 lint 和 test 并报告结果 | 3 |
| **下一处** | `nextChange`（新） | 下处 | 「下一处」 | `F7` / diff 下一处 | 3 |
| **上一处** | `prevChange`（新） | 上处 | 「上一处」 | `Shift+F7` / diff 上一处 | 3 |
| **新会话** | `newThread`（复用） | 新会话 | 「新会话」「清空」 | focus Composer + `Ctrl+N` | 5、换话题 |
| **搜索** | `quickSearch` | 搜索 | 「搜索」 | `Ctrl+P`（可配 `Ctrl+F`） | 11 |
| **粘贴** | （paste 槽） | 粘贴 | 「粘贴」 | focus + Ctrl+V | 8 |
| **命令** | `commandPalette` | 命令菜单 | 「命令」 | `Ctrl+Shift+P` | 7、10 |
| **取消** | `cancel` | 取消 | 「取消」 | 停生成 | running 态 |
| **接受** | `acceptChanges`（gate） | — | 「接受」 | `Ctrl+Enter`（当前文件/hunk） | needs_input |
| **全部接受** | `acceptAllChanges`（gate） | — | 「全部接受」 | `Ctrl+Shift+Enter` | needs_input |
| **@ 文件** | — | — | — | **灰掉**（无可靠固定匹配） | 9 |

**增补说明：**

| 新卡 | 解决 | 备注 |
|---|---|---|
| **新会话 / 清空** | 一键重开 Composer（不用找 X） | 复用已有 `newThread`；Pad 文案从「新建」改为「新会话」 |
| **跑测试** | Agent 跑完后的标准下一步；缺失会逼用户回鼠标 | 与「总结改动」同为固定模板句，**不**走终端 npm 直跑 |
| **下一处 / 上一处** | 走 Agent 生成的 diff 细读 | 「总结改动」= 粗看；走 diff = 细看 |

**灰掉 / gate：**

- **@ 文件**：继续灰掉  
- **接受 / 全部接受**：`cursor_can_observe_needs_input` **默认关** → UI 与 grammar **灰掉**；仅 gate **开启** 且处于 **needs_input** 态才高亮。Cursor 无 approve adapter，gate 开后仍是 chord 注入，不假装 Codex 式「同意/不要」  

**diff 导航天花板：** Cursor 无官方稳定「下一处改动」快捷键（F7 为 VS Code lineage 默认，Composer inline diff 可能不一致）。实现时可在 `cursor_keybindings_setup.rs` 可选 seed F7 / Shift+F7，UI 须诚实标注，不假装 100% 可靠。

### 4.2 迷你栏展示

**小白默认（开箱）：**

```text
[ Cursor ] [说话] [发送] [继续] [新会话]  [更多]
副标题：「按住 说话 说需求 · 说完点 发送」
```

- 4 张可点；**不**在每张卡下印「说：xxx」清单  
- 点成功一次后，**仅该卡**短暂提示「也可以说：继续」  
- **不要** Hook 配置入口、不要 5 色状态课  

**熟手 / 展开更多：**

```text
[ Cursor● ] [定计划] [开工] [搜索] …  [用量] [展开 Pad]
     ↑ 状态点（Hook，可选）  ↑ 与 Pad 同 slotId，高亮=当前可说
副标题示例：「本回合完成 · 说 继续 / 跑测试 / 下一处」
```

- 点 **Cursor 芯片** 或 **更多 / 展开**：全 Pad 键帽（与 chip **同一动作源**）  
- 熟手面才在键帽下标 **说：{固定口令}**  
- gate 关时：**接受 / 全部接受** 不出现在默认 Pad 编辑列表，也不进 grammar  

---

## 5. 你的 11 条 Cursor 常规需求

| # | 场景描述 | 能力卡 / 操作 | 固定口令 |
|---|---|---|---|
| 1 | 从其他 App → Cursor 输入框 → Plan → 输入并发送 | 回 Cursor → 定计划 →（可选发送） | 「回 Cursor」「定计划」「发送」 |
| 2 | 等 Plan 完成 → 查看 → Build/Agent 开工 | **开工**（Cursor 无 Build API，Agent=开工） | 「开工」 |
| 3 | 查看改动 → 理解总结 → 测试 | **总结改动** → **下一处/上一处** → **跑测试** | 「总结改动」「下一处」「上一处」「跑测试」 |
| 4 | 去其他页面/Agent 提问 → 回 Cursor | **回 Cursor** | 「回 Cursor」 |
| 5 | Agent 框改意见 → 重定计划 → 再开工；或换话题重开 | **定计划** → **开工**；换话题用 **新会话** | 「定计划」「开工」「新会话」 |
| 6 | 任务中断 → 快速继续 | **继续** | 「继续」 |
| 7 | 难题 → 切换模型 | **命令**（进菜单后手选） | 「命令」 |
| 8 | 剪贴板截图粘贴 → 语音补充 | **粘贴** +（可选 PTT 补充） | 「粘贴」 |
| 9 | 快速 @ 文件 | **灰掉** | — |
| 10 | Git 整理 → commit message → commit/push | **命令** → 源代码管理 | 「命令」 |
| 11 | 软件内搜文件/关键词 | **搜索** | 「搜索」 |

---

## 6. Cursor Hook ↔ 状态灯 ↔ 声音 ↔ 可说能力卡

### 6.1 已有链路（代码里 today）

```text
Cursor hooks.json
  → cursor-hook-probe.js
  → source=cursor_hook + event
      ├→ PadStatus → 迷你栏 chip 颜色 + 底栏文案
      └→ AgentAttention → 提示音（sound-bus）
```

| Hook 事件（示例） | 迷你栏状态 | 提示音 | 备注 |
|---|---|---|---|
| `beforeSubmitPrompt` 等 | running · 蓝 | — | 有 |
| `stop` / `afterAgentResponse` | done · 绿（短） | `agent.completed` | 有 |
| `agent_needs_input` 等 | needs_input · 琥珀 | `agent.needs_input` | **需开 gate** |
| `idle` | idle · 灰 | — | 有 |
| 失败类 | failed · 红 | `agent.failed` | **Cursor Hook 几乎无** |

**注意：**

- Cursor **`needs_input` 默认关闭**（`cursor_can_observe_needs_input=false`），需用户显式开启  
- Hook 需在 Soft Pad「Cursor Hook 接入」里 **复制合并配置**；未装 Hook 时灯不可靠  
- Cursor **无 approve/reject 适配器**；「接受 / 全部接受」跟 gate 走，gate 关则灰掉（与 Codex 的「同意/不要」分离）  

### 6.2 目标：态 → 高亮能力卡 → 固定口令可执行

Hook 只负责 **「现在哪一态」**；每一态只允许说/按 subset 能力卡（grammar 动态过滤）：

| Cursor 态 | 迷你栏提示 | 高亮能力卡（Pad = 语音） | 声音 |
|---|---|---|---|
| **idle** | 待命 | 定计划、搜索、回 Cursor、**新会话** | — |
| **running** | 正在写代码 | **取消** | — |
| **done** | 本回合完成 | **继续、定计划、开工、总结改动、跑测试、下一处、上一处** | completed |
| **needs_input**（gate 关） | 等你确认 | **继续、取消**（接受类 **灰**） | — |
| **needs_input**（gate 开） | 等你确认 | **继续、取消、接受、全部接受** | needs_input |
| **failed** | 出错了 | **定计划、命令、新会话** | failed |

用户路径示例：

1. Cursor 跑完 → **done 绿灯 + 完成音**  
2. 迷你栏高亮 **「继续」「定计划」「开工」「跑测试」「下一处」** chip  
3. 用户说 **「跑测试」** 或按 Pad → **与按键相同动作**，一步完成  

---

## 7. 控制面前置（可选）

需要时可 **前置 Soft Pad + 迷你栏**（不抢 Cursor 编辑焦点）：

| 触发 | 行为 |
|---|---|
| 侧键长按 ~1s | 展开 Pad + 迷你栏 |
| 固定口令「控制」 | 同上 |
| 可配热键 / 摄像头手势 | 可选 |

Arm 后：后台 KWS 监听固定口令；Pad/迷你栏显示 **最后 1～2 条已执行动作** 与 **当前可执行卡**。侧键 **短按/按住说话** 仍是 PTT 听写（IME），与「长按展开 Pad」区分。

---

## 8. 明确不做

- 11 条各自一个 **自然语言** 口令 / NLU 意图  
- 语音页重做「打开应用」启动器  
- 按 Agent/CLI/客户端各做一套语音命令表  
- Cursor 上假装语音 **Build / @ 文件**；gate 关时假装 **approve**  
- Pad 必须抢焦点才能识别固定口令  
- 复活 legacy `voice-command-matcher.js` 自由文本匹配  
- 为「跑测试」另做终端 npm 直跑（已定为 Composer 模板句）  
- 把 下一处/上一处 做成 NLU「看下一段改动」  
- 把 Cursor Composer 自带麦做成与 IME 并列的第二 STT / 双模式开关  
- 把能力卡口令并进 IME 自由听写（同一 decoder）  
- 用 OneTone Vosk 替代讯飞等做 Cursor 长 prompt 听写  
- gate 关时把「接受 / 全部接受」预埋进 grammar  
- 把 12 张卡 + Hook 安装 + 全表口令作为小白开箱默认（认知过载 → 卸载）  
- 小白面用语音「教 Cursor」（NLU 解释 Plan/Agent）；模式用 chip 点选用  
- 另做「语音跳转工作流 / 说第 N 步」引擎；小白环不是可跳转菜单  

---

## 9. 实现优先级

| 阶段 | 内容 |
|---|---|
| **P0** | `try_dispatch_agent_voice` 走 live pack；说「定计划」与按 Pad Plan **同 slotId、同 dispatch** |
| **P1** | Cursor Pad 面：每槽 Pad + voice 双 binding；迷你栏 chip +「说：xxx」；绑定 **新会话 / 跑测试 / 下一处 / 上一处**；总结改动 + 跑测试走 focus → insert → Enter |
| **P2** | Hook 态 → 高亮能力卡 + grammar **按态过滤**（done 含跑测试/diff；needs_input 仅 gate 开时含接受类）；done/completed 声路径验收 |
| **P3** | Tab2 能力卡对照表；可选 Arm 前置；Hook 安装引导；可选 seed F7/Shift+F7；gate 开启路径文档化 |
| **小白面** | 开箱迷你栏只 4 chip（说话/发送/继续/新会话）；点成功后才提示「也可以说」；Hook 与其余卡进「更多」 |

### P1 新增 slot 映射（实现时）

| slotId | mode | insert / chord |
|---|---|---|
| `runChecks` | insertOnly | `请运行项目的 lint 和 test，并报告结果` |
| `nextChange` | execute | `F7` |
| `prevChange` | execute | `Shift+F7` |
| `acceptChanges` | execute | `Ctrl+Enter`（仅 gate 开） |
| `acceptAllChanges` | execute | `Ctrl+Shift+Enter`（仅 gate 开） |
| `newThread` | execute | `Ctrl+N`；口令 alias「新会话」「清空」 |

「总结改动」模板句：`请总结本次改动的要点和风险`。与「跑测试」「继续」同路径（focus → insert_text → Enter）；第二处模板出现后再抽公共函数。

### 验收要点

- [ ] 说「定计划」≡ 按 Pad Plan 键（同一 `action_id`）  
- [ ] 迷你栏 chip 与 Pad 键 **同 slotId、同文案**  
- [ ] done 态：灯 + 声 + 高亮「继续 / 定计划 / 开工 / 跑测试 / 下一处 / 上一处」  
- [ ] running 态：仅「取消」在 grammar 内  
- [ ] 说「新会话」≡ 按 Pad 新会话键（同 `newThread`）  
- [ ] gate 关：接受 / 全部接受 **灰 + grammar 无**  
- [ ] gate 开 + needs_input：接受类 **亮 + 可语音/按键**  
- [ ] @ 文件在 UI 上 **灰掉**  
- [ ] 未装 Cursor Hook 时 honest 提示「状态灯不准」  
- [ ] Pad 麦 / 侧键发 IME `target_key`，不触发 Cursor 自带麦  
- [ ] PTT 听写中，能力卡口令（如「定计划」）不抢识别  

---

## 10. 原型参考

**落地稿（按真实 320×44 overlay，不是中文大按钮条）：**

| 文件 | 落地 |
|---|---|
| [cursor-mvp-land-a-mini-icons.png](../assets/cursor-mvp-land-a-mini-icons.png) | 迷你栏：Cu● + 4 个 22px 图标，点即执行；新会话 hold |
| [cursor-mvp-land-b-pad-labels.png](../assets/cursor-mvp-land-b-pad-labels.png) | 展开 Pad：键帽写中文；与迷你图标同一 slotId |
| [cursor-mvp-land-c-arm-voice.png](../assets/cursor-mvp-land-c-arm-voice.png) | arm 不抢前台；未 arm 口令无视；已 arm 说「继续」才切 Cursor |
| [cursor-mvp-land-d-click-stay.png](../assets/cursor-mvp-land-d-click-stay.png) | 点发送：切 Cursor 并留下 |
| [cursor-mvp-land-e-probe-fail.png](../assets/cursor-mvp-land-e-probe-fail.png) | 未检测到 Cursor：不画 4 图标，诚实文案 |
| [cursor-mvp-land-f-onboard.png](../assets/cursor-mvp-land-f-onboard.png) | 首装 1 屏钉在真实迷你栏上 |

**情景故事板（信息架构，像素不作为规格）：**

| 文件 | 解决什么 |
|---|---|
| [cursor-workflow-proto-k-minibar-speak.png](../assets/cursor-workflow-proto-k-minibar-speak.png) | 不会写 prompt：听写进 Composer |
| [cursor-workflow-proto-l-minibar-send.png](../assets/cursor-workflow-proto-l-minibar-send.png) | 说完点/说发送 |
| [cursor-workflow-proto-m-minibar-continue.png](../assets/cursor-workflow-proto-m-minibar-continue.png) | Agent 停了：继续 |
| [cursor-workflow-proto-n-softpad-keys.png](../assets/cursor-workflow-proto-n-softpad-keys.png) | 迷你 = Pad 投影 |
| [cursor-workflow-proto-o-new-session.png](../assets/cursor-workflow-proto-o-new-session.png) | 聊乱了：新会话 |

**熟手面（更早稿）：**

| 文件 | 说明 |
|---|---|
| [cursor-workflow-proto-i-capability-cards-fixed-voice.png](../assets/cursor-workflow-proto-i-capability-cards-fixed-voice.png) | 全表能力卡 + 固定口令 |
| [cursor-workflow-proto-g-three-states.png](../assets/cursor-workflow-proto-g-three-states.png) | 空闲 / 等你 / 听写 三态 |
| [cursor-workflow-proto-e-softpad-minibar.png](../assets/cursor-workflow-proto-e-softpad-minibar.png) | Pad + 迷你栏日常 |
| [cursor-workflow-proto-f-minibar-menu.png](../assets/cursor-workflow-proto-f-minibar-menu.png) | 点芯片展开（与 Pad 同动作） |
| [cursor-workflow-proto-h-control-surface-armed.png](../assets/cursor-workflow-proto-h-control-surface-armed.png) | 控制面前置 |

---

## 11. 相关代码入口（实现时）

| 模块 | 路径 |
|---|---|
| Cursor Hook ingest | `src-tauri/src/pad_status/adapters/cursor.rs` |
| Attention / 声音 | `src-tauri/src/agent_attention/store.rs` |
| Cursor needs_input gate | `src-tauri/src/agent_catalog/mod.rs` → `cursor_can_observe_needs_input` |
| Cursor adapter（无 approve） | `src-tauri/src/agent/providers/cursor.rs` |
| 继续 / 模板句注入 | `src-tauri/src/agent/layer1_native.rs` → `execute_agent_continue` |
| 语音派发 | `src-tauri/src/voice_end_runtime.rs` → `try_dispatch_agent_voice` |
| live pack（按键已用） | `src-tauri/src/config.rs` → `live_dispatch_mappings` |
| Pad 布局 / 绑定 | `src/js/features/agent/codex-micro-pad-ui.js` → `CURSOR_SOFT_PAD_SLOT_IDS` |
| Cursor 默认和弦 | `src/js/features/agent/agent-actions.js` → `CURSOR_DEFAULT_KEY_BY_SLOT` |
| Cursor keybindings seed | `src-tauri/src/cursor_keybindings_setup.rs` |
| Pad 麦 chord heal | `src-tauri/src/codex_numpad_layer.rs` |
| IME 预设 | `src/js/ime-presets.js` |
| 迷你栏规范 | `docs/soft-pad-mini-ui-guidelines.md` |
| Hook 探针 | `scripts/cursor-hook-probe.js` |

---

## 12. 一句话总结

**把常见 Cursor 操作做成 Soft Pad 上的能力卡；迷你栏同卡展示。小白开箱只给 4 张可点卡（说话 / 发送 / 继续 / 新会话）：听写替打字，口令只复读已点过的下一步。熟手才展开全表口令与 Hook 态灯。长听写走第三方 IME（PTT），与口令分层。接受类留给 `cursor_can_observe_needs_input` 开了再亮。**
