# foundation: add tray-first background runtime mode

你在 `C:\Users\Administrator\Desktop\voice-pilot` 仓库中工作。目标是实现 onetone 的 "Quicker 式后台底座 phase 1"：托盘常驻、主窗口可按需隐藏、UI 恢复后能主动拉取后端状态。不要做 Windows Service，不要拆双进程，不要做动作系统/AI 系统。

当前项目已经是 Tauri 2 + Rust + 普通 script 前端。**注意：前端不是 ESM/bundler，不要写 `import '@tauri-apps/api/window'` 这类代码。**

## 总原则

1. 小步改动，优先保持现有行为不退化。
2. 后台启动只做 phase 1，不强行把语音引擎从 JS 迁到 Rust。
3. 主窗口可以隐藏，但托盘、热键、runtime loop 继续工作。
4. 老用户升级必须安全：新增字段缺失时默认显示主窗口，不要让老用户突然以为软件没启动。
5. 不要引入新依赖。
6. 不做大 UI 改版。
7. **不要复制 push_runtime 里的字段计算逻辑**。如果需要 runtime 状态字段，先调用 `push_runtime` 把 payload 拿到，再合并进 snapshot；不要重新实现一份。

---

## 一、配置字段：启动时最小化到托盘

文件：`src-tauri/src/config.rs`

在 `VoiceConfig` 增加字段：

```rust
#[serde(default = "default_false", rename = "startMinimizedToTray")]
pub start_minimized_to_tray: bool,

fn default_false() -> bool { false }
```

**必须是 `default_false`，不要用 `default_true`**。原因：老用户升级时配置文件没有该字段，`default_true` 会导致已有配置用户升级后突然隐藏启动，像软件没打开。

新增 helper：

```rust
pub fn should_show_main_on_startup(cfg: &VoiceConfig) -> bool {
    !cfg.start_minimized_to_tray
}
```

**本阶段不要引入 `has_usable_config` / `config_file_exists` 到启动可见性判断**，避免把 onboarding/config completeness 复杂度混进 phase 1。字段缺失或 false = 显示；用户显式 true = 托盘启动。

如果保存配置 payload 会覆盖该字段，确保保存时保留 `existing.start_minimized_to_tray`，或让前端 `buildSavePayload` 带上 `startMinimizedToTray`。优先最小改动，避免保存后字段丢失。

---

## 二、补配置测试

在 `config.rs` 的 `#[cfg(test)] mod tests` 中加入至少两条测试。**用 `serde_json`，不要用 toml**：

```rust
#[test]
fn start_minimized_to_tray_missing_field_means_show() {
    // 模拟老用户升级：version/mappings/trash 都在，但没有 startMinimizedToTray
    let cfg: VoiceConfig = serde_json::from_str(
        r#"{"version":5,"mappings":[],"trash":[]}"#
    ).unwrap();
    assert!(!cfg.start_minimized_to_tray);
    assert!(should_show_main_on_startup(&cfg));
}

#[test]
fn start_minimized_to_tray_explicit_true_means_hide() {
    let cfg: VoiceConfig = serde_json::from_str(
        r#"{"startMinimizedToTray":true}"#
    ).unwrap();
    assert!(!should_show_main_on_startup(&cfg));
}
```

第一条是 **PR 的核心安全网**。`default = true` 一旦溜进来，这条立即失败。

---

## 三、启动策略

文件：`src-tauri/src/lib.rs`

在 setup 中，**tray 初始化完成之后**，根据 `should_show_main_on_startup` 决定是否隐藏 main window：

```rust
let cfg = app_state.cfg.lock().unwrap().clone();
if should_show_main_on_startup(&cfg) {
    app_log::log_line(&app_state, "startup", "startup policy: show main window");
} else if let Some(window) = app.get_webview_window("main") {
    let _ = window.hide();
    app_log::log_line(&app_state, "startup", "startup policy: hide main window (tray-first)");
}
```

注意：

- **托盘必须先 setup，再 hide 主窗口**。
- 不要 `unwrap` main window；用 `if let Some(window) = ...`。
- 当前隐藏的 main WebView 可以继续作为兼容 bootstrap，前端 JS 仍可运行。**不要把语音引擎启动从 JS 强迁到 Rust**。
- 保留现有 close requested -> hide 行为。

单实例回调中显示并聚焦 main window，补日志 `"single instance show main window"`。

---

## 四、安全 emit

当前已有模块化结构：

- `src-tauri/src/ipc/core/emit.rs`
- `src-tauri/src/ipc/core/runtime.rs`
- `src-tauri/src/ipc/commands/runtime/init.rs`

**在现有文件上修改，不要再创建并行的 IPC 子目录**。

在 `core/emit.rs` 中保证有：

```rust
pub fn get_main_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("main")  // 不 unwrap
}

pub fn emit_to_main_if_available(
    app: &tauri::AppHandle,
    state: Option<&crate::state::AppState>,
    event_type: &str,
    payload: serde_json::Value,
) -> bool {
    match get_main_window(app) {
        Some(w) if w.is_visible().unwrap_or(false) => {
            let _ = w.emit(event_type, payload);
            true
        }
        Some(_) => {
            log_emit_skip(state, event_type, "main hidden");
            false
        }
        None => {
            log_emit_skip(state, event_type, "main unavailable");
            false
        }
    }
}

fn log_emit_skip(state: Option<&crate::state::AppState>, event: &str, reason: &str) {
    let msg = format!("emit skipped because {}: {}", reason, event);
    match state {
        Some(s) => app_log::log_line(s, "emit", &msg),
        None    => app_log::early_line("emit", &msg),
    }
}
```

行为：

- main window 不存在或 emit 失败时，不 panic。
- 写日志 `"emit skipped because main hidden"` 或 `"emit skipped because main unavailable"`。
- **避免高频循环刷日志**，必要时在循环调用点外层节流（runtime loop 已经每秒数十次，不要每 tick 都打）。

保留现有 `emit_to_js_main(window, payload)`，用于 command 中 window 明确存在的旧路径（如 `cmd_ready`、mapping edit 等）。

---

## 五、cmd_request_runtime 返回 snapshot

文件：`src-tauri/src/ipc/core/runtime.rs` 和 `src-tauri/src/ipc/commands/runtime/init.rs`

新增 `build_runtime_snapshot`：

```rust
pub fn build_runtime_snapshot(
    app: &tauri::AppHandle,
    state: &crate::state::AppState,
) -> serde_json::Value {
    // 安全约束：不要重新实现 push_runtime 里的字段计算。
    // 先看一下 push_runtime 当前的实现，按它的算法取值。
    serde_json::json!({
        "type": "mvp_runtime_snapshot",
        // 下面这些字段值都必须从 state 取（或调已有 helper），
        // 不要写死成 "runtime_refresh" 或 "..."。
        "bindings":      state.bindings_string(),  // 或类似现有 helper
        "lastAction":    state.last_action(),
        "lastMappingId": state.last_mapping_id(),
        "mappingCount":  state.mapping_count(),
        "enabledCount":  state.enabled_count(),
        "timerActive":   state.timer_active(),
        "paused":        state.is_paused(),

        "update":    crate::update::snapshot(state).ok(),          // try; 不存在则 null
        "voiceSapi": voice_sapi_status(state),                    // 已有函数
        "voiceVosk": voice_vosk_status(app, state),               // 需 app.path().resource_dir().ok()
        "voiceEnd":  voice_end_status(state),                     // 已有函数

        "logs": state.log_ring_recent(50)                         // 复用 log_ring
    })
}
```

注意：

- **`lastAction` 不要写死成 `"runtime_refresh"`**。`"runtime_refresh"` 是事件名（emit 时用），不是 lastAction 的值。lastAction 必须来自 state。
- `log_ring` 已存在于 AppState，不需要新增 feature。
- `voice_sapi_status` / `voice_end_status` 不需要 `resource_dir`。
- `voice_vosk_status` 需要 `app.path().resource_dir().ok()`，参考 `cmd_voice_vosk_status` / `app_resource_dir` 现有实现。
- 如果某些 status 函数 phase 1 还没抽出来，可以返回 `null` + `// TODO(phase2)`，**不要造数据**。
- **复用已有 runtime 字段计算逻辑**，不要复制出两套算法。

把 `cmd_request_runtime` 改成返回 `serde_json::Value`：

```rust
#[tauri::command]
pub fn cmd_request_runtime(
    app: tauri::AppHandle,
    state: tauri::State<std::sync::Arc<crate::state::AppState>>,
    window: tauri::WebviewWindow,
) -> serde_json::Value {
    let snapshot = build_runtime_snapshot(&app, &state);
    // 保留旧 push，兼容现有前端 to_js 消息路径；
    // 返回值供窗口恢复/诊断直接消费。
    push_runtime(&state, &window, "runtime_refresh", "");
    snapshot
}
```

如果项目现有 Tauri 约定对参数顺序有要求，按现有风格调整，但必须通过 `cargo check`。

---

## 六、前端处理 mvp_runtime_snapshot

文件：`src/js/core/webview-bus.js`

增加对 `msg.type === 'mvp_runtime_snapshot'` 的处理，**至少复用现有 `mvp_runtime` 的状态更新逻辑**：

- `runtime.lastAction`
- `runtime.timerActive`
- `runtime.paused`
- 必要时 `scheduleRuntimeRender()`
- 如果有 `msg.update`，可以同步 `state.update`
- 如果有 `logs`，可以先存到 debug state 或忽略，但不要报错

不要做大 UI 改版。

---

## 七、窗口恢复后主动拉取状态

**前端是普通 script，不要写 `import`**。

在合适文件中加最小逻辑，推荐 `src/js/core/app-boot.js` 或已有 bootstrap 文件。先 grep 一下：

```bash
grep -rn "OneToneIpc.invoke" src/js/core/
grep -rn "__vp_dispatch_to_js__" src/js/
```

确认现有 invoke 风格和 dispatch 函数名再接入。

推荐代码形态：

```js
(function(global){
  var lastRuntimeRefreshAt = 0;
  window.addEventListener('focus', function(){
    var now = Date.now();
    if(now - lastRuntimeRefreshAt < 800) return;  // 节流
    lastRuntimeRefreshAt = now;
    if(!global.OneToneIpc || !global.OneToneIpc.invoke) return;
    global.OneToneIpc.invoke('cmd_request_runtime', {}).then(function(snapshot){
      if(snapshot && snapshot.type === 'mvp_runtime_snapshot'){
        // 通过 webview-bus 同一条消息路径分发
        if(global.__vp_dispatch_to_js__){
          global.__vp_dispatch_to_js__(snapshot);
        } else if(window.chrome && window.chrome.webview){
          // 兜底：直接派发 message 事件
          window.chrome.webview.postMessage(snapshot);
        }
      }
    }).catch(function(err){
      console.error('request runtime on focus', err);
    });
  });
})(window);
```

如果 `app-boot.js` 已有初始化结构，按现有风格接入，不要重复 IIFE 导致全局混乱。

---

## 八、托盘行为和日志

文件：`src-tauri/src/tray.rs`

确认并保持：

- 左键显示主窗口
- 右键显示托盘菜单
- 菜单"退出"走 `graceful_exit`
- 关闭主窗口只 hide，不退出

补日志：

- `show_main_window` 成功时 `"main window shown"`
- close requested hide 时 `"main window hidden"`
- 单实例显示时 `"single instance show main window"`

如果 `handle_tray_action` 目前依赖 main window 可见，**尽量改到不依赖可见性**；但不要在 phase 1 大范围重构 listen/scheme 函数签名。**保持功能不退化优先**。

---

## 九、明确不做

- Windows Service
- 双进程
- 动作系统
- AI 意图解析
- 前端大改版
- 新依赖
- 把语音引擎启动从 JS 强迁 Rust
- 再新建一套并行 IPC 目录结构
- 重新实现 push_runtime 里的字段计算逻辑

---

## 十、验证

完成后运行：

```bash
cd src-tauri
cargo fmt
cargo test
cargo check
```

如果 `cargo check` / `cargo test` 失败，**修到通过**。若失败是环境缺依赖，说明具体错误，不要继续往下做。

### 手动验证清单（写在最终回复里）

1. 老配置缺失 `startMinimizedToTray` 时，启动仍显示主窗口。
2. 显式 `startMinimizedToTray=true` 时，启动后托盘常驻且主窗口隐藏。
3. 点击关闭按钮后，进程仍在托盘。
4. 托盘左键能重新打开主窗口。
5. 再次启动 exe 不双开，而是唤起主窗口。
6. 窗口重新获得焦点后 `cmd_request_runtime` 返回 snapshot，前端无 console 报错。