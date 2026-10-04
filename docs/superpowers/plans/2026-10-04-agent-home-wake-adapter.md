# Agent Home Trust and Wake Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让首页 Agent Center 只展示有证据支撑的状态和操作，并以 Wake 的统一读取形态逐步收敛 Claude、Cursor、Codex 的观察能力。

**Architecture:** 分两条有明确门槛的路线。路线 A 先收口首页诚实闭环：probe 在上游完成，纯 resolver 只消费归一化证据，执行后重新 probe 验证。路线 B 再抽出 Wake 式 `AgentAdapter`：adapter 负责外部 Agent 事实，Registry 只存归一化结果，Agent Center 只做投影；历史读取、索引和 watcher 后置，不阻塞首页。

**Tech Stack:** Rust/Tauri、serde JSON、现有 `ProviderSupport` 六态、SQLite agent memory、Node contract tests、合成 `ONETONE_AGENT_HOME` fixture。

**Spec:** 本计划对应当前会话中的“首页 Agent 诚实对接 + Wake 思路渐进吸收”方案；不改首页布局/CSS，不把 Wake 的历史读取模型误当作 OneTone 的控制模型。

## Global Constraints

- 不把 `ProviderSupport` 六态压缩成四态；六态表示具体执行机制，能力投影另行表达 Native/Emulated/Unsupported/Unknown。
- `interrupt` 只有在 probe 为 `Ok`、目标 ID 精确匹配、会话 active 且证据新鲜时才可 enabled。
- 任何 CLI 失败、超时、解析失败、CLI 不存在都必须 fail-closed；负缓存 TTL 固定为 3 秒。
- `ForceFresh` 不得依赖旧成功证据；动作执行后必须后验 probe，未经验证不得写入 `session_aborted`。
- 所有自动化测试使用 `ONETONE_AGENT_HOME` 或等价合成根目录；真实用户目录只能由显式 smoke 测试访问。
- 首页布局、CSS、中文投影结构本轮不改；Registry 输出统一事实，中文文案由前端投影。
- Codex Hotkey/best-effort 与 Claude Native interrupt 必须分别标注，不能因为 Claude 完成而宣称全 Agent 闭环完成。

## Review Focus

- 负缓存命中期间 CLI 恢复：3 秒内保持 fail-closed，TTL 后自动重试；`ForceFresh` 立即绕过缓存。
- `ForceFresh` 运行期间并发的 Cached 请求：不能继续消费已失效的成功证据。
- 非空但未知的 Claude JSON：必须保持 ParseError，不能猜字段后启用按钮。
- `externalSessionId` 前后空白、别名 provider、部分 ID：必须精确拒绝，不得静默映射。
- 已停止命令返回成功但后验仍 active：必须返回未验证，不得写入 aborted。
- Adapter 未实现某能力：必须返回 Unknown 或 Unsupported，而不是继承 AgentKind 静态布尔值。

---

## 路线 A：先收口首页诚实闭环

### Task 1: 固化 Claude 负缓存和 ForceFresh 语义

**Files:**
- Modify: `src-tauri/src/agent_memory/claude_background.rs`
- Test: `src-tauri/src/agent_memory/claude_background.rs` 内单元测试

**Interfaces:**
- Consumes: `ProbePolicy::{Cached, ForceFresh}`、`ClaudeProbeCache`、`ClaudeProbeRunner`
- Produces: Cached 读取任意状态；ForceFresh 绕过缓存并替换旧结果的确定性语义

- [ ] **Step 1: Write failing tests**：增加 ForceFresh 开始探测前使旧成功证据不可被并发 Cached 消费的测试 seam；不能用 sleep 证明并发，使用可阻塞 fake runner 和 barrier。
- [ ] **Step 2: Run the focused test and verify it fails**：`cargo test --manifest-path src-tauri/Cargo.toml --lib agent_memory::claude_background -- --nocapture`。
- [ ] **Step 3: Implement the minimal cache change**：ForceFresh 在进入 runner 前先使旧缓存失效；不持有 mutex 跨越 subprocess IO；仍将 Ok 和所有错误结果缓存 3 秒。
- [ ] **Step 4: Add an error-state matrix test**：分别验证 ParseError、Timeout、CommandFailed、CliUnavailable 在 TTL 内只调用一次 runner，TTL 后重新调用。
- [ ] **Step 5: Run focused verification**：期望 `8+ passed; 0 failed`，且没有新增 warning 以外的编译错误。

### Task 2: 用真实 Claude 输出解除生产 ParseError 阻塞

**Files:**
- Create/Modify: `scripts/fixtures/claude-agents/claude-agents-active-<version>.json`
- Modify: `src-tauri/src/agent_memory/claude_background.rs`
- Modify: `scripts/fixtures/claude-agents/README.md`

**Interfaces:**
- Consumes: 用户手动采集的 `claude agents --json --all` 非空输出；禁止自动创建后台任务。
- Produces: 版本明确、字段经过真实输出验证的 parser；未知版本仍 fail-closed。

- [ ] **Step 1: Capture a real active fixture manually**：启动一个不消耗额外自动任务的已允许 Claude background 会话，保存完整 stdout，并记录 CLI 版本、采集时间和脱敏说明。
- [ ] **Step 2: Write parser tests first**：至少覆盖 active 匹配、inactive、多个 session、缺少 ID、未知 schema；非目标字段不得影响匹配。
- [ ] **Step 3: Implement versioned parsing**：只读取 fixture 已证实的字段；不能用宽松的“任意字段猜测”启用 Native interrupt。
- [ ] **Step 4: Preserve fail-closed fallback**：空数组仍为 Ok/empty；未识别非空数组仍为 ParseError。
- [ ] **Step 5: Verify**：运行 Claude background、Agent Center 和 Node contract tests；生产真实 CLI 只做显式 smoke。

### Task 3: 让首页状态只来自归一化实例证据

**Files:**
- Modify: `src-tauri/src/agent_memory/agent_center.rs`
- Modify: `src-tauri/src/ipc/commands/shell/agent_center_cmd.rs`
- Modify: `src/js/features/agent/agent-center.js`
- Test: Rust Agent Center tests、`scripts/test-agent-center.mjs`

**Interfaces:**
- Consumes: `ResolveHints.claude_background`、`AgentObservation`/`ObservedStatus` 的时间戳和置信度范式。
- Produces: UI action 的 `supported/enabled/reason` 只从同一份实例证据投影，不再读取静态 `can_interrupt` 或重复推断。

- [ ] **Step 1: Add failing contract tests**：Claude ParseError/过期/ID 不匹配显示 disabled；Ok+active 精确匹配才 enabled；Codex Hotkey 显示 best-effort，不冒充 Native。
- [ ] **Step 2: Remove remaining Claude static interrupt gate**：删除或退化 `interrupt_support(kind)`，保留仅用于兼容的非控制路径，不得参与实例态 enabled 判断。
- [ ] **Step 3: Normalize action support projection**：`ProviderSupport::Native` 表示 Native；`Workflow/Hotkey/DeepLink/InsertOnly` 表示 Emulated/具体机制；`Unsupported` 表示 Unsupported；缺证据表示 Unknown。
- [ ] **Step 4: Keep frontend projection thin**：前端只翻译统一 reason 和 support，不再次判断 session、status 或 provider 名称。
- [ ] **Step 5: Verify**：`cargo test ... agent_memory::agent_center`、`node scripts/test-agent-center.mjs`、`npm run typecheck`。

### Task 4: 路线 A 验收门槛

- [ ] Claude 真实 active fixture 尚未取得时，交付说明只能写“fail-closed infrastructure complete”，不能写“真实中断闭环完成”。
- [ ] 首页不出现 Claude false-positive Interrupt。
- [ ] 负缓存不会造成持续 CLI 风暴；ForceFresh 能即时恢复探测。
- [ ] 全量 Cargo 失败必须按模块归因，不能用局部通过冒充全量通过。

---

## 路线 B：建立 Wake 式统一观察层

### Task 5: 定义最小 `AgentAdapter`，先不引入 transcript

**Files:**
- Create: `src-tauri/src/agent_memory/adapter.rs`
- Modify: `src-tauri/src/agent_memory/mod.rs`
- Modify: `src-tauri/src/agent_memory/registry.rs`
- Test: `src-tauri/src/agent_memory/adapter.rs`

**Interfaces:**

```rust
pub trait AgentAdapter: Send + Sync {
    fn kind(&self) -> AgentKind;
    fn probe(&self, ctx: &ProbeContext) -> AgentProbe;
    fn read_work(&self, ctx: &WorkReadContext) -> AgentWork;
    fn capabilities(&self, probe: &AgentProbe, work: &AgentWork) -> CapabilitySet;
    fn actions(&self, probe: &AgentProbe, work: &AgentWork) -> Vec<ResolvedAction>;
}
```

- `ProbeContext` 必须携带合成 root、时间、probe policy 和可注入 runner。
- `AgentProbe` 必须有 state、observed_at、fresh_until、confidence、diagnostic reason。
- `AgentWork` 必须有 canonical provider、current session、external session ID、status/presence。
- `CapabilitySet` 使用四态语义 `Native | Emulated | Unsupported | Unknown`，并保留可选 `ProviderSupport` 机制细节。
- `ResolvedAction` 继续由 Agent Center 统一投影和执行；adapter 不得直接修改前端状态。

- [ ] **Step 1: Write contract tests**：fake adapter 能在同一输入下产生稳定 probe/work/capability/action；Unknown 不得自动变成 enabled。
- [ ] **Step 2: Implement the minimal trait and normalized types**：不要求历史 transcript 方法，不把 Wake 的所有方法一次塞进 runtime adapter。
- [ ] **Step 3: Add an adapter registry**：按 canonical `AgentKind` 查找 adapter；未注册 provider 返回 Unknown，不回退到静态 catalog 布尔。
- [ ] **Step 4: Verify**：只运行 adapter、registry、Agent Center focused tests。

### Task 6: 将 Claude 专用逻辑包进 adapter

**Files:**
- Create: `src-tauri/src/agent_memory/adapters/claude.rs`
- Modify: `src-tauri/src/agent_memory/claude_background.rs`
- Modify: `src-tauri/src/agent_memory/registry.rs`
- Modify: `src-tauri/src/agent_memory/agent_center.rs`

- [ ] **Step 1: Add fake adapter contract tests**：Claude probe 的 Ok/error/freshness、work target 和 interrupt action 均由 adapter 输出。
- [ ] **Step 2: Move orchestration, not parsing ownership**：`claude_background.rs` 保留 CLI runner、parser、cache；Claude adapter 负责把它们转换为通用 `AgentProbe`/`AgentWork`。
- [ ] **Step 3: Replace direct Claude fields in `ResolveHints`**：先保留兼容反序列化/测试入口，再让 resolver 消费通用 evidence。
- [ ] **Step 4: Verify no behavior change**：现有 Claude 8+ tests、Agent Center 22+ tests、Node contract tests 全部通过。

### Task 7: 将 Cursor 接入同一 adapter，消除静态 action 重复判断

**Files:**
- Create: `src-tauri/src/agent_memory/adapters/cursor.rs`
- Modify: existing Cursor registry/read modules and `agent_center.rs`
- Test: Cursor synthetic-root adapter contract tests

- [ ] **Step 1: Inventory current Cursor facts**：把 mapping、marks、presence、focus、session identity 分为 probe/work/capability 三类。
- [ ] **Step 2: Implement adapter using existing facts**：不复制现有 parser；adapter 只做归一化。
- [ ] **Step 3: Remove `view/focus` duplicate checks**：二者必须共享同一 capability evidence；若产品仍需两个入口，只保留不同 action ID 和 label。
- [ ] **Step 4: Replace provider-name substring session matching**：使用 canonical provider ID 和 adapter 返回的 session identity。
- [ ] **Step 5: Verify**：合成 HOME 下覆盖存在、缺失、脏 marks、provider alias 和 stale evidence。

### Task 8: 后置吸收 Wake 的历史读取层

**Files:**
- Create: `src-tauri/src/agent_memory/history_adapter.rs` 或 adapter 内部 history module
- Modify: existing agent memory SQLite/index modules
- Create: synthetic fixtures under `scripts/fixtures/agents/`

- [ ] **Step 1: Define cheap-first history interface**：`data_roots() -> detect() -> list_session_files() -> quick_meta() -> parse_session()/parse_transcript()`；`list_session_files` 不读取正文。
- [ ] **Step 2: Add `with_custom_root` through `ProbeContext`**：测试 root 只能从 context 注入，不能修改进程 HOME。
- [ ] **Step 3: Implement one provider deeply**：优先 Codex JSONL + state DB；先完成 session listing 和 quick metadata，再做 transcript parser。
- [ ] **Step 4: Keep index independent**：adapter 输出 normalized records，SQLite sessions/messages/FTS/tombstones 负责可丢弃重建；UI 不碰 JSONL/DB 格式。
- [ ] **Step 5: Add mtime scan before watcher**：先实现稳定 mtime 增量扫描，watcher 仅作为加速，不作为正确性前提。
- [ ] **Step 6: Verify**：删除索引后可从 fixture 重建；重复扫描幂等；tombstone 和文件修改不会制造重复 session/message。

### Task 9: 路线 B 验收门槛

- [ ] Registry 只存统一结果，不再存一组会被 Agent Center 二次解释的布尔能力。
- [ ] 首页、Agent 管理页、MCP 使用同一 normalized snapshot。
- [ ] 任一 adapter 缺失或 schema 未知时，产品显示 Unknown/Unavailable，不猜测启用。
- [ ] 至少 Claude 和 Cursor 通过最小 adapter contract；Codex 历史读取可独立于首页控制闭环交付。
- [ ] Wake 的历史能力和 OneTone 的 Windows focus/interrupt/voice 操作保持分层，不引入 Hannah 的策略 deny 管道。

## Recommended Execution Order

1. 先执行 Task 1–4，完成首页诚实闭环验收。
2. 再执行 Task 5–6，把 Claude 从专项 hints 迁入最小 adapter；保持首页行为不变。
3. 执行 Task 7，收敛 Cursor，顺便清除 `view/focus` 和静态 session 判断。
4. 最后执行 Task 8，按 Wake 模式建设历史读取、索引和 watcher；这一步不应阻塞首页发布。

## Non-goals

- 本计划不重做首页布局和 CSS。
- 本计划不把所有 provider 一次性改成 Native。
- 本计划不自动创建真实 Claude 后台会话。
- 本计划不实现 Hannah 的 deny/allow/warn 策略管道。
- 本计划不把 Codex Hotkey 伪装成实例级 interrupt。
