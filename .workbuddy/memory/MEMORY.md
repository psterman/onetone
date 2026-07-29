# MEMORY.md — onetone (一声) voice-pilot 项目

## 项目身份
- onetone / 一声：硬件启动键 → 语音输入法快捷键的映射工具，Tauri 2 + Rust 桌面应用。
- 工作区：C:\Users\Administrator\Desktop\voice-pilot

## 前端架构（关键事实）
- 主路径仍是零构建 vanilla JS（`src` = frontendDist）；React Islands 经 Vite 打到 `src/assets/islands/main.js`，由 `index.html` 末尾 module 加载。
- `src/js/`：约 183 文件 / ~87k 行；170+ `<script src>` 顺序加载。
- 状态：`window.OneToneState`（state/ui/runtime），手动重渲染。
- 权威契约：`docs/migration-react-islands.md`（**勿**再参考已删除的 `src-react/` / `MIGRATION_GUIDE.md` / `package-v2.json`）。

## React Islands 完成度裁定（2026-07-29 锁定）
- **工程骨架 + 第一批岛完成**，可继续演进；**最痛区域未全部迁完**；产品验收待 §8.5。
- 完成：旧页面继续跑、岛挂 DOM、React/TS/Vite/Tailwind、runtime、typed IPC、Basic 岛、Toast 单轨桥接。
- 部分：Voice（文本短语+策略；声学 legacy）、Mapping **仅列表** keyed diff（编辑器未迁）、Confirm（React 可用，legacy 弹层未全换）。
- **未完成**：Command 真实接管 `#wbCommandSearch`、完整 Mapping Editor、正式 shadcn/Radix、Tauri 人工验收。
- Toast：`OneToneUi.toast` → legacy `OneToneAppToast`；不 `pushToast`。
- shadcn：`components/ui/*` 为零依赖 API 壳，**不是**官方 Radix/shadcn。
- 下一步：§8.5 人工清单 → 再单独开 P9（Command 或完整 Mapping Editor）。不打磨伪 shadcn。

## 近期修复 / 已知债
- islands boot：`vite.config.ts` `define process.env.NODE_ENV=production`（修 webview `process is not defined`；bundle ~260KB）。**最新 boot 日志已无该错误**。
- 语音 hero：`#voiceConfigIsland` 必须在 `#voiceDeskPanel` 内，勿作 `voice-page-body` 网格子项。
- 假死观察：历史 `switchListeningStrategy` → `vosk stop_sync begin` 无 `end`（Rust A）；本次省电事件有完整 `ok`（假死 B）→ FE 延后 islands refresh + 岛策略走 legacy 单路径。
- §8.5：项 6 ✅；项 1–5 待人工；假死分类见契约 8.5.1。

## 构建/环境坑（可复用）
- 沙箱内 `npm install` 写 lockfile 可能挂起；可用已有 node_modules 直接 `vite build`。
- `vite.config.ts`：`build.emptyOutDir: false`；必须 `define process.env.NODE_ENV`。
- EPERM 覆盖 `main.js`：删 `src/assets/islands` 再 build。
