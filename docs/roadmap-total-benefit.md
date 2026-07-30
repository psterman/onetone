# 总收益路线图（采用 · A- 闸门收紧）

> 状态：✅ 工程落地启动 2026-07-30；Camera 冷却验收 ✅；发布前真源见下文 §发布前验收 / §测试矩阵。产品总收益 ≠ React 迁移性价比。  
> 关联契约：[`migration-react-islands.md`](./migration-react-islands.md)

## Gate0-lite（本轮书面记录）

**本轮范围**：home/workbench IA + `buildHomeWorkbenchModel` + render-loop home 轻守卫 + shell IA **收敛**文档 + HUD/tray **状态协议** + 录制 IPC 生命周期骨架。  
**不碰**：Keys / SoftPad / Voice / Camera / Debug **现有 React 岛**实现与挂载点。

| §8.5 项 | 相关岛 | 与本轮相交？ | 处置 |
|---|---|---|---|
| #14–#19 | Keys P12b 编辑器 chrome | 否 | **跳过人工点选**（本轮不改对应 host/守卫） |
| #20–#25 | SoftPad P14c–h | 否 | **跳过** |
| #26 | P6e 声学 paint-target | 否 | **跳过**（仅文档提及 MediaRecorder 为 Phase3 依赖，不改声学岛） |
| #27 | Camera flow chrome | 否 | **跳过** |
| #28 | Debug overview | 否 | **跳过** |

若后续 PR 改动上述岛文件或 `__otMount*` 接线 → 升级为 **Gate0-hard**，须先完成对应人工项。

## 三段产品层

1. **home/workbench** — 拉升器（IA + 单一 model）  
2. **主 shell IA 收敛 + HUD/tray 协议** — 稳定器（不整壳/整窗 React）  
3. **record IPC → MediaRecorder → SoftPad → Camera Pro** — 底座与能力层  

## Phase1 交付物

| ID | 交付 | 路径 |
|---|---|---|
| 1a | IA 硬顶（主卡片 ≤4、单一主 CTA、异常入口） | model + workbench 渲染 |
| 1b | `buildHomeWorkbenchModel()` | [`home-workbench-model.js`](../src/js/features/home/home-workbench-model.js) |
| 1c | home render sig 轻守卫 | `render-loop` + workbench |

## Phase2 交付物

| ID | 交付 | 路径 |
|---|---|---|
| 2a | 主 shell IA **收敛**表（回首页 / 进设置） | [`shell-ia-convergence.js`](../src/js/shared/shell-ia-convergence.js) + 下文 §Shell |
| 2b | HUD/tray 状态协议（与 home 同一套 statusToken） | [`runtime-status-lexicon.js`](../src/js/shared/runtime-status-lexicon.js) |

## Phase3 交付物（骨架）

| ID | 交付 | 路径 |
|---|---|---|
| 3a | 录制 IPC 生命周期 + Keys chrome 消费 | [`record-ipc-lifecycle.js`](../src/js/features/mapping/record-ipc-lifecycle.js) + cancel bar / feedback / flow chrome |
| 3b–d | MediaRecorder / SoftPad / Camera Pro | 见下文排队；本轮只钉顺序与边界 |

---

## §Shell — 主 shell IA 收敛（非迁移）

一级导航（`data-wb-nav`）归属：

| nav | 打开 | 回首页？ | 深水区？ |
|---|---|---|---|
| `home` | 关 drawer | 是 | 否 |
| `schemes` | habits | 否 | 否（主能力） |
| `triggers` | keys | 否 | 中 |
| `softPad` | softPad | 否 | 中 |
| `voice` | voiceWake | 否 | 中 |
| `camera` | camera | 否 | **是 · Pro**（不抢首页主线） |
| `sounds` | sounds | 否 | 浅 |
| `general` | basic | 否 | 浅 |
| `runtime` / `maintenance` | debug | 否 | 修复入口 |

规则：首页 CTA 只指向「下一步」或「修复」；Camera 不进首页主 CTA。

---

## §HUD/tray — 状态协议

与 home 共用 `statusToken`（见 `runtime-status-lexicon.js`）：

| token | 含义 | 托盘/HUD 展示原则 |
|---|---|---|
| `idle` | 未激活听写 | 安静 |
| `listening` | 监听中 | 常驻可信 |
| `dictating` | 听写中 | 强反馈 |
| `paused` | 总开关暂停 | 明确暂停 |
| `error` | 需修复 | 可点进 repair |
| `triggered` | 瞬时触发反馈 | 短时，防噪音 |
| `needsSetup` | 缺触发/目标/麦克风等 | 指向设置 CTA |

锁定小模型（另保留 `ts` 作变更戳；一期仍镜像 `label`/`detail` 兼容）：

| 字段 | 含义 |
|---|---|
| `statusToken` | 上表 token |
| `statusText` | 状态文案 |
| `triggerText` | 触发方式 |
| `targetText` | 目标应用 |
| `repairText` | 修复入口；无则空串 |
| `canPause` / `canResume` | 暂停/恢复可用性 |
| `lastEventText` | 瞬时事件短文（triggered/error） |

主窗经 `ot:runtime-status` / `cmd_runtime_status_protocol` 发布；托盘/HUD/home 消费同一快照。禁止堆叠无关统计；首页五问不得另起文案源。

### 人工三端一致性检查

维护页「快速控制」探针对照主窗 / 托盘 / HUD 的 `statusToken`：

| # | 操作 | 期望 token 路径 | 通过？ |
|---|---|---|---|
| 1 | 暂停 | `listening\|dictating` → `paused`，`canResume=true` | ✅ 2026-07-30 |
| 2 | 恢复 | `paused` → `listening`（或就绪态），`canPause=true` | ✅ 2026-07-30 |
| 3 | 触发一次 | 短时 `triggered`/`dictating`，`lastEventText` 非空后回落 | ✅ 2026-07-30 |
| 4 | 断开/模拟异常 | `error`，`repairText` 非空 | ✅ 2026-07-30 |
| 5 | 刷新快照 | 三处与 `__otRuntimeStatusProtocol` 一致 | ✅ 2026-07-30 |

证据：维护页快速控制探针 `[同源] proto=listening · 主窗Hero=listening`；清单「复制进度」。

---

## Phase1 验收（5 秒工作台）

**工程完成定义（2026-07-30）**：`buildHomeWorkbenchModel` 为首页五问唯一文案源；`#wbHeroFlowSummary` 标 `data-wb-from-model=1`；有 workbench 时 `home-shell` 不再写平行 `#homeStatusTitle` / CTA。

**简化口径**：日常/发布前以机器契约为准；冷启动可读性只做抽检（不必每轮勾满五格）。

| # | 五问 | 机器（契约） | 人工（冷启动抽检） |
|---|---|---|---|
| 1 | 状态 | `model.statusLine` ↔ `protocol.statusText` · `test:home-roadmap` | 一眼能读 Hero「状态」 |
| 2 | 触发 | `model.triggerLabel` ↔ `protocol.triggerText` | 一眼能读「触发」 |
| 3 | 目标 | `model.targetLabel` ↔ `protocol.targetText` | 一眼能读「目标」 |
| 4 | 下一步 | `model.cta` / `nextActionLabel`；CTA ≠ camera | 一眼能读主 CTA |
| 5 | 修复 | `repair` ↔ `protocol.repairText`（有则非空） | 有 repair 时能看到入口 |

| 档 | 通过？ | 说明 |
|---|---|---|
| 机器契约 | ✅ 见 §测试矩阵最近一次必跑 | `npm run test:home-roadmap` 含五问字段 / CTA 禁 camera |
| 人工抽检 | ☐ 发版前 30 秒可选 | 未勾不挡工程发布；失败则只改 model + `renderHeroFlowSummary`，禁平行文案源 |

---

## §Phase3 排队

1. **录制 IPC（Phase3a · 消费落地）**：`idle → starting → recording → stopping → ready|error|cancelled`（[`record-ipc-lifecycle.js`](../src/js/features/mapping/record-ipc-lifecycle.js)；Keys 取消条/反馈/flow chrome **只读** `ipcPhase` / `ot:record-ipc`；`isRecordingUi` 统一「是否在录」；禁止平行 mode!=='none' 判断）  
2. **声学 MediaRecorder（#2a/#2b/#2c ✅）**：P6e paint-target 内统一录制 phase + 样本摘要 + 诊断条（权限/后端/失败/阈值）；**不拆 P6e 岛 root**  
3. **SoftPad 四面板（#3a/#3b/#3c ✅）**：`buildSoftPadFourPanelModel()` + 顺序 / 默认落点 / 每面板唯一主 CTA / 空态已兑现到 legacy paint；**禁止**整页 JSX 重写（P14k–n 锁定）  
4. **Camera Pro（#4a/#4b ✅）**：`safety` 为首屏子 tab；Send Guard 产品态（`buildCameraSendGuardModel` / 禁单视觉直送）；Hello 仅认证叙事、**不接**系统 Windows Hello API；**不做** #4c Capability Probes / #4d 子能力扩展；**禁止** MediaPipe 重写与首页主 CTA  

### SoftPad / Camera 边界（Gate0 通过后仍钉死）

| 模块 | 现在可做 | 现在不做 |
|---|---|---|
| SoftPad | 四面板体验重组已兑现（#3a–c）；保持 paint-target | 整页 JSX、改 `__otMount*` 深改 |
| Camera | #4a/#4b 安全主线 + Pro IA 收敛；nav 标 Pro；CTA 禁 camera；**功能冻结 · 冷却验收已通过** | MediaPipe 重写、#4c/#4d、首页主卡片、系统 Hello API |

**Gate0-hard**：§8.5 #14–#28 ✅（2026-07-30）。Phase3 SoftPad #3a–c / 声学 #2a–c / Camera #4a–b 已落地。

### §Camera Pro Done Criteria（#4a/#4b 冻结态）

| 准则 | 冻结态 |
|---|---|
| send-class blocked | `buildCameraSendGuardModel().allowsDirectSend===false`；`normalizePrefs` / `dispatchAction` 拒 send；绑定菜单无 send |
| probe disabled | `#cameraProSafetyCtaProbe` 保持 `disabled`；title 指向 #4c |
| Hello no system API | Hello 卡仅文案；`#cameraProHelloCheckBtn` disabled；无系统 Hello invoke |
| MediaPipe legacy | 识别/预览仍 legacy；不迁 React；不重写 landmarker / preview |
| 首页 CTA 禁 camera | `home-workbench-model` 对 `camera` 走 `isForbiddenHomeCta` 回退；首页主 CTA 不进 camera |

静态护栏：[`camera-pro-safety.test.js`](../scripts/camera-pro-safety.test.js)、[`camera-presence-actions.test.js`](../scripts/camera-presence-actions.test.js)。

### §Camera 手动回归（冷却验收）

人工闸门。失败判定：remount 假死、预览黑屏/卡死、safety 非默认、probe 可点、出现「立即发送」类 CTA。

| # | 操作 | 期望 | 通过？ |
|---|---|---|---|
| 1 | trigger / action / pro 三 tab 来回切 | 无整页 remount 假死；预览宿主不闪崩 | ✅ 2026-07-30 |
| 2 | 开预览 → 关预览 | MediaPipe 预览起停正常；无卡死 | ✅ 2026-07-30 |
| 3 | 开始校准 → 取消校准 | 校准 UI 可进可退；取消后回到可预览态 | ✅ 2026-07-30 |
| 4 | 进 Pro，默认落 **safety** | 首屏是安全 / Send Guard，不是 beauty | ✅ 2026-07-30 |
| 5 | 点 CTA「配置确认规则」 | 高亮 Send Guard 卡并滚动；约 1.6s 后取消高亮 | ✅ 2026-07-30 |
| 6 | 点 CTA「查看能力探测」 | **仍 disabled**，无导航、无 API | ✅ 2026-07-30 |
| 7 | 点 CTA「开启预览」 | `startPreview({reason:'pro_safety_cta'})`；预览正常 | ✅ 2026-07-30 |

### §Camera Freeze

**状态**：冷却验收 ✅ 2026-07-30；**功能边界仍冻结**（禁止 #4c / Hello / MediaPipe / 首页 CTA 接 camera）。开下一功能刀须另开计划。

| 允许 | 禁止 |
|---|---|
| 修明确 bug | #4c Capability Probes、#4d 子能力扩展 |
| 测试 / 文案 / 样式小改 | 系统 Windows Hello API |
| 文档收口 / 测试矩阵 | MediaPipe 重写；识别/预览迁 React |
| | 首页主 CTA 接 camera；改 `__otMount*` 深改 |

**功能刀候选（不自动排期）**：HUD/tray 抽检、Camera #4c UI-only。真正开工须另开计划。

---

## §发布前验收清单（Phase1–3 收口）

发布前以本表为产品层真源；细节节见上文与 [`migration-react-islands.md`](./migration-react-islands.md) §8.5。

| 层 | Done | 证据（脚本或文档节） | 人工 | 禁区 |
|---|---|---|---|---|
| Phase1 home/workbench | ✅ 机器契约 | `npm run test:home-roadmap`；§Phase1 简化表 | 冷启动抽检可选 ☐ | 平行文案源 |
| Phase2 shell + HUD/tray | ✅ 协议落地 | [`runtime-status-lexicon.js`](../src/js/shared/runtime-status-lexicon.js)；§HUD 人工三端表 | 三端一致性已勾 ✅ 2026-07-30 | 不整壳 React |
| Phase3a record IPC | ✅ | Keys chrome 只读 `ipcPhase` / `ot:record-ipc`；[`record-ipc-lifecycle.js`](../src/js/features/mapping/record-ipc-lifecycle.js) | Keys 录制抽检（§8.5 #16） | 平行 `mode!=='none'` 判断 |
| 声学 #2a–c | ✅ | `npm run test:voice-acoustic`；P6e paint-target | §8.5 #26 ✅ | 不拆 P6e root |
| SoftPad #3a–c | ✅ | `node scripts/test-soft-pad-four-panel-experience.mjs`（亦含于 `test:islands`） | §8.5 #20–25 ✅ | 整页 JSX |
| Camera #4a–b | ✅ | `camera-pro-safety` + `camera-presence-actions`；§Camera Done Criteria | 手动回归 7 步 ✅ 2026-07-30 | #4c/#4d、系统 Hello、MediaPipe 重写、首页 CTA |

---

## §测试矩阵（命令 → 护栏）

不新增聚合 npm script；发布前按表跑。

**最近一次必跑**：✅ 2026-07-30（`test:islands` + `test:home-roadmap` + `test:voice-acoustic` + `camera-pro-safety` + `camera-presence-actions` 全部通过）

| 档 | 命令 | 护栏 | 最近 |
|---|---|---|---|
| 必跑 | `npm run test:islands` | 岛/tsc/smoke + SoftPad/Keys/Camera flow chrome 等 | ✅ |
| 必跑 | `npm run test:home-roadmap` | Phase1 workbench model / 首页 CTA 禁 camera | ✅ |
| 必跑 | `npm run test:voice-acoustic` | 声学 JS 配置/匹配/UI（P6e） | ✅ |
| 必跑 | `node scripts/camera-pro-safety.test.js` | Pro safety IA + Send Guard 静态 | ✅ |
| 必跑 | `node scripts/camera-presence-actions.test.js` | send-class 拒收 + Send Guard model | ✅ |
| 有 cargo 时加跑 | `npm run test:voice-acoustic:rust` | 声学 Rust 命令测 | — |
| 按域抽跑 | `node scripts/camera-pro-glance.test.js` | Pro glance prefs normalize | — |
| 按域抽跑 | `npm run verify:islands-runtime` | 岛运行时挂载抽检 | — |

---

## 验证

发布前跑 §测试矩阵「必跑」行即可发工程闸门。Phase1 人工抽检与 Camera 真机冷却为可选/已完成项，不挡本次必跑通过。
