use crate::key_chord::{
    is_left_alt_only, is_right_alt_only, parse_chord, MouseButton, SendToken, VkKey,
};
use crate::send_guard;
use std::sync::Mutex;
use std::sync::OnceLock;
use winapi::um::winuser::{
    SendInput, INPUT, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY,
    KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
    MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, MOUSEINPUT, VK_ESCAPE, VK_RETURN, VK_RMENU, XBUTTON1,
    XBUTTON2,
};

static OUR_HWND: OnceLock<Mutex<isize>> = OnceLock::new();
static LAST_EXTERNAL_HWND: OnceLock<Mutex<isize>> = OnceLock::new();

pub fn set_our_hwnd(hwnd: isize) {
    *OUR_HWND.get_or_init(|| Mutex::new(0)).lock().unwrap() = hwnd;
}

#[cfg(windows)]
pub fn track_foreground_for_send() {
    use winapi::um::processthreadsapi::GetCurrentProcessId;
    use winapi::um::winuser::{GetForegroundWindow, GetWindowThreadProcessId, IsWindow};

    unsafe {
        let fg = GetForegroundWindow();
        if fg.is_null() || IsWindow(fg) == 0 {
            return;
        }
        let our = *OUR_HWND.get_or_init(|| Mutex::new(0)).lock().unwrap();
        if our != 0 && fg as isize == our {
            return;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(fg, &mut pid);
        if pid == GetCurrentProcessId() {
            return;
        }
        *LAST_EXTERNAL_HWND
            .get_or_init(|| Mutex::new(0))
            .lock()
            .unwrap() = fg as isize;
    }
}

#[cfg(not(windows))]
pub fn track_foreground_for_send() {}

#[cfg(windows)]
pub fn restore_external_foreground() -> bool {
    let target_hwnd = {
        let hwnd = *LAST_EXTERNAL_HWND
            .get_or_init(|| Mutex::new(0))
            .lock()
            .unwrap();
        if hwnd == 0 {
            return false;
        }
        hwnd as winapi::shared::windef::HWND
    };
    focus_window(target_hwnd)
}

/// Pick any visible top-level window that is not OneTone, then focus it.
/// Used when Quick Start / settings own FG and no LAST_EXTERNAL_HWND was tracked.
#[cfg(windows)]
pub fn focus_any_external_top_level() -> bool {
    use winapi::shared::minwindef::{BOOL, LPARAM, TRUE};
    use winapi::shared::windef::HWND;
    use winapi::um::processthreadsapi::GetCurrentProcessId;
    use winapi::um::winuser::{
        EnumWindows, GetClassNameW, GetWindow, GetWindowLongW, GetWindowThreadProcessId, IsIconic,
        IsWindowVisible, GWL_EXSTYLE, GWL_STYLE, GW_OWNER, WS_EX_TOOLWINDOW, WS_VISIBLE,
    };

    struct Ctx {
        our_pid: u32,
        our_hwnd: isize,
        found: isize,
    }

    unsafe extern "system" fn enum_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam as *mut Ctx);
        if ctx.found != 0 {
            return TRUE;
        }
        if ctx.our_hwnd != 0 && hwnd as isize == ctx.our_hwnd {
            return TRUE;
        }
        if IsWindowVisible(hwnd) == 0 {
            return TRUE;
        }
        if IsIconic(hwnd) != 0 {
            return TRUE;
        }
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        if (style & WS_VISIBLE) == 0 {
            return TRUE;
        }
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if (ex & WS_EX_TOOLWINDOW) != 0 {
            return TRUE;
        }
        if !GetWindow(hwnd, GW_OWNER).is_null() {
            return TRUE;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 || pid == ctx.our_pid {
            return TRUE;
        }
        // WebView2 / Chromium host windows share the app UI; never treat as external FG.
        let mut class_buf = [0u16; 256];
        let class_len = GetClassNameW(hwnd, class_buf.as_mut_ptr(), class_buf.len() as i32);
        if class_len > 0 {
            let class = String::from_utf16_lossy(&class_buf[..class_len as usize]).to_ascii_lowercase();
            if class.contains("chrome_widgetwin")
                || class.contains("chrome_renderwidget")
                || class.contains("intermediate d3d")
                || class.contains("webview")
            {
                return TRUE;
            }
        }
        ctx.found = hwnd as isize;
        TRUE
    }

    let our_hwnd = *OUR_HWND.get_or_init(|| Mutex::new(0)).lock().unwrap();
    let mut ctx = Ctx {
        our_pid: unsafe { GetCurrentProcessId() },
        our_hwnd,
        found: 0,
    };
    unsafe {
        EnumWindows(Some(enum_cb), &mut ctx as *mut Ctx as LPARAM);
    }
    if ctx.found == 0 {
        return false;
    }
    *LAST_EXTERNAL_HWND
        .get_or_init(|| Mutex::new(0))
        .lock()
        .unwrap() = ctx.found;
    focus_window(ctx.found as winapi::shared::windef::HWND)
}

#[cfg(not(windows))]
pub fn focus_any_external_top_level() -> bool {
    false
}

/// Show a window without activating it (does not steal foreground).
#[cfg(windows)]
pub fn show_window_no_activate(target_hwnd: winapi::shared::windef::HWND) -> bool {
    use winapi::um::winuser::{IsWindow, ShowWindow, SW_SHOWNOACTIVATE};
    unsafe {
        if target_hwnd.is_null() || IsWindow(target_hwnd) == 0 {
            return false;
        }
        ShowWindow(target_hwnd, SW_SHOWNOACTIVATE) != 0
    }
}

#[cfg(windows)]
pub fn focus_window(target_hwnd: winapi::shared::windef::HWND) -> bool {
    use winapi::um::processthreadsapi::GetCurrentProcessId;
    use winapi::um::winuser::{
        AllowSetForegroundWindow, AttachThreadInput, BringWindowToTop, GetForegroundWindow,
        GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, SetForegroundWindow,
        ShowWindow, SW_RESTORE, SW_SHOW,
    };

    const ASFW_ANY: u32 = 0xFFFF_FFFF;

    unsafe {
        if target_hwnd.is_null() || IsWindow(target_hwnd) == 0 {
            return false;
        }
        // Tray / hidden main windows (common for WeChat): make visible before focus.
        if IsWindowVisible(target_hwnd) == 0 {
            ShowWindow(target_hwnd, SW_SHOW);
        }
        // Only restore when minimized. Unconditional SW_RESTORE demotes a maximized
        // window back to normal size (looks like a random resize).
        if IsIconic(target_hwnd) != 0 {
            ShowWindow(target_hwnd, SW_RESTORE);
        }
        let fg = GetForegroundWindow();
        if fg == target_hwnd {
            return true;
        }
        let mut fg_pid = 0u32;
        let mut target_pid = 0u32;
        let fg_thread = GetWindowThreadProcessId(fg, &mut fg_pid);
        let target_thread = GetWindowThreadProcessId(target_hwnd, &mut target_pid);
        let our_pid = GetCurrentProcessId();
        // AttachThreadInput against our own WebView2/UI threads deadlocks the overlay
        // (soft-keyboard clicks → focus Codex while overlay owns FG). Never attach when
        // either side is our process; also never join the calling worker into the queue.
        let use_attach = fg_pid != 0
            && target_pid != 0
            && fg_pid != our_pid
            && target_pid != our_pid
            && fg_thread != 0
            && target_thread != 0
            && fg_thread != target_thread;
        if use_attach {
            AttachThreadInput(fg_thread, target_thread, 1);
        }
        AllowSetForegroundWindow(ASFW_ANY);
        BringWindowToTop(target_hwnd);
        let ok = SetForegroundWindow(target_hwnd) != 0;
        if use_attach {
            AttachThreadInput(fg_thread, target_thread, 0);
        }
        ok
    }
}

#[cfg(not(windows))]
pub fn focus_window(_target_hwnd: isize) -> bool {
    false
}

#[cfg(not(windows))]
pub fn restore_external_foreground() -> bool {
    false
}

fn make_key_input(vk: u16, extended: bool, keyup: bool) -> INPUT {
    let mut input = INPUT {
        type_: INPUT_KEYBOARD,
        u: unsafe { std::mem::zeroed() },
    };
    unsafe {
        *input.u.ki_mut() = KEYBDINPUT {
            wVk: vk,
            wScan: 0,
            dwFlags: (if extended { KEYEVENTF_EXTENDEDKEY } else { 0 })
                | (if keyup { KEYEVENTF_KEYUP } else { 0 }),
            time: 0,
            dwExtraInfo: 0,
        };
    }
    input
}

fn make_scan_input(scan: u16, extended: bool, keyup: bool) -> INPUT {
    let mut input = INPUT {
        type_: INPUT_KEYBOARD,
        u: unsafe { std::mem::zeroed() },
    };
    unsafe {
        *input.u.ki_mut() = KEYBDINPUT {
            wVk: 0,
            wScan: scan,
            dwFlags: KEYEVENTF_SCANCODE
                | (if extended { KEYEVENTF_EXTENDEDKEY } else { 0 })
                | (if keyup { KEYEVENTF_KEYUP } else { 0 }),
            time: 0,
            dwExtraInfo: 0,
        };
    }
    input
}

fn mouse_down_flag(btn: MouseButton) -> (u32, u32) {
    match btn {
        MouseButton::Left => (MOUSEEVENTF_LEFTDOWN, 0),
        MouseButton::Right => (MOUSEEVENTF_RIGHTDOWN, 0),
        MouseButton::Middle => (MOUSEEVENTF_MIDDLEDOWN, 0),
        MouseButton::X1 => (MOUSEEVENTF_XDOWN, XBUTTON1 as u32),
        MouseButton::X2 => (MOUSEEVENTF_XDOWN, XBUTTON2 as u32),
    }
}

fn mouse_up_flag(btn: MouseButton) -> (u32, u32) {
    match btn {
        MouseButton::Left => (MOUSEEVENTF_LEFTUP, 0),
        MouseButton::Right => (MOUSEEVENTF_RIGHTUP, 0),
        MouseButton::Middle => (MOUSEEVENTF_MIDDLEUP, 0),
        MouseButton::X1 => (MOUSEEVENTF_XUP, XBUTTON1 as u32),
        MouseButton::X2 => (MOUSEEVENTF_XUP, XBUTTON2 as u32),
    }
}

fn make_mouse_input(btn: MouseButton, keyup: bool) -> INPUT {
    let (flag, data) = if keyup {
        mouse_up_flag(btn)
    } else {
        mouse_down_flag(btn)
    };
    let mut input = INPUT {
        type_: INPUT_MOUSE,
        u: unsafe { std::mem::zeroed() },
    };
    unsafe {
        *input.u.mi_mut() = MOUSEINPUT {
            dx: 0,
            dy: 0,
            mouseData: data,
            dwFlags: flag,
            time: 0,
            dwExtraInfo: 0,
        };
    }
    input
}

fn token_to_press_input(token: SendToken) -> INPUT {
    match token {
        SendToken::Key(VkKey { vk, extended }) => make_key_input(vk, extended, false),
        SendToken::Scan { code, extended } => make_scan_input(code, extended, false),
        SendToken::Mouse(btn) => make_mouse_input(btn, false),
    }
}

fn token_to_release_input(token: SendToken) -> INPUT {
    match token {
        SendToken::Key(VkKey { vk, extended }) => make_key_input(vk, extended, true),
        SendToken::Scan { code, extended } => make_scan_input(code, extended, true),
        SendToken::Mouse(btn) => make_mouse_input(btn, true),
    }
}

fn send_inputs(inputs: &mut [INPUT]) {
    if inputs.is_empty() {
        return;
    }
    unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_mut_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        );
    }
}

fn send_vk(vk: u16, extended: bool, keyup: bool) {
    let mut input = make_key_input(vk, extended, keyup);
    send_inputs(std::slice::from_mut(&mut input));
}

fn send_scancode(scan: u16, extended: bool, keyup: bool) {
    let mut input = make_scan_input(scan, extended, keyup);
    send_inputs(std::slice::from_mut(&mut input));
}

fn send_token_sequence(tokens: &[SendToken], hold_ms: u32) -> bool {
    if tokens.is_empty() {
        return false;
    }

    let hold = hold_ms.max(35) as u64;
    let mut press: Vec<INPUT> = tokens.iter().copied().map(token_to_press_input).collect();
    send_inputs(&mut press);

    std::thread::sleep(std::time::Duration::from_millis(hold));

    let mut release: Vec<INPUT> = tokens
        .iter()
        .rev()
        .copied()
        .map(token_to_release_input)
        .collect();
    send_inputs(&mut release);
    true
}

/// Press a chord down without releasing (hold-to-talk synthesis).
///
/// Guard is echo-suppression only (~120ms). Do **not** keep `send_guard` armed for
/// the whole physical hold — a multi-minute guard swallows Ctrl/Shift/D globally and
/// makes Soft Pad / the desktop feel frozen (假死) while Numpad0 / ACT10 is held.
pub fn press_chord(combo: &str) -> bool {
    let trimmed = combo.trim();
    if trimmed.is_empty() {
        return false;
    }
    if is_right_alt_only(trimmed) || is_left_alt_only(trimmed) {
        return false;
    }
    match parse_chord(trimmed) {
        Ok(tokens) => {
            send_guard::arm_keys(&send_guard::guard_keys_from_combo(trimmed));
            send_guard::run_guarded(120, || {
                let mut press: Vec<INPUT> =
                    tokens.iter().copied().map(token_to_press_input).collect();
                send_inputs(&mut press);
            });
            true
        }
        Err(_) => false,
    }
}

/// Release a previously pressed chord (keyup half of hold-to-talk).
pub fn release_chord(combo: &str) -> bool {
    let trimmed = combo.trim();
    if trimmed.is_empty() {
        return false;
    }
    if is_right_alt_only(trimmed) || is_left_alt_only(trimmed) {
        return false;
    }
    match parse_chord(trimmed) {
        Ok(tokens) => {
            // Keep guard armed across keyup + short drain so LL-hook / hotkey echo
            // cannot re-enter hold start (observed as double start/release → 假死).
            send_guard::arm_keys(&send_guard::guard_keys_from_combo(trimmed));
            send_guard::run_guarded(220, || {
                let mut release: Vec<INPUT> = tokens
                    .iter()
                    .rev()
                    .copied()
                    .map(token_to_release_input)
                    .collect();
                send_inputs(&mut release);
            });
            true
        }
        Err(_) => false,
    }
}

/// Match AHK's `{vkA5sc138}` as closely as possible.
pub fn send_right_alt(duration_ms: u32) {
    let hold_ms = duration_ms.max(250) as u64;
    let guard_ms = hold_ms + 80;
    send_guard::arm_keys(&send_guard::guard_keys_from_combo("RAlt"));
    send_guard::run_guarded(guard_ms, || {
        send_vk(VK_RMENU as u16, true, false);
        std::thread::sleep(std::time::Duration::from_millis(hold_ms));
        send_vk(VK_RMENU as u16, true, true);

        send_scancode(0x38, true, false);
        std::thread::sleep(std::time::Duration::from_millis(30));
        send_scancode(0x38, true, true);
    });
}

pub fn send_left_alt(duration_ms: u32) {
    let hold_ms = duration_ms.max(250) as u64;
    let guard_ms = hold_ms + 80;
    send_guard::arm_keys(&send_guard::guard_keys_from_combo("LAlt"));
    send_guard::run_guarded(guard_ms, || {
        send_vk(0xA4, false, false);
        std::thread::sleep(std::time::Duration::from_millis(hold_ms));
        send_vk(0xA4, false, true);

        send_scancode(0x38, false, false);
        std::thread::sleep(std::time::Duration::from_millis(30));
        send_scancode(0x38, false, true);
    });
}

/// 发送目标键/组合键：键盘、媒体键、鼠标键、扫描码与别名。
pub fn send_chord(combo: &str, duration_ms: u32) -> bool {
    let trimmed = combo.trim();
    if trimmed.is_empty() {
        return false;
    }

    if is_right_alt_only(trimmed) {
        send_right_alt(duration_ms);
        return true;
    }

    if is_left_alt_only(trimmed) {
        send_left_alt(duration_ms);
        return true;
    }

    match parse_chord(trimmed) {
        Ok(tokens) => {
            let hold = duration_ms.max(35) as u64;
            let guard_ms = hold + 100;
            send_guard::arm_keys(&send_guard::guard_keys_from_combo(trimmed));
            send_guard::run_guarded(guard_ms, || {
                send_token_sequence(&tokens, duration_ms);
            });
            true
        }
        Err(_) => false,
    }
}

pub fn send_escape() {
    send_guard::arm_keys(&send_guard::guard_keys_from_combo("Escape"));
    send_guard::run_guarded(100, || {
        send_vk(VK_ESCAPE as u16, false, false);
        send_vk(VK_ESCAPE as u16, false, true);
    });
}

pub fn send_enter() {
    send_guard::arm_keys(&send_guard::guard_keys_from_combo("Enter"));
    send_guard::run_guarded(100, || {
        send_vk(VK_RETURN as u16, false, false);
        send_vk(VK_RETURN as u16, false, true);
    });
}

/// Pulse a virtual-key (down → brief hold → up). Used by overlay numpad digit taps.
pub fn tap_vk(vk: u16, extended: bool, hold_ms: u32) {
    let hold = hold_ms.max(25) as u64;
    send_guard::arm_keys(&[]);
    send_guard::run_guarded(hold + 40, || {
        send_vk(vk, extended, false);
        std::thread::sleep(std::time::Duration::from_millis(hold));
        send_vk(vk, extended, true);
    });
}

/// Left-click a point inside `hwnd`'s client area using relative ratios (0.0–1.0).
#[cfg(windows)]
pub fn click_client_relative(
    hwnd: winapi::shared::windef::HWND,
    x_ratio: f32,
    y_ratio: f32,
) -> bool {
    use winapi::shared::windef::{POINT, RECT};
    use winapi::um::winuser::{ClientToScreen, GetClientRect, SetCursorPos};

    unsafe {
        if hwnd.is_null() {
            return false;
        }
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetClientRect(hwnd, &mut rect) == 0 {
            return false;
        }
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 0 || height <= 0 {
            return false;
        }

        let x_ratio = x_ratio.clamp(0.08, 0.92);
        let y_ratio = y_ratio.clamp(0.08, 0.95);
        let client_x = rect.left + (width as f32 * x_ratio).round() as i32;
        let client_y = rect.top + (height as f32 * y_ratio).round() as i32;
        let mut pt = POINT {
            x: client_x,
            y: client_y,
        };
        if ClientToScreen(hwnd, &mut pt) == 0 {
            return false;
        }

        send_guard::run_guarded(120, || {
            SetCursorPos(pt.x, pt.y);
            std::thread::sleep(std::time::Duration::from_millis(35));
            let down = make_mouse_input(MouseButton::Left, false);
            let up = make_mouse_input(MouseButton::Left, true);
            send_inputs(&mut [down, up]);
        });
        true
    }
}

/// Client-area click via PostMessage — does not depend on Z-order (Soft Pad on top).
#[cfg(windows)]
pub fn click_client_relative_via_message(
    hwnd: winapi::shared::windef::HWND,
    x_ratio: f32,
    y_ratio: f32,
) -> bool {
    use winapi::shared::windef::RECT;
    use winapi::um::winuser::{GetClientRect, PostMessageW, WM_LBUTTONDOWN, WM_LBUTTONUP};

    unsafe {
        if hwnd.is_null() {
            return false;
        }
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetClientRect(hwnd, &mut rect) == 0 {
            return false;
        }
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 0 || height <= 0 {
            return false;
        }
        let x_ratio = x_ratio.clamp(0.08, 0.92);
        let y_ratio = y_ratio.clamp(0.08, 0.95);
        let x = (width as f32 * x_ratio).round() as i32;
        let y = (height as f32 * y_ratio).round() as i32;
        let lp = ((y as u32) << 16) | (x as u32 & 0xffff);
        let down_ok = PostMessageW(hwnd, WM_LBUTTONDOWN, 1, lp as isize) != 0;
        std::thread::sleep(std::time::Duration::from_millis(30));
        let up_ok = PostMessageW(hwnd, WM_LBUTTONUP, 0, lp as isize) != 0;
        down_ok && up_ok
    }
}

#[cfg(not(windows))]
pub fn click_client_relative(_hwnd: isize, _x_ratio: f32, _y_ratio: f32) -> bool {
    false
}

#[cfg(not(windows))]
pub fn click_client_relative_via_message(_hwnd: isize, _x_ratio: f32, _y_ratio: f32) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use crate::key_chord::parse_chord;

    #[test]
    fn chord_aliases() {
        assert!(parse_chord("Ctrl+Alt+Space").is_ok());
        assert!(parse_chord("LCtrl+RAlt+F13").is_ok());
        assert!(parse_chord("Win+Shift+S").is_ok());
        assert!(parse_chord("Ctrl+Shift").is_ok());
        assert!(parse_chord("Volume_Up").is_ok());
        assert!(parse_chord("XButton1").is_ok());
    }
}
