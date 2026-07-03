# Phase 1 Final Plan: Tray-First Background Runtime Mode

> Commit title: `foundation: add tray-first background runtime mode`
> Branch: `feature/tray-first-phase1`
> Author goal: OneTone 从 Tauri 桌面应用 → Quicker 式后台底座 + 可选 GUI。
> Phase 1 只做"主窗口可隐藏 + runtime 可查 + 托盘可控 + 现有功能不退化"。

---

## 0. 范围 (Scope)

### In scope (phase 1)

1. 启动策略字段 `start_minimized_to_tray` + helper
2. Safe emit wrapper (`get_main_window`, `emit_to_main_if_available`)
3. 主窗口关闭 = hide；托盘 quit 走 `graceful_exit`
4. 单实例唤起主窗口
5. `handle_tray_action` 不依赖 main 可见（listen_toggle / scheme / mode 直读 AppState）
6. config watcher 持有 `AppHandle`，emit 走 safe wrapper
7. `cmd_request_runtime` 返回 snapshot（最小字段集）
8. 日志补齐：启动策略 / 托盘 / 单实例 / emit 失败 / 窗口显隐
9. 3 条 unit test 锚定配置解析（含"缺失字段 = 显示"回归保护）

### Out of scope (phase 2+)

- 语音引擎从 JS 迁 Rust（语音生命周期）
- UI 恢复时主动拉取状态（前端 trigger）
- 全量 emit 调用点重写
- `log_ring` 实现（若有则复用，若无则降级为 `[]`）
- 双进程 / Windows Service / 动作系统 / AI 系统 / 品牌 / UI 大改

---

## 1. 文件改动一览（路径已 grep 验证）

| 文件 | 改动 |
|---|---|
| `src-tauri/src/config.rs` | 新字段 `start_minimized_to_tray`，helper `should_show_main_on_startup`，`start_watcher` 签名加 `AppHandle` |
| `src-tauri/src/lib.rs` | setup 末尾判断 hide/show；`push_mvp_init` 用 safe emit；单实例回调加日志 |
| `src-tauri/src/ipc/core/emit.rs` | 新增 `get_main_window`, `emit_to_main_if_available(_t)` |
| `src-tauri/src/ipc/core/runtime.rs` | 新增 `build_runtime_snapshot` |
| `src-tauri/src/ipc/commands/runtime/init.rs` | `cmd_request_runtime` 返回 `serde_json::Value` |
| `src-tauri/src/ipc/listen.rs` | `pause_listen` / `resume_listen` 接受 `AppHandle`，emit 走 safe wrapper |
| `src-tauri/src/tray.rs` | `handle_tray_action` 不依赖 main 可见；listen_toggle / scheme / mode 直读 AppState |
| `src/js/core/webview-bus.js` | 增加 `mvp_runtime_snapshot` 分支（**先做 §6 通道验证再 wire**） |

**不创建新目录、不迁移现有文件**。所有改动落在已有扁平 / 已有 `ipc/core/` 与 `ipc/commands/runtime/` 文件内。

---

## 2. 配置字段（防升级恐慌的核心）

### 2.1 字段定义

```rust
// src-tauri/src/config.rs (VoiceConfig)
#[serde(default = "default_false", rename = "startMinimizedToTray")]
pub start_minimized_to_tray: bool,

fn default_false() -> bool { false }
```

### 2.2 行为矩阵

| 用户场景 | config 文件 | 字段值 | `should_show_main_on_startup` 返回 | 行为 |
|---|---|---|---|---|
| 全新用户 | 不存在 | — | `true` | 显示 ✓ |
| 全新用户默认 | 存在 | `false` (default) | `true` | 显示 ✓ |
| **老用户升级** | **存在** | **缺失** | **`true` (default_false 兜底)** | **显示 ✓** |
| 用户主动勾 | 存在 | `true` | `false` | 隐藏 ✓ |

### 2.3 helper

```rust
pub fn should_show_main_on_startup(cfg: &VoiceConfig) -> bool {
    // 单一规则：字段为 false 或缺失 → 显示
    // phase 1 不做 "config completeness" 判定，留给 phase 2 + onboarding 流程
    !cfg.start_minimized_to_tray
}
```

**`default = false` 是这版的硬性约束**，写进 PR description。任何"为了简化改 default=true"的尝试都要拒掉。

---

## 3. Safe Emit Wrapper

新增到 `src-tauri/src/ipc/core/emit.rs`：

```rust
pub fn get_main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")  // 不 unwrap
}

pub fn emit_to_main_if_available(
    app: &AppHandle,
    state: Option<&AppState>,
    event_type: &str,
    payload: serde_json::Value,
) -> bool {
    match get_main_window(app) {
        Some(w) if w.is_visible().unwrap_or(false) => {
            let _ = w.emit(event_type, payload);
            true
        }
        Some(w) => {
            // 窗口存在但被 hide → emit 会丢失，代码不 panic，记日志
            log_skip(state, "main hidden", event_type);
            false
        }
        None => {
            log_skip(state, "main unavailable", event_type);
            false
        }
    }
}

pub fn emit_to_main_if_available_t<T: Serialize + Send + 'static>(
    app: &AppHandle,
    state: Option<&AppState>,
    event_type: &str,
    payload: T,
) -> bool {
    match get_main_window(app) {
        Some(w) if w.is_visible().unwrap_or(false) => {
            let _ = w.emit(event_type, payload);
            true
        }
        Some(_) => { log_skip(state, "main hidden", event_type); false }
        None     => { log_skip(state, "main unavailable", event_type); false }
    }
}

fn log_skip(state: Option<&AppState>, reason: &str, event_type: &str) {
    let msg = format!("emit skipped ({}): {}", reason, event_type);
    match state {
        Some(s) => app_log::log_line(s, "emit", &msg),
        None    => app_log::early_line("emit", &msg),
    }
}
```

`emit_to_js_main` / `emit_to_js_main_t` **保留**，继续供"窗口必然存在"的 IPC 命令路径（如 `cmd_ready`、mapping edit 等确认有 window 的命令）。

---

## 4. lib.rs setup 改动

### 4.1 启动决策（tray::setup 之后追加）

```rust
// 已有顺序：AppState → config watcher → hotkey → tray → runtime loop → push_mvp_init
// 末尾追加 visibility 决策：
let cfg = app_state.cfg.lock().unwrap().clone();
if should_show_main_on_startup(&cfg) {
    app_log::log_line(&app_state, "startup", "startup policy: show main window");
} else if let Some(w) = get_main_window(&app.handle()) {
    let _ = w.hide();
    app_log::log_line(&app_state, "startup", "startup policy: hide main window (tray-first)");
}
```

### 4.2 单实例回调加日志

```rust
// 现有代码附近（lib.rs ~L179）
.on_single_instance(|app, _argv, _cwd| {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        app_log::log_line(app.state(), "single-instance", "single instance show");
    }
})
```

### 4.3 push_mvp_init 走 safe emit

把现有 `emit_to_js_main(&window, payload)` 改成 `emit_to_main_if_available(&app.handle(), Some(&state), "to_js", payload)`。`AppHandle` 已在 setup 闭包里可取。

### 4.4 启动顺序（已满足，文档化）

1. AppState load + `app.manage(state)`
2. config watcher（持有 AppHandle，emit 走 safe wrapper）
3. hotkey bind_all
4. tray setup
5. runtime loop spawn（40ms tick，window 不可用时 skip emit 分支）
6. **新增**：visibility 决策（hide 或 show）
7. push_mvp_init（async @400ms，safe emit）

**Hidden WebView 仍加载 JS**，`scheduleDeferredVoiceEngineBoot` 仍会在 ~10s 后由前端触发语音引擎。本阶段**接受这个兼容层状态**，不强行把语音启动搬到 Rust。语音生命周期迁移是 phase 2。

---

## 5. cmd_request_runtime 返回值

### 5.1 新签名

```rust
// src-tauri/src/ipc/commands/runtime/init.rs
pub fn cmd_request_runtime(
    app: AppHandle,
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
) -> serde_json::Value {
    let snapshot = build_runtime_snapshot(&app, &state);
    // 保留 push 以兼容多 webview listen 场景（详见 §6）
    push_runtime(&state, &window, "runtime_refresh", "");
    snapshot
}
```

### 5.2 build_runtime_snapshot

新增到 `src-tauri/src/ipc/core/runtime.rs`：

```rust
pub fn build_runtime_snapshot(app: &AppHandle, state: &AppState) -> serde_json::Value {
    json!({
        "type": "mvp_runtime_snapshot",
        "bindings":       state.bindings_summary(),    // 复用现有
        "lastAction":     state.last_action(),
        "lastMappingId":  state.last_mapping_id(),
        "mappingCount":   state.mapping_count(),
        "enabledCount":   state.enabled_count(),
        "timerActive":    state.timer_active(),
        "paused":         state.is_paused(),

        // 不确定项：返回 null + TODO，phase 2 再补全
        "update":    null,   // TODO(phase2): crate::update::snapshot(state)
        "voiceSapi": null,   // TODO(phase2): voice_sapi_status(state)
        "voiceVosk": null,   // TODO(phase2): voice_vosk_status - 需确认是否依赖 resource_dir
        "voiceEnd":  null,   // TODO(phase2): voice_end_status

        "logs": state.log_ring_recent(50)   // 复用已有; 若无则返回 []
    })
}
```

**原则**：不要为了完整性造数据。没实现的字段返回 `null` + TODO 注释，比返回假数据安全 100 倍。

---

## 6. 前端 IPC 通道验证（改动前必做）

### 6.1 现状（已 grep 验证）

- 后端 `emit_to_js_main` 用 `window.emit("to_js", payload)` → Tauri emit API
- 前端 `webview-bus.js` L9 用 `window.chrome?.webview?.addEventListener('message', ...)` → WebView2 原生 API

### 6.2 两种可能

1. **Tauri 2 + WebView2 自动桥接**：`emit("to_js", ...)` 自动作为 `chrome.webview.message` 投递 → 直接在 webview-bus.js 加 `mvp_runtime_snapshot` 分支即可
2. **两条链路分离**：需要在前端加 `__TAURI__.event.listen("to_js", handler)` 收 snapshot

### 6.3 验证方法

```bash
# dev 模式启动
cd src-tauri
cargo tauri dev

# 在前端 console 临时插入探针（dev only）：
window.__TAURI__.event.listen('to_js', e => console.log('TAURI listen:', e));
window.chrome?.webview?.addEventListener?.('message', e => console.log('chrome listen:', e.data?.type));

# 调用 cmd_request_runtime，看哪边收到 mvp_runtime_snapshot
await window.__TAURI_INTERNALS__.invoke('cmd_request_runtime');
```

### 6.4 决策

| 验证结果 | 处理 |
|---|---|
| chrome.listen 收到 | 在 `webview-bus.js` 加 `mvp_runtime_snapshot` 分支 |
| TAURI.listen 收到 | 在 `app-boot.js` 加 `__TAURI__.event.listen` 监听 + applyRuntimeSnapshot |
| 两边都收到 | 任选一条；推荐 webview-bus.js 一致性 |
| 都没收到 | **停下来排查**，不要硬写 |

---

## 7. Unit Tests (config.rs)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// 核心回归保护：缺字段时 default=false → 老用户升级安全
    #[test]
    fn start_minimized_to_tray_missing_field_means_show() {
        let toml = r#"
            [some_other_section]
            foo = "bar"
        "#;
        let cfg: VoiceConfig = toml::from_str(toml).unwrap();
        assert_eq!(cfg.start_minimized_to_tray, false);
        assert!(should_show_main_on_startup(&cfg));
    }

    #[test]
    fn start_minimized_to_tray_explicit_false_means_show() {
        let toml = r#"start_minimized_to_tray = false"#;
        let cfg: VoiceConfig = toml::from_str(toml).unwrap();
        assert!(should_show_main_on_startup(&cfg));
    }

    #[test]
    fn start_minimized_to_tray_explicit_true_means_hide() {
        let toml = r#"start_minimized_to_tray = true"#;
        let cfg: VoiceConfig = toml::from_str(toml).unwrap();
        assert!(!should_show_main_on_startup(&cfg));
    }
}
```

**第 1 条是整个 PR 的安全网**。`default = true` 一旦溜进来，这条测试立即失败。

---

## 8. 日志清单

| 事件 | 日志 |
|---|---|
| 启动策略 | `startup policy: show main window` / `startup policy: hide main window (tray-first)` |
| 托盘 | `tray initialized`（已有，保持） |
| Runtime loop | `runtime loop started`（已有，保持） |
| 窗口显隐 | `main window hidden` / `main window shown` |
| 单实例 | `single instance show` |
| Emit 降级 | `emit skipped because main hidden/unavailable: <event>` |

---

## 9. 验证清单（手动）

1. 删除/保留 `config.toml`，启动时主窗口 show/hide 是否符合策略
2. 点击关闭 → 托盘仍在，进程未退出
3. 托盘左键 → 主窗口恢复并聚焦
4. 主窗口隐藏时托盘菜单暂停/恢复 → `AppState.paused` 变化，热键停止/恢复 dispatch
5. 再次启动 exe → 单实例唤起主窗口（不双开）
6. 打开主窗口后 `cmd_request_runtime` 返回 snapshot（含 `paused` / `mappingCount` / `logs`）

---

## 10. 自动化

```bash
cd src-tauri
cargo fmt
cargo test          # 至少 3 条配置测试通过
cargo check         # 编译覆盖
# cargo tauri build  # 可选，CI 已跑过，本地慢
```

---

## 11. Phase 2 预告（不在本 PR）

- 语音引擎从 JS 迁 Rust（语音生命周期）
- `log_ring` 全量实现（如果 phase 1 验证后确认缺失）
- UI 恢复时主动拉取状态（前端 `onFocusChanged` 监听 → `cmd_request_runtime`）
- snapshot 字段扩展（`update` / `voiceSapi` / `voiceVosk` / `voiceEnd`）
- `emit_to_main_if_available` 全量替换现有 `emit_to_js_main` 调用点
- IPC 架构是否进一步拆分

---

## 12. PR Description 关键约束（防 scope 蔓延）

> 1. **不创建新 IPC 子目录**，所有改动在现有 `ipc/core/` 与 `ipc/commands/runtime/` 文件内进行
> 2. **`start_minimized_to_tray` 默认 `false`**，保证老用户升级时不突然隐藏主窗口
> 3. **不强行把语音引擎从 JS 迁 Rust**，phase 1 接受 hidden WebView 兼容启动的状态
> 4. **不引入新依赖**，不修改 `package.json` / `Cargo.toml`
> 5. **不做 Windows Service、不拆双进程、不上动作系统**
> 6. **改动前端只限 `webview-bus.js` 一处加分支**，且先验证 IPC 通道（§6）
> 7. **snapshot 不确定字段返回 `null` + TODO**，不要造数据
> 8. **PR 通过的判据**：3 条 unit test 全过 + §9 手动验证清单全过

---

## 13. 预估工作量

| 项 | 行数 |
|---|---|
| config.rs 字段 + helper + 3 tests | ~80 |
| lib.rs 启动决策 + 单实例日志 + push_mvp_init 改 safe emit | ~30 |
| ipc/core/emit.rs safe emit helpers | ~60 |
| ipc/core/runtime.rs build_runtime_snapshot | ~40 |
| ipc/commands/runtime/init.rs 返回值改动 | ~10 |
| ipc/listen.rs AppHandle 化 | ~20 |
| tray.rs handle_tray_action 解耦 | ~40 |
| webview-bus.js snapshot 分支（含验证） | ~30 |
| **合计** | **~310 行 diff** |

工期：1.5 - 2 天。

---

## 14. 风险登记

| 风险 | 等级 | 缓解 |
|---|---|---|
| 老用户升级恐慌（主窗口不显示） | **High** | `default = false` + unit test §7.1 |
| IPC 通道接错（snapshot 收不到） | Medium | §6 验证在前，wire 在后 |
| Hidden WebView 仍跑语音 → 内存不降 | Low | Phase 1 接受，phase 2 解决 |
| `get_main_window` 返回 `Some` 但窗口实际 destroyed | Low | `is_visible()` check 已涵盖大部分场景 |
| 托盘 listen_toggle 在 hidden 状态下不响应 | Medium | `handle_tray_action` 不依赖 main + AppHandle 化 |

---

## 15. 相关文档

- 上一轮 review: 见对话历史（2026-07-03 session）
- 仓库 docs/ 已有：`COLD_START_TEST_v1.0.0.md` / `RELEASE_v1.0.0.md` / `RELEASE_NEXT.md`
- 此文档位置：`docs/PHASE1_FINAL_PLAN.md`