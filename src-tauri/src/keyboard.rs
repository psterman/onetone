use crate::key_chord::{is_left_alt_only, is_right_alt_only, parse_chord, MouseButton, SendToken, VkKey};
use crate::send_guard;
use winapi::um::winuser::{
    SendInput, INPUT, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY,
    KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
    MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, MOUSEINPUT, VK_ESCAPE, VK_RETURN, VK_RMENU,
    XBUTTON1, XBUTTON2,
};

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

/// Match AHK's `{vkA5sc138}` as closely as possible.
pub fn send_right_alt(duration_ms: u32) {
    let hold_ms = duration_ms.max(250) as u64;
    send_guard::run_guarded(hold_ms + 80, || {
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
    send_guard::run_guarded(hold_ms + 80, || {
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
            send_guard::run_guarded(hold + 100, || {
                send_token_sequence(&tokens, duration_ms);
            });
            true
        }
        Err(_) => false,
    }
}

pub fn send_escape() {
    send_guard::run_guarded(100, || {
        send_vk(VK_ESCAPE as u16, false, false);
        send_vk(VK_ESCAPE as u16, false, true);
    });
}

pub fn send_enter() {
    send_guard::run_guarded(100, || {
        send_vk(VK_RETURN as u16, false, false);
        send_vk(VK_RETURN as u16, false, true);
    });
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
