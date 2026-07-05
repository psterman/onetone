#![cfg(windows)]

//! XInput gamepad polling for extension-layer trigger capture.

use winapi::shared::minwindef::DWORD;
use winapi::shared::winerror::ERROR_SUCCESS;
use winapi::um::xinput::{
    XInputGetState, XINPUT_GAMEPAD_A, XINPUT_GAMEPAD_B, XINPUT_GAMEPAD_BACK,
    XINPUT_GAMEPAD_DPAD_DOWN, XINPUT_GAMEPAD_DPAD_LEFT, XINPUT_GAMEPAD_DPAD_RIGHT,
    XINPUT_GAMEPAD_DPAD_UP, XINPUT_GAMEPAD_LEFT_SHOULDER, XINPUT_GAMEPAD_LEFT_THUMB,
    XINPUT_GAMEPAD_RIGHT_SHOULDER, XINPUT_GAMEPAD_RIGHT_THUMB, XINPUT_GAMEPAD_START,
    XINPUT_GAMEPAD_X, XINPUT_GAMEPAD_Y, XINPUT_STATE, XUSER_MAX_COUNT,
};

use crate::input_ext::InputSource;

const GAMEPAD_BUTTONS: &[(u16, &str)] = &[
    (XINPUT_GAMEPAD_A, "Gamepad_A"),
    (XINPUT_GAMEPAD_B, "Gamepad_B"),
    (XINPUT_GAMEPAD_X, "Gamepad_X"),
    (XINPUT_GAMEPAD_Y, "Gamepad_Y"),
    (XINPUT_GAMEPAD_LEFT_SHOULDER, "Gamepad_LB"),
    (XINPUT_GAMEPAD_RIGHT_SHOULDER, "Gamepad_RB"),
    (XINPUT_GAMEPAD_BACK, "Gamepad_Back"),
    (XINPUT_GAMEPAD_START, "Gamepad_Start"),
    (XINPUT_GAMEPAD_LEFT_THUMB, "Gamepad_LS"),
    (XINPUT_GAMEPAD_RIGHT_THUMB, "Gamepad_RS"),
    (XINPUT_GAMEPAD_DPAD_UP, "Gamepad_DpadUp"),
    (XINPUT_GAMEPAD_DPAD_DOWN, "Gamepad_DpadDown"),
    (XINPUT_GAMEPAD_DPAD_LEFT, "Gamepad_DpadLeft"),
    (XINPUT_GAMEPAD_DPAD_RIGHT, "Gamepad_DpadRight"),
];

pub fn gamepad_button_name(mask: u16) -> Option<&'static str> {
    GAMEPAD_BUTTONS
        .iter()
        .find(|(m, _)| mask & *m != 0)
        .map(|(_, name)| *name)
}

pub struct XInputSource {
    prev_buttons: [u16; XUSER_MAX_COUNT as usize],
}

impl XInputSource {
    pub fn new() -> Self {
        Self {
            prev_buttons: [0; XUSER_MAX_COUNT as usize],
        }
    }

    fn poll_index(&mut self, idx: usize) -> Vec<(String, String)> {
        let mut state: XINPUT_STATE = unsafe { std::mem::zeroed() };
        let rc = unsafe { XInputGetState(idx as DWORD, &mut state) };
        if rc != ERROR_SUCCESS {
            self.prev_buttons[idx] = 0;
            return Vec::new();
        }
        let pressed = state.Gamepad.wButtons;
        let newly = pressed & !self.prev_buttons[idx];
        self.prev_buttons[idx] = pressed;
        if newly == 0 {
            return Vec::new();
        }
        let device = format!("xinput:{idx}");
        GAMEPAD_BUTTONS
            .iter()
            .filter(|(mask, _)| newly & *mask != 0)
            .map(|(_, name)| (device.clone(), (*name).to_string()))
            .collect()
    }
}

impl InputSource for XInputSource {
    fn name(&self) -> &'static str {
        "xinput"
    }

    fn poll(&mut self) -> Vec<String> {
        let mut out = Vec::new();
        for idx in 0..XUSER_MAX_COUNT as usize {
            for (device, key) in self.poll_index(idx) {
                out.push(crate::press_gesture::format_device_key(&device, &key));
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gamepad_mask_to_name() {
        assert_eq!(gamepad_button_name(XINPUT_GAMEPAD_A), Some("Gamepad_A"));
        assert_eq!(gamepad_button_name(XINPUT_GAMEPAD_DPAD_UP), Some("Gamepad_DpadUp"));
        assert_eq!(gamepad_button_name(0), None);
    }
}
