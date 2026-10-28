# Phase2 RC 验收 · 自动 / 手动复核报告

> 复验时间：**2026-10-28 11:57（GMT+8）** — 独立重跑，非沿用 11:23 记录。
> 配套手册：[phase2-rc-acceptance.md](./phase2-rc-acceptance.md)
> 一句话结论：**7 项自动化全绿，只证明「逻辑 / IPC / 路径安全」；A / B / C 及 release 仍待人工真机，任何人不得以自动化结果把面板上的「待验 / pending」标成 passed。**

---

## 一、自动化复核结果（已重跑，真绿）

| 命令 | 正确调用方式 | 结果 | 退出码 |
| --- | --- | --- | --- |
| `npm run test:home-assist-ipc-contract` | 仓库根目录 | `test-home-assist-ipc-contract: ok` | 0 |
| `npm run test:home-assist-ownership` | 仓库根目录 | `test-home-assist-ownership: ok` | 0 |
| `npm run test:home-assist-ui-checklist` | 仓库根目录 | `ok (simulated steps 1–8)` + `device_check_remaining: visual click-through` | 0 |
| `npm run test:home-project-context` | 仓库根目录 | `test-home-project-context: ok` | 0 |
| `npm run test:home-prompt-prep` | 仓库根目录 | `ok home-prompt-prep` | 0 |
| `npm run test:home-agent-v2` | 仓库根目录 | `test-home-agent-v2: ok` | 0 |
| `cargo test --lib project_context --no-default-features` | **须在 `src-tauri/` 下**（或加 `--manifest-path src-tauri/Cargo.toml`） | `11 passed; 0 failed; 1098 filtered out` | 0 |

> ⚠️ 修正：`cargo test` 的原生命令需在 `src-tauri/` 子目录执行。仓库根目录无 `Cargo.toml`，直接跑会报 `could not find Cargo.toml`。手册里那行命令缺 manifest 路径，复验时已在 `src-tauri/` 下重跑成功。

**11 个 Rust 单测明细（全 ok）：**
`rejects_dotdot_and_ads` · `staged_and_unstaged_separate` · `passport_from_readme_and_package` · `rejects_junction` · `excerpt_preserves_long_span` · `excludes_env` · `rejects_prefix_collision_neighbor` · `non_main_window_rejected` · `one_active_scope_per_window` · `task_mismatch_revokes_access` · `finds_literal_and_skips_binaryish`

---

## 二、自动化能证明什么（能力边界）

- **实现本身**：核心 reader / scope / passport / git_evidence / search 模块逻辑存在且正确。
- **预检门（preflight gate）**：feature flag、scope 归属、路径安全校验逻辑通过。
- **假传输整理（fake transport）**：`task_organize` 的本地/模拟链路通过（非真实远程）。
- **IPC 契约**：前端 ↔ Rust 的调用契约一致。
- **路径安全（重点）**：拒绝 `..` 越界、ADS 流、junction  symlink、前缀碰撞邻目录；非主窗口调用被拒（`non_main_window_rejected`）；一窗一 scope、task 不匹配即吊销。
- **Git 逻辑层**：staged 与 unstaged **不混算**（`staged_and_unstaged_separate` ok）。
- **模拟 8 步 checklist**：`ui-checklist` 自述 `simulated steps 1–8`，并显式标注剩余项 `device_check_remaining: visual click-through on onetone.exe` —— **这是模拟层，不是真机**。

---

## 三、自动化不能证明什么（必须人工）

| 缺口 | 对应手册项 | 为什么不能自动 |
| --- | --- | --- |
| Win 原生文件夹对话框（FolderBrowser） | A3 | 需要 Win32 原生 UI 在主窗口弹出 + 真人选择目录 |
| adopt 界面（来源/行号/预算可见） | A6 / A7 | UI 渲染与交互在主窗口，逻辑虽覆盖但 UI 待确认 |
| stale UI（改文件后刷新/继续旧版/移除） | A8 | 依赖主窗口事件与真人操作文件 |
| 真机八步 / 截图证据 | ui-checklist 的 `device_check_remaining` | checklist 是模拟层，需真人点 + 截图 |
| 真实远程 `task_organize` | C | 需要密钥 + 费用授权，未授权即保持 skipped |
| NSIS 打包后 dialog+Git 子进程 | H3 | 当前是 debug exe，非打包产物 |

---

## 四、必人工项清单（照搬手册，状态不变）

### A. 桌面本地闭环（同一桌面构建，A0 已 pass 可跳过重建）
| # | 步骤 | 状态 | 为何必须人工 |
| --- | --- | --- | --- |
| A1 | 默认不显示「添加工程材料」 | pending | 需主窗口启动确认隐藏 |
| A2 | 设 flag 后 reload，入口显示 | pending | 需主窗口 DevTools |
| A3 | 主窗口可打开原生目录选择器 | pending | Win32 原生对话框 |
| A4 | tray / Soft Pad 调用被拒（wrong_owner） | pending | 桌面多窗口点击确认 |
| A5 | 读取 README / 代码行片段 | pending | 主窗口交互 |
| A6 | 候选未 adopt 不进发送正文 | pending | UI 待确认 |
| A7 | adopt 后可见来源/行号/预算 | pending | UI 待确认 |
| A8 | 改文件 stale；刷新/继续旧版/移除 | pending | 主窗口 + 文件操作 |
| A9 | 无 key 直接发送仍可完成 | pending | 真机发送链路 |
| A10 | 截图 / 操作记录已附 | pending | 人工留证 |

### B. Git 闭环（同一构建）
| # | 步骤 | 状态 | 为何必须人工 |
| --- | --- | --- | --- |
| B1 | staged / unstaged 不混算 | pending | lib 测 pass ≠ 桌面点通 |
| B2 | 非 Git 项目：禁用 Diff + 引导文案 | pending | 桌面 UI |
| B3 | 二进制：状态展示不硬转 patch | pending | 桌面 UI |
| B4 | 删除文件：明确状态 | pending | 桌面 UI |
| B5 | 重命名：新旧路径校验 | pending | 桌面 UI |
| B6 | 超限 patch：截断 + 预算解释 | pending | 桌面 UI |
| B7 | Git 不可用：降级读选定文件 | pending | 桌面 UI |

### C. 真实远程 `task_organize`
- 状态：**unverified / skipped**（无用户费用/提供商授权）。
- 仅在你明确允许提供商 + 费用时才执行；否则保持 skipped，不得标 passed。

---

## 五、人工最短路径步骤（A → B → C）

**前置（A0 已做过，可跳过重建）**
1. 启动 `src-tauri/target/debug/onetone.exe`（**主窗口**，非仅 Soft Pad）。
2. DevTools 执行 `localStorage.setItem('onetone.projectContext.enabled','1')` → 刷新。
3. `Ctrl+Shift+A` 打开验收雷达，对照勾选。

**A 本地闭环**
1. 未开 flag 时确认无「添加工程材料」→ 开 flag 后出现。
2. 打开入口 → 原生目录选择器选一个小仓库。
3. 读 README / 某文件片段 → 未 adopt 前不进发送正文。
4. adopt → 看到来源/行号/预算 → 无 key 也能直接发送。
5. 改文件 → stale → 试刷新 / 继续旧版（`stale_user_confirmed`）/ 移除。
6. Soft Pad / tray 若可测：应被拒（`wrong_owner`）。
7. 截图或操作记录留下。

**B Git（同一构建）**
1. staged / unstaged 分开选、不混算。
2. 非 Git 项目：Diff 禁用 + 引导选文件。
3. 二进制 / 删除 / 重命名 有明确状态。
4. 超大 patch 截断 + 预算说明。
5. 无 Git 时降级为读选定文件。

**C 远程**
- 只有你明确允许提供商 + 费用时才做：材料 → 整理 → `organizedDraft` → 编辑 → 发送（失败可直发）。否则继续 skipped。

**Release 门禁**
- A + B 全 pass（C 可跳过）→ 才把 `local desktop` / `release acceptance` 改成 passed。
- H3（NSIS 打包后 dialog+Git 子进程）当前为 debug exe，未验。

---

## 六、状态回填约束（再次强调）

- ✅ 可回填：**automated verification** 层（本次复验再确认 7 项全绿）。
- ⛔ 不可回填：**local desktop (A)** / **Git (B)** / **remote organize (C)** / **release acceptance** —— 这些依赖人工真机证据；自动化结果**不构成**将这些面板「pending」翻成「passed」的依据。
- C 在未授权前永久保持 `skipped`，任何人不得写 passed。
