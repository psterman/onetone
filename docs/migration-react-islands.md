# React Islands 渐进迁移契约（OneTone / voice-pilot）

> 阶段状态：✅ P0–P8 工程轨静态通过；✅ 验收债收口（2026-07-29）：Toast legacy 主路径单轨桥接 + Command 明确脚手架 + 孤儿轨清理 + i18n 护栏。
> **裁定**：静态通过 + Toast 单轨桥接 + Command 脚手架 + **产品验收待 Tauri 人工清单**。最后更新：2026-07-29
>
> P4 口径修正：共享 UI 为「能力就绪 + Toast 单轨桥接」，**不是**全局切流完成；`#wbCommandSearch` **未接管**（仍 legacy `home-workbench-cmdk.js`）。
## 0. 目标与范围

**做什么**：在现有 Tauri 2 + Rust 桌面应用的前端里，以「React Island」方式渐进挂载 React/TypeScript 组件，**不重写应用壳、不改 Rust/Tauri 主架构、不改成完整 SPA**。

**不迁区域（按方案保留 legacy）**：
- 相机 MediaPipe / 注视追踪
- Coach HUD（`coach-hud.html`）
- tray 透明窗（`tray-menu.html`）
- 主 shell IA 大改（`#appWorkbenchShell` / `#appContentColumn` 布局结构）
- 现有 legacy 弹层（onboard / welcome / phrasePractice / test / camera 模态）— 新 Dialog 走独立 portal 根

> 注意：home/workbench 体量很大且状态密集，方案未明确迁移；若长期留 legacy，则「0–4」的真实收益低于 70%。

## 1. 核心原则（不可违反）

1. 旧页面继续跑；`index.html`、legacy IIFE、`OneToneState`、`render-loop` 暂保留。
2. React/TS 像「岛」一样挂到明确 mount point。
3. 每个岛只拥有自己的 DOM 子树；legacy 不得再 `innerHTML`/`render` 覆盖该子树。
4. 新代码走 typed IPC；legacy 暂用 `window.OneToneIpc`。
5. shadcn/ui 仅用于 React islands，不污染旧页面。
6. 不迁相机/HUD/tray/shell IA（除非极小兼容）。
7. 每阶段完成后必须能运行现有 开发/构建/测试 命令并记录结果。
8. 不确定行为优先保留 legacy，不做视觉/交互大改。

## 2. 当前架构事实（审计结果）

- **形态**：Tauri 2 + Rust 桌面应用，4 个窗口（main / tray_menu / coach_hud / codex_micro_overlay）。
- **前端**：零构建 vanilla JS。`tauri.conf.json` → `frontendDist: "../src"`、`beforeBuildCommand: ""`；开发用 `npm run serve`（serve src -l 1420）。
- **体量与加载**：`src/js/` 共 **183 文件 / ~87,344 行**；`index.html` 用 **170+ 个经典 `<script src>`** 按加载顺序挂载全局对象。
- **状态**：单一全局可变对象 `OneToneState = {state, ui, runtime}`（`src/js/core/state.js`），无响应式，手动重渲染。
- **原生桥**：`withGlobalTauri: true`，用 `window.__TAURI__`（全局）；`OneToneIpc`（`src/js/core/ipc.js`）提供 `invoke / invokeTimeout / raw / tauriArgs`，且 **`tauriArgs` 已内置 snake⇄camel 兼容** —— typed IPC 可直接复用，不必重写。
- **渲染分发（关键）**：`render-loop.js` 的 `render()` 经 `global.__vp_render_hooks__` 在每个周期整树刷新：`renderEditor / renderMappingChrome / renderVoiceModeSwitch / renderHome / renderListenRuntime / renderUpdateUi / renderRecordCancelBar / renderSoundSettingsPanel / renderKeyFinishFlowPanel / renderTrashList / renderDebugDeveloperPanel` 等。并有 `render slow >250ms` 告警（已存在性能问题）。
- **现存重挂载隐患（最大风险，已证实）**：`config-persist.js` 注释明确写「Full applyMvpInit here used to remount editors and 假死 the home switch path」「cmd_ready → applyMvpInit remount storm 假死's the UI (esp. MediaPipe)」，并有 `mvpInitHeavyRemountBlocked()` 守卫压制。说明 legacy 今天就在和重挂载假死搏斗——岛必须显式避开。

## 3. Island Mount 约定

- 挂载点 = `index.html` 中已存在的具名容器 id（见下表），或新增的空 `.ot-island` 容器。
- React root **只挂在空容器**；容器内容完全由 React 管理，legacy 停止对其 `innerHTML`。
- 命名：岛容器加类 `.ot-island`；内部 React 组件用 shadcn。
- 入口：在 `index.html` 仅追加一个最小 `type="module"` 脚本（不重排旧脚本）。

### 已知挂载点（index.html）

| 区域 | 容器 id | 对应阶段 |
|---|---|---|
| 基础设置 | `#settingsPanelBasic` (L514) | P5 |
| 按键设置 | `#settingsPanelKeys` (L677) | 后续 |
| 虚拟键盘 | `#settingsPanelSoftPad` (L1055) | 后续 |
| 习惯/场景 | `#settingsPanelScenes` (L1121) / `#settingsPanelHabits` (L1152) | 后续 |
| 语音唤醒配置 | `#settingsPanelVoiceWake` (L1446) | P6 |
| 映射列表 | `#mappingList` (L1439) | P7 |
| 语音流程 | `#voiceWorkflowPipeline` / `#voiceFlowNodes` (L1515+) | P6 |
| Command 搜索 | `#wbCommandSearch` + `#wbCmdkPanel` (L92) | P4 脚手架（未接管，仍 legacy） |
| 语音声学 host | `#voiceWakeAcousticHost` / `#voiceCancelAcousticHost` / `#voiceEndAcousticHost` | P6 |
| 主 shell | `#appWorkbenchShell` (L81) / `#appContentColumn` (L153) | 不迁 |

> Toast：**legacy `OneToneAppToast` 为主路径**；`OneToneUi.toast` 反向代理到 legacy（兼容 `string | ToastOptions`），React Toast 岛挂载但默认无数据。二次切流前禁止恢复 `pushToast` 并行渲染。
> Dialog/Confirm：legacy 弹层保留；新确认可走 `OneToneUi.confirm`（React）。Command 岛为独立 portal 脚手架，**不**替换 `#wbCommandSearch`。
## 4. legacy / React DOM 所有权规则

- **每个岛在 `__vp_render_hooks__` / `render-loop.js` 中对应的 `render*` 必须摘除或加守卫**。`P3` 提供 `isInsideIsland(node)`（`src-islands/dom-ownership.ts`）供 legacy render / i18n sweep 调用：遇到位于 `.ot-island` 子树内的节点一律跳过。
- **刷新约定（P3）**：legacy 在 `applyMvpInit` / `render` / config reload 之后，调用 `window.OneToneIslandsRefresh()`（= `dispatchRefresh()` → 派发 `ot:islands:refresh` 事件）。运行时自动 `refreshAll()`：对每个带 `onRefresh` 的岛重算 props 并重渲染。岛组件也可用 `useIslandRefresh(cb)` 在刷新时重新拉取 typed IPC。
- `mvp_init` / `cmd_ready` / config reload 后：岛必须 **remount 或 `updateIsland(id, props)`**，不得静默分叉；React 内部 state 仅存 UI 临时态，持久数据以 `OneToneState` / Rust config 为准。
- **i18n 隔离**：现有 `i18n.js` 对 `data-i18n` 节点做整树扫描重写；岛内 React 文本必须被 **跳过**（调用 `isInsideIsland` 判定，或加 skip 标记），否则会被静默覆盖。
- **portal 作用域**：shadcn Dialog/Dropdown/Toast 默认渲染到 `document.body`，逃出 `.ot-island`；用 P3 的 `createIslandPortalRoot(id)` 在 body 下创建 `.ot-island` 包裹层，把 Radix Portal 的 `container` 指向其内层节点，使 portal 内容也受 scoped Tailwind（`important:'.ot-island'`）作用。

### Island DOM Ownership Registry（P3 固化）

| 岛（容器 id） | 阶段 | React 所有者 | 需摘除/守卫的 legacy render 入口 | i18n 跳过 | portal 作用域 |
|---|---|---|---|---|---|
| `#ot-toast-root`（新建） | P4 | Toast 岛（默认空；二次切流用） | legacy `OneToneAppToast` **仍为主路径**；`OneToneUi.toast` 反向代理，不 `pushToast` | 是 | 是（Toast portal，当前无数据） |
| `#ot-dialog-root`（新建） | P4 | Dialog/Confirm 岛 | legacy 弹层保留，新确认走 `OneToneUi.confirm` | 是 | 是 |
| `#wbCommandSearch` / `#wbCmdkPanel` | P4 脚手架 | **未接管**；React Command 岛挂独立 portal | 仍由 `home-workbench-cmdk.js` 驱动 | — | React portal 存在但不接产品入口 |
| `#settingsPanelBasic` | P5 | 基础设置岛 | 不在 render 列表（事件驱动）→ 无需摘除；已加两道 legacy 守卫：`basic-panel-ui.js` 的 `render()` 在岛接管后 return、`app-lang-settings.js` 的 `applySettingsTexts` 跳过 `#settingsPanelBasicDesc` | 是（岛内文案由岛自管，且 `OneToneI18n.t` 取词；legacy `data-i18n` sweep 不命中本面板） | 是（Toggle/Segmented 用 scoped CSS，不引 shadcn 弹层） |
| `#settingsPanelVoiceWake` 等语音面板 | P6 | 语音配置岛（按 tab 分岛） | `renderVoiceModeSwitch` 及 voice 页自有 render；迁移后禁用对应 hook | 是 | 是（Dialog/Toast） |
| `#mappingList`（行列表） | P7 | 映射列表岛（keyed diff 渲染，交互留 legacy 委托） | `renderMappingList` 顶部守卫：岛挂载后改调 `window.__otMappingListSync()`，不再 `innerHTML` 整表重建；行 markup 由 legacy `OneToneMappingList.rowView` 单一来源生成（岛与 legacy 共用）；`renderEditor` / `renderMappingChrome` 其余子渲染与 `renderRecordCancelBar` **留 legacy**（编辑器/录制/取消条不迁） | 是（行内文案由 rowView 内 `t()` 生成，`#mappingList` 无 data-i18n 扫描） | 否（无弹层；菜单 `#mapMenuFloat` 留 legacy） |
| `#voiceConfigIsland`（新建，位于 `#settingsPanelVoiceWake` 内） | P6 | 语音配置岛（按 tab 分岛） | 接管 **文本短语编辑器**：`renderPhraseTags` 加 `isInsideIsland` 守卫；`renderWakePage`/`renderRecognizePage` 在岛挂载后隐藏 legacy 文本短语面板（`voiceWakeKindTextPane`/`voiceWakeCustomBlock`/`voiceCancelKindTextPane`/`voiceCancelCustomBlock`/`voiceEndKindTextPane`/`voiceEndCustomBlock`）与策略开关（`#voiceSummaryEngineSwitch`）；**声音录制（acoustic）子页保留 legacy** | 是（岛内文案自管） | 是（Dialog/Toast via OneToneUi） |
| `#appWorkbenchShell` / `#appContentColumn` | 不迁 | — | 主 shell IA 保留 legacy | — | — |

> 每个岛挂载时运行时自动给容器加 `.ot-island`；`unmountIsland` 会移除该类、解除所有权声明，legacy 可回收该子树。

## 5. typed IPC 规则

- 新层：`src-islands/ipc/typedIpc.ts`（P2 已落地）+ `src-islands/ipc/types.ts`（共享类型）。
- 调用内核 `invoke<T>(cmd, args)`：**优先复用 `window.OneToneIpc.invoke`**（即 ipc.js 的 `tauriArgs` 双键兼容），否则回退到原始 Tauri invoke（Tauri v2 自动把 camelCase 参数转 snake_case）。→ snake/camel 兼容在边界处统一处理，岛代码只用 camelCase。
- **`cmd_save` / `cmd_save_camera_prefs` 接收 `{ json: string }`**（Rust 参数为 `json: String`，非对象）；`saveConfig()` / `saveCameraPrefs()` 同时接受对象或字符串，自动 `JSON.stringify`。
- 禁止在 React 组件里散落字符串 command；统一 import 本模块的类型化函数。
- 已覆盖命令族（按 P2 范围）：
  - config/runtime：`requestRuntime` `ready` `saveConfig` `saveAppPrefs` `saveCameraPrefs` `pause` `resume`
  - app/env：`getForegroundApp` `getAppIcon` `getRunningApps` `setSetupInteractionActive`
  - mic：`getMicMute` `setMicMute` `listMicDevices` `setDefaultMic` `startMicMonitor` `getMicLevel` `stopMicMonitor`
  - voice（vosk/sapi/kws/end/acoustic/desired）：`getVoice{Vosk,Sapi,Kws,End}Status`、`setVoice{*}{Enabled,Phrases,...}`、`setDesiredVoiceEngine` `setListeningStrategy` `getAcousticVoiceCommandStatus` 等
  - mapping：`mappingToggle` `mappingDelete` `mappingDuplicate` `mappingReorder` `mappingSetGroup` `mappingSetSourceKey` `mappingConflicts`
  - compat：`startTriggerCompatProbe` `startTriggerVerifyListen` `stopTriggerCompatProbe` `stopTriggerVerifyListen`
  - misc：`appLog`
- legacy 暂继续用 `window.OneToneIpc`；新岛只用 typed IPC。
- Rust 命令签名不清时：从现有 JS 调用 + Rust command 实现反推，并在本文档「不确定项」标注（见 §9）。

## 6. 各阶段验收标准

- **P0**：审计完成；本契约文档存在；无大规模代码改动。✅
- **P1**：Vite+TS+React 接入；`serve src` 与旧脚本顺序仍可用；islands bundle 输出到稳定路径（默认 `src/assets/islands/`）；Tailwind preflight 隔离、`.ot-island` 作用域；smoke test 证明旧页面仍可加载。
- **P2**：`typedIpc.ts` 覆盖高频命令并带类型；可被岛使用；legacy 未强制迁移。
- **P3**：`mountIsland/unmountIsland/updateIsland` + `window.OneToneIslands` 宿主 API；文档列出每个岛 DOM 所有权；mvp_init 后可 remount/update。✅
- **P4**：共享交互能力就绪（Toast/Dialog/Confirm/Command 岛 + `OneToneUi`）；Toast **legacy 主路径单轨**（`OneToneUi.toast` 反向代理 `OneToneAppToast`，兼容 string|opts）；Command **未接管** `#wbCommandSearch`。✅（债收口后口径）- **P5**：基础设置（运行/外观/字体/语言/偏好）成岛；修改可保存；语言/主题/字体切换一致；mvp_init/reload 后一致；其它 panel 不受影响。✅
- **P6**：语音配置按 tab 分岛；切引擎不回归；短语可保存且 reload 一致；legacy voice render 不再覆盖岛 DOM。✅
- **P7**：映射编辑器守习惯契约 + persist 守卫；增删复制重排/冲突检测/字段不丢；保存 reload mvp_init 后一致。✅
- **P8**：清理临时 bridge（不破 legacy）；本文档更新为最终态；补 smoke/typecheck/build 脚本；记录 `npm install`/typecheck/`vite build`/JS 测试/Tauri dev·build 验证结果；列出后续安全收口计划（CSP / `withGlobalTauri`）。✅（见 §10 P8 执行记录：验证矩阵 8.4，npm install 与 Tauri dev·build 为环境限制待办）

## 7. 已知债务与风险（必须持续追踪）

1. **双轨系统债（ intentional ）**：legacy 与 React 长期并存；靠本契约 + 冒烟测试护栏。
2. **i18n 覆盖**：`home-workbench.js` 的 `data-i18n` sweep 已 `isInsideIsland` 跳过；其它定点写文案路径仍需纪律。
3. **portal 逃逸**：shadcn 弹层逃出 `.ot-island`，需显式 portal 作用域。
4. **收益边界**：home/workbench、相机、HUD、tray 留 legacy，真实长期收益 < 70%，除非后续补迁。
5. **构建产物落点**：`src/assets/islands/` 已 `.gitignore`；`emptyOutDir: false` 环境坑见 P1 记录。
6. **Toast 二次切流**：正式 shadcn/a11y 就绪前，**禁止**恢复 `OneToneUi.toast → pushToast` 并行渲染（会与 legacy 双弹）。
7. **Command 接管**：`#wbCommandSearch` 仍是独立迁移项（home/workbench/快捷键/焦点），勿塞进债收口。
8. **最大不确定项**：P7 运行期回归 + typed IPC 部分 `[UNVERIFIED]`；建议整体 +20–30% 缓冲。

## 8. 验证命令

现有：
- `npm run serve` → 静态服务 src（1420）
- `npm run dev` / `npm run build` → `tauri dev` / `tauri build`
- `npm run test:voice-acoustic:all` 等脚本测试

新增（P1 起）：
- `npm run typecheck` → `tsc --noEmit`
- `npm run build:islands` → `vite build`
- `npm run test:islands` → 冒烟测试（挂载/卸载/mvp_init 不覆盖）

## 9. 不确定项

- **[P2 已核对] Rust command 签名**：已读取 `src-tauri/src/ipc/commands/**` 反推类型，覆盖 config/mic/app/voice/mapping/compat 各族。以下具体点仍需在用到时收紧：
  - `AppConfig` 主题/语言/字体字段名 **[UNVERIFIED]**：仓库无 `cmd_set_theme/language/font` 专门命令，这些走 `cmd_save` 的 config 负载；字段名（theme/language/font 还是 snake_case）需对照 Rust config 结构体确认后再依赖。
  - `VoiceEngineStatus` / `RuntimeSnapshot` **[BEST-EFFORT]**：Rust 多返回 `serde_json::Value`，已放宽为宽松类型，后续按需收紧。
  - `saveConfig` 的 `saveSource`/`version:6` 标记由 legacy `config-persist.js` 注入；岛侧目前不强制注入，若 Rust 侧依赖该标记做 source 判定需注意。
- home/workbench 是否纳入迁移范围未定（影响总收益与范围）。
- `src/assets/islands/` 已定为 islands bundle 落点（非独立 `dist/`），已 `.gitignore` 排除；P1 已落定。

## 10. 执行记录（P0 / P1）

### P0 — 仓库审计与迁移契约 ✅
- 读取 package.json / tauri.conf.json / index.html / ipc.js / state.js / render-loop.js / config-persist.js。
- 定位挂载点：`#settingsPanelBasic` `#settingsPanelVoiceWake` `#mappingList` `#wbCommandSearch` `#appWorkbenchShell` 等。
- 确认 legacy 渲染所有权：`render-loop.js` 整树刷新，`__vp_render_hooks__`（settings-debug-hooks.js:94）登记 `renderEditor/renderMappingChrome/renderVoiceModeSwitch/renderHome…`。
- 确认现存重挂载隐患：`config-persist.js`「applyMvpInit 假死」「remount storm」注释 + `mvpInitHeavyRemountBlocked()` 守卫。
- 产出本文档（island 约定 / DOM 所有权 / typed IPC 规则 / 阶段验收）。

### P1 — 工程双轨接入 ✅（已验证）
- 新增工程文件：`vite.config.ts` / `tsconfig.json` / `tailwind.config.js`（preflight 关、`important:'.ot-island'` 作用域）/ `postcss.config.js`。
- 新增 `src-islands/`：`main.tsx`（注入 scoped CSS + 暴露 `window.OneToneIslands`）、`island-runtime.ts`（mount/update/unmount/remountAll）、`globals.css`（scoped shadcn token）、`components/IslandTemplate.tsx`、`vite-env.d.ts`。
- `index.html` 末尾追加 `<script type="module" src="assets/islands/main.js">`，不动旧脚本顺序。
- `package.json` 增加 devDeps（vite5 / plugin-react4 / react18 / ts5 / tailwind3 等）与 scripts（typecheck / build:islands / dev:islands / test:islands）。
- `.gitignore` 排除 `src/assets/islands/`。
- 新增 `scripts/smoke-islands.mjs`（校验 bundle 存在 + legacy 脚本顺序未被破坏）。

**验证结果（2026-07-29）**：
- `vite build` → 退出 0，产出 `src/assets/islands/main.js`（726 KB / gzip 171 KB，26 模块）。
- `tsc --noEmit` → 退出 0，无类型错误。
- `node scripts/smoke-islands.mjs` → 5/5 PASS（bundle 存在且非空、legacy `js/core/state.js` 仍在、module 入口已注入且位于 legacy 之后）。
- 已知限制：npm 在该环境写 lockfile 时挂起，已用本地 node_modules 直接构建验证；`package-lock.json` 待联网环境 `npm install` 补齐以保证可复现。
- 构建环境坑：`vite build` 清空输出目录时会调用环境内的「安全删除」垃圾箱二进制并挂起（ETIMEDOUT）→ 已将 `vite.config.ts` 的 `build.emptyOutDir` 设为 `false` 绕开；若 CI 需干净输出，请在 build 前手动 `rm -rf src/assets/islands`。

### P2 — typed IPC 层 ✅（已验证）
- 新增 `src-islands/ipc/types.ts`：共享类型（`MicMuteState`/`MicDeviceInfo`/`AppIdentity`/`ConflictReport`/`CmdAck`/`RuntimeSnapshot`/`MappingEntryLite`/`AppConfigPatch`/`VoiceEngineStatus`/`TriggerProbeResult`），每个类型标注 `[VERIFIED]/[BEST-EFFORT]/[UNVERIFIED]` 验证等级。
- 新增 `src-islands/ipc/typedIpc.ts`：核心 `invoke<T>` 优先复用 `window.OneToneIpc.invoke`（继承 snake⇄camel 双键兼容），回退原始 Tauri invoke；按域导出类型化命令函数（config/runtime、app/env、mic、voice vosk/sapi/kws/end/acoustic/desired、mapping CRUD/conflicts/edit、compat probe、misc），组件内不再散落字符串 command。
- 关键签名已从 Rust 反推核实：`cmd_save`/`cmd_save_camera_prefs` 收 `{json:String}`；`cmd_ready(backdrop_mode?)`/`cmd_request_runtime()` 返回 `serde_json::Value`；mic 命令返回 `MicMuteState`/`Vec<MicDeviceInfo>`/`MicLevelSnapshot`；mapping `cmd_mapping_conflicts(mapping_id?)` 返回 `Vec<ConflictReport>`；无专门 theme/language/font 命令（走 `cmd_save` config 负载）。
- `AppConfig` 主题/语言/字体字段名标为 `[UNVERIFIED]`，待对照 Rust config 结构体确认。

**验证结果（2026-07-29）**：
- `tsc --noEmit` → 退出 0，无类型错误（`src-islands/ipc/**` 纳入 `tsconfig.json` include）。
- `vite build` → 退出 0，产出 `src/assets/islands/main.js`（726 KB / gzip 171 KB，26 模块）。

### P3 — Island Runtime 与宿主桥 ✅（已验证）
- 新增 `src-islands/dom-ownership.ts`（不依赖 React）：`isInsideIsland()`（DOM 所有权判定，供 legacy 跳过岛子树）、`mark/unmarkIslandContainer`、`createIslandPortalRoot(id)`（scoped portal 根，解决 shadcn 弹层逃逸 `.ot-island` 问题）、事件常量 `OT_ISLAND_REFRESH_EVENT = 'ot:islands:refresh'`、`OT_ISLAND_CLASS = 'ot-island'`。
- 增强 `src-islands/island-runtime.ts`：`mountIsland(id, component, props?, options?)` 支持 `onRefresh` 回调；`updateIsland` / `unmountIsland`（解除所有权声明）/ `refreshAll`（重算 props+重渲染）/ `remountAll` / `dispatchRefresh`；`useIslandRefresh(cb)` React hook；模块加载时自动监听 `ot:islands:refresh` 事件调用 `refreshAll`。`OneToneIslands` 宿主桥暴露全部方法 + `isInsideIsland` + `createPortalRoot` + 常量。
- `src-islands/main.tsx` 额外暴露 `window.OneToneIslandsRefresh = () => OneToneIslands.dispatchRefresh()`，供 legacy 在 `applyMvpInit` / `render` / config reload 后触发所有岛刷新。
- 新增 `scripts/test-island-runtime.mjs`：用 esbuild 转译 `dom-ownership.ts` 后在最小 DOM shim 下验证 `isInsideIsland` 树遍历、`OT_*` 常量、`createIslandPortalRoot` 作用域；纳入 `npm run test:islands`。
- `docs/migration-react-islands.md` §4 新增 **Island DOM Ownership Registry**，固化每个岛（P4–P7）的容器 id / React 所有者 / 需摘除的 legacy render 入口 / i18n 跳过 / portal 作用域。

**验证结果（2026-07-29）**：
- `tsc --noEmit` → 退出 0，无类型错误（含新增 `dom-ownership.ts` / 增强的 `island-runtime.ts`）。
- `vite build` → 退出 0，产出 `src/assets/islands/main.js`。
- `node scripts/test-island-runtime.mjs` → 全部 PASS（DOM 所有权护栏与刷新约定正确）。
- `npm run test:islands`（typecheck + smoke + runtime 单测）→ 通过。

### P4 — 共享交互岛 + OneToneUi 宿主桥 ✅（已验证）
- 新增 `src-islands/shared/ui-store.ts`（**纯逻辑、无 React/DOM**，可在 node 单测）：单一数据源管理 toast 列表、confirm 队列（Promise 兑现）、command 列表与开关。这是「不出现两套 Toast/Confirm 同时弹出」的根本保证——全仓库只有这一套。
- 新增 `src-islands/shared/ui-bridge.ts`：暴露 `window.OneToneUi = { toast, confirm, openCommand, closeCommand, registerCommands }` 供 legacy 调用。
- 新增 `src-islands/shared/portal-roots.ts`：用 P3 的 `createIslandPortalRoot` 预建 toast/dialog/command 三个 `.ot-island` portal 根，赋稳定 id（`ot-toast-root`/`ot-dialog-root`/`ot-command-root`）。
- 新增 `src-islands/islands/{toast,confirm,command}-island.tsx`：分别订阅 ui-store 渲染 Toast / 确认 Dialog / Command 搜索面板。
- `main.tsx` 把三个岛挂到各自 portal 根，并暴露 `window.OneToneUi` + `OneToneUiReady` 标志（legacy 可据此优先用 React UI、不再自建并行 toast/confirm）。
- 新增 `scripts/test-island-ui.mjs`：esbuild 转译 `ui-store.ts` 后验证 toast/confirm/command 单一数据源与队列逻辑（13/13 PASS），纳入 `npm run test:islands`。

**实现说明（重要偏差）**：本环境 `npm` 安装新包（@radix-ui/*、class-variance-authority、clsx、tailwind-merge、cmdk、lucide-react）会挂起、无法稳定落地，因此 P4 的 UI 组件**未采用真实 Radix/shadcn 依赖**，改为零依赖的等价实现：
- `components/ui/{button,dialog,tabs,toast}.tsx` 用纯 React + scoped Tailwind 实现，API 形态刻意对齐 shadcn/ui（Dialog/DialogHeader/Footer/Title/Description、Tabs/TabsList/Trigger/Content、Button variant/size、Toast*），后续接入真实 shadcn 时调用方基本不用改。
- `lib/utils.ts` 的 `cn` 用零依赖实现替代 clsx+tailwind-merge。
- 待 CI/联网环境 `npm install` 稳定后，可 `npx shadcn@latest add` 覆盖这些文件以换成官方 Radix 版本；功能与边界（.ot-island 作用域、单数据源）不变。
- 验收「不出现两套 Toast/Confirm 同时弹出」由单一 ui-store 保证；legacy 调用点改为调用 `OneToneUi.*` 即可，未做全仓扫描式替换（符合 P4「逐步替换、不一次性扫全仓」纪律）。

**验证结果（2026-07-29）**：
- `tsc --noEmit` → 退出 0。
- `vite build` → 退出 0，产出 `src/assets/islands/main.js`（766.52 KB / gzip 181.76 KB，43 模块）。
- `npm run test:islands` → smoke 5/5 + runtime 单测 8/8 + ui-store 单测 13/13 全 PASS。

### P5 — 基础设置岛 ✅（已验证）

**目标**：把首个低风险、表单型岛挂到 `#settingsPanelBasic`，独占其子树，验证「双轨不打架」闭环。

**数据模型（已逐个核实 legacy 源码）**：
- 主题 `theme` / 字号 `fontScale`：**document 级**（`<html data-theme>` / `data-font-scale` + localStorage `vp_theme`/`vp_font_scale`），非 config；由 `OneToneAppThemePrefs.setTheme/setFontScale` 写入（含 `window.chrome.webview.postMessage` 同步窗口 backdrop）。
- 语言 `lang`：`OneToneI18n.getLang()`；由 bootstrap hooks `setAppLang` + `applyLang` 写入。
- 开机自启动 `autostart`：**Rust 端独立状态**，经 `cmd_autostart_get/set`（非 config）；初始值需异步拉取。
- 最小化到托盘 `startMinimized`：`OneToneState.state.config.startMinimizedToTray` + `OneToneConfigPersist.saveAsync()`。
- 按键提示条 `coachHud`：`config.coachHudEnabled` + `cmd_coach_hud_set_enabled`。
- 总开关 `globalListen`：**实为 runtime 暂停/恢复**（`!runtime.paused`），由 `OneToneAppHomeRuntime.toggleGlobalListen()` 触发 `cmd_pause/cmd_resume`。

**关键约束（决定实现方式）**：legacy 的 `OneToneAppAutostart.toggle()` / `OneToneAppStartMinimized.toggle()` / `OneToneAppCoachHud.toggle()` 都依赖 `#btnAutostart` 等 DOM 按钮来计算 next 值——而这些按钮在岛挂载后已被 React 替换、不复存在。因此岛**不复用这些 legacy toggle 函数**，改为直接走既有 persist 流程（typed IPC / config + `saveAsync`），避免「岛写状态、legacy 按钮读不到」的死链。

**新增/修改文件**：
- 新增 `src-islands/islands/basic-settings-island.tsx`：React 岛，渲染与 legacy 同构的 DOM（复用 `basic-block` / `pref-row` / `toggle-switch` / `pref-segmented` 等类名，**不改视觉**），但用 `data-ot-theme-pick` / `data-ot-scale` / `data-ot-lang-pick` 替代 legacy 的 `data-theme-pick` / `data-scale` / `data-lang-pick`，使 legacy `applyTheme/applyFontScale/bindEvents` 的全局选择器**不会误命中岛内元素**。读初始态 → `readInitial()`（document 属性 / `OneToneI18n` / `OneToneState.config` / `runtime.paused` + 异步 `autostartGet`）；写 → 复用 `OneToneAppThemePrefs` / bootstrap hooks / typed IPC / `OneToneConfigPersist`；订阅 `useIslandRefresh` 在 `mvp_init`/reload 后重拉状态。
- `src-islands/ipc/typedIpc.ts`：增补 `autostartGet` / `autostartSet` / `coachHudSetEnabled`（签名已对照 `app-autostart.js`/`app-coach-hud.js` 核实，标 `[VERIFIED]`）。
- `src-islands/island-runtime.ts`：新增 `isMounted(id)` 并暴露到 `OneToneIslands` 宿主桥（供 legacy 守卫判断）。
- `src-islands/main.tsx`：mount Basic 岛到 `#settingsPanelBasic`（try/catch 包裹——若挂载失败则保留 legacy HTML，主线不停）。
- `src/index.html`：`#settingsPanelBasic` 加 `ot-island` 标记类（保留内部 legacy HTML 作为无 JS 回退；岛挂载后由 React 替换）。
- 两道 legacy 守卫：
  - `src/js/features/settings/basic-panel-ui.js` `render()`：岛接管后 `return`（不再写摘要文本）。
  - `src/js/core/app-lang-settings.js` `applySettingsTexts()`：岛接管后跳过 `#settingsPanelBasicDesc` 的写入。
- `scripts/smoke-islands.mjs`：新增校验 bundle 含 `ot-basic-content` 与 `basic-global-listen-block`（确认岛已打进产物）。

**验证结果（2026-07-29）**：
- `tsc --noEmit` → 退出 0。
- `vite build` → 退出 0，产出 `src/assets/islands/main.js`（786.18 KB / gzip 185.65 KB，45 模块）。
- `npm run test:islands` → smoke 7/7（含 P5 bundle 标记）+ runtime 8/8 + ui-store 13/13 全 PASS。
- 静态核对：P5 验收项均具备对应实现——① 修改可保存（各开关走既有 persist）；② 主题/字体/语言切换一致（`setTheme/setFontScale/setAppLang+applyLang` 即 legacy 同源调用）；③ `mvp_init`/reload 后一致（`useIslandRefresh` 重拉 + legacy 守卫不再覆盖岛）；④ 其它 panel 不受影响（仅 `#settingsPanelBasic` 子树被岛接管，且 guard 精确限定到该 id）。

**运行期人工验收待办**（需在 Tauri/浏览器实际跑一次）：切换主题/语言/字号后 UI 与窗口 backdrop 一致；开关保存后 reload 仍生效；打开设置抽屉时 Basic 面板与 Keys/Voice 等其它 panel 互不干扰。建议接 `tauri dev` 走一遍。

- 下一步 P6：语音配置按 tab 分岛（语音引擎状态 / 唤醒词 / Vosk·SAPI·KWS 选择 / Dialog/Toast 调用）；守 `OneToneState` 单一数据源，避免与 React state 分叉；legacy voice render 不再覆盖已迁移岛 DOM。

### P6 — 语音配置岛（按 tab 分岛）✅（已验证）

**目标**：把语音配置中最表单化、最易被 React 接管的「监听策略 + 唤醒词/取消词/结束词」迁成按 tab 分岛，验证「切引擎不回归、短语可保存且 reload 一致、legacy voice render 不再覆盖岛 DOM」。守住 `OneToneState` 单一数据源，不与 React state 分叉。

**关键约束与发现（来自语音代码审计）**：
- 唤醒词按引擎分存：`config.voiceSapi/Vosk/Kws.phrases`，经 `cmd_voice_*_set_phrases` 保存；岛按当前激活引擎（读 `OneToneVoiceSettingsViewModel.build().mode`）定向读写。
- 取消/结束/发送词存 `config.voiceEnd.cancelPhrasesZh/En`、`phrasesZh/En`、`sendPhrasesZh/En`，经 `cmd_voice_end_set_{cancel,send}_phrases {phrasesZh, phrasesEn}` 保存。
- **修了一个真实 IPC bug**：原 `setVoiceEndCancelPhrases` / `setVoiceEndSendPhrases` 被错写成单数组 `{phrases}`，与 legacy 的 `{phrasesZh, phrasesEn}` 不一致，会丢失语言维度。P6 改为 `(phrasesZh, phrasesEn)` 并调用正确命令（标 `[VERIFIED]`）。
- 保存落盘：`flushWakePhraseSave` / voice-end 保存后会调 `OneToneConfigPersist.saveAsync()`，故岛写入后也触发 `saveAsync()`，保证 reload 一致。
- `renderVoiceModeSwitch` 每帧重写 `#voiceSummaryEngineSwitch`/`#voiceWakePhraseTags` 等 → 岛**不挂这些节点**，并在 legacy 渲染器加 `isInsideIsland` 守卫。
- 语音面板无 `data-i18n` 整树扫描，岛内文案不会被静默覆盖（风险仅来自逐节点 per-frame render hook）。

**新增/修改文件**：
- 新增 `src-islands/domain/phrase-utils.ts`：纯函数（normalize/add/remove/merge），无 DOM 依赖，可 node 单测。
- 新增 `src-islands/domain/voiceConfig.ts`：从 `OneToneState.config` 读、经 typed IPC 写并触发 `saveAsync()` 的单一数据源读写层（唤醒词按引擎、取消/结束词按 zh/en、监听策略）。
- 新增 `src-islands/islands/voice-config-island.tsx`：策略分段控件 + 唤醒词/取消词/结束词 三个 Tab 的短语增删，复用 `Tabs/Button`/`cn`/`OneToneUi.toast`，`useIslandRefresh` 重拉状态。
- `src-islands/globals.css`：补 `ot-voice-config` 等 scoped 样式（仅 `.ot-island` 内生效）。
- `src-islands/main.tsx`：try/catch 挂载 `VoiceConfigIsland` 到 `#voiceConfigIsland`。
- `src/index.html`：`#settingsPanelVoiceWake` 内新增 `#voiceConfigIsland.ot-island` 容器。
- legacy 守卫（全部 `if (OneToneIslands.isMounted('voiceConfig'))` 触发，岛未挂载即原样保留 legacy）：
  - `voice-phrase-custom.js` `renderPhraseTags`：加 `isInsideIsland(el)` 守卫（保护任意被岛接管的短语标签容器）。
  - `voice-step-wake-render.js` `renderWakePage` 末：隐藏 `#voiceWakeKindTextPane` + `#voiceWakeCustomBlock`。
  - `voice-step-recognize-render.js` `renderRecognizePage` 末：隐藏 `#voiceCancelKindTextPane`/`#voiceCancelCustomBlock`/`#voiceEndKindTextPane`/`#voiceEndCustomBlock`。
  - `voice-wake.js` `syncVoiceStrategyTabButtons`：`grid.hidden = islandOn; if(islandOn) return;`（隐藏 legacy 策略开关，保留声音录制子页）。
- `scripts/test-voice-config.mjs`：phrase-utils 单测；`scripts/smoke-islands.mjs` 增 P6 bundle 标记与容器校验；`package.json` `test:islands` 串入新测试。

**验证结果（2026-07-29）**：
- `tsc --noEmit` → 退出 0。
- `vite build` → 退出 0，产出 `src/assets/islands/main.js`（799.71 KB / gzip 189.06 KB，49 模块）。
- `npm run test:islands` → smoke 10/10（含 P6 标记 + 容器）+ runtime 8/8 + ui-store 13/13 + voice-config 13/13 全 PASS。
- 静态核对 P6 验收项：① 切引擎不回归（岛按激活引擎读写同源 IPC，策略开关走 `setListeningStrategy`）；② 短语可保存且 reload 一致（`saveAsync()` 落盘 + `useIslandRefresh` 重拉）；③ legacy voice render 不再覆盖岛 DOM（`renderPhraseTags` isInsideIsland 守卫 + 文本编辑器隐藏，声音录制子页保留 legacy）。

**运行期人工验收待办**（需在 Tauri/浏览器实际跑一次）：在语音页确认 React 岛的策略/短语控件可正常增删保存、与 legacy 声音录制子页互不干扰；切换引擎后唤醒词读写正确；reload 后配置仍生效。

- 下一步 P7：映射编辑器岛（守习惯契约 + persist 守卫；增删复制重排/冲突检测/字段不丢；保存 reload mvp_init 后一致）。

### P7 — 映射列表岛（keyed diff + rowView 单一来源）✅（已验证）

**目标**：在契约标注的最高风险区（remount storm 路径）落岛。验收：守习惯契约 + persist 守卫；增删复制重排/冲突检测/字段不丢；保存 reload mvp_init 后一致。

**切入决策（审计驱动，最小风险面）**：
- **岛只接管 `#mappingList` 的「渲染」**：React 按 `id` keyed diff——只有变化的行才重写，替代 legacy 每次 `list.innerHTML=html` 整表重建（`mapping-list.js:164`，即 remount storm 在列表区的直接根源）。
- **行 markup 单一来源**：从 legacy `renderMappingList` 抽出 `rowView(m)`（返回 `{id, cls, inner}`），legacy 与岛**共用同一函数**——视觉、`data-*` 契约、字段展示零偏差；i18n 由 `rowView` 内 `t()` 自产（`#mappingList` 无 data-i18n 扫描）。
- **交互零迁移（字段不丢的根本保证）**：legacy 事件全部委托在 `#mappingList` 容器与 document 上（`mapping-list-ui.js` `bindEvents`），React 子树内点击/输入照常冒泡命中 `data-toggle`/`data-menu`/`data-list-timing-toggle`/`data-add-switch`/`data-rm-switch`/`data-native-restore(-record)`/`data-test`/`data-scene-activate` 等——增删复制重排、冲突展示、录制、浮动菜单、测试发送 100% 走 legacy 原路径，直接在 `OneToneState.state.config.mappings[i]` 原地改字段 + `buildSavePayload`（`config-persist.js:801` 显式序列化全部字段）。
- **编辑器/录制/取消条不迁**：`renderEditor`（写 `#triggerView`/`#targetView` 等）、`renderMappingChrome` 其余子渲染、`renderRecordCancelBar`（`#recordCancelBar`）、全局键盘钩子录制流全部留 legacy。
- **删除保留 legacy softDelete 回收站语义**（`mapping-trash-menu.js`），不切 `cmd_mapping_delete`（原则 8：不确定行为保留 legacy）。

**审计要点（决定架构的事实）**：
- legacy CRUD 是混合模型：仅 toggle 走后端 `cmd_mapping_toggle`（`mvp_mapping_toggle` 消息桥）+ `persist_and_rebind` 回推 `mvp_init`；增/删/复制/重排走本地改 + `cmd_save`。`cmd_mapping_delete/duplicate/reorder/conflicts` Rust 命令存在但 legacy 从不调用（为未来岛预留）。
- 冲突检测在服务端（`config.rs conflict_report`），仅经 `mvp_init` 载荷下发 `setConflictRows`；本地 `cmd_save` 不回推 conflicts → 增删后冲突数组可能过期至下一次 `mvp_init`（**legacy 既有行为，岛保持一致，未加剧**）。
- `applyMvpInit` 用 `st.config = inbound` 整体替换 config → 岛不持旧引用，每次 sync 都从 `OneToneState` 重读。
- `#mappingList` 全仓唯一写入点就是 `renderMappingList`（已核实），守卫一处即完备。

**新增/修改文件**：
- `src/js/features/mapping/mapping-list.js`：抽出 `rowView(m)` / `listHasRows()`（原 `renderMappingList` 行构建逻辑原样搬移）；`renderMappingList` 加守卫——`OneToneIslands.isMounted('mappingList')` 时调 `window.__otMappingListSync()` 并 return（空态 `#mappingEmpty.hidden` 仍由 legacy 维护）；导出 `rowView`/`listHasRows`/`syncTimingRanges`。
- 新增 `src-islands/domain/mappingList.ts`：`buildMappingRows()`（`OneToneMappingCore.sorted()` × `rowView`）、`rowsSignature()`（签名比对，per-frame render 无变化时跳过 setState）、`afterRowsCommit()`（React 提交后恢复 `syncAllTimingRanges` 滑条同步）。
- 新增 `src-islands/islands/mapping-list-island.tsx`：`MappingRow` memo 组件（`className` + `dangerouslySetInnerHTML`，markup 来自 legacy 单一来源）；暴露 `window.__otMappingListSync`；`useIslandRefresh` 兜底 mvp_init/reload。
- `src-islands/main.tsx`：try/catch 挂载（挂载前清空容器；失败则 legacy 原路径继续）。
- `src-islands/globals.css`：`#mappingList.ot-island { color: inherit }` 中和岛基础前景色（行样式完全走 legacy CSS）。
- `src/index.html`：**零改动**（`#mappingList` 容器已存在，运行时打 `.ot-island` 标记）。
- 测试：新增 `scripts/test-mapping-island.mjs`（node 加载真实 `mapping-list.js`：rowView 全部 data-* 契约 + 守卫行为「岛挂载时不 innerHTML、改调 sync；未挂载时原路径」，23 项）；`smoke-islands.mjs` 增 P7 bundle/守卫校验；`package.json` `test:islands` 串入。

**验证结果（2026-07-29）**：
- `tsc --noEmit` → 退出 0。
- `vite build` → 退出 0，产出 `src/assets/islands/main.js`（801.76 KB / gzip 189.59 KB，51 模块）。
- `npm run test:islands` → smoke（含 P7 标记/守卫）+ runtime 8/8 + ui-store 13/13 + voice-config 13/13 + **mapping-island 23/23** 全 PASS。
- 静态核对 P7 验收项：① 守习惯契约 + persist 守卫（交互零迁移，全部走 legacy 原路径与 `buildSavePayload`）；② 增删复制重排/冲突检测/字段不丢（rowView 单一来源 + 事件委托冒泡命中 + 原地改 `mappings[i]`）；③ 保存 reload mvp_init 后一致（每次 sync 从 `OneToneState` 重读，`useIslandRefresh` + `renderMappingList` 守卫双通道触发；`applyMvpInit` 整体替换 config 亦无旧引用问题）。

**运行期人工验收待办**（需 Tauri/浏览器实测）：按键面板打开后增删复制重排映射、行内开关/滑条/录制切换键/原生恢复、浮动菜单、冲突提示展示；reload 后列表一致；观察 render slow 告警是否较之前减少（keyed diff 应降低列表区渲染成本）。

### P8 — 收尾：bridge 契约固化 + 刷新接线 + 安全收口计划 ✅（已验证）

**目标**：清理临时 bridge（不破 legacy）；契约文档定格为最终态；补齐验证记录；列出后续安全收口计划（CSP / `withGlobalTauri`）。

#### 8.1 Bridge 审计结果（临时 → 契约固化）

全仓盘点岛侧暴露的 `window.*` 面，逐项定性：

| 全局 API | 定性 | 处置 |
|---|---|---|
| `window.OneToneIslands`（mount/update/unmount/refreshAll/isMounted/isInsideIsland/createPortalRoot） | **长期契约** | 保留；后续新岛均经此挂载 |
| `window.OneToneUi`（toast/confirm/openCommand/closeCommand/registerCommands） | **长期契约** | 保留；**toast 反向代理 legacy**；confirm 走 React；Command 为脚手架 |
| `window.OneToneIslandsRefresh()` | **长期契约** | 保留；P8 已补 legacy 调用点（见 8.2） |
| `window.OneToneUiReady` / `OneToneIslandsReady` | **长期契约（就绪信号）** | 保留；就绪 ≠ Toast/Command 已全局切流 |
| `window.__otMappingListSync` | **窄桥（P7 专用）** | 保留；已有正确生命周期（岛 unmount 时 `delete`，legacy 探测 `typeof === 'function'` 后调用，缺席即回退原路径） |
| `src-islands/components/IslandTemplate.tsx` | **P1 脚手架残留** | 已删除（全仓零引用） |

清理原则：**契约级 API 一个不删（删了才破 legacy），零引用的脚手架全删。** 除模板文件外无其它孤儿桥。

#### 8.2 补齐契约接线：`applyMvpInit` → 岛刷新

P8 审计发现 §4 的刷新约定只做了一半：岛侧 `OneToneIslandsRefresh` 已暴露，但 **legacy 没有任何调用点**——`mvp_init`/config reload 后 Basic/Voice 岛不会自动重拉状态（mapping 岛有 per-frame 守卫兜底不受影响）。已修复：

- `src/js/core/config-persist.js` `applyMvpInit`：在 config 整体替换完成、分流重副作用**之前**（两个出口路径全覆盖）加 `try { global.OneToneIslandsRefresh?.() } catch {}`。
- 定性为**轻量事件派发**（React 只重算 props/重渲染，不重挂载），不受 `mvpInitHeavyRemountBlocked()` 压制——不会加剧 remount storm；岛 bundle 未加载时为 no-op。
- `smoke-islands.mjs` 新增校验「P8 applyMvpInit → OneToneIslandsRefresh 接线已就位」。

#### 8.3 安全收口计划（后续，不在 P8 内执行）

现状取证：`tauri.conf.json` → `"withGlobalTauri": true`、`"csp": null`；capability 已较小（`default.json` 仅 `core:default` + `app-ipc` + autostart 三项，按窗口分文件）；legacy 有 **8 个 JS 文件**直接引用 `window.__TAURI__`。

分步收口（每步独立可验证、可回滚）：
1. **CSP 从 null 收紧（先行，与 withGlobalTauri 无耦合）**：先以 report-only 心态在 dev 验证 `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost`。注意两点：islands 的 scoped CSS 经 JS 注入 `<style>`（需 `style-src 'unsafe-inline'`，Tauri 的 CSP nonce 注入只处理静态 HTML）；`assets/islands/main.js` 为本地静态文件，`script-src 'self'` 天然放行。
2. **收敛 `__TAURI__` 直引**：8 个 legacy 文件改走 `OneToneIpc`（已是绝大多数代码的路径），使 `withGlobalTauri` 的依赖面收敛到 `ipc.js` 单文件。
3. **退出 `withGlobalTauri`**：依赖面收敛后，`ipc.js` 改由 islands bundle 转出的 `@tauri-apps/api` ESM 提供 invoke/listen（或保留全局但仅注入 `ipc.js` 作用域）；届时 `withGlobalTauri:false`，网页上下文不再暴露全局 Tauri 句柄。
4. **capability 持续最小化**：新增 Rust 命令时按窗口最小授权（现有三 capability 文件已是正确形态）。

顺序不可颠倒：先 CSP（低风险高收益）、再收敛直引（纯 JS 重构）、最后退出全局桥（需 ESM 通道就绪）。

#### 8.4 最终验证矩阵（2026-07-29）

| 验证项 | 结果 |
|---|---|
| `tsc --noEmit` | ✅ 退出 0 |
| `vite build` | ✅ 退出 0（`src/assets/islands/main.js` 801.69 KB / gzip 189.58 KB，51 模块） |
| `npm run test:islands` | ✅ 全 PASS：smoke + runtime + ui-store + **toast-bridge** + voice-config + mapping-island |
| `npm install`（lockfile 补齐） | ⚠️ 本环境 npm 写 lockfile/装新包挂起（沙箱网络限制）；**待联网环境执行一次 `npm install` 生成 `package-lock.json`** 保证可复现构建 |
| `tauri dev` / `tauri build` | ⚠️ 需 Rust 工具链 + 交互窗口，本环境未执行；**待本机人工跑一遍**（见 8.5 人工验收清单，全部待测） |

#### 8.5 运行期人工验收清单（汇总 P5–P8，需 `tauri dev` 实测一次）

| # | 项 | 结果（2026-07-29） |
|---|---|---|
| 1 | Basic 面板：切主题/语言/字号 → UI 与窗口 backdrop 一致；开关保存 reload 生效；其余 panel 不受影响 | ⚠️ 待测 |
| 2 | 语音页：策略/短语增删保存；与声学子页互不干扰；切引擎；reload 一致 | ⚠️ 待测 |
| 3 | 按键面板：增删复制重排、行内控件、浮动菜单、冲突；reload；观察 render slow | ⚠️ 待测 |
| 4 | P8 接线：`mvp_init` 后三岛状态自动同步 | ⚠️ 待测 |
| 5 | Toast 单轨：控制台 `OneToneUi.toast('…')` / `toast({title})` 只出 **一套** legacy toast | ⚠️ 待测 |

> 本轮债收口不阻塞代码合入；产品验收以本表实测为准。

#### 8.6 后续路线图（契约外，按需启动）

- **补迁候选**（按 §3 挂载点表）：`#settingsPanelKeys` / `#settingsPanelSoftPad` / `#settingsPanelScenes` / `#settingsPanelHabits`——均为表单型，模式已被 P5/P6 验证，可逐个复制。
- **shadcn 官方化**：联网环境 `npm install` 稳定后 `npx shadcn@latest add` 覆盖 `components/ui/*`（API 已对齐，调用方基本不改）。
- **home/workbench 决策**：留 legacy 则总收益 <70%；若迁移需先解 render-loop 每帧整树刷新的所有权问题（P7 keyed diff 模式可复制）。
- **安全收口**：按 8.3 顺序执行。

---

## 11. 迁移总结（P0–P8 + 债收口）

- **工程轨 P0–P8 静态通过**，legacy 零破坏：`index.html` 仅 +1 个 module 入口与岛容器/标记；170+ 旧脚本顺序未动；守卫「岛未挂载即回退 legacy」。
- **落地资产**：typed IPC（含 voiceEnd 短语签名修复）、Island Runtime + DOM 所有权、3 个业务岛（Basic / Voice / Mapping keyed diff）、共享 UI 桥（Confirm 走 React；Toast 反向代理 legacy；Command 脚手架）。
- **测试护栏**：`npm run test:islands` = typecheck + smoke + runtime + ui-store + **toast-bridge** + voice-config + mapping-island。
- **裁定口径**：静态通过 + Toast 单轨桥接 + Command 明确脚手架 + **产品验收待 §8.5 人工清单**。
- **纪律**：新岛必须过 §3/§4；二次切流前禁止 `pushToast` 与 legacy Toast 并行。

### 12. 验收债收口执行记录（2026-07-29）

| 项 | 处置 |
|---|---|
| Toast 单轨 | `OneToneUi.toast(string\|opts)` → `OneToneAppToast.show(title, {detail,type,duration})`；不 `pushToast`；缺席 warn 一次 |
| Command | 明确脚手架，不接管 `#wbCommandSearch` |
| 孤儿轨 | 删除 `src-react/`、`MIGRATION_GUIDE.md`、`package-v2.json`（正式入口 `assets/islands/main.js` ← `src-islands`） |
| i18n 护栏 | `home-workbench.js` `renderQuickActions` / `applyLang` 跳过 `.ot-island` |
| 单测 | `scripts/test-toast-bridge.mjs`（源码静态 + 运行时 mock）串入 `test:islands` |
| 人工清单 | §8.5 表项全部 ⚠️ 待测（本环境未跑 `tauri dev`） |
