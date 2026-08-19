use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::thread;

macro_rules! w {
    ($s:expr) => {{
        let v: Vec<u16> = $s.encode_utf16().chain(std::iter::once(0)).collect();
        v.as_ptr()
    }};
}

use crate::config::{
    bindings_need_mouse_hook, is_volume_hotkey, SCHEME_CYCLE_MARKER, SCHEME_SELECT_PREFIX,
};
use crate::device_identity;
use crate::input_ext::InputExtensionBus;
use crate::input_obs::{InputDebugMeta, InputObsEvent};
use crate::key_chord::chord_to_register_hotkey;
use crate::press_gesture::{format_device_key, parse_physical_event, resolve_binding_in_list};
use crate::send_guard;
use crate::vendor_hid;
use winapi::shared::minwindef::{LPARAM, LRESULT, UINT, WPARAM};
use winapi::shared::ntdef::HANDLE;
use winapi::shared::windef::HWND;
use winapi::um::winuser::{
    self, CallNextHookEx, CallWindowProcW, CreateWindowExW, DefWindowProcW, DispatchMessageW,
    GetRawInputData, GetRawInputDeviceInfoW, MapVirtualKeyW, RegisterHotKey,
    RegisterRawInputDevices, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx,
    UnregisterHotKey, APPCOMMAND_BROWSER_BACKWARD, APPCOMMAND_BROWSER_FORWARD,
    APPCOMMAND_BROWSER_REFRESH, APPCOMMAND_LAUNCH_APP1, APPCOMMAND_LAUNCH_APP2,
    APPCOMMAND_LAUNCH_MAIL, APPCOMMAND_MEDIA_NEXTTRACK, APPCOMMAND_MEDIA_PLAY_PAUSE,
    APPCOMMAND_MEDIA_PREVIOUSTRACK, APPCOMMAND_MEDIA_STOP, APPCOMMAND_VOLUME_DOWN,
    APPCOMMAND_VOLUME_MUTE, APPCOMMAND_VOLUME_UP, CS_HREDRAW, CS_VREDRAW, GET_APPCOMMAND_LPARAM,
    GWLP_WNDPROC, KBDLLHOOKSTRUCT, MAPVK_VSC_TO_VK_EX, MOD_NOREPEAT, MSG, MSLLHOOKSTRUCT, RAWINPUT,
    RAWINPUTDEVICE, RIDEV_INPUTSINK, RIDI_DEVICENAME, RID_INPUT, RIM_TYPEHID, RIM_TYPEKEYBOARD,
    RI_KEY_BREAK, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_APPCOMMAND, WM_DESTROY, WM_HOTKEY, WM_INPUT,
    WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_RBUTTONDOWN, WM_SYSKEYDOWN,
    WM_SYSKEYUP, WM_XBUTTONDOWN, WM_XBUTTONUP, WNDCLASSEXW,
};

struct WndCtx {
    tx: mpsc::Sender<String>,
    names: HashMap<u32, String>,
    next_id: u32,
    scheme_switch_id: Option<u32>,
    scheme_select_ids: HashMap<u32, String>,
}

const SCHEME_SWITCH_HOTKEY_ID: u32 = 0x7FFF;
const SCHEME_SELECT_BASE_ID: u32 = 0x7000;

static RECORDING_SENDER: OnceLock<Mutex<Option<mpsc::Sender<String>>>> = OnceLock::new();
/// True for the whole StartRecording→StopRecording window, even when
/// `recording_sender` is momentarily cleared during hook transitions.
static RECORDING_SESSION: AtomicBool = AtomicBool::new(false);
static RECORDING_HOOK: OnceLock<Mutex<isize>> = OnceLock::new();
static RECORDING_MOUSE_HOOK: OnceLock<Mutex<isize>> = OnceLock::new();
static ACTIVE_BINDINGS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
static VERIFY_OVERLAY_BINDINGS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
static ACTIVE_SENDER: OnceLock<Mutex<Option<mpsc::Sender<String>>>> = OnceLock::new();
static FORWARD_HWND: OnceLock<Mutex<isize>> = OnceLock::new();
static FORWARD_PREV_WNDPROC: OnceLock<Mutex<isize>> = OnceLock::new();
static DEVICE_NAME_CACHE: OnceLock<Mutex<HashMap<isize, String>>> = OnceLock::new();
static INPUT_EXT_BUS: OnceLock<Mutex<InputExtensionBus>> = OnceLock::new();
static INPUT_OBS_SENDER: OnceLock<Mutex<Option<mpsc::Sender<InputObsEvent>>>> = OnceLock::new();
static PENDING_INPUT_DEBUG: OnceLock<Mutex<Option<InputDebugMeta>>> = OnceLock::new();

fn input_obs_sender() -> &'static Mutex<Option<mpsc::Sender<InputObsEvent>>> {
    INPUT_OBS_SENDER.get_or_init(|| Mutex::new(None))
}

fn pending_input_debug() -> &'static Mutex<Option<InputDebugMeta>> {
    PENDING_INPUT_DEBUG.get_or_init(|| Mutex::new(None))
}

pub fn take_pending_input_debug() -> Option<InputDebugMeta> {
    pending_input_debug().lock().unwrap().take()
}

fn set_pending_input_debug(meta: InputDebugMeta) {
    *pending_input_debug().lock().unwrap() = Some(meta);
}

fn emit_input_obs(
    kind: &'static str,
    key: &str,
    device: Option<&str>,
    report_hex: &str,
    reason: &str,
    source: &str,
) {
    let event = InputObsEvent {
        kind,
        key: key.to_string(),
        device: device.unwrap_or("").to_string(),
        report_hex: report_hex.to_string(),
        reason: reason.to_string(),
        source: source.to_string(),
    };
    if let Some(tx) = input_obs_sender().lock().unwrap().as_ref() {
        let _ = tx.send(event);
    }
}

fn is_extension_key(name: &str) -> bool {
    name.starts_with("Gamepad_") || name.starts_with("HID_")
}

fn device_cache() -> &'static Mutex<HashMap<isize, String>> {
    DEVICE_NAME_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn input_ext_bus() -> &'static Mutex<InputExtensionBus> {
    INPUT_EXT_BUS.get_or_init(|| Mutex::new(InputExtensionBus::with_defaults()))
}

fn forward_hwnd() -> &'static Mutex<isize> {
    FORWARD_HWND.get_or_init(|| Mutex::new(0))
}

fn forward_prev_wndproc() -> &'static Mutex<isize> {
    FORWARD_PREV_WNDPROC.get_or_init(|| Mutex::new(0))
}

/// Raw Input 设备：标准键盘 + Consumer Control + 鼠标（补充侧键等）。
const RAW_INPUT_DEVICES: &[(u16, u16)] = &[
    (0x01, 0x06), // Keyboard
    (0x0C, 0x01), // Consumer Control
    (0x01, 0x02), // Mouse
];

enum Cmd {
    BindAll(Vec<String>),
    BindModifierWatches(Vec<String>),
    BindSchemeSwitch(Option<String>),
    BindSchemeSelect(Vec<(String, String)>),
    SetVerifyOverlay(Vec<String>),
    StartRecording,
    StopRecording,
    AttachAppHwnd(isize),
    Shutdown,
}

fn recording_sender() -> &'static Mutex<Option<mpsc::Sender<String>>> {
    RECORDING_SENDER.get_or_init(|| Mutex::new(None))
}

/// Public clone of the currently-installed recording sender (or `None` if no
/// recording session is active). Used by the runtime loop to flush the
/// `PENDING_RECORDING_MOUSE` fallback buffer without re-acquiring the inner
/// static via the private helper.
pub fn recording_sender_clone() -> Option<mpsc::Sender<String>> {
    recording_sender().lock().unwrap().clone()
}

fn recording_hook() -> &'static Mutex<isize> {
    RECORDING_HOOK.get_or_init(|| Mutex::new(0))
}

fn recording_mouse_hook() -> &'static Mutex<isize> {
    RECORDING_MOUSE_HOOK.get_or_init(|| Mutex::new(0))
}

fn is_recording() -> bool {
    recording_sender().lock().unwrap().is_some()
}

fn active_bindings() -> &'static Mutex<Vec<String>> {
    ACTIVE_BINDINGS.get_or_init(|| Mutex::new(Vec::new()))
}

fn verify_overlay_bindings() -> &'static Mutex<Vec<String>> {
    VERIFY_OVERLAY_BINDINGS.get_or_init(|| Mutex::new(Vec::new()))
}

fn input_capture_needed() -> bool {
    !active_bindings().lock().unwrap().is_empty()
        || !verify_overlay_bindings().lock().unwrap().is_empty()
        || !modifier_watches().lock().unwrap().is_empty()
        || is_recording()
}

fn sync_input_capture_hooks(hwnd: winapi::shared::windef::HWND) {
    unsafe {
        if !input_capture_needed() {
            remove_keyboard_hook();
            return;
        }
        install_raw_input(hwnd);
        install_keyboard_hook();
    }
}

fn modifier_watches() -> &'static Mutex<Vec<String>> {
    static MODIFIER_WATCHES: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
    MODIFIER_WATCHES.get_or_init(|| Mutex::new(Vec::new()))
}

fn is_modifier_watch_key(name: &str) -> bool {
    let watches = modifier_watches().lock().unwrap();
    if watches.is_empty() {
        return false;
    }
    let chord = crate::key_chord::build_pressed_chord(name);
    watches
        .iter()
        .any(|w| crate::key_chord::chords_equivalent(w, &chord) || crate::key_chord::chords_equivalent(w, name))
}

fn active_sender() -> &'static Mutex<Option<mpsc::Sender<String>>> {
    ACTIVE_SENDER.get_or_init(|| Mutex::new(None))
}

fn key_to_vk(name: &str) -> Option<UINT> {
    if let Some(rest) = name.strip_prefix("VK_") {
        if let Ok(vk) = u16::from_str_radix(rest, 16) {
            return Some(vk as UINT);
        }
    }
    if name.contains('+') {
        return None;
    }
    match name {
        "Volume_Up" => Some(0xAF),
        "Volume_Down" => Some(0xAE),
        "Volume_Mute" => Some(0xAD),
        "LShift" => Some(0xA0),
        "RShift" => Some(0xA1),
        "LCtrl" => Some(0xA2),
        "RCtrl" => Some(0xA3),
        "LAlt" => Some(0xA4),
        "RAlt" => Some(0xA5),
        "LWin" => Some(0x5B),
        "RWin" => Some(0x5C),
        "Media_Next" => Some(0xB0),
        "Media_Prev" => Some(0xB1),
        "Media_Play_Pause" => Some(0xB3),
        "Media_Stop" => Some(0xB2),
        "RControl" => Some(0xA3),
        "AppsKey" => Some(0x5D),
        "Browser_Back" => Some(0xA6),
        "Browser_Forward" => Some(0xA7),
        "Browser_Refresh" => Some(0xA8),
        "Launch_Mail" => Some(0xB4),
        "Launch_App1" => Some(0xB6),
        "Launch_App2" => Some(0xB7),
        "F13" => Some(0x7C),
        "F14" => Some(0x7D),
        "F15" => Some(0x7E),
        "F16" => Some(0x7F),
        "F17" => Some(0x80),
        "F18" => Some(0x81),
        "F19" => Some(0x82),
        "F20" => Some(0x83),
        "F21" => Some(0x84),
        "F22" => Some(0x85),
        "F23" => Some(0x86),
        "F24" => Some(0x87),
        "CapsLock" => Some(0x14),
        "F1" => Some(0x70),
        "F2" => Some(0x71),
        "F3" => Some(0x72),
        "F4" => Some(0x73),
        "F5" => Some(0x74),
        "F6" => Some(0x75),
        "F7" => Some(0x76),
        "F8" => Some(0x77),
        "F9" => Some(0x78),
        "F10" => Some(0x79),
        "F11" => Some(0x7A),
        "F12" => Some(0x7B),
        other if other.len() == 1 => {
            let b = other.as_bytes()[0];
            if b.is_ascii_alphanumeric() {
                Some(b as UINT)
            } else {
                None
            }
        }
        _ => None,
    }
}

fn resolve_active_binding(name: &str, device: Option<&str>) -> Option<String> {
    {
        let verify = verify_overlay_bindings().lock().unwrap();
        if let Some(hit) = resolve_binding_in_list(&verify, name, device) {
            return Some(hit);
        }
    }
    let bindings = active_bindings().lock().unwrap();
    resolve_binding_in_list(&bindings, name, device)
}

fn try_dispatch_named_pad(name: &str, is_keyup: bool) -> bool {
    let Some(snap) = crate::codex_numpad_layer::lookup_named_pad_route(name) else {
        return false;
    };
    if let Some(sender) = active_sender().lock().unwrap().as_ref() {
        sender
            .send(crate::codex_numpad_layer::format_micro_key_event(
                &snap.micro_key_id,
                !is_keyup,
            ))
            .ok();
    }
    true
}

/// Multi-key chords use RegisterHotKey (WM_HOTKEY). The low-level hook must not swallow
/// only the terminal key — Ctrl/Shift would still reach the OS and switch IME layouts.
fn hook_handles_binding(binding: &str) -> bool {
    !binding.contains('+')
}

const RECORD_KEYS: &[&str] = &[
    "Volume_Up",
    "Volume_Down",
    "Volume_Mute",
    "Media_Next",
    "Media_Prev",
    "Media_Play_Pause",
    "Media_Stop",
    "Browser_Back",
    "Browser_Forward",
    "Browser_Refresh",
    "Launch_App1",
    "Launch_App2",
    "Launch_Mail",
    "AppsKey",
    "F1",
    "F13",
    "F14",
    "F15",
    "F16",
    "F17",
    "F18",
    "F19",
    "F20",
    "F21",
    "F22",
    "F23",
    "F24",
];

pub struct HotkeyManager {
    cmd_tx: mpsc::Sender<Cmd>,
    event_tx: mpsc::Sender<String>,
    event_rx: mpsc::Receiver<String>,
    obs_rx: mpsc::Receiver<InputObsEvent>,
}

impl HotkeyManager {
    pub fn new() -> Self {
        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let (event_tx, event_rx) = mpsc::channel::<String>();
        let (obs_tx, obs_rx) = mpsc::channel::<InputObsEvent>();
        *input_obs_sender().lock().unwrap() = Some(obs_tx);
        let thread_event_tx = event_tx.clone();
        thread::spawn(move || hotkey_thread(cmd_rx, thread_event_tx));
        Self {
            cmd_tx,
            event_tx,
            event_rx,
            obs_rx,
        }
    }

    pub fn bind_all(&self, bindings: &[String]) {
        self.cmd_tx.send(Cmd::BindAll(bindings.to_vec())).ok();
    }

    pub fn bind_modifier_watches(&self, watches: &[String]) {
        self.cmd_tx
            .send(Cmd::BindModifierWatches(watches.to_vec()))
            .ok();
    }

    /// QS/habit binding verify: listen for trigger keys without BindAll (avoids re-verify freeze).
    pub fn set_verify_overlay_bindings(&self, bindings: Vec<String>) {
        self.cmd_tx.send(Cmd::SetVerifyOverlay(bindings)).ok();
    }

    pub fn bind_scheme_switch(&self, combo: Option<String>) {
        self.cmd_tx.send(Cmd::BindSchemeSwitch(combo)).ok();
    }

    pub fn bind_scheme_select(&self, bindings: Vec<(String, String)>) {
        self.cmd_tx.send(Cmd::BindSchemeSelect(bindings)).ok();
    }

    pub fn start_recording(&self) {
        // ponytail: recording_sender is set inside Cmd::StartRecording AFTER hooks are
        // installed, so the mouse hook is ready before any events can arrive.
        self.cmd_tx.send(Cmd::StartRecording).ok();
    }

    pub fn stop_recording(&self) {
        // Clear immediately so hooks stop routing to recording even before the Cmd is processed.
        *recording_sender().lock().unwrap() = None;
        self.cmd_tx.send(Cmd::StopRecording).ok();
    }

    pub fn attach_app_window(&self, hwnd: isize) {
        self.cmd_tx.send(Cmd::AttachAppHwnd(hwnd)).ok();
    }

    pub fn try_recv(&self) -> Option<String> {
        self.event_rx.try_recv().ok()
    }

    pub fn try_recv_obs(&self) -> Option<InputObsEvent> {
        self.obs_rx.try_recv().ok()
    }
}

impl Drop for HotkeyManager {
    fn drop(&mut self) {
        self.cmd_tx.send(Cmd::Shutdown).ok();
    }
}

fn hotkey_thread(cmd_rx: mpsc::Receiver<Cmd>, event_tx: mpsc::Sender<String>) {
    let _class_name = unsafe {
        winapi::um::winuser::RegisterClassExW(&WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as UINT,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wnd_proc),
            hInstance: std::ptr::null_mut(),
            lpszClassName: w!("OneToneHotkey"),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hIcon: std::ptr::null_mut(),
            hCursor: std::ptr::null_mut(),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            hIconSm: std::ptr::null_mut(),
        })
    };

    let hwnd = unsafe {
        CreateWindowExW(
            0,
            w!("OneToneHotkey"),
            w!("VP"),
            0,
            0,
            0,
            0,
            0,
            winuser::HWND_MESSAGE,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if hwnd.is_null() {
        return;
    }

    let mut ctx = Box::new(WndCtx {
        tx: event_tx.clone(),
        names: HashMap::new(),
        next_id: 1,
        scheme_switch_id: None,
        scheme_select_ids: HashMap::new(),
    });
    let ctx_ptr: *mut WndCtx = &mut *ctx;

    *active_sender().lock().unwrap() = Some(event_tx.clone());

    let mut recording_mode = false;

    unsafe fn try_register_hotkey(hwnd: HWND, id: i32, combo: &str) -> bool {
        if combo.contains('+') {
            chord_to_register_hotkey(combo)
                .map(|(mods, vk)| RegisterHotKey(hwnd, id, mods, vk as UINT) != 0)
                .unwrap_or(false)
        } else if let Some(vk) = key_to_vk(combo) {
            RegisterHotKey(hwnd, id, MOD_NOREPEAT as u32, vk) != 0
                || RegisterHotKey(hwnd, id, 0, vk) != 0
        } else {
            false
        }
    }

    unsafe fn register(ctx: *mut WndCtx, hwnd: HWND, name: &str) -> Option<u32> {
        let id = (*ctx).next_id;
        if try_register_hotkey(hwnd, id as i32, name) {
            (*ctx).names.insert(id, name.to_string());
            (*ctx).next_id += 1;
            Some(id)
        } else {
            None
        }
    }

    unsafe fn unregister_triggers(ctx: *mut WndCtx, hwnd: HWND) {
        for id in (*ctx).names.keys().cloned().collect::<Vec<_>>() {
            UnregisterHotKey(hwnd, id as i32);
        }
        (*ctx).names.clear();
        (*ctx).next_id = 1;
    }

    unsafe fn unregister_scheme_switch(ctx: *mut WndCtx, hwnd: HWND) {
        if (*ctx).scheme_switch_id.is_some() {
            UnregisterHotKey(hwnd, SCHEME_SWITCH_HOTKEY_ID as i32);
            (*ctx).scheme_switch_id = None;
        }
    }

    unsafe fn unregister_scheme_selects(ctx: *mut WndCtx, hwnd: HWND) {
        for id in (*ctx).scheme_select_ids.keys().cloned().collect::<Vec<_>>() {
            UnregisterHotKey(hwnd, id as i32);
        }
        (*ctx).scheme_select_ids.clear();
    }

    unsafe fn register_scheme_selects(ctx: *mut WndCtx, hwnd: HWND, bindings: &[(String, String)]) {
        unregister_scheme_selects(ctx, hwnd);
        let mut id = SCHEME_SELECT_BASE_ID;
        for (combo, mapping_id) in bindings {
            if id >= SCHEME_SWITCH_HOTKEY_ID {
                break;
            }
            if try_register_hotkey(hwnd, id as i32, combo) {
                (*ctx).scheme_select_ids.insert(id, mapping_id.clone());
                id += 1;
            }
        }
    }

    unsafe fn register_scheme_switch(ctx: *mut WndCtx, hwnd: HWND, combo: &str) -> bool {
        unregister_scheme_switch(ctx, hwnd);
        if try_register_hotkey(hwnd, SCHEME_SWITCH_HOTKEY_ID as i32, combo) {
            (*ctx).scheme_switch_id = Some(SCHEME_SWITCH_HOTKEY_ID);
            true
        } else {
            false
        }
    }

    unsafe fn register_list(ctx: *mut WndCtx, hwnd: HWND, keys: &[String]) {
        unregister_triggers(ctx, hwnd);
        for name in keys {
            register(ctx, hwnd, name);
        }
    }

    unsafe fn register_record_keys(ctx: *mut WndCtx, hwnd: HWND) {
        unregister_triggers(ctx, hwnd);
        for name in RECORD_KEYS {
            register(ctx, hwnd, name);
        }
    }

    unsafe {
        winuser::SetWindowLongPtrW(hwnd, winuser::GWLP_USERDATA, ctx_ptr as isize);
    }

    let mut msg: MSG = unsafe { std::mem::zeroed() };
    loop {
        while let Ok(cmd) = cmd_rx.try_recv() {
            match cmd {
                Cmd::BindAll(bindings) => {
                    *active_bindings().lock().unwrap() = bindings.clone();
                    unsafe {
                        install_raw_input(hwnd);
                    }
                    sync_input_capture_hooks(hwnd);
                    if !recording_mode {
                        unsafe {
                            register_list(ctx_ptr, hwnd, &bindings);
                        }
                    }
                    unsafe {
                        sync_runtime_mouse_hook(&bindings, recording_mode);
                    }
                }
                Cmd::SetVerifyOverlay(bindings) => {
                    *verify_overlay_bindings().lock().unwrap() = bindings;
                    sync_input_capture_hooks(hwnd);
                }
                Cmd::BindModifierWatches(watches) => {
                    *modifier_watches().lock().unwrap() = watches.clone();
                    if !watches.is_empty() {
                        unsafe {
                            install_raw_input(hwnd);
                            install_keyboard_hook();
                        }
                    }
                }
                Cmd::BindSchemeSwitch(combo) => unsafe {
                    if let Some(ref key) = combo {
                        if !key.trim().is_empty() {
                            register_scheme_switch(ctx_ptr, hwnd, key.trim());
                        } else {
                            unregister_scheme_switch(ctx_ptr, hwnd);
                        }
                    } else {
                        unregister_scheme_switch(ctx_ptr, hwnd);
                    }
                },
                Cmd::BindSchemeSelect(bindings) => unsafe {
                    register_scheme_selects(ctx_ptr, hwnd, &bindings);
                },
                Cmd::StartRecording => {
                    recording_mode = true;
                    RECORDING_SESSION.store(true, Ordering::SeqCst);
                    // Set recording_sender BEFORE installing hooks so the very first
                    // mouse-hook WM_XBUTTONDOWN / keyboard-hook VK_VOLUME_* that arrives
                    // immediately after install can already route to the sender. The
                    // previous "after all hooks" ordering created a race window during
                    // which X1/X2 clicks and Bluetooth Vol+/- fell through to WebView2
                    // (back/forward navigation) and the recording was lost.
                    *recording_sender().lock().unwrap() = Some(event_tx.clone());
                    unsafe {
                        install_raw_input(hwnd);
                    }
                    unsafe {
                        install_keyboard_hook();
                    }
                    unsafe {
                        install_mouse_hook();
                    }
                    unsafe {
                        register_record_keys(ctx_ptr, hwnd);
                    }
                }
                Cmd::StopRecording => {
                    recording_mode = false;
                    *recording_sender().lock().unwrap() = None;
                    RECORDING_SESSION.store(false, Ordering::SeqCst);
                    unsafe {
                        install_raw_input(hwnd);
                    }
                    unsafe {
                        remove_mouse_hook();
                    }
                    let bindings = active_bindings().lock().unwrap().clone();
                    if bindings.is_empty() {
                        unsafe {
                            remove_keyboard_hook();
                        }
                    } else {
                        unsafe {
                            install_keyboard_hook();
                        }
                    }
                    unsafe {
                        register_list(ctx_ptr, hwnd, &bindings);
                    }
                    unsafe {
                        sync_runtime_mouse_hook(&bindings, false);
                    }
                }
                Cmd::AttachAppHwnd(app_hwnd) => {
                    if app_hwnd != 0 {
                        unsafe {
                            install_forward_wndproc(app_hwnd as HWND);
                        }
                    }
                }
                Cmd::Shutdown => {
                    unsafe {
                        unregister_triggers(ctx_ptr, hwnd);
                        unregister_scheme_switch(ctx_ptr, hwnd);
                        unregister_scheme_selects(ctx_ptr, hwnd);
                        remove_raw_input();
                        remove_keyboard_hook();
                        remove_mouse_hook();
                        winuser::DestroyWindow(hwnd);
                    }
                    return;
                }
            }
        }

        // 低级键盘钩子依赖本线程消息泵；不能只 Peek 单一 hwnd，否则钩子/WM_HOTKEY 会饿死。
        let has_msg = unsafe {
            winuser::PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, winuser::PM_REMOVE)
        } != 0;
        if has_msg {
            if msg.message == winuser::WM_QUIT {
                break;
            }
            unsafe {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        } else {
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
        poll_input_extensions();
    }
}

unsafe fn install_keyboard_hook() {
    let mut hook = recording_hook().lock().unwrap();
    if *hook != 0 {
        return;
    }
    let handle = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), std::ptr::null_mut(), 0);
    *hook = handle as isize;
}

unsafe fn install_raw_input(hwnd: HWND) {
    let devices: Vec<RAWINPUTDEVICE> = RAW_INPUT_DEVICES
        .iter()
        .map(|(page, usage)| RAWINPUTDEVICE {
            usUsagePage: *page,
            usUsage: *usage,
            dwFlags: RIDEV_INPUTSINK,
            hwndTarget: hwnd,
        })
        .collect();
    RegisterRawInputDevices(
        devices.as_ptr(),
        devices.len() as u32,
        std::mem::size_of::<RAWINPUTDEVICE>() as u32,
    );
}

unsafe fn remove_raw_input() {
    let devices: Vec<RAWINPUTDEVICE> = RAW_INPUT_DEVICES
        .iter()
        .map(|(page, usage)| RAWINPUTDEVICE {
            usUsagePage: *page,
            usUsage: *usage,
            dwFlags: 0,
            hwndTarget: std::ptr::null_mut(),
        })
        .collect();
    RegisterRawInputDevices(
        devices.as_ptr(),
        devices.len() as u32,
        std::mem::size_of::<RAWINPUTDEVICE>() as u32,
    );
}

fn dispatch_physical_payload(payload: &str, source: &str, report_hex: &str) -> bool {
    let ev = parse_physical_event(payload);

    let body = format_device_key(ev.device.as_deref().unwrap_or(""), &ev.key);
    let wire = if ev.is_keyup {
        format!("keyup:{body}")
    } else {
        body
    };

    if let Some(sender) = recording_sender().lock().unwrap().as_ref() {
        sender.send(wire).ok();
        emit_input_obs(
            onetone_logic::runtime_event::kind::INPUT_CAPTURED,
            &ev.key,
            ev.device.as_deref(),
            report_hex,
            "recording",
            source,
        );
        return true;
    }

    if try_dispatch_named_pad(&ev.key, ev.is_keyup) {
        return true;
    }

    if send_guard::blocks_key(&ev.key) {
        send_guard::note_blocked();
        emit_input_obs(
            onetone_logic::runtime_event::kind::INPUT_IGNORED,
            &ev.key,
            ev.device.as_deref(),
            report_hex,
            "send_guard",
            source,
        );
        return false;
    }

    if !report_hex.is_empty() || is_extension_key(&ev.key) {
        set_pending_input_debug(InputDebugMeta {
            key: ev.key.clone(),
            device: ev.device.clone().unwrap_or_default(),
            report_hex: report_hex.to_string(),
            source: source.to_string(),
        });
    }

    if let Some(binding) = resolve_active_binding(&ev.key, ev.device.as_deref()) {
        if hook_handles_binding(&binding) {
            if let Some(sender) = active_sender().lock().unwrap().as_ref() {
                sender.send(wire).ok();
            }
            emit_input_obs(
                onetone_logic::runtime_event::kind::INPUT_CAPTURED,
                &ev.key,
                ev.device.as_deref(),
                report_hex,
                "binding",
                source,
            );
            return true;
        }
    }

    if is_extension_key(&ev.key) {
        emit_input_obs(
            onetone_logic::runtime_event::kind::INPUT_IGNORED,
            &ev.key,
            ev.device.as_deref(),
            report_hex,
            "no_binding",
            source,
        );
    }
    false
}

fn dispatch_key_event(name: &str, is_keyup: bool, device: Option<&str>, source: &str) -> bool {
    let body = format_device_key(device.unwrap_or(""), name);
    let payload = if is_keyup {
        format!("keyup:{body}")
    } else {
        body
    };
    dispatch_physical_payload(&payload, source, "")
}

fn dispatch_media_key(name: &str) -> bool {
    dispatch_key_event(name, false, None, "appcommand")
}

fn poll_input_extensions() {
    let events = input_ext_bus().lock().unwrap().poll_all();
    for payload in events {
        dispatch_physical_payload(&payload, "xinput", "");
    }
}

fn dispatch_appcommand(cmd: i32) -> bool {
    appcommand_to_name(cmd)
        .map(|name| dispatch_media_key(&name))
        .unwrap_or(false)
}

unsafe extern "system" fn forward_wnd_proc(
    hwnd: HWND,
    msg: UINT,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_INPUT {
        if try_dispatch_raw_input(lparam) {
            return 0;
        }
    }
    if msg == WM_APPCOMMAND {
        let cmd = GET_APPCOMMAND_LPARAM(lparam as isize) as i32;
        if dispatch_appcommand(cmd) {
            return 1;
        }
    }
    let prev = *forward_prev_wndproc().lock().unwrap();
    CallWindowProcW(std::mem::transmute(prev), hwnd, msg, wparam, lparam)
}

unsafe fn install_forward_wndproc(hwnd: HWND) {
    let mut stored = forward_hwnd().lock().unwrap();
    if *stored == hwnd as isize {
        return;
    }
    let prev =
        winuser::SetWindowLongPtrW(hwnd, GWLP_WNDPROC, forward_wnd_proc as *const () as isize);
    *forward_prev_wndproc().lock().unwrap() = prev;
    *stored = hwnd as isize;
}

unsafe fn remove_keyboard_hook() {
    let mut hook = recording_hook().lock().unwrap();
    if *hook != 0 {
        UnhookWindowsHookEx(*hook as *mut _);
        *hook = 0;
    }
}

unsafe fn sync_runtime_mouse_hook(bindings: &[String], recording: bool) {
    if recording || bindings_need_mouse_hook(bindings) {
        install_mouse_hook();
    } else {
        remove_mouse_hook();
    }
}

unsafe fn install_mouse_hook() {
    let mut hook = recording_mouse_hook().lock().unwrap();
    if *hook != 0 {
        return;
    }
    let handle = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), std::ptr::null_mut(), 0);
    *hook = handle as isize;
}

unsafe fn remove_mouse_hook() {
    let mut hook = recording_mouse_hook().lock().unwrap();
    if *hook != 0 {
        UnhookWindowsHookEx(*hook as *mut _);
        *hook = 0;
    }
}

const LLKHF_INJECTED: u32 = 0x10;

/// Defence-in-depth buffer for mouse events that arrive before `recording_sender`
/// is observable from inside the hook. With the Cmd::StartRecording ordering fix
/// the sender is now set before any hook is installed, but this buffer covers
/// the StopRecording transition (sender cleared but hook still installed) and
/// any future reordering of the cmd pipeline. The runtime loop drains it on
/// every tick.
static PENDING_RECORDING_MOUSE: OnceLock<Mutex<Vec<String>>> = OnceLock::new();

fn pending_recording_mouse() -> &'static Mutex<Vec<String>> {
    PENDING_RECORDING_MOUSE.get_or_init(|| Mutex::new(Vec::new()))
}

pub(crate) fn drain_pending_recording_mouse() -> Vec<String> {
    let mut buf = pending_recording_mouse().lock().unwrap();
    std::mem::take(&mut *buf)
}

fn xbutton_name_from_mouse_data(mouse_data: u32) -> Option<&'static str> {
    // Spec: HIWORD(mouseData) is XBUTTON1/2. Some dongles put the button in
    // the low word, or stash RAWMOUSE button flags (0x0040 / 0x0100) instead.
    let hi = (mouse_data >> 16) as u16;
    let lo = (mouse_data & 0xFFFF) as u16;
    for v in [hi, lo] {
        if v == winapi::um::winuser::XBUTTON1 as u16 || v == 0x0040 {
            return Some("XButton1");
        }
        if v == winapi::um::winuser::XBUTTON2 as u16 || v == 0x0100 {
            return Some("XButton2");
        }
    }
    None
}

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let session_active = RECORDING_SESSION.load(Ordering::SeqCst);
    let sender_ready = recording_sender().lock().unwrap().is_some();
    if send_guard::is_active() && !session_active {
        return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
    }
    if code >= 0 {
        let w = wparam as u32;
        let is_x_up = w == WM_XBUTTONUP;
        let btn = match w {
            WM_LBUTTONDOWN => Some("LButton"),
            WM_RBUTTONDOWN => Some("RButton"),
            WM_MBUTTONDOWN => Some("MButton"),
            WM_XBUTTONDOWN | WM_XBUTTONUP => {
                let info = *(lparam as *const MSLLHOOKSTRUCT);
                xbutton_name_from_mouse_data(info.mouseData)
            }
            _ => None,
        };
        if let Some(name) = btn {
            if sender_ready {
                if let Some(sender) = recording_sender().lock().unwrap().as_ref() {
                    if !is_x_up {
                        sender.send(name.to_string()).ok();
                    }
                }
                // Swallow side buttons so WebView2 does not treat them as Back/Forward.
                if name == "XButton1" || name == "XButton2" {
                    return 1;
                }
            } else if try_dispatch_named_pad(name, is_x_up) {
                return 1;
            } else if resolve_active_binding(name, None).is_some() {
                // Side buttons are pulse-only — keyup must not re-dispatch as a second tap.
                if !is_x_up {
                    if let Some(sender) = active_sender().lock().unwrap().as_ref() {
                        sender.send(name.to_string()).ok();
                    }
                }
                return 1;
            } else if session_active && (name == "XButton1" || name == "XButton2") && !is_x_up {
                // Sender race / StopRecording transition: session is active but the
                // sender is not yet visible from inside the hook. Buffer the side
                // button so the runtime loop can still route it to recording once
                // it drains the buffer. Swallow the event so WebView2 does not
                // navigate Back/Forward in the meantime.
                pending_recording_mouse().lock().unwrap().push(name.to_string());
                return 1;
            }
        } else if session_active && (w == WM_XBUTTONDOWN || w == WM_XBUTTONUP) {
            // mouseData was empty/unrecognized. Still swallow so WebView2 cannot
            // navigate Forward; raw input names the button on the recording channel.
            return 1;
        }
    }
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

/// Pure bridge helper extracted from `keyboard_proc` so the Bluetooth
/// RAlt → Volume_Up rewrite is unit-testable without spinning up a Windows
/// hook. Returns the bridged wire name to send down the recording channel.
fn bridge_injected_ralt_to_volume(injected: bool, name: &str) -> &str {
    // Recording: 02 识别 defaults to RAlt. BT volume keys often surface as
    // VK_RMENU with or without LLKHF_INJECTED — both must become Volume_Up
    // or finish_hardware_capture treats them as a recognition-key echo.
    if name == "RAlt" && (injected || RECORDING_SESSION.load(Ordering::SeqCst)) {
        "Volume_Up"
    } else {
        name
    }
}

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let recording = RECORDING_SESSION.load(Ordering::SeqCst) || is_recording();
    let is_key_down = wparam == WM_KEYDOWN as usize || wparam == WM_SYSKEYDOWN as usize;
    let is_key_up = wparam == WM_KEYUP as usize || wparam == WM_SYSKEYUP as usize;
    if code >= 0 && (is_key_down || is_key_up) {
        let kb = *(lparam as *const KBDLLHOOKSTRUCT);
        if kb.flags & LLKHF_INJECTED != 0 {
            // Hardware dongles often inject VK_VOLUME_* ; skip only non-volume ghosts
            // so recording can still capture the physical volume key.
            //
            // Bluetooth HID remap bridge: some Bluetooth keyboards describe their
            // media keys with the same usage page as RAlt, so Windows surfaces the
            // keystroke as an injected VK_RMENU (0xA5 = "RAlt"). Without the bridge
            // the recording session would fall through to the IME and the trigger
            // capture would either get short-circuited by is_recognition_key_echo
            // (target is RAlt by default) or never reach the runtime at all.
            //
            // During a recording session we let the in-flight RAlt ride the same
            // channel as a hardware volume key; the handler bridges it into the
            // Volume_Up fast-path and tags the source device accordingly so the
            // user can see what happened.
            let injected_capture_token = recording
                && vk_to_name(kb.vkCode as u32)
                    .as_deref()
                    .map(|n| is_volume_hotkey(n) || n == "RAlt")
                    .unwrap_or(false);
            if !injected_capture_token {
                return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
            }
        }
        let extended = kb.flags & 0x01 != 0;
        if let Some(source) = crate::codex_numpad_layer::normalize_numpad_physical(
            kb.scanCode as u16,
            extended,
        ) {
            if recording {
                if is_key_down {
                    if let Some(sender) = recording_sender().lock().unwrap().as_ref() {
                        sender.send(source.id()).ok();
                    }
                }
                return 1;
            }
            if crate::codex_numpad_layer::hook_should_swallow(&source) {
                if let Some(sender) = active_sender().lock().unwrap().as_ref() {
                    let payload = crate::codex_numpad_layer::format_event(&source, is_key_down);
                    sender.send(payload).ok();
                }
                return 1;
            }
        }
        if let Some(name) = vk_to_name(kb.vkCode as u32) {
            // Dedicated arrows only (LLKHF_EXTENDED). NumLock-off numpad 2/4/6/8 share VK
            // names but are non-extended and belong to the Soft Pad numpad route above.
            if extended {
                if let Some(nav_id) = crate::codex_numpad_layer::arrow_nav_micro_key(&name) {
                    if crate::codex_numpad_layer::pad_should_capture_arrow(nav_id) {
                        if let Some(sender) = active_sender().lock().unwrap().as_ref() {
                            let payload = crate::codex_numpad_layer::format_micro_key_event(
                                nav_id, is_key_down,
                            );
                            sender.send(payload).ok();
                        }
                        return 1;
                    }
                }
            }
            if recording {
                // Bluetooth HID remap bridge: an injected RAlt during recording is
                // almost always a Bluetooth media key that Windows translated to
                // VK_RMENU. We surface it as a Volume_Up event so the handler's
                // Volume fast-path catches it; the source device tag is set by
                // the handler when it sees the bridge tag in the payload.
                let bridged = bridge_injected_ralt_to_volume(
                    kb.flags & LLKHF_INJECTED != 0,
                    &name,
                )
                .to_string();
                if is_key_down {
                    if let Some(sender) = recording_sender().lock().unwrap().as_ref() {
                        sender.send(bridged.clone()).ok();
                    }
                } else if is_key_up {
                    if let Some(sender) = recording_sender().lock().unwrap().as_ref() {
                        sender.send(format!("keyup:{bridged}")).ok();
                    }
                }
                // Swallow volume / bridged RAlt / mouse-as-browser keys so IME
                // and WebView2 Back/Forward do not steal the press.
                if is_volume_hotkey(&bridged)
                    || name == "RAlt"
                    || name == "Browser_Back"
                    || name == "Browser_Forward"
                {
                    return 1;
                }
                return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
            }
            if send_guard::blocks_key(&name) {
                return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
            }
            if try_dispatch_named_pad(&name, is_key_up) {
                return 1;
            }
            if is_modifier_watch_key(&name) {
                if let Some(sender) = active_sender().lock().unwrap().as_ref() {
                    let payload = if is_key_down {
                        name.clone()
                    } else if is_key_up {
                        format!("keyup:{name}")
                    } else {
                        return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
                    };
                    sender.send(payload).ok();
                }
                return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
            }
            if let Some(dispatch) = resolve_active_binding(&name, None) {
                if !hook_handles_binding(&dispatch) {
                    return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
                }
                let payload = if is_key_down {
                    dispatch.clone()
                } else if is_key_up {
                    format!("keyup:{dispatch}")
                } else {
                    return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
                };
                if let Some(sender) = active_sender().lock().unwrap().as_ref() {
                    sender.send(payload).ok();
                }
                return 1;
            }
        }
    }
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

fn vk_to_name(vk: u32) -> Option<String> {
    match vk {
        0xAE => Some("Volume_Down".into()),
        0xAF => Some("Volume_Up".into()),
        0xAD => Some("Volume_Mute".into()),
        0xB0 => Some("Media_Next".into()),
        0xB1 => Some("Media_Prev".into()),
        0xB2 => Some("Media_Stop".into()),
        0xB3 => Some("Media_Play_Pause".into()),
        0xA0 => Some("LShift".into()),
        0xA1 => Some("RShift".into()),
        0xA2 => Some("LCtrl".into()),
        0xA3 => Some("RCtrl".into()),
        0xA4 => Some("LAlt".into()),
        0xA5 => Some("RAlt".into()),
        0x5B => Some("LWin".into()),
        0x5C => Some("RWin".into()),
        0x5D => Some("AppsKey".into()),
        0xA6 => Some("Browser_Back".into()),
        0xA7 => Some("Browser_Forward".into()),
        0xA8 => Some("Browser_Refresh".into()),
        0xB4 => Some("Launch_Mail".into()),
        0xB6 => Some("Launch_App1".into()),
        0xB7 => Some("Launch_App2".into()),
        0x08 => Some("Backspace".into()),
        0x09 => Some("Tab".into()),
        0x0D => Some("Enter".into()),
        0x1B => Some("Esc".into()),
        0x20 => Some("Space".into()),
        0x2E => Some("Delete".into()),
        0x24 => Some("Home".into()),
        0x23 => Some("End".into()),
        0x21 => Some("PageUp".into()),
        0x22 => Some("PageDown".into()),
        0x26 => Some("Up".into()),
        0x28 => Some("Down".into()),
        0x25 => Some("Left".into()),
        0x27 => Some("Right".into()),
        0x30..=0x39 => Some(((vk - 0x30) as u8 + b'0') as char).map(|c| c.to_string()),
        0x41..=0x5A => Some(((vk - 0x41) as u8 + b'A') as char).map(|c| c.to_string()),
        0x7C..=0x87 => Some(format!("F{}", vk - 0x7C + 13)),
        0x14 => Some("CapsLock".into()),
        0x70..=0x7B => Some(format!("F{}", vk - 0x70 + 1)),
        0x60..=0x69 => Some(format!("Numpad{}", vk - 0x60)),
        0x6A => Some("NumpadMultiply".into()),
        0x6B => Some("NumpadAdd".into()),
        0x6D => Some("NumpadSubtract".into()),
        0x6E => Some("NumpadDecimal".into()),
        0x6F => Some("NumpadDivide".into()),
        other => Some(format!("VK_{:02X}", other)),
    }
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: UINT,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_INPUT {
        if try_dispatch_raw_input(lparam) {
            return 1;
        }
        return 1;
    }

    if msg == WM_APPCOMMAND {
        let cmd = GET_APPCOMMAND_LPARAM(lparam as isize) as i32;
        if dispatch_appcommand(cmd) {
            return 1;
        }
    }

    if msg == WM_HOTKEY {
        let id = wparam as u32;
        let ctx_ptr = winuser::GetWindowLongPtrW(hwnd, winuser::GWLP_USERDATA) as *mut WndCtx;
        if let Some(sender) = recording_sender().lock().unwrap().as_ref() {
            if !ctx_ptr.is_null() {
                if let Some(name) = (*ctx_ptr).names.get(&id) {
                    sender.send(name.clone()).ok();
                }
            }
            return 1;
        }
        if id == SCHEME_SWITCH_HOTKEY_ID {
            if !ctx_ptr.is_null() && (*ctx_ptr).scheme_switch_id.is_some() {
                (*ctx_ptr).tx.send(SCHEME_CYCLE_MARKER.to_string()).ok();
            }
            return 1;
        }
        if !ctx_ptr.is_null() {
            if let Some(mapping_id) = (*ctx_ptr).scheme_select_ids.get(&id) {
                let marker = format!("{SCHEME_SELECT_PREFIX}{mapping_id}");
                (*ctx_ptr).tx.send(marker).ok();
                return 1;
            }
            if let Some(name) = (*ctx_ptr).names.get(&id) {
                if send_guard::blocks_key(name) {
                    send_guard::note_blocked();
                } else {
                    (*ctx_ptr).tx.send(name.clone()).ok();
                }
            }
        }
        return 1;
    }

    if msg == WM_DESTROY {
        let ctx_ptr = winuser::GetWindowLongPtrW(hwnd, winuser::GWLP_USERDATA) as *mut WndCtx;
        if !ctx_ptr.is_null() {
            drop(Box::from_raw(ctx_ptr));
        }
        winuser::PostQuitMessage(0);
        return 0;
    }

    DefWindowProcW(hwnd, msg, wparam, lparam)
}
fn consumer_usage_to_name(usage: u16) -> Option<String> {
    match usage {
        0x00E9 => Some("Volume_Up".into()),
        0x00EA => Some("Volume_Down".into()),
        0x00E2 => Some("Volume_Mute".into()),
        0x00CD => Some("Media_Play_Pause".into()),
        0x00B5 => Some("Media_Next".into()),
        0x00B6 => Some("Media_Prev".into()),
        0x00B7 => Some("Media_Stop".into()),
        0x0223 => Some("Browser_Back".into()),
        0x0224 => Some("Browser_Forward".into()),
        0x0227 => Some("Browser_Refresh".into()),
        0x018A => Some("Launch_Mail".into()),
        0x0192 => Some("Launch_App1".into()),
        0x0194 => Some("Launch_App2".into()),
        _ => None,
    }
}

fn scan_consumer_bytes(data: &[u8]) -> Option<String> {
    for i in 0..data.len() {
        if let Some(name) = consumer_usage_to_name(data[i] as u16) {
            return Some(name);
        }
    }
    for i in 0..data.len().saturating_sub(1) {
        let le = u16::from_le_bytes([data[i], data[i + 1]]);
        if let Some(name) = consumer_usage_to_name(le) {
            return Some(name);
        }
        let be = u16::from_be_bytes([data[i], data[i + 1]]);
        if let Some(name) = consumer_usage_to_name(be) {
            return Some(name);
        }
    }
    fn scan_bitmap(bytes: &[u8], base: u16) -> Option<String> {
        for (byte_index, byte) in bytes.iter().enumerate() {
            if *byte == 0 {
                continue;
            }
            for bit in 0..8u16 {
                if (*byte as u16) & (1 << bit) == 0 {
                    continue;
                }
                let usage = base + (byte_index as u16 * 8) + bit;
                if let Some(name) = consumer_usage_to_name(usage) {
                    return Some(name);
                }
            }
        }
        None
    }
    // 常见蓝牙外设：consumer control 以位图方式上报，usage 常从 0x00E0 起连续展开。
    if let Some(name) = scan_bitmap(data, 0x00E0) {
        return Some(name);
    }
    // BLE often prefixes a report id (1..=15). Vol+/Vol- then sit in the next byte
    // as bits starting at usage 0xE9, not at 0xE0-from-byte-0.
    if !data.is_empty() && (1..=15).contains(&data[0]) {
        let payload = &data[1..];
        if let Some(name) = scan_bitmap(payload, 0x00E0) {
            return Some(name);
        }
        if let Some(name) = scan_bitmap(payload, 0x00E9) {
            return Some(name);
        }
    }
    None
}

unsafe fn raw_input_device_id(hdevice: isize) -> Option<String> {
    if hdevice == 0 {
        return None;
    }
    {
        let cache = device_cache().lock().unwrap();
        if let Some(name) = cache.get(&hdevice) {
            return Some(name.clone());
        }
    }
    // RIDI_DEVICENAME: pcbSize 单位是字符数（wchar），不是字节数。
    let mut char_count: u32 = 0;
    if GetRawInputDeviceInfoW(
        hdevice as HANDLE,
        RIDI_DEVICENAME,
        std::ptr::null_mut(),
        &mut char_count,
    ) == u32::MAX
    {
        return None;
    }
    if char_count == 0 {
        return None;
    }
    let mut buf = vec![0u16; char_count as usize];
    let wrote = GetRawInputDeviceInfoW(
        hdevice as HANDLE,
        RIDI_DEVICENAME,
        buf.as_mut_ptr() as *mut _,
        &mut char_count,
    );
    if wrote == u32::MAX || wrote == 0 {
        return None;
    }
    let end = buf.iter().position(|&c| c == 0).unwrap_or(wrote as usize);
    let name = String::from_utf16_lossy(&buf[..end]);
    if name.is_empty() {
        return None;
    }
    let stable = device_identity::stable_id_from_path(&name);
    device_cache()
        .lock()
        .unwrap()
        .insert(hdevice, stable.clone());
    Some(stable)
}

unsafe fn try_dispatch_raw_input(lparam: LPARAM) -> bool {
    let mut size: u32 = 0;
    GetRawInputData(
        lparam as *mut _,
        RID_INPUT,
        std::ptr::null_mut(),
        &mut size,
        std::mem::size_of::<winapi::um::winuser::RAWINPUTHEADER>() as u32,
    );
    if size == 0 {
        return false;
    }
    let mut buf = vec![0u8; size as usize];
    if GetRawInputData(
        lparam as *mut _,
        RID_INPUT,
        buf.as_mut_ptr() as *mut _,
        &mut size,
        std::mem::size_of::<winapi::um::winuser::RAWINPUTHEADER>() as u32,
    ) != size
    {
        return false;
    }
    let raw = &*(buf.as_ptr() as *const RAWINPUT);
    let device = raw_input_device_id(raw.header.hDevice as isize);
    if raw.header.dwType == RIM_TYPEHID {
        return dispatch_raw_hid_input(raw, device.as_deref());
    }
    if let Some((name, is_up)) = raw_mouse_xbutton(raw) {
        return dispatch_key_event(&name, is_up, device.as_deref(), "raw_input");
    }
    if let Some((name, is_up)) = raw_input_to_event(raw) {
        return dispatch_key_event(&name, is_up, device.as_deref(), "raw_input");
    }
    false
}

fn raw_mouse_xbutton(raw: &RAWINPUT) -> Option<(String, bool)> {
    unsafe {
        if raw.header.dwType != winapi::um::winuser::RIM_TYPEMOUSE {
            return None;
        }
        let flags = raw.data.mouse().usButtonFlags;
        const RI_MOUSE_BUTTON_4_DOWN: u16 = 0x0040;
        const RI_MOUSE_BUTTON_4_UP: u16 = 0x0080;
        const RI_MOUSE_BUTTON_5_DOWN: u16 = 0x0100;
        const RI_MOUSE_BUTTON_5_UP: u16 = 0x0200;
        if flags & RI_MOUSE_BUTTON_4_DOWN != 0 {
            return Some(("XButton1".into(), false));
        }
        if flags & RI_MOUSE_BUTTON_5_DOWN != 0 {
            return Some(("XButton2".into(), false));
        }
        if flags & RI_MOUSE_BUTTON_4_UP != 0 {
            return Some(("XButton1".into(), true));
        }
        if flags & RI_MOUSE_BUTTON_5_UP != 0 {
            return Some(("XButton2".into(), true));
        }
        // Some dongles leave usButtonFlags empty and put XBUTTON1/2 in usButtonData.
        let data = raw.data.mouse().usButtonData;
        if flags == 0 && data == winapi::um::winuser::XBUTTON1 as u16 {
            return Some(("XButton1".into(), false));
        }
        if flags == 0 && data == winapi::um::winuser::XBUTTON2 as u16 {
            return Some(("XButton2".into(), false));
        }
        None
    }
}

unsafe fn dispatch_raw_hid_input(raw: &RAWINPUT, device: Option<&str>) -> bool {
    let hid = raw.data.hid();
    let len = hid.dwSizeHid as usize * hid.dwCount as usize;
    if len == 0 {
        return false;
    }
    let data = std::slice::from_raw_parts(hid.bRawData.as_ptr(), len);
    if let Some(name) = scan_consumer_bytes(data) {
        return dispatch_key_event(&name, false, device, "raw_input");
    }
    let mut handled = false;
    for ev in crate::codex_micro_vendor::ingest_hid_report(data) {
        if crate::codex_numpad_layer::vendor_micro_should_dispatch(&ev.micro_key_id) {
            if let Some(sender) = active_sender().lock().unwrap().as_ref() {
                let payload = crate::codex_numpad_layer::format_micro_key_event(
                    &ev.micro_key_id,
                    ev.key_down,
                );
                sender.send(payload).ok();
            }
            handled = true;
        }
    }
    if handled {
        return true;
    }
    if let Some(name) = scan_boot_keyboard_bytes(data) {
        return dispatch_key_event(&name, false, device, "raw_input");
    }
    if let Some(scan) = vendor_hid::scan_vendor_hid_report(data) {
        let payload = format_device_key(device.unwrap_or(""), &scan.key);
        return dispatch_physical_payload(&payload, "raw_input", &scan.report_hex);
    }
    if vendor_hid::report_has_signal(data) {
        emit_input_obs(
            onetone_logic::runtime_event::kind::INPUT_PARSE_MISS,
            "",
            device,
            &vendor_hid::report_hex(data),
            "hid_parse_miss",
            "raw_input",
        );
    }
    false
}

fn raw_input_to_event(raw: &RAWINPUT) -> Option<(String, bool)> {
    unsafe {
        if raw.header.dwType == RIM_TYPEKEYBOARD {
            let kb = raw.data.keyboard();
            let is_up = kb.Flags & (RI_KEY_BREAK as u16) != 0;
            if let Some(name) = vk_to_name(kb.VKey as u32) {
                return Some((name, is_up));
            }
            if kb.VKey == 0 {
                let vk = MapVirtualKeyW(kb.MakeCode as u32, MAPVK_VSC_TO_VK_EX);
                return vk_to_name(vk as u32).map(|n| (n, is_up));
            }
            return None;
        }
    }
    None
}

fn hid_keyboard_usage_to_name(usage: u8) -> Option<String> {
    match usage {
        0x04..=0x1d => {
            let c = (b'a' + (usage - 0x04)) as char;
            Some(c.to_ascii_uppercase().to_string())
        }
        0x1e..=0x26 => Some(((usage - 0x1e + b'1') as char).to_string()),
        0x27 => Some("0".into()),
        0x3a..=0x45 => Some(format!("F{}", usage - 0x3a + 1)),
        0x68..=0x73 => Some(format!("F{}", usage - 0x68 + 13)),
        _ => None,
    }
}

fn scan_boot_keyboard_bytes(data: &[u8]) -> Option<String> {
    if data.len() >= 3 {
        for &usage in &data[2..] {
            if usage != 0 {
                if let Some(name) = hid_keyboard_usage_to_name(usage) {
                    return Some(name);
                }
            }
        }
    }
    for &usage in data {
        if usage != 0 {
            if let Some(name) = hid_keyboard_usage_to_name(usage) {
                return Some(name);
            }
        }
    }
    None
}

fn appcommand_to_name(cmd: i32) -> Option<String> {
    match cmd {
        val if val == APPCOMMAND_VOLUME_UP as i32 => Some("Volume_Up".into()),
        val if val == APPCOMMAND_VOLUME_DOWN as i32 => Some("Volume_Down".into()),
        val if val == APPCOMMAND_VOLUME_MUTE as i32 => Some("Volume_Mute".into()),
        val if val == APPCOMMAND_MEDIA_NEXTTRACK as i32 => Some("Media_Next".into()),
        val if val == APPCOMMAND_MEDIA_PREVIOUSTRACK as i32 => Some("Media_Prev".into()),
        val if val == APPCOMMAND_MEDIA_PLAY_PAUSE as i32 => Some("Media_Play_Pause".into()),
        val if val == APPCOMMAND_MEDIA_STOP as i32 => Some("Media_Stop".into()),
        val if val == APPCOMMAND_BROWSER_BACKWARD as i32 => Some("Browser_Back".into()),
        val if val == APPCOMMAND_BROWSER_FORWARD as i32 => Some("Browser_Forward".into()),
        val if val == APPCOMMAND_BROWSER_REFRESH as i32 => Some("Browser_Refresh".into()),
        val if val == APPCOMMAND_LAUNCH_MAIL as i32 => Some("Launch_Mail".into()),
        val if val == APPCOMMAND_LAUNCH_APP1 as i32 => Some("Launch_App1".into()),
        val if val == APPCOMMAND_LAUNCH_APP2 as i32 => Some("Launch_App2".into()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        bridge_injected_ralt_to_volume, drain_pending_recording_mouse, scan_consumer_bytes,
        xbutton_name_from_mouse_data, RECORDING_SESSION,
    };
    use crate::config::is_volume_hotkey;
    use std::sync::atomic::Ordering;

    #[test]
    fn scan_consumer_bytes_finds_volume_usages() {
        assert_eq!(scan_consumer_bytes(&[0xE9]).as_deref(), Some("Volume_Up"));
        assert_eq!(scan_consumer_bytes(&[0xEA]).as_deref(), Some("Volume_Down"));
        assert_eq!(
            scan_consumer_bytes(&[0x01, 0xE9, 0x00]).as_deref(),
            Some("Volume_Up")
        );
        assert_eq!(
            scan_consumer_bytes(&[0x01, 0x01]).as_deref(),
            Some("Volume_Up")
        );
        assert_eq!(
            scan_consumer_bytes(&[0x01, 0x02]).as_deref(),
            Some("Volume_Down")
        );
        assert_eq!(scan_consumer_bytes(&[0x03, 0x00, 0x80]), None);
    }

    /// The pending-recording-mouse buffer must accept side-button names pushed
    /// while `recording_sender` is temporarily invisible from inside the hook
    /// (race around Cmd::StartRecording / Cmd::StopRecording transitions), and
    /// the runtime loop must drain it cleanly without leaking entries between
    /// sessions.
    #[test]
    fn pending_recording_mouse_buffer_round_trips_side_buttons() {
        drain_pending_recording_mouse();
        // The mouse hook would push the side-button names via the same static
        // (we exercise the round-trip directly because the WH_MOUSE_LL proc is
        // unsafe and Windows-only).
        let names = vec!["XButton1".to_string(), "XButton2".to_string()];
        for n in &names {
            super::pending_recording_mouse()
                .lock()
                .unwrap()
                .push(n.clone());
        }
        let drained = drain_pending_recording_mouse();
        assert_eq!(drained, names);
        // Second drain is empty — no leakage between recording sessions.
        assert!(drain_pending_recording_mouse().is_empty());
    }

    #[test]
    fn xbutton_name_reads_hi_or_lo_word() {
        assert_eq!(xbutton_name_from_mouse_data(0x0001_0000), Some("XButton1"));
        assert_eq!(xbutton_name_from_mouse_data(0x0002_0000), Some("XButton2"));
        assert_eq!(xbutton_name_from_mouse_data(0x0000_0001), Some("XButton1"));
        assert_eq!(xbutton_name_from_mouse_data(0x0000_0002), Some("XButton2"));
        assert_eq!(xbutton_name_from_mouse_data(0x0100_0000), Some("XButton2"));
        assert_eq!(xbutton_name_from_mouse_data(0x0000_0100), Some("XButton2"));
        assert_eq!(xbutton_name_from_mouse_data(0x0040_0000), Some("XButton1"));
        assert_eq!(xbutton_name_from_mouse_data(0), None);
    }

    /// The Bluetooth keyboard bridge — when VK_RMENU arrives during recording
    /// we treat it as `Volume_Up` so the handler's volume fast-path catches it
    /// instead of letting the IME swallow the keystroke / recognition echo.
    #[test]
    fn bridge_injected_ralt_to_volume_during_recording() {
        assert_eq!(bridge_injected_ralt_to_volume(true, "RAlt"), "Volume_Up");
        assert!(is_volume_hotkey(bridge_injected_ralt_to_volume(true, "RAlt")));
        RECORDING_SESSION.store(true, Ordering::SeqCst);
        assert_eq!(bridge_injected_ralt_to_volume(false, "RAlt"), "Volume_Up");
        RECORDING_SESSION.store(false, Ordering::SeqCst);
        assert_eq!(bridge_injected_ralt_to_volume(false, "RAlt"), "RAlt");
        assert_eq!(bridge_injected_ralt_to_volume(true, "Volume_Up"), "Volume_Up");
    }
}
