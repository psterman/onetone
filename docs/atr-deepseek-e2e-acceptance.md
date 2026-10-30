# ATR DeepSeek E2E 验收记录

> runId: `run-2026-10-29T01-25-58`  
> recordedAt: 2026-10-29T01:27:49.847Z  
> sandbox: `E:\voice-pilot\.tmp-atr-e2e-sandbox`  
> DeepSeek key: **MISSING**

## 总判

**假驱动/协议闭环通过；缺 Soft Pad DeepSeek 密钥，真模型未齐**

假驱动/协议 cargo：PASS（`logs\atr-deepseek-e2e\run-2026-10-29T01-25-58\protocol-cargo.log`）

## 五条边界

| ID | 标题 | 协议/假驱动 | 真 DeepSeek | 备注 |
|----|------|-------------|-------------|------|
| v1-single-file | 真密钥单文件修改 | pass | blocked_no_key | edit→waiting→approve→done；同 taskId/checkpointId；文件内容符合 goal |
| v2-repair | check 失败并自主修复 | pass | blocked_no_key | run_check ok=false → repair → run_check ok=true → done |
| v3-restart | 重启后 waiting / interrupted 恢复 | pass | blocked_no_key | waiting 杀进程后仍可批准；interrupted 可 resume；同 checkpointId |
| v4-dirty | 未提交修改不被覆盖 | pass | blocked_no_key | baseline_dirty_requires_approval；USER_LOCAL_EDIT 仍在磁盘 |
| v5-long-drive | 长时间模型请求对首页与 DB | code_review_pass | blocked_no_key | drive 中首页可交互；status IPC 不挂；无 SQLite busy；cancel→cancelled |

## 证据目录

`E:\voice-pilot\logs\atr-deepseek-e2e\run-2026-10-29T01-25-58`

- `summary.json` — 机器可读结果
- `protocol-cargo.log` — Fake 闭环 cargo 输出
- `v4-dirty-prepared.json` — 已写入 USER_LOCAL_EDIT 的脏文件状态
- 真密钥桌面跑通后请追加：`v1-status.json` `v1-events.json` … `v5-notes.md`

## 操作员补跑（有密钥后）

1. Soft Pad 写入 DeepSeek 密钥；确认 `cmd_agent_task_ready.deepseekReady === true`
2. DevTools: `localStorage.setItem('onetone.agentTaskRuntime','1')` → 刷新
3. 首页确认项目 = sandbox → `workMode=edit`
4. **v1** goal: `把 scratch/hello.txt 改成 hello deepseek\\n` → 批准 → done → 导出 events
5. **v2** 构造可失败再修复的 check 场景（或观察 noop/项目 check）→ 确认 repair 事件
6. **v3** waiting 时杀进程再开；running 时杀进程 → 恢复
7. **v4** 使用已准备的 dirty hello.txt → 确认拒绝覆盖且 USER_LOCAL_EDIT 仍在
8. **v5** drive 进行中点首页刷新 / status；可选 cancel

## 明确不做

- 不在 CI 注入真密钥
- 不默认打开 ATR flag
