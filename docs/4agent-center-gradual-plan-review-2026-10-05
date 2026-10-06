# 《Agent Center 梯度交付计划（执行前修正版）》评审

日期：2026-10-05 00:25 ｜ 评审对象：Phase 0–4 梯度交付计划  
核验基线：`4fc86e5d`（2026-10-05 00:18）｜ working tree **0 modified / 0 untracked**

## 总评：A-

**前提核验 10/10 成立** —— 这是本项目历次方案里功课最扎实的一份。

- 上一轮（23:42）我判定的"Agent Center 全套未提交"已在 00:18 被提交，**该结论作废**。
- 技术判断专业，诚实边界设计精准对应当前真实短板。
- 扣分集中在三处可执行风险（R1–R3），其中 R1 会直接造成资产损失。

## 一、前提核验（逐条 grep，全部通过）

| 方案声称                                                          | 实测                                            | 结论 |
| ------------------------------------------------------------- | --------------------------------------------- | -- |
| HEAD 含 Agent Center 主体 `4fc86e5d`                             | `4fc86e5d` @ 00:18:01                         | ✅  |
| working tree clean                                            | modified 0 / untracked 0                      | ✅  |
| `title.rs` / `codex_background.rs` / `prompt_journal.rs` 不存在  | 三者均不存在                                        | ✅  |
| `claude_background.rs` ~17KB                                  | 17534 bytes                                   | ✅  |
| `agent_center.rs` ~79KB                                       | 79268 bytes（2150 行，方案写 ~2027，微差）              | ✅  |
| `agent_events.detail_json` 列已存在                               | 建表语句含该列                                       | ✅  |
| `append_observed_event` 写 `detail_json=NULL`，缺 with_detail 变体 | SQL 硬写 `VALUES(...,NULL)`，仅 2 个 pub fn append | ✅  |
| `.gitignore` 缺 `test-output/` `output/`                       | grep 无匹配                                      | ✅  |
| Codex interrupt fail-open                                     | 见下，**比方案描述更宽松**                               | ⚠️ |
| 验收涉及的 scripts / css 存在                                        | 4 个文件全在                                       | ✅  |
| `cargo test --lib` 可行                                         | agent_memory 下 10 个文件含 `#[cfg(test)]`         | ✅  |

## 二、Codex interrupt：方案低估了严重性

方案说"working 即 enabled"。实测 `agent_center.rs:882-889`：

```rust
} else if kind == Some(AgentKind::Codex) {
    // Focus target exists for Codex — enable; execute will focus+Esc.
    interrupt_enabled = true;
```

**连 `working` 判断都没有 —— 仅凭 `kind == Codex` 就 enabled。** 对比 Cursor 分支（869-881）有 mapping target 校验，Codex 分支是后加的、明显更粗糙。  
→ 修正时按更严标准改：不要只删 `working`，要把 `focus target + active session + freshness` 三项证据都补上；也不要照抄 Cursor 分支的宽松度。

## 三、三个可执行风险

### R1（高）`.gitignore` 加 `output/` 会踩 81 文件陷阱

`output/` 下**已有 81 个被 git 跟踪的文件**（含 `agent-console-home.html`、`agent-console-home-v2.html` 等本轮评估产出的原型）。gitignore 对**已跟踪文件无效**：

- 加了也白加：`git status` 照样显示 output/ 下的改动 → 产生"已忽略"的假象。
- 更危险：若执行者为"让它生效"跑 `git rm -r --cached output/`，等于把 81 个文件从版本库移除，下次提交即删除。

**建议**：不要 ignore 整个 `output/`。只加 `/test-output/` 与 `output/test-output/`；若确实要 ignore `output/`，必须先单独决策这 81 个文件的去留（保留跟踪 or 显式 `git rm` 并写进报告）。

### R2（高）Phase 1 与 Phase 3 的依赖顺序倒置 —— 标题做完也没有信息量

Phase 1 的推导优先级首版实际命中 2–5：project+session metadata / project 名 / lifecycle 摘要 / Unknown。

- 优先级 2、3 都是 **project 名** → 同一项目下所有会话标题相同（全是 "voice-pilot"），对用户零信息量。
- 唯一有信息量的是优先级 4（lifecycle 事件摘要），但它**依赖 hook 上报覆盖率**：没接 hook 的 agent 直接掉到 Unknown。
- 结果：Phase 1 产出一堆"项目名标题"和"未命名会话"，**M2（标题识别）分数不会实质上升**——这恰恰是上一轮评分里最弱的一项（0.5/2）。

而真正有信息量的来源（最近提问摘要）在 **Phase 3** 才做。

**建议**：把 Phase 3 的 PromptJournal 提到 Phase 1 之前（或至少让 Phase 1 预留"最近提问摘要"作为优先级 2.5，Phase 3 落地后回填）。另外硬规则补一条：**当推导结果是 project 名时，UI 必须显式标 Derived 并注明"来自项目名"**，避免用户误当成真标题。

### R3（高）第三套体系风险：未处理与 `agent_lane` 的命名空间对齐

方案全程未提 `pad_status` / `agent_lane`。而 `agent_lane` 已有：会话状态机（`LaneState`）、导航能力（`can_focus_live` / `can_resume` / `can_open_exact_session`）、以及同样为空的 `title` 字段，其 `LaneKey.lane_id = "{provider}:session:{session_id}"`。

PromptJournal 新建一套 event 存储后，若 `session_id` 与 lane 的 `session_id` 不同源，将来还要做一次映射 —— 那就是第四套。

**建议**：Phase 3 落库前明确一条硬规则 —— `prompt_journal` 的 `session_id` 必须与 `agent_lane::LaneKey.session_id` 同命名空间，并在单测里断言两者可互相定位。不要求本轮打通 lane（那是另一件事），但命名空间必须先钉死。

## 四、中低风险

- **R4（中）验收命令缺守门测试**：Phase 4 改了首页投影，验收清单里没有 `node scripts/test-home-default-surface.mjs`（Fusion G 唯一守门测试）。必须补。
- **R5（中）Phase 0 快照实操**：`Compress-Archive` 面对本仓库规模（`remotion-videos/` 4411 文件、`design-mock/` 316、`src-tauri/` 77k）易超时或 OOM。建议用 `tar -czf`，并显式追加排除 `remotion-videos/`、`design-mock/`、`prototypes/`、`assets/`、`edits/`、`output/`（快照只需源码+脚本+fixture）。建目录前先确认 E 盘余量。
- **R6（低）幂等键安全**：`events.rs` 的 `event_id = sha256(provider|source_ref|event_type)` 已含 provider，Claude/Codex/Cursor 的 source_ref 不会互相冲突 —— 方案担心的那点已经天然安全，可以放心。

## 五、明确认可（这些设计是对的，别在后续迭代里丢掉）

1. **禁止伪造 Observed**：没有真来源就不启用 Observed 路径、不为测分支捏造 fixture。
2. **两级证据门槛**：`HookRegistered ≠ PromptPayloadObserved`，只有拿到真实 payload 才标 `ClaudeHook` 并展示文本，否则"内容未知"。这是本项目最需要的诚实设计。
3. **Codex 不发明 CLI schema**：无可验证控制面则恒 `Unavailable/Unsupported`，用注入式 fake runner 测状态机而非冒充生产 parser。
4. **`detail_json` 永不存原文**，只存 `{role, text_len, source, confidence}` + 清洗截断后的 summary。
5. **性能约束**：禁止在 `resolve_actions()` 内查库，上游批量注入 `ResolveHints`。
6. **静态 support 仅作机制上限**，不得单独开按钮。
7. **前端文案"最近提问"而非"最近对话"**，前端不判断 interrupt/transcript。
8. 禁词自检清单与"未做事项"清单 —— 防止交付时被口头放大。

## 六、建议的执行顺序调整

```
原方案：P0 → P1 title → P2 codex → P3 journal → P4 首页
建议：  P0 → P3 journal → P1 title(回填提问摘要) → P2 codex → P4 首页
```

理由：标题的信息量来自提问摘要，先做 journal 才能让 P1 真正提升 M2；P2 与其它两个无依赖，位置可保持。

## 七、验收清单补丁

在方案原有命令基础上追加：

```
node scripts/test-home-default-surface.mjs     # R4：首页守门，必跑
```

Phase 0 报告需额外写明：`output/` 81 个已跟踪文件的处置决定（R1）。
