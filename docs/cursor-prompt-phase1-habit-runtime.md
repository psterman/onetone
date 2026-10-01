# Cursor 落地 Prompt：OneTone Phase 0 + Phase 1（Runtime Habit Facade）

> 用法：把本文件整体粘给 Cursor（或让它读这个文件）。里面所有代码事实都已核验过，带 `file:line`，**不必重新推导，但改动前请自己再确认一次行号**。

---

## 0. 任务一句话

在 `E:\voice-pilot` 建立运行时习惯的**单一事实层** `OneToneHabitRuntime`（Facade），并修掉"旧 Dashboard 没被真正隐藏"这个缺陷。

**本次不改 Now 首页 UI。**

---

## 1. 背景（你需要知道的最小上下文）

OneTone 是 Windows 桌面应用（Tauri + 原生 JS）。`src/` 下没有构建步骤，全部靠 `index.html` 里的 `<script>` 顺序加载。

- **习惯** = `config.mappings[]`（Rust 侧 `MappingEntry`）
- **"当前状态"** 名义上是 `config.activeSceneId`，但真正生效的是前端 `OneToneRuntimeHabitControl.resolveActiveSceneId()` 的 5 级优先级解析
- **现状病灶**：Now 首页（`src/js/features/now/*`）自带 `fixtures.js` + 本地 `live` 对象，点"会议中"只改内存——不写 config、不通知 Rust、刷新即丢；而真实状态解析在 `runtime-habit-control.js` 里，两者完全独立。这就是"两个状态源"。

本次目标不是让首页好看，而是**先建立唯一事实层**，让"有效状态"只有一个来源，且这个来源可以被观察（订阅）与被操作（受控切换）。

---

## 2. 已核验的代码事实（直接用，不要重新推导）

### 2.1 `src/js/features/scene/runtime-habit-control.js`

- `resolveActiveSceneId(identity, opts)` **`:156`** — 优先级：
  1. `pin.kind==='habit'` → 返回 pin.mappingId
  2. `pin.kind==='appHabit'` 且前台 app 匹配 → 返回 pin.mappingId
  3. softOverride 且 `fgSignature` 与当前前台一致 → 返回 softOverride.mappingId
  4. `cfg.followForegroundAppScenario` 且有前台身份 → `autoSceneIdForIdentity()`（走 `OneToneHabitHub.findAppScenarioForIdentity`），兜底 `cfg.activeSceneId`
  5. 兜底 `cfg.activeSceneId`
- ⚠️ **它不是纯函数**：
  - `ensureRuntimeFields()` 会**补写** `cfg.runtimeHabitControl`
  - softOverride 失效分支 **`:176-179`** 会 `clearSoftOverride()` + `persistQuiet()`（**写盘**）
  - 依赖模块级单例 `lastFgIdentity`（`identity` 参数可覆盖，默认取单例）
  - 外部依赖：`OneToneMappingCore.byId`、`OneToneHabitHub.findAppScenarioForIdentity`、`OneToneAppBehaviorRules`
- `resolveRuntimeHabitDisplay(identity)` **`:189`** — 返回
  `{ mode, mappingId, habitName, badgeLabel, tooltip, canClearPin, canClearOverride }`
  **各分支 shape 不一致**：`appName` 只在 `pinAppHabit` 分支返回；`staleOverride:true` 只在"失效 override"分支返回。
- 现成中文文案（**已 i18n，Facade 应原样透传，不要重新翻译**）：
  - `已锁定: {name}`（pinHabit）
  - `在 {app} 锁定: {name}`（pinAppHabit）
  - `临时选用`（softOverride），tooltip「你临时选用了 {name}。切到别的应用时自动恢复跟随前台。」
  - `手动`（manual）/ 跟随前台时的说明文案
- 导出清单 `:271-285`

### 2.2 `src/js/features/scene/scene-activate.js`

- `activateScene(id, opts)` **`:77`**
  - ⚠️ **`:84-87`**：有 pin 且 `source==='manual'` 时**静默 `return`**，只有 `opts.force` 才继续，**且不发 toast**
  - 副作用 **`:112-117`**：`m.lastUsedAt=Date.now()`、`m.useCount=(m.useCount||0)+1`、`cfg.activeSceneId=id`、`postMessage('mvp_scheme_select')`
  - 非已保存习惯 / incomplete stub 会 `toast` 后拒绝（`:101-110`）
- `applySoftOverride(id, identity)` **`:124`** = `setSoftOverride` + `activateScene` → **底座 `cfg.activeSceneId` 也被改**，所以"临时"语义目前不成立（Phase 4 才修）
- `normalizeSource()` **`:44`**：只把 `foreground/follow/auto` 归一为 `'foreground'`，其余一律 `'manual'`
- `pendingSwitchSource` / `takePendingSwitchSource()` **`:8 / :50 / :57`** — source 管道已存在
- `scheduleManualSwitchPaint()` **`:60-75`** — 显式点名调用
  `OneToneHomeWorkbenchPanels.renderScenarioPanel()` / `.renderRuntimeStatusRow()` / `OneToneHomeWorkbench.render()`
  → **这是当前唯一的刷新入口**

### 2.3 通知机制

`src/js/core/config-persist.js` **没有任何事件机制**：搜 `dispatchEvent|CustomEvent|EventTarget|subscribe|onChange|notify|addEventListener` 零命中。
→ `subscribeChange` 必须新建，**没有现成 pipeline 可复用**。

### 2.4 现有消费者（Phase 3 要复用，勿重写）

- `src/js/features/home/home-workbench-panels.js:1324-1333` — 旧首页已在渲染 `resolveRuntimeHabitDisplay()` 的 badge
- `src/js/features/home/home-workbench.js:2561-2577` `selectWorkbenchMapping()` — `applySoftOverride` 的**唯一**调用点
- `src/js/features/agent/soft-pad-tray-ui.js:93-99` — 取当前 scene id
- `src/js/features/mapping/habit-channel-edit-banner.js:55-61` — 取当前 scene id
- `src/js/features/home/home-workbench.js:2396-2400` — pin 存在时用 `{source:'foreground'}` 落定

### 2.5 Now 模块（本次**不要动**）

- `src/js/features/now/fixtures.js:8` — `HABIT_CATALOG` 写死的假数据
- `src/js/features/now/now-model.js:64` — `activateHabit()` 只改本地 `live` 对象
- `src/js/features/now/now-home.js` — 从不读 config（唯一例外：`resolveHotkey()` 读 `OneToneState.config` 取语音快捷键）

### 2.6 Rust 侧（本次**不要动**）

- `src-tauri/src/config.rs:2353-2368` — `SceneConfig` 标注 `Legacy / reserved; not used at runtime`
- `src-tauri/src/config.rs:2421` — `scenes: Option<Vec<SceneConfig>>` 带 `skip_serializing`，全仓无读取点 → **死代码，但本次不删**
- `src-tauri/src/scene_config.rs` — **活的**：`EffectiveSceneConfig` / `resolve_effective_scene`，被 `voice_end_runtime.rs:127` 使用 → **不要删**
- `src-tauri/src/lib.rs:49` — `mod context;` **已注册**，但 `context::snapshot_live()` **零生产调用点**（只有 `context/mod.rs:85,92` 的单测）→ Phase 5 之前**不要在前端留假接口**

### 2.7 统计字段

`useCount` / `lastUsedAt` 全仓只有两处消费者：`config-persist.js:2263-2266`（从远端合并）、`i18n.js:4770` `habitHubUseCount`（展示文案）。**无排序 / 推荐 / 默认态消费者** → 不需要 `recordUsage:false` 之类的参数。

### 2.8 验证工具现状 ⚠️

`node_modules/playwright` **当前是坏的**（`playwright-core@1.59.1` 缺 `lib/server/dispatchers/browserDispatcher.js`），仓库里所有 `test-*.cjs` 这类 Playwright 脚本**都跑不起来**。
→ 验证请用 `vm` 模式的手写测试（参考 `scripts/smoke-now-home.mjs`）。**不要试图修 Playwright**，那超出本次范围。

---

## 3. 硬性约束（不许做）

1. **不改 Now 首页 UI**（`src/js/features/now/*` 任何文件）——那是 Phase 2
2. **不新增字段**到 `MappingEntry`：`controls[]` / `actions[]` / `promise[]` 都不许加（`promise` 是 Phase 3；`actions` 请从现有 `target_actions` 投影）
3. **不复活** `VoiceConfig.scenes[]`，**不删** `scene_config.rs`
4. **不重命名**"习惯页"、不改 i18n key、不动 `data-wb-nav` / DOM id
5. **不新增**前端假 Context 接口
6. **不引入**构建步骤或新依赖
7. **不修** Playwright
8. 不做视觉调整

---

## 4. 任务

### T0 — 隐藏旧 Dashboard（1 行 CSS）｜⚠️ 工作区已应用，本次只需验证

```css
/* 已存在于 src/css/home-workbench.css（未提交，位于 .wb-dashboard-stack 规则之后） */
/* [hidden] alone loses to display:flex above — Now home sets stack.hidden */
.wb-dashboard-stack[hidden]{display:none !important}
```

**不要重复添加这条规则。** 你的任务是：确认它在真实页面里生效（见第 5 节手工验证第一条），并把它放进第 6 节要求的第 2 个 commit。

**为什么**：`.wb-dashboard-stack{display:flex}` 覆盖了 `[hidden]` 的 UA 规则（`display:none`），导致 `now-home.js` 里 `stack.hidden = true` **视觉上完全无效**。实测：`hidden=true` 但 computed `display:flex`、仍占 382px，旧工作台整块排在 Now 面板下方，同时把 Now 面板挤到 402px、`.now-body` 出现 307/606 的内部二次滚动。
仓库既有约定：`app.css` 里有 100+ 处同款 `X[hidden]{display:none!important}`。

**验收**：注入该规则后 `#wbDashboardStack` computed `display:none`、可见高 0；`#nowHomeRoot` 高度 402 → 784；`.now-body` 不再需要内部滚动。

---

### T1 — 新建 `src/js/features/scene/habit-runtime.js`（本次主体）

全局名 `OneToneHabitRuntime`。
**必须**在 `src/index.html` 的 `:5610`（`js/features/scene/scene-activate.js` 之后）加载，顺序为
`runtime-habit-control.js` → `scene-activate.js` → `habit-runtime.js`。

对外 API（严格照此，Now 将来只依赖它）：

```js
OneToneHabitRuntime = {
  getSnapshot(),                       // 归一化只读快照
  switch(id, opts),                    // 唯一写入口（T2）
  subscribe(type, cb),                 // 事件订阅（T3）
  unsubscribe(cb),
  notify(reason, detail),              // 供外部触发事件
  reconcile(opts),                     // 显式落定清理，会写盘（T4）
  calculateEffectiveScene(identity)    // 纯计算，不写盘（T4）
}
```

`getSnapshot()` 固定 shape —— **所有 key 恒存在，不允许各分支缺字段**：

```js
{
  current: {
    id,            // = effective activeSceneId
    name,          // = habitName
    appName,       // 恒存在，默认 ''（原实现只在 pinAppHabit 分支给）
    mode,          // pinHabit | pinAppHabit | softOverride | auto | manual
    badge,         // = badgeLabel，原样透传（已 i18n）
    tooltip        // 原样透传（已 i18n）
  },
  control: { canClearPin, canClearOverride, staleOverride },  // 恒存在 boolean
  source:  { pin, override, foreground, manual },               // 4 boolean，至少一个 true
  hasHabits: boolean
}
```

- `source` 由 `mode` 映射：`pinHabit`/`pinAppHabit` → `pin`；`softOverride` → `override`；`auto` 且 `followForegroundAppScenario` 开 → `foreground`；`manual` → `manual`
- `id` 用 `OneToneRuntimeHabitControl.resolveActiveSceneId(OneToneRuntimeHabitControl.foregroundIdentity())`
- 每次 `getSnapshot()` 首次调用触发一次 `subscribe('change')`（`reason:'init'`）
- `hasHabits`：`config.mappings` 里存在至少一条已保存习惯（参考 `OneToneMappingCore.isSaved` / `OneToneHabitProfile.isLibraryHabit`）→ **无习惯时 Now 首页要能显示空态，这是 Phase 2 的前提**

---

### T2 — `switch(id, opts)` 收口所有写操作

`opts = { source, mode?, confirm? }`
`source` 取值：`'home_quick_switch' | 'manual' | 'foreground'`
`mode` 取值：`'auto' | 'override' | 'pin'`（默认 `'auto'`）

**行为（运行时规则由 Facade 判断，UI 不自己判断）**：

| 情况 | 行为 | 返回 |
|---|---|---|
| 无 pin | `OneToneSceneActivate.activateScene(id, { source })` | `{ ok:true, snapshot }` |
| 有 pin 且 `!opts.confirm` | **不执行任何写操作** | `{ ok:false, requiresConfirm:true, reason:'pin_active', pinnedName, targetName }` |
| 有 pin 且 `opts.confirm` | 先 `clearPin()` 再 `activateScene(id,{source})` | `{ ok:true, snapshot }` |
| 无 pin 且 `mode==='override'` | `setSoftOverride(id, foregroundIdentity())` | `{ ok:true, snapshot }` |
| 无 pin 且 `mode==='pin'` | `setPinHabit(id)` | `{ ok:true, snapshot }` |
| id 无效 / 非已保存习惯 | 透传 `activateScene` 的 toast 拒绝行为 | `{ ok:false, reason:'not_available' }` |

注意：
- 无 pin 时**不要**传 `force:true`（不需要，clearPin 分支已经先解除了 pin）
- `mode==='override'` 时**不要**调 `OneToneSceneActivate.applySoftOverride`（它会同时改底座 `activeSceneId`；那是 Phase 4 才修的语义）
- 成功后触发 `notify('manual' | 'override' | 'pin', { previous, current })`

**收口要求**：Facade 是 `activateScene` / `setSoftOverride` / `setPinHabit` / `setPinAppHabit` / `clearPin` 的**唯一调用方**。
把 `home-workbench.js:2561-2577 selectWorkbenchMapping()` 改为调 `OneToneHabitRuntime.switch()`：
- 原来走 `applySoftOverride` 的分支 → `switch(id, { source:'manual', mode:'override' })`，并加注释标注「Phase 4 会改其语义」

---

### T3 — 订阅（替代散落的显式 repaint）

```js
subscribe('change', cb)
// cb({ type:'effective_changed', previous, current, reason })
// reason: 'manual' | 'foreground' | 'override' | 'pin' | 'config' | 'init'
```

**触发点全部集中在 Facade 内部**，外部不要直接 emit：

1. `switch()` 成功
2. `reconcile()` 清理了失效 override
3. 配置变化：暴露 `notifyConfigChanged()`，由 `config-persist` 保存完成处或现有调用方调用（**不要改 config-persist 的持久化流程本身**）
4. 首次 `getSnapshot()`（`reason:'init'`）
5. `noteForegroundIdentity()` 之后（前台窗口变化）——这是"跟随前台自动切换"能反映到首页的关键

同时把 `scene-activate.js:60-75 scheduleManualSwitchPaint()` 里点名的 repaint 调用换成 `OneToneHabitRuntime.notify(...)`；旧面板的 repaint 调用**可以保留**（Phase 0 后它已隐藏，保留无害且降低风险）——如果你判断可以直接删掉，删掉并在提交信息里写明。

---

### T4 — 拆分 resolve 与 reconcile（本次最关键的架构修复）

改 `src/js/features/scene/runtime-habit-control.js`：

1. 抽出**纯计算** `calculateEffectiveScene(identity)`：
   - 只读。不写 `cfg`、不 persist、不 clear override
   - softOverride 失效时**只返回结论**（如 `{ kind:'stale_override', resolvedId }`），**不执行清理**
2. 抽出 `reconcileRuntimeHabitState(opts)`：
   - 负责 `ensureRuntimeFields()`、清理失效 override、`persistQuiet()`
3. `resolveActiveSceneId()` 保留为**兼容包装**，内部 = calculate + reconcile
   → **现有 3 个消费者行为完全不变**
   → 加 `@deprecated` 注释指向 Facade
4. 验收标准：连续调用 `calculateEffectiveScene()` **不产生任何 config 写入或 persist 调用**；`reconcile()` 至多在 override 失效时 persist 一次

---

### T5 — source 增加 `home_quick_switch`

`scene-activate.js:44 normalizeSource()` 目前把非 foreground 的一律归一为 `'manual'`。
把 `'home_quick_switch'` 作为**独立 source 透传**（不要被归一成 manual），将来才能区分"主动切换 / 自动切换 / 系统推荐切换"。

---

### T6 — 冒烟测试 + 接进测试链

新建 `scripts/smoke-habit-runtime.mjs`，照 `scripts/smoke-now-home.mjs` 的 `vm.runInNewContext` + 手写 `document`/`location` shim 模式。必须覆盖：

1. `getSnapshot()` 在 4 个分支（manual / pinHabit / pinAppHabit / softOverride）都返回**完整固定 shape**（逐字段断言 key 存在）
2. `switch()` 在 pin 生效且未 confirm 时返回 `requiresConfirm:true`，且**没有**调用 `activateScene`（用计数 spy）
3. `switch(..., { confirm:true })` 先 `clearPin` 再 `activate`
4. `switch(..., { mode:'override' })` 只调 `setSoftOverride`，**不**改 `cfg.activeSceneId`
5. 连续两次 `calculateEffectiveScene()`，`persist` spy 调用次数为 **0**
6. `reconcile()` 在 stale override 情况下恰好 persist **1** 次
7. `subscribe('change')` 在 `switch()` 成功后被调用 1 次，payload 含 `previous` / `current`

接进 `package.json`：
- 新增 `"test:habit-runtime": "node scripts/smoke-habit-runtime.mjs"`
- 追加到 `test:islands` 链尾（该行很长，用同样的 `&&` 风格）

---

## 5. 验收（你必须自己跑，并贴出真实输出）

```bash
node scripts/smoke-habit-runtime.mjs     # → smoke-habit-runtime: ok
node scripts/smoke-now-home.mjs          # → 仍然 ok（没被破坏）
npm run test:habit-workspace             # 习惯相关既有测试仍通过
npm run test:home-habit-channels         # 既有测试仍通过
```

静态检查：

```bash
# Now 模块不应新增对 config / runtime / scene-activate 的直接依赖
# 允许的既有例外只有 resolveHotkey 读 OneToneState.config
grep -n "OneToneState\|OneToneRuntimeHabitControl\|OneToneSceneActivate" src/js/features/now/*.js
```

手工验证（`npm run serve` → 浏览器打开 `http://127.0.0.1:5173`）：

- 首页只显示 Now 面板，旧 Dashboard 消失，且 Now 面板占满高度、无内部二次滚动
- 控制台能查到 Facade 的返回值（Phase 1 还没有 UI，验证 `switch()` 在 pin 生效时**返回** `requiresConfirm` 而不是静默失败即可）

---

## 6. 提交要求

- 2 个 commit：
  1. `feat(habit-runtime): add OneToneHabitRuntime facade, split resolve/reconcile`
  2. `fix(home-workbench): hide legacy dashboard when Now home is active`
- 每个 commit 附上你实际跑过的命令与输出
- 不要顺手改视觉、不要动 Now UI、不要重命名

---

## 7. 明确不在本次范围

| Phase | 内容 |
|---|---|
| Phase 2 | Now 改用 Facade；删除 `live` / `activateHabit`；`HABIT_CATALOG` 降级为 demo/空态；空态 UI；pin 分支与临时/锁定二选一 UI |
| Phase 3 | 旧首页 badge / pin / override 组件迁移到 Now（**复用** `home-workbench-panels.js:1324-1333`，不要重写）；新增 `promise` 字段 |
| Phase 4 | softOverride 加 `previousMappingId` 实现真回滚（方案 A 已定） |
| Phase 5 | Context Decision 层 → candidate scene → `可能正在`（`mod context` 已注册但零调用，需先加 command + emit + 前端订阅；展示用 evidence，不用百分比） |

这些在 Facade 落地并验证后再单独开工。
