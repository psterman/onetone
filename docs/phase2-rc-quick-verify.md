# Phase2 RC 快速验证操作说明

> 目标：用最短路径得出「能不能发」的结论。
> 铁律：**自动化只证明逻辑/IPC/路径安全；原生对话框、主窗口 UI、真机截图、真实远程必须人手点。自动化绿 ≠ 面板 passed。**

---

## 一、自动跑一遍（约 30 秒，照抄）

仓库根目录执行 6 个 FE 测试，再进 `src-tauri` 跑 Rust 单测：

```bash
cd E:/voice-pilot
npm run test:home-assist-ipc-contract && \
npm run test:home-assist-ownership && \
npm run test:home-assist-ui-checklist && \
npm run test:home-project-context && \
npm run test:home-prompt-prep && \
npm run test:home-agent-v2

cd src-tauri
cargo test --lib project_context --no-default-features
```

判定：
- 6 个 `npm` 全部打印 `ok`、退出码 0 → FE 逻辑/IPC 绿。
- `cargo` 打印 `11 passed; 0 failed` → 路径安全 + Git 逻辑层绿。
- **这层只能回填 `automated verification`，不代表 A/B/C/release 通过。**

---

## 二、人手点最短路径（约 10–15 分钟，拿证据）

**前置**
1. 启动 `src-tauri/target/debug/onetone.exe`（主窗口）。
2. DevTools：`localStorage.setItem('onetone.projectContext.enabled','1')` → 刷新。
3. `Ctrl+Shift+A` 打开验收雷达对照勾选。

**A 本地闭环（同一构建）**
1. 不开 flag 时确认**没有**「添加工程材料」→ 开 flag 后出现。
2. 打开入口 → 原生目录选择器选一个小仓库。
3. 读 README / 某文件片段 → 未 adopt 前**不**进发送正文。
4. adopt → 看到来源/行号/预算 → 无 key 也能直接发送。
5. 改那个文件 → 出现 stale → 试「刷新 / 继续旧版 / 移除」。
6. 截图或留操作记录。

**B Git（同一构建）**
1. 在一个 git 仓库里：staged 与 unstaged 分开选、不混算。
2. 非 Git 文件夹：Diff 禁用 + 引导文案出现。
3. 制造一个二进制 / 删除 / 重命名，状态展示明确。
4. （可选）超大 patch 是否被截断 + 预算说明。

**C 远程**
- 你**未明确授权**提供商+费用 → 直接保持 `skipped`，什么都不用做。
- 授权后才走：材料 → 整理 → 编辑 → 发送（失败可直发）。

---

## 三、判定口径（别被骗）

| 看到的现象 | 能下什么结论 | 不能下什么结论 |
| --- | --- | --- |
| 7 项自动化全绿 | 逻辑/IPC/路径安全对 | A/B/C 真机通过 |
| `ui-checklist` 打印 `simulated steps 1–8` | 模拟层通过 | 真机八步点过 |
| `staged_and_unstaged_separate` ok | Git 逻辑对 | 桌面 Git UI 点通 |
| 主窗口手动 A1–A10 全过 + 截图 | **local desktop 可标 passed** | — |
| 主窗口手动 B1–B7 全过 | **Git 可标 passed** | — |
| A+B 全过 | **release acceptance 可标 passed**（C 可跳过） | — |

> 谁把「没有人工证据」的 A/B/C/release 标成 passed，就是假通过。
