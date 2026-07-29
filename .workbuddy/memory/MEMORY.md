# MEMORY.md — onetone (一声) voice-pilot 项目

## 项目身份
- onetone / 一声：硬件启动键 → 语音输入法快捷键的映射工具，Tauri 2 + Rust 桌面应用。
- 工作区：C:\Users\Administrator\Desktop\voice-pilot

## 前端架构（关键事实）
- 主路径仍是零构建 vanilla JS（`src` = frontendDist）；React Islands 经 Vite 打到 `src/assets/islands/main.js`，由 `index.html` 末尾 module 加载。
- `src/js/`：约 183 文件 / ~87k 行；170+ `<script src>` 顺序加载。
- 状态：`window.OneToneState`（state/ui/runtime），手动重渲染。
- 权威契约：`docs/migration-react-islands.md`（**勿**再参考已删除的 `src-react/` / `MIGRATION_GUIDE.md` / `package-v2.json`）。

## React Islands 进度（2026-07-29 债收口后）
- **P0–P8 工程轨静态通过**；产品验收待 `tauri dev` §8.5 人工清单。
- **P4 口径**：能力就绪 + Toast 单轨桥接，**不是**全局切流。
  - Toast：**legacy `OneToneAppToast` 主路径**；`OneToneUi.toast(string|opts)` **反向代理** legacy；不 `pushToast`（二次切流前禁止并行）。
  - Command：React 岛为脚手架，**未接管** `#wbCommandSearch`（仍 `home-workbench-cmdk.js`）。
  - Confirm：可走 React `OneToneUi.confirm`。
- 业务岛：Basic（`#settingsPanelBasic`）、Voice（`#voiceConfigIsland`）、Mapping list keyed diff（`#mappingList`）。
- 护栏：`isInsideIsland`（含 home-workbench data-i18n sweep）、legacy `isMounted` 守卫、`applyMvpInit` → `OneToneIslandsRefresh`。
- 测试：`npm run test:islands`（含 `test-toast-bridge.mjs`）。

## 构建/环境坑（可复用）
- 沙箱内 `npm install` 写 lockfile 可能挂起；可用已有 node_modules 直接 `vite build`。
- `vite.config.ts`：`build.emptyOutDir: false`（清空目录会调安全删除挂起）。
- EPERM 覆盖 `main.js`：删 `src/assets/islands` 再 build。
