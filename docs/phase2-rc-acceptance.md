# Phase2 RC 验收手册

> 产品状态：**Phase2 RC** — 实现 / 自动化 / 桌面 A/B 已通过；远程 C **skipped**；release acceptance **passed**（C 约定跳过）。  
> 分层状态见 [phase2-gate-record.md](./phase2-gate-record.md)。

## 当前记录（回填区）

| 层 | 状态 | 证据 / 备注 |
| --- | --- | --- |
| implementation | passed | 代码与 IPC 已合入工作区 |
| automated verification | **passed**（2026-10-28） | `npm run verify:phase2-rc` 全绿；`project_context` 11 passed |
| Phase2.0 preflight | passed | gate 七项 |
| local desktop verification (A) | **passed**（2026-10-28） | 主窗口引导九步：目录选择 / 读片段 / adopt / 直发 / stale 三态 / 截图 |
| Git closed loop (B) | **passed**（2026-10-28） | unstaged 列表 + Diff；非 Git 目录降级提示「改用读取选定文件」。B3–B6（二进制/删除/重命名/超限）RC 简化门禁未强制，保持 skip |
| remote organize (C) | **skipped** | 无费用/提供商授权 |
| release acceptance | **passed**（2026-10-28） | A+B 人工通过；C skipped；debug `onetone.exe`（NSIS 非硬门禁） |

启用入口（真机）：

```js
localStorage.setItem('onetone.projectContext.enabled', '1')
```

默认必须**不**显示「添加工程材料」。

### 简化验收

| 方式 | 命令 / 入口 | 能证明什么 |
| --- | --- | --- |
| 一键自动化 | `npm run verify:phase2-rc` | FE + `project_context` lib |
| 引导台 | 主窗口 `Ctrl+Shift+A` →「引导」 | 桌面 A/B 逐步勾选 |

---

## A. 桌面本地闭环

前置：重建并启动**主窗口** `onetone.exe`。

| # | 步骤 | 结果 | 备注 |
| --- | --- | --- | --- |
| A0 | 重建 exe | **pass** | 含对话框假死修复与 query camelCase 修复后的 debug 构建 |
| A1 | 默认不显示「添加工程材料」 | **pass** | flag 关闭时隐藏 |
| A2 | 设置 flag 后入口显示 | **pass** | 引导台「启用入口」 |
| A3 | 主窗口原生目录选择器 | **pass** | 选 voice-pilot / not-git-test2 |
| A4 | tray / Soft Pad `wrong_owner` | **pass** | lib `non_main_window_rejected`；RC 未另开 Soft Pad 点测 |
| A5 | 读取 README / 名片 | **pass** | 抽屉内联表单（已弃用 WebView prompt） |
| A6 | 未 adopt 不进发送正文 | **pass** | 候选仅预览 |
| A7 | adopt 后状态/预算提示 | **pass** | 「加入材料」 |
| A8 | stale 三态 | **pass** | 校验新鲜度 → changed → 刷新/继续旧版/移除 |
| A9 | 无 key 直发 | **pass** | 引导步完成 |
| A10 | 截图留证 | **pass** | 操作员截图（Win+Shift+S） |

---

## B. Git 闭环

| # | 步骤 | 结果 | 备注 |
| --- | --- | --- | --- |
| B1 | staged / unstaged 不混算 | **pass** | unstaged 列表含 README 等；两侧分入口 |
| B2 | 非 Git：引导选定文件 | **pass** | `not-git-test2` → 非 Git 提示 +「改用读取选定文件」 |
| B3 | 二进制 | **skip** | RC 简化未强制 |
| B4 | 删除文件 | **skip** | 同上 |
| B5 | 重命名 | **skip** | 同上 |
| B6 | 超限 patch | **skip** | 同上 |
| B7 | Git 不可用降级 | **pass** | 与 B2 同路径覆盖 |

---

## C. 真实远程 `task_organize`

**未授权费用/提供商 → 全部 skip。**

| 字段 | 记录 |
| --- | --- |
| 日期 | 2026-10-28 |
| 结论 | **skipped**（无授权） |

```text
task_organize: implemented
local/fake transport: verified
real provider: skipped
```

---

## 构建卫生

| # | 检查 | 结果 | 备注 |
| --- | --- | --- | --- |
| H1 | build 通过 | **pass** | debug exe |
| H2 | capability 仅 main | **pass** | |
| H3 | NSIS 打包 | **pending / 可选** | 非 RC 硬门禁 |
| H4 | warning 不阻塞 | noted | |

**RC 闭环结论（2026-10-28）：** A+B 人工通过，C skipped，`Phase2 release acceptance: passed`。后续若授权真实提供商，另开 C 复验，不回滚本 RC 结论除非回归失败。
