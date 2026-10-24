# 新首页工作区整改方案

> 范围：`home-agent-v2` 滚动区「Agent 任务与会话」行列表（及与之共享投影的 Hero / pulse）。  
> 壳层已对齐 Mac WorkbenchHomeView；本方案只改**行数据语义**，不改 Dock / Mid 已定方向。  
> 证据档：A 原生 hook · B 部分支持 · C 间接推算。

---

## 1. 目标与非目标

### 目标

1. 工作区只展示**有可叙述证据**的任务/会话行，方便扫状态与数据。
2. 行结构对齐 Mac：`名 · 状态标 · 工作句 · 相对时间 · 真 CTA`。
3. A 定真假，B 定边界，C 只装饰；禁止占位文案冒充内容。
4. 原 Focus 桌有价值信号按档迁入，不回流 Mid 作文区 / 台账墙。

### 非目标

- 不重做 Agent Center 全页；首页「查看全部」仍跳转 Center。
- 不把 inventory 探测、windowsLabel、metrics 做成工作区主内容。
- 不恢复 Mid Focus composer + icon grid。
- 不伪造 `installed` / 假 sent。

---

## 2. 问题根因（已确认）

| 现状 | 后果 |
|------|------|
| `workRows = agents.slice(0, 3)` | idle / 仅 discovered 也占位 |
| `project \|\| '最近工作'` · `title \|\| '查看最近工作'` | 空证据仍画满行 |
| `rowHtml` meta = `windowsLabel` | 副行是能力探测，不是工作 |
| 行 CTA 堆 focus/approve/resume | 与 Mac「发送到此」主路径抢注意力；状态语义弱 |

---

## 3. 证据档与入列规则

### 3.1 三档定义

| 档 | 来源 | 可进 waiting | 置信 |
|----|------|--------------|------|
| **A 原生** | `officialHook` / `appServer` / `native` / `OneToneAsk` | 是 | high |
| **B 部分** | hook waiting、solo 本地灯、checkpoint、focus 有 interrupt 无 | 否或受限 | medium |
| **C 间接** | cwd 叶名、relativeWhen、score、matchConfidence、inventory | 否 | 装饰 |

### 3.2 入列谓词（唯一权威）

```
eligible(row) ⟺
  hasNarration(row)                    // 真工作句，见下
  ∧ (isA(row) ∨ isBWithBoundary(row))  // B 须带边界文案，不可假装 A
  ∧ ¬isPlaceholderOnly(row)

出列 ⟺ 仅 inventory · 仅 windowsLabel · 仅占位/未知句
```

**`hasNarration` / 假内容黑名单（必须显式排除）**

| 字符串 / 来源 | 今天会出现在 | 处理 |
|---------------|--------------|------|
| `已探测 · 可发送` 等 | `windowsLabel` → 行 meta | **行上禁止再用 windowsLabel**；文案可留在 detail / 发送失败说明 |
| `检测到交互，内容未知` | `prompt_journal::UNKNOWN_PROMPT_SUMMARY` → `recentPrompt` → `workLine` | **视为无 narration**（与空串等价）；有 A 态无真句时用短状态句「执行中/等待确认」，不用 journal 未知句 |
| `最近工作` / `查看最近工作` | `projectAgent` fallback | 删除 fallback；不入列 |
| `能力受限`（sole line） | `workLine` 无 work 时 | 不算 narration；可作 B `boundary`，不出行主句 |

真 narration 仅：非黑名单的 `recentPrompt`、`currentWork.title`（非 sessionId 裸 ID）、usable checkpoint step、fresh attention 可读标题。

`workRows(n)`：**先 filter eligible，再按 score/updated 排序，再 slice(n)**。禁止先 slice 后假装有内容。

### 3.3 行 ViewModel（替换当前 projectAgent 对外字段）

```
{
  kind, name,                    // Agent 名
  tag, tagTone,                  // 执行中 | 等确认 | 可恢复 | 空闲 | 失败  （来自 A/B 态）
  line,                          // 工作主句：A.prompt/title > B.checkpoint/受限说明；禁止占位
  project?,                      // C：有则缀在 line 后「· proj」；无则省略
  when,                          // C：relativeWhen；无时间则省略，不写「未知」硬填
  evidenceTier: 'A'|'B',         // 行 data 属性，便于验收
  boundary?,                     // B 副标：可观察 · 无远程中断 等
  primaryCta: 'send'|'approve'|'resume'|'open',  // 只暴露一个主 CTA
  actions                        // 仍保留 raw actions，供 approve 条等
}
```

占位删除：`最近工作`、`查看最近工作` 从投影层移除；无 narration → 该 agent 不入 `workRows`。

### 3.4 对齐「真数据 / 实时」与是否去掉 Agent

Mac 预览 HTML 里的 Codex/Claude/Cursor 行是**演示 fixture**，不是系统实时源。要对齐的是 **Mac IA + 诚实动态**，不是对齐那三行假文案。

**真数据从哪来（Windows）**

| 动态 | 数据源 | 刷新 |
|------|--------|------|
| 执行中 / 等确认 / 失败 | Soft Pad / OfficialHook → attention → Center `observedStatus` | attention 事件 + Center snapshot 轮询（现有） |
| 工作主句 | `recentPrompt`（非未知句）/ `currentWork.title` / checkpoint step | 同上 + prompt journal |
| 投递结果 | Dock send receipt | 即时 |
| 可发送目标 | inventory ∪ Center `agent.focus` | inventory / Center 刷新 |

无 A 事件、无真句 → **无法「像 Mac 演示那样」填满三行**；正确行为是 empty 或少行，而不是用探测串凑满。

**分层展示（不要一刀切从产品里删 Agent）**

| 表面 | 谁出现 | 谁消失 |
|------|--------|--------|
| **工作区行** | 仅 `eligible`（A/B + 真 narration 或短状态句） | 仅 C / 未知 prompt / 无态无句 → **不出行**（等价于「去掉展示」，按证据临时隐藏） |
| **Pulse** | eligible 优先；可补 discovered idle chip（有边界） | 未探测、未安装不出现 |
| **Dock 发送目标** | 可 focus / 已发现且用户可选的目标（含无工作行的 idle Agent） | 未探测的不进快捷目标 |
| **Agent Center「查看全部」** | 全量名册 | 不在首页裁剪能力集 |

结论：

1. **匹配实时** = 接上 A 通道（hook connected）+ 入列规则；动态跟 attention/Center，不跟假 fixture。  
2. **不支持真动态的 Agent** = **从工作区行撤掉**，不是从 CATALOG / Center 永久删除。  
3. **仍可发送**的 Agent 留在 Dock；工作区 empty 时文案引导用底栏。  
4. Cursor 等「可观察 · 无远程中断」属 **B**：有真句或明确边界才入行；只有 inventory → 不出行。

---

## 4. 原首页内容迁入映射

| 原 Focus / classic | 档 | 新落点 | 操作 |
|--------------------|----|--------|------|
| Needs You（Soft Pad / attention） | A | approve 条 + 行 tag「等确认」 | 复用 Center actions；Hero 用 focusVm.headline |
| Living / working | A（或 B 本地） | pulse + 行 tag「执行中」+ line | line 用 recentPrompt/currentWork |
| Continue / checkpoint | B | Hero return **或** 一行「可恢复」 | 有 usable step 才入列；无则不出行 |
| Recent sessions | B/C | 工作区行 | 有 title 才入；continueSid 去重 |
| Status strip 单条 | A 仲裁 | 并入 approve / 首行 | 不双挂 strip host |
| Quiet 作文 + icon grid | — | Dock 草稿 | 不动 |
| Agent 台账 / inventory ledger | C→B | 「查看全部」→ Center | 首页不铺台账 |
| 项目确认 gate | B | perm / Hero | 不占工作区行 |
| probeFoot / consent | B | 轻提示（可选一行 hint） | 不挡草稿 |
| windowsLabel / 能力探测 | C | Dock / detail | **禁止**作 row meta |

---

## 5. UI 契约（Mac 行）

参考 `design-mock/onetone-mac-home-preview.html`：

```
[icon]  Name  [tag]
        line · project?          when?
                         [主 CTA：发送到此 | 批准 | 继续]
```

- 选中行 = 发送目标（`data-ha2-select`），与 Dock dest 同步（已有）。
- 主 CTA 优先级：`approve`（A needs）> `resume`（B fresh checkpoint）> `send`（可 focus）> `open`（仅查看）。
- 次要「›」进详情可保留；不要一排四个按钮淹没状态。
- Empty：沿用 Mac 文案「还没有可展示的 Agent 任务…」——**无 eligible 行时必须 empty**，即使 agents/targets 非空。

Hero / pulse：

- Hero quiet：无 eligible →「现在没有正在推进的事」（已有）；有 eligible → 用首行 line，不用占位 title。
- Pulse：优先 eligible 行状态；无行时才用 discovered targets 作 idle chip（现状可保留）。

---

## 6. 实施步骤

### P0 — 投影诚实（阻塞）

**文件**

- `src/js/features/now/home-agent-v2-store.js`  
  - `projectAgent`：去掉占位 fallback；增加 `hasNarration` / `evidenceTier` / `tag`。  
  - `workRows`：filter → sort → slice。  
  - 可选：从 focusVm.desk.continueCard / attention 合并 B 行（若 Center 缺 narration 但 Focus 有）。
- `src/js/features/now/home-agent-v2.js`  
  - `rowHtml`：Mac 结构（tag / line / when / 单主 CTA）；meta 不再绑 `windowsLabel`。  
  - `taskVm`：首 eligible 行驱动；禁占位 title。  
  - `emptyListHtml`：agents 非空但 workRows 空 → 仍 empty（关键）。

**验收**

- 无 recentPrompt/currentWork/needs/resume → 工作区 empty。  
- 有 A needs_input → 行 tag + approve 主 CTA（或顶部 approve 条，二选一不重复堆）。  
- DOM/字符串断言：`data-ha2-list` 内禁止出现：
  - `最近工作` / `查看最近工作`
  - `已探测` / `可发送`（windowsLabel 族）
  - `检测到交互，内容未知`
- Fixture：`recentPrompt = "检测到交互，内容未知"` 且无其它 title → **不出行**（或仅有 tag 短句「执行中」，断言不含「内容未知」）。

### P1 — 原桌信号并入

**文件**

- `home-agent-v2-store.js`：订阅路径已有 FocusStore；在 `workRows` 投影中合并：
  - attention fresh wait → A 行（若 Center 已有同 agent，合并不双行）
  - fresh checkpoint → B「可恢复」行（与 Living 同 session 去重，沿用 adapter 规则）
- 不重挂 `homeAgentStatusHost`；逻辑复用 `pickStatus` 优先级思想，UI 落 approve/首行。

**验收**

- [x] Soft Pad 等待与 Center needs 不双条。  
- [x] Living + 同 session Continue 只保留 Living。  
- [x] `cmd_agent_home_snapshot` → `enrichFromHomeSnapshot`；`workRows` = Center eligible ∪ desk 去重。  
- [x] approve 条读 `workRows`（不与 Soft Pad 双挂）。

### P2 — 测试与回滚

**文件**

- `scripts/test-home-agent-v2.mjs`：  
  - eligible / empty / 禁占位 / 行结构（tag+line+when）  
  - A/B 分档 fixture（mock agent DTO）
- `scripts/smoke-now-home.mjs`：不破坏 Focus classic；V2 相关断言跟进行结构。

**回滚**（已有）：`?homeAgentV2=0` / `localStorage onetone.homeSurface=focus|classic`。

### P3 — 打磨（可选）

- 行 `data-evidence="A|B"` + 开发态小标（默认隐藏）。
- B boundary 文案与 Mac Claude「可观察 · 无远程中断」对齐。
- when / project 截断与 i18n。

---

## 7. 操作顺序（建议一次落地）

1. **先改 store 投影 + workRows 过滤**（P0 数据），不改样式也能立刻消灭空心行。  
2. **再改 rowHtml / taskVm**（P0 UI）。  
3. 跑 `node scripts/test-home-agent-v2.mjs` + `node scripts/smoke-now-home.mjs`。  
4. 真机：Cursor/Codex 各一：无会话 empty → 投递后有行 → Soft Pad 等待出 approve。  
5. 再开 P1 合并 Focus desk（若 Center 行仍偏少）。

---

## 8. 风险与护栏

| 风险 | 护栏 |
|------|------|
| 过滤过严 → 常 empty | empty 文案引导 Dock；pulse 仍显示 discovered |
| Center 缺 title 但 hook 有态 | P1 用 attention/prompt_journal 补 narration；有态无句 → tag+boundary，line 用「等待确认/执行中」短句（仍算 narration，非占位项目名） |
| 双 CTA / 双 approve | 主 CTA 单选；approve 条与行 approve 互斥（有条则行用「查看」） |
| 回归 classic Focus | smoke 门禁；V2 默认可继续用 query 回滚 |

---

## 9. 完成定义

- [x] `workRows` 仅 eligible；无 eligible → empty。  
- [x] 列表 DOM 无「最近工作」「查看最近工作」「已探测…可发送」「检测到交互，内容未知」。  
- [x] 行含：名、状态 tag、工作句（或 A 短状态句）、when（有则）、单一主 CTA。  
- [x] meta 非 windowsLabel；未知 prompt 不计入 hasNarration。  
- [x] test-home-agent-v2 + smoke-now-home 绿。  
- [ ] 真机 A（hook 等待/执行）与 empty 两场景肉眼通过。

---

## 10. 关键文件一览

| 文件 | 改动 |
|------|------|
| `src/js/features/now/home-agent-v2-store.js` | 投影、eligible、workRows |
| `src/js/features/now/home-agent-v2.js` | rowHtml、taskVm、empty 判定 |
| `src/css/home-agent-v2.css` | 行 tag / when（小改） |
| `scripts/test-home-agent-v2.mjs` | 入列与禁占位断言 |
| `scripts/smoke-now-home.mjs` | 仅必要时补 V2 相关 |

不改：`home-focus-triad.js`（Focus 专用）、Dock 草稿链、默认 flip / 回滚开关。
