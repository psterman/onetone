# Home Agent Roster v2 — 真实桌面验收矩阵

**状态：** Capability Resolver + Honest Projection 已完成；C1/U1/X1–X4 仍待真实证据；A4–A7 验收工具阻塞；export/disable 暂未接入  

**通道：** 复用 `bfinal_e2e`（`ONETONE_AGENT_ROSTER_E2E=1`）+ `scripts/capture-tauri-shot.ps1`；非 Playwright / 非 winapp CLI  
**证据目录：** `docs/acceptance-artifacts/20261005/`（基线 `bfinal-baseline/`；Roster `roster-webview/`）  
**允许结果：** `通过` | `阻塞：<原因>` | `失败：<现象>` | `未验收：<原因>`  
**规则：** fixture WebView ≠ 真实 Provider。助手只写入矩阵；不凭回忆补填。

### 统一证据模板

```text
ID:
操作:
实际:
截图:
日志:
outcome:
ok:
verified:
attemptId:
结果:   # 通过 | 阻塞：原因 | 失败：现象 | 未验收：原因
```

### 日志分级

| 场景 | 日志 |
|------|------|
| V1、V2 等纯 UI | 允许 `日志：不适用；证据为截图 + 实际 DOM/UI 状态` |
| V3、V4、E* | 截图必填；有 toast/文案则记入「实际」；日志不适用须写明 |
| C1、X1–X4、U1 | **必须**有应用日志或 action result 证据（outcome / ok / verified / attemptId） |

### 本轮证据标记（统一）

```text
执行表面：真实 Tauri WebView
数据来源：确定性 fixture
Provider 真实性：非真实 Provider
```

---

## 矩阵（填写顺序 V → E → C → U → X）

| ID | 操作 | 预期 | 实际 | 截图 | 日志 | outcome / ok / verified / attemptId | 结果 |
|----|------|------|------|------|------|--------------------------------------|------|
| V1 | 窄屏（≤680）展开名册行 | 详情可读；`.har-detail` 出现；无横向严重裁切 | fixture：`aria-expanded` false→true；openRow+detail+badges；scrollWidth=clientWidth；逻辑宽≤680 | `docs/acceptance-artifacts/20261005/roster-webview/roster-v1-expand.png` | `roster-v1.json` | — | 通过（fixture WebView） |
| V2 | 筛选：全部 / 正在工作 / 可确认 / 尽力 / 尚未接入 / 不支持 / 状态过期 | 各组合行集合正确；尚未接入≠不支持 | fixture 七项全覆盖；各 filter matchOk；working=1；unsupported≠notWired；Cursor 仅 usable→bestEffort | `roster-v2-filters.png`（及 `roster-v2.json`） | `roster-v2.json`；交叉校验 `_computeHomeOverview`/`_matchesHomeFilter`/`_projectAgentControl` | — | 通过（fixture WebView） |
| H1 | 宽屏四卡总览 | 已发现 / 正在工作 / 可确认控制 / 尽力控制 四列可见；摘要含尚未接入/不支持/过期 | fixture apply + filter=all；`canvasScrollTop=900`；四卡+名册行可见 | `home-overview-four-cards.png` | `home-shot-overview.json` | — | 通过（fixture WebView） |
| H2 | 筛选「尚未接入」 | 仅 notWired 行；与不支持分离 | filter=notWired；行=`kind:unknown` | `home-filter-not-wired.png` | `home-shot-notWired.json` | — | 通过（fixture WebView） |
| H3 | 筛选「不支持」 | 仅 unsupported 行 | filter=unsupported；行=`kind:unsupported` | `home-filter-unsupported.png` | `home-shot-unsupported.json` | — | 通过（fixture WebView） |
| H4 | 筛选「状态过期」 | 仅 stale 行 | filter=stale；行=`kind:work-stale` | `home-filter-stale.png` | `home-shot-stale.json` | — | 通过（fixture WebView） |
| H5 | Cursor 尽力控制 | Cursor 可用 hotkey 行显示尽力；无 Verified | filter=bestEffort；含 `kind:cursor` | `home-cursor-best-effort.png` | `home-shot-cursor.json` | — | 通过（fixture WebView） |
| H6 | 可确认 pending 详情 | 展开详情含验收状态；export/disable 只读尚未接入、无可点按钮 | filter=confirmable；expand `kind:claude`；详情含验收；无 export 按钮 | `home-confirmable-pending-detail.png` | `home-shot-confirmableDetail.json` | — | 通过（fixture WebView） |
| V3 | working 证据过期后看总览 | 「当前工作中」下降；不与中断能力桶相加 | asOf 固定；fresh working 计入；stale working 不计入且 status 仍为 working | `roster-v3-freshness.png` | `roster-v3.json` | — | 通过（真实 Tauri WebView + fixture freshness 投影验证；非真实 Provider freshness） |
| V4a | 动作返回 verified | toast「已确认停止」语义 | `_resolveActionOutcome`→verified；`_outcomeMessage` 与 failed/attempted 文案分离 | `roster-v4-ui.png` | `roster-v4-ui.json` | outcome=verified / （合成 result） | 通过（真实 Tauri WebView + 合成 result 的 UI 投影验证） |
| V4b | 动作返回 attemptedUnverified | toast「已发送，尚未确认」语义 | outcome=attemptedUnverified；文案≠verified | 同上 | 同上 | outcome=attemptedUnverified | 通过（UI 投影） |
| V4c | 动作返回 failed | toast「操作失败」语义；无 Verified 文案 | outcome=failed；负向：缺省/非法/ok·verified 错配均不升级 verified | 同上 | 同上 | outcome=failed | 通过（UI 投影） |
| V4-ipc | 真实 failed IPC | invoke 返回 failed/ok=false/verified=false | `cmd_agent_center_action` agentId=`kind:e2e-nonexistent` → `error=agent_not_found` | 不适用（结构化 JSON） | `roster-v4-ipc.json` | outcome=failed / ok=false / verified=false / attemptId=e2e-roster-v4-ipc-1 | 通过（真实失败 IPC；非真实 Provider 中断） |
| V4-rust | DTO 不变量 | verified/attempted/failed 派生字段 + camelCase attemptId | 复用既有测试：`action_outcome_derived_fields`、`agent_center_action_result_serializes_outcome`；`cargo test --lib agent_memory` 142 passed | 不适用 | cargo 测试输出 | — | 通过 |
| V4-provider | 真实 Provider 中断 | Phase 6 | 本轮未执行 | — | — | — | 未验收：默认不执行真实 Provider（Phase 6） |
| E1 | `no_window_target` | 文案「窗口不可定位」 | fixture reason → `_humanActionReason`；UI 投影通过，真实来源未验收 | `roster-e-reasons.png` | `roster-e1-e5.json` | — | 通过（UI 投影）；真实来源未验收 |
| E2 | `no_mapping_target` | 「没有可定位的 Cursor 控制目标」 | 同上 | 同上 | 同上 | — | 通过（UI 投影）；真实来源未验收 |
| E3 | `evidence_stale` | 「控制证据已过期」；≠ unsupported | classify≠unsupported；文案≠ E5 | 同上 | 同上 | — | 通过（UI 投影）；真实来源未验收 |
| E4 | `ProbeNotImplemented` | 「本机检测尚未接入」；≠「不支持」 | classify=unknown；文案≠ E5 | 同上 | 同上 | — | 通过（UI 投影）；真实来源未验收 |
| E5 | `provider_unsupported` | 「不支持」；与 E4 不同 | classify=unsupported；与 E4 分离 | 同上 | 同上 | — | 通过（UI 投影）；真实来源未验收 |
| C1 | Claude：精确会话运行中 → 中断/Stop | toast「已确认 Agent 已停止」；outcome=verified | 未执行 | — | — | — | 未验收：真实 Provider 中断默认不执行（Phase 6） |
| U1 | Cursor：热键成功 | 固定 AttemptedUnverified；UI **无** Verified | 未执行 | — | — | — | 未验收：真实 Provider 中断默认不执行（Phase 6） |
| X1 | Codex inactive exact → Verified | toast Verified /「已确认停止」 | 未执行 | — | — | — | 未验收：真实 Provider 中断默认不执行（Phase 6） |
| X2 | Codex 仍 active → AttemptedUnverified | 不得 Verified | 未执行 | — | — | — | 未验收：真实 Provider 中断默认不执行（Phase 6） |
| X3 | Codex session mismatch | AttemptedUnverified；不得 Verified | 未执行 | — | — | — | 未验收：真实 Provider 中断默认不执行（Phase 6） |
| X4 | Codex probe/ForceFresh 失败 | AttemptedUnverified；不得 Verified | 未执行 | — | — | — | 未验收：真实 Provider 中断默认不执行（Phase 6） |

---

## 验收后填写说明

1. fixture WebView 项已用 `bfinal_e2e` + `ONETONE_AGENT_ROSTER_E2E=1` 回填；证据在 `roster-webview/`。
2. 真实 Provider（C/U/X）为**近期专项**：仅在显式 `ONETONE_AGENT_REAL_INTERRUPT_E2E=1` 且已准备活动会话时执行；默认不跑；证据写入 `real-provider/`。
3. A4–A7：**验收工具阻塞**（非产品缺陷）→ 非本轮关闭阻塞；不写成通过；不伪装成产品不支持；工具链具备后单独验收。
4. `export_history` / `disable_source`：保持 `not_wired`；UI 禁用或隐藏；无成功 toast；无明确场景前不实现。
5. 正式交付口径见下；不得写「全部真实场景通过」。

**整表汇总：** V/E fixture 已通过；UI 投影收敛完成；C1/U1/X1–X4 未执行（近期专项）；A4–A7 工具阻塞；export/disable 未接入

**汇总说明：**

```text
自动化验证：通过
真实 Tauri WebView fixture 验收（V/E）：通过
UI/范围收敛：完成
真实 Provider 中断验收（C/U/X）：未执行（近期专项）
原生窗口自动化 A4–A7：验收工具阻塞
export_history / disable_source：暂未接入

正式交付口径：
Capability Resolver Convergence + Honest Capability Projection 已完成；
真实 Provider 中断闭环仍待 C1/U1/X1–X4 证据；
A4–A7 为验收工具阻塞；
export_history 和 disable_source 暂未接入。
```

### 关闭条件分层

- [ ] C1/U1/X1–X4 真实 Provider 证据（近期专项 / Phase 6）
- [x] V/E WebView fixture 项有实际记录与截图/JSON
- [x] UI 投影收敛（四卡 + projectAgentControl）
- [x] A4–A7 标为验收工具阻塞（不写成通过；不阻塞本轮）
- [x] export/disable 明确 `not_wired` / 后续能力
- [x] delivery 与最终状态同步
