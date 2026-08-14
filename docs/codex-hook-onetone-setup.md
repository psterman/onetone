# Codex / Claude Hook → OneTone 状态灯

用 **官方 Hooks** 把生命周期事件送进 OneTone。分层：

- **Codex Hook** → 主 `PadStatus` **单灯**（`slotId=status`；无则 fallback AG00；stock Soft Pad 无 status route → 灯在 AG00，按下仍是命令菜单）
- **Claude Hook** → **Claude Agent Activity Pad**：`claude_lights` **自建多灯**（agent 活动灯 / OneTone 自建聚合；非官方硬件多灯协议）
- **Micro native** `v.oai.thstatus` → AG00–AG05 官方多 AG（最高优先）

**Hook 通过 ≠ Micro HID thstatus。** Claude **不**写、也不消费 `v.oai.thstatus`。`native` 仍只代表真 Micro 协议状态。

详见 **[State Core](./pad-status-core.md)**。

## 3 分钟用户路径

1. 打开 OneTone，进入 Codex 小键盘管理。
2. 开启 **Codex 状态灯**（会 ensure 本机 `127.0.0.1:8796`；关闭时**不停** listener）。
3. 点 **复制 Hook 配置**，手动合并到 `%USERPROFILE%\.codex\hooks.json`（根对象只能有 `"hooks"`）。
4. 在 `~/.codex/config.toml` 的 `[features]` 下设 `hooks = true`。
5. 用 **Codex CLI** 信任：终端运行 `codex` → `/hooks` → Trust（聊天框里的 `/hooks` 无效）。
6. 在 Codex 发一条 prompt → status 宿主键 `running`；权限请求 → `needs_input`；完成 → `done` → 约 600ms `idle`。
7. Hook 面板显示 **已连接** · Codex Hook · lastEvent。

面板三态（诚实命名，**不**检测「已信任」）：

| 状态 | 含义 |
|------|------|
| 未配置 | hooks.json 不存在或不含 `codex-hook-probe.js` |
| 已配置，等待 Codex 事件 | 已配置探针，但尚无 `codex_hook` 事件 |
| 已连接 | 已收到 `codex_hook` + lastEvent |

> 如果已配置但没有事件，请在 Codex 的 `/hooks` 中信任该 Hook。

## 通道说明

Loopback（Labs / 状态灯开启时 ensure）监听 `127.0.0.1:8796`：

- `POST /api/codex-micro/protocol` — Micro 状态（不接 hid/rad）
- `POST /api/codex-app/state` — **Hook / app 状态专用**；关状态灯时仍可写入并返回 `disabled`/`appStateEnabled=false`，但 overlay **不吃** `codex_hook` 上灯

产品开关字段：`codexMicroPad.codexStatusLightsEnabled`（独立语义，不是键位映射）。

## 手动配置 Hooks（推荐先 inspect，再一键或手写）

示例：[`scripts/codex-hooks.example.json`](../scripts/codex-hooks.example.json)

- Codex 0.142：根对象**只能**有 `"hooks"`；不能有 `description`
- Soft Pad Hub：**复制 Hook 配置** 或 **一键安装 hooks**（备份 `hooks.json.onetone-backup-*` 后 merge）
- `cmd_codex_hook_setup_status.inspectFiles` 会列出 Codex 实际相关路径（`~/.codex/hooks.json`、`config.toml` hooks 开关）
- 安装后仍须：在 `~/.codex/config.toml` 的 `[features]` 下设 `hooks = true`，并用 **Codex CLI** `/hooks` → Trust
- 不会静默覆盖你的非 OneTone 段以外的自定义（merge 按事件键写入探针）

覆盖事件：`SessionStart`、`UserPromptSubmit`、`PermissionRequest`、`Stop`、`SubagentStart`、`SubagentStop`。

探针：[`scripts/codex-hook-probe.js`](../scripts/codex-hook-probe.js) — fail-open，永远 exit 0，stdout 为空。

## 灯映射

| Hook 事件 | 灯状态 |
|-----------|--------|
| `UserPromptSubmit` | running（status 宿主键） |
| `PermissionRequest` | needs_input |
| `Stop` | done → 约 600ms 后 idle |

- Codex Subagent*：只记事件，不做六槽 / 不做 Codex Hook 多灯
- Claude `SubagentStart/Stop`：只写 `claude_lights`，**不写**主 `PadStatus`；Soft RGB / app meta 仍跟主 `PadStatus`
- Claude `needs_input`：主 ACT context idle 时才局部强调 ACT08/ACT12；不驱动 Soft RGB
- idle 后仍保留 `appLastEvent` / `appLastSource` / `appLastSeenAt` / `appAgeMs`

UI：`codex_hook` →「Codex Hook」；`claude_hook` →「Claude Hook」；`native` →「Native Micro」。禁止把 Hook 标成 Native Micro。

## 验收页

`node design-mock/_serve.js` →  
`http://127.0.0.1:8766/codex-onetone-linkage-acceptance.html`

- **Codex Hook 状态灯** 区：`source=codex_hook`、status 宿主键灯态、lastEvent
- **Micro 协议注入** 区：Native Micro / thstatus / rgbcfg
- 顶部总状态不再用 `native AG` 暗示 Hook 成功

## 诚实边界

- Hook 通过 ≠ Micro HID thstatus
- 不要把 Hook payload 转成 `v.oai.thstatus`
- Claude 多灯 = OneTone 自建聚合，不是官方硬件多灯协议
- Soft RGB / meta 跟主 `PadStatus`，不跟 Claude 多灯
- 关状态灯不停 8796 listener（Labs Micro 注入可继续）
