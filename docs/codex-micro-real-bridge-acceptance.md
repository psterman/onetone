# Codex Desktop → OneTone 真桥验收结论

> 模板：跑完 `scripts/run-codex-micro-bridge-acceptance.ps1` 后填写。

## 元数据

| 字段 | 值 |
|---|---|
| 日期 | |
| voice-pilot commit | |
| AgentController commit | `51a44e4`（`.agentcontroller-tmp`） |
| Codex Desktop 版本 | |
| 驱动 CodexMicroVhfUm | 未装 / 已装 |
| OneTone 启动方式 | `run_onetone.ps1 -CodexMicroProtocol -Safe` |

## 结论（A / B / C）

- [ ] **A 已打通** — READ_OUTPUT `v.oai.thstatus` + relay `POST 200` + OneTone `nativeAG≥1`（来自真实 color/slot）
- [ ] **B 未打通，OneTone OK** — loopback/注入 7/7 通过，但无 READ_OUTPUT 或 Codex 未识 Micro
- [ ] **C 卡点** — 见下方分层

## 三联证据（A 必填）

```
[AgentController] READ_OUTPUT v.oai.thstatus
[relay] POST 200 method=v.oai.thstatus connectionState=connected nativeAg=...
```

粘贴 jsonl 样例行：

```json

```

粘贴 OneTone snapshot 摘要（`nativeAG` / `connectionState`）：

```json

```

## 分层排查（C 时填写）

| 层 | 状态 | 备注 |
|---|---|---|
| 驱动 PnP | | |
| Codex 识 Micro | | |
| READ_OUTPUT / jsonl | | |
| Relay POST | | |
| OneTone 8796 | | |
| Overlay merge | | |

## 注入链路（对照，非 A）

一键验收 / loopback POST 注入可通过，但不等于真桥：

- Loopback: `POST http://127.0.0.1:8796/api/codex-micro/protocol`
- 验收页: `http://127.0.0.1:8766/codex-onetone-linkage-acceptance.html`

## 备注

- Rust 已支持 Codex 原生 `params[]` + `c` 颜色映射（`map_thstatus_color_to_state`）
- Relay normalize 仅为联调便利；透传原生 JSON 亦应由 Rust 解析
- `agent_slots[i].raw` 保留完整 slot item 便于版本漂移排障
