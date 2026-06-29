use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::thread;

macro_rules! w {
    ($s:expr) => {{
        let v: Vec<u16> = $s.encode_utf16().chain(std::iter::once(0)).collect();
        v.as_ptr()
    }};
}

use crate::config::{SCHEME_CYCLE_MARKER, SCHEME_SELECT_PREFIX};
use crate::key_chord::{build_pressed_chord, chord_to_register_hotkey};
use crate::press_gesture::format_device_key;
use crate::send_guard;
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
    WM_SYSKEYUP, WM_XBUTTONDOWN, WNDCLASSEXW,
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
static RECORDING_HOOK: OnceLock<Mutex<isize>> = OnceLock::new();
static RECORDING_MOUSE_HOOK: OnceLock<Mutex<isize>> = OnceLock::new();
static ACTIVE_BINDINGS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
static ACTIVE_SENDER: OnceLock<Mutex<Option<mpsc::Sender<String>>>> = OnceLock::new();
static FORWARD_HWND: OnceLock<Mutex<isize>> = OnceLock::new();
static FORWARD_PREV_WNDPROC: OnceLock<Mutex<isize>> = OnceLock::new();
static DEVICE_NAME_CACHE: OnceLock<Mutex<HashMap<isize, String>>> = OnceLock::new();

fn device_cache() -> &'static Mutex<HashMap<isize, String>> {
    DEVICE_NAME_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn forward_hwnd() -> &'static Mutex<isize> {
    FORWARD_HWND.get_or_init(|| Mutex::new(0))
}

fn forward_prev_wndproc() -> &'static Mutex<isize> {
    FORWARD_PREV_WNDPROC.get_or_init(|| Mutex::new(0))
}

/// Raw Input 设备：标准键盘 + 蓝牙外设常用的 Consumer Control。
const RAW_INPUT_DEVICES: &[(u16, u16)] = &[
    (0x01, 0x06), // Keyboard
    (0x0C, 0x01), // Consumer Control
];

enum Cmd {
    BindAll(Vec<String>),
    BindSchemeSwitch(Option<String>),
    BindSchemeSelect(Vec<(String, String)>),
    StartRecording,
    StopRecording,
    AttachAppHwnd(isize),
    Shutdown,
}

fn recording_sender() -> &'static Mutex<Option<mpsc::Sender<String>>> {
    RECORDING_SENDER.get_or_init(|| Mutex::new(None))
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

fn resolve_active_binding(name: &str) -> Option<String> {
    let bindings = active_bindings().lock().unwrap();
    let chord = build_pressed_chord(name);
    if bindings.iter().any(|b| b == &chord) {
        return Some(chord);
    }
    if bindings.iter().any(|b| b == name) {
        return Some(name.to_string());
    }
    None
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
    "RAlt",
    "RControl",
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
];

pub struct HotkeyManager {
    cmd_tx: mpsc::Sender<Cmd>,
    event_rx: mpsc::Receiver<String>,
}

impl HotkeyManager {
    pub fn new() -> Self {
        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let (event_tx, event_rx) = mpsc::channel::<String>();
        thread::spawn(move || hotkey_thread(cmd_rx, event_tx));
        Self { cmd_tx, event_rx }
    }

    pub fn bind_all(&self, bindings: &[String]) {
        self.cmd_tx.send(Cmd::BindAll(bindings.to_vec())).ok();
    }

    pub fn bind_scheme_switch(&self, combo: Option<String>) {
        self.cmd_tx.send(Cmd::BindSchemeSwitch(combo)).ok();
    }

    pub fn bind_scheme_select(&self, bindings: Vec<(String, String)>) {
        self.cmd_tx.send(Cmd::BindSchemeSelect(bindings)).ok();
    }

    pub fn start_recording(&self) {
        self.cmd_tx.send(Cmd::StartRecording).ok();
    }

    pub fn stop_recording(&self) {
        self.cmd_tx.send(Cmd::StopRecording).ok();
    }

    pub fn attach_app_window(&self, hwnd: isize) {
        self.cmd_tx.send(Cmd::AttachAppHwnd(hwnd)).ok();
    }

    pub fn try_recv(&self) -> Option<String> {
        self.event_rx.try_recv().ok()
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
                    if bindings.is_empty() {
                        unsafe {
                            remove_keyboard_hook();
                        }
                    } else {
                        unsafe {
                            install_keyboard_hook();
                        }
                    }
                    if !recording_mode {
                        unsafe {
                            register_list(ctx_ptr, hwnd, &bindings);
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

fn dispatch_key_event(name: &str, is_keyup: bool, device: Option<&str>) -> bool {
    let body = format_device_key(device.unwrap_or(""), name);
    let payload = if is_keyup {
        format!("keyup:{body}")
    } else {
        body
    };
    if let Some(sender) = recording_sender().lock().unwrap().as_ref() {
        sender.send(payload).ok();
        return true;
    }
    if resolve_active_binding(name).is_some() {
        if let Some(sender) = active_sender().lock().unwrap().as_ref() {
            sender.send(payload).ok();
        }
        return true;
    }
    false
}

fn dispatch_media_key(name: &str) -> bool {
    dispatch_key_event(name, false, None)
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

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if send_guard::is_active() {
        return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
    }
    if code >= 0 {
        if let Some(sender) = recording_sender().lock().unwrap().as_ref() {
            let btn = match wparam as u32 {
                WM_LBUTTONDOWN => Some("LButton"),
                WM_RBUTTONDOWN => Some("RButton"),
                WM_MBUTTONDOWN => Some("MButton"),
                WM_XBUTTONDOWN => {
                    let info = *(lparam as *const MSLLHOOKSTRUCT);
                    let xbtn = (info.mouseData >> 16) as u16;
                    if xbtn == winapi::um::winuser::XBUTTON1 as u16 {
                        Some("XButton1")
                    } else if xbtn == winapi::um::winuser::XBUTTON2 as u16 {
                        Some("XButton2")
                    } else {
                        None
                    }
                }
                _ => None,
            };
            if let Some(name) = btn {
                sender.send(name.to_string()).ok();
            }
        }
    }
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if send_guard::is_active() {
        return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
    }
    let recording = is_recording();
    let is_key_down = wparam == WM_KEYDOWN as usize || wparam == WM_SYSKEYDOWN as usize;
    let is_key_up = wparam == WM_KEYUP as usize || wparam == WM_SYSKEYUP as usize;
    if code >= 0 && (is_key_down || is_key_up) {
        let kb = *(lparam as *const KBDLLHOOKSTRUCT);
        if kb.flags & LLKHF_INJECTED != 0 {
            return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
        }
        if let Some(name) = vk_to_name(kb.vkCode as u32) {
            if recording {
                if is_key_down {
                    if let Some(sender) = recording_sender().lock().unwrap().as_ref() {
                        sender.send(name.clone()).ok();
                    }
                } else if is_key_up {
                    if let Some(sender) = recording_sender().lock().unwrap().as_ref() {
                        sender.send(format!("keyup:{name}")).ok();
                    }
                }
                return CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam);
            }
            if let Some(dispatch) = resolve_active_binding(&name) {
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
        0x7C..=0x83 => Some(format!("F{}", vk - 0x7C + 13)),
        0x14 => Some("CapsLock".into()),
        0x70..=0x7B => Some(format!("F{}", vk - 0x70 + 1)),
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
        if send_guard::is_active() {
            return 1;
        }
        let id = wparam as u32;
        if id == SCHEME_SWITCH_HOTKEY_ID {
            let ctx_ptr = winuser::GetWindowLongPtrW(hwnd, winuser::GWLP_USERDATA) as *mut WndCtx;
            if !ctx_ptr.is_null() && (*ctx_ptr).scheme_switch_id.is_some() {
                (*ctx_ptr).tx.send(SCHEME_CYCLE_MARKER.to_string()).ok();
            }
            return 1;
        }
        let ctx_ptr = winuser::GetWindowLongPtrW(hwnd, winuser::GWLP_USERDATA) as *mut WndCtx;
        if !ctx_ptr.is_null() {
            if let Some(mapping_id) = (*ctx_ptr).scheme_select_ids.get(&id) {
                let marker = format!("{SCHEME_SELECT_PREFIX}{mapping_id}");
                (*ctx_ptr).tx.send(marker).ok();
                return 1;
            }
            if let Some(name) = (*ctx_ptr).names.get(&id) {
                (*ctx_ptr).tx.send(name.clone()).ok();
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
    // 常见蓝牙外设：consumer control 以位图方式上报，usage 常从 0x00E0 起连续展开。
    // 这里不能只看单字节内的 0..7 位，Volume Up/Down 往往落在更高位（如 0x00E9/0x00EA）。
    for (byte_index, byte) in data.iter().enumerate() {
        if *byte == 0 {
            continue;
        }
        for bit in 0..8u16 {
            if (*byte as u16) & (1 << bit) == 0 {
                continue;
            }
            let usage = 0x00E0u16 + (byte_index as u16 * 8) + bit;
            if let Some(name) = consumer_usage_to_name(usage) {
                return Some(name);
            }
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
    device_cache().lock().unwrap().insert(hdevice, name.clone());
    Some(name)
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
    if let Some((name, is_up)) = raw_input_to_event(raw) {
        return dispatch_key_event(&name, is_up, device.as_deref());
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
        if raw.header.dwType == RIM_TYPEHID {
            let hid = raw.data.hid();
            let len = hid.dwSizeHid as usize * hid.dwCount as usize;
            if len == 0 {
                return None;
            }
            let data = std::slice::from_raw_parts(hid.bRawData.as_ptr(), len);
            return scan_consumer_bytes(data).map(|n| (n, false));
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
