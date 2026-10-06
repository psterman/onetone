# Capability Resolver Convergence + Honest Capability Projection — 交付边界

**日期：** 2026-10-05

## 状态分列（防误读）

```text
自动化验证：通过
真实 Tauri WebView fixture 验收（V/E）：通过
UI/范围收敛（projectAgentControl 四卡）：完成
真实 Provider 中断验收（C/U/X）：未执行（近期专项缺口）
原生窗口自动化 A4–A7：验收工具阻塞（非产品缺陷；非本轮关闭阻塞）
export_history / disable_source：暂未接入（not_wired）

正式交付口径：
Capability Resolver Convergence + Honest Capability Projection 已完成；
真实 Provider 中断闭环仍待 C1/U1/X1–X4 证据；
A4–A7 为验收工具阻塞；
export_history 和 disable_source 暂未接入。
```

说明：npm/cargo 绿 ≠ 真实 Provider 通过。本轮 E2E 使用隔离数据根 + fixture，在真实 Tauri WebView 中验收 UI 投影；**不是**真实 Claude/Cursor/Codex 中断闭环。

仅当 C1/U1/X1–X4 有 `real-provider/` 证据后，才可宣称真实中断闭环已验收。  
仅当产品目标升级为「完整 Agent 管理中心」时，才同时投入 A4–A7、导出历史与禁用 Agent。  
**禁止**「全部真实场景通过」或暗示 Provider / A4–A7 / export·disable 已完成。

## 文档说明

- [`docs/agent-center-home-roster-v2-desktop-acceptance.md`](agent-center-home-roster-v2-desktop-acceptance.md)：桌面验收矩阵（已回填 V/E/V4 fixture；C/U/X 未执行）
- [`docs/acceptance-artifacts/20261005/bfinal-baseline/`](acceptance-artifacts/20261005/bfinal-baseline/)：Phase 2 隔离基线 E2E
- [`docs/acceptance-artifacts/20261005/roster-webview/`](acceptance-artifacts/20261005/roster-webview/)：Phase 3–4 Roster WebView fixture 证据
- [`scripts/capture-tauri-shot.ps1`](../scripts/capture-tauri-shot.ps1)：PrintWindow 截图
- [`scripts/run-tauri-e2e.ps1`](../scripts/run-tauri-e2e.ps1)：隔离 data root + 可选 `-AgentRoster`
- [`src-tauri/src/bfinal_e2e.rs`](../src-tauri/src/bfinal_e2e.rs)：`ONETONE_AGENT_ROSTER_E2E=1` 门控
- [`src-tauri/src/data_root.rs`](../src-tauri/src/data_root.rs)：`ONETONE_E2E_DATA_ROOT` 双门禁覆盖

## 本轮 E2E 通道（Phase 0–4）

| Phase | 内容 | 状态 |
|-------|------|------|
| 0 | 只读核验（进程/磁盘/允许修改面） | 完成 |
| 1A/1B | 截图脚本 + TimeoutMinutes + e2e-run.meta.json | 完成 |
| 1C/1D | E2E data root 双门禁 + 最小 settings fixture（无 token） | 完成 |
| 2 | 隔离环境原有 bfinal_e2e 全绿 | 通过 |
| 3 | V1/V2/V3 + E1–E5（真实 WebView + fixture） | 通过 |
| 4 | V4-ui / V4-ipc / V4-rust；V4-provider 未执行 | ui/ipc/rust 通过；provider 未执行 |
| 5 | winapp CLI A4–A7 | 验收工具阻塞（暂不投入产品开发） |
| 6 | 真实 Provider C1/U1/X1–X4 | 未执行；**近期唯一建议专项**（需 `ONETONE_AGENT_REAL_INTERRUPT_E2E=1`） |
| 7 | UI/范围收敛（四卡 + projectAgentControl） | 完成 |
| — | export_history / disable_source | 保持 `not_wired`；无明确场景前不实现 |

### 安全约束（已遵守）

- 完整 E2E 仅在 `ONETONE_E2E_DATA_ROOT` 隔离根运行；未使用用户真实 AppData settings/token
- 生产 `target/release/onetone.exe` hash 未变；不含 `ONETONE_BFINAL_E2E` marker
- 收尾轮允许修改 `agent-center.js` I18N（E1/E2/E3 文案）与验收文档；Rust 能力槽 `not_wired` 不变
- 不自动 commit；不 `cargo clean`；不迁 `CARGO_HOME`

## 复测记录

| 命令 | 结果 | 备注 |
|------|------|------|
| `cargo test … --lib data_root` | 通过 5 | E2E override 纯函数 |
| `npm run test:e2e` / rebuild+`-AgentRoster` | 通过 | 隔离 data root；roster gate |
| `rebuild-and-run-tauri-e2e.ps1 -AgentRoster`（2026-10-06） | **PASS** shots=19 | 六张 `home-*` 含名册/详情；`home-shot-*.json` ok；scroll pin |
| `npm run typecheck` | 通过 | |
| `cargo check --manifest-path src-tauri/Cargo.toml` | 通过 | 既有 unused warning |
| `cargo test … --lib agent_memory` | 通过 **142** | 含 `action_outcome_derived_fields` 等 V4-rust |
| `npm run test:agent-center` | 通过 | projectAgentControl + E1–E5 + Cursor 永非 Verified |
| `npm run test:home-agent-roster` | 通过 | 四卡筛选选项 |
| `npm run typecheck` | 通过 | UI 收敛轮 |
| `cargo test … --lib agent_memory` | 通过 **142** | |
| 收尾报告 | 见 `docs/acceptance-artifacts/20261005/final-report.md` | 正式口径：Resolver 已完成；C/U/X 待证；A4–A7 工具阻塞；export/disable 未接入 |

生产 exe SHA256（本轮后）：`B0FD1372164C0A450DC268BE71B1F3A4411B82B438FC6B39AA333CB051BEEAB5`；`rg -a ONETONE_BFINAL_E2E` 无匹配。

## 后续阶段（分层）

**近期（建议）：** Phase 6 真实 Provider 专项 — `src-tauri/src/real_provider_e2e.rs` + `scripts/run-real-provider-scenario.ps1`。2026-10-06 U1 实跑结果为 **blocked**（Cursor `not_running`），非通过。需活动会话使 `interrupt.enabled=true` 后再跑。默认不跑。

**暂缓：** Phase 5 A4–A7 — 验收工具阻塞；工具链具备后单独验收；不写成通过、不伪装成产品不支持。

**暂不实现：** `export_history` / `disable_source` — 保持 `not_wired`；UI 禁用或隐藏；无成功 toast。
