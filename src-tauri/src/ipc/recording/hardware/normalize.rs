use crate::config::{canonical_trigger, is_volume_hotkey};

pub(crate) fn normalize_hardware_key(key: &str) -> String {
    match key {
        "AudioVolumeDown" | "VolumeDown" | "Audio_Volume_Down" => "Volume_Down".into(),
        "AudioVolumeUp" | "VolumeUp" | "Audio_Volume_Up" => "Volume_Up".into(),
        "AudioVolumeMute" | "VolumeMute" | "Audio_Volume_Mute" => "Volume_Mute".into(),
        "RControl" => "RCtrl".into(),
        "LControl" | "ControlLeft" => "LCtrl".into(),
        "Control" | "Ctrl" => "LCtrl".into(),
        "LShift" | "ShiftLeft" => "LShift".into(),
        "RShift" | "ShiftRight" => "RShift".into(),
        "Shift" => "LShift".into(),
        "LAlt" | "AltLeft" | "LMenu" => "LAlt".into(),
        "RAlt" | "AltRight" | "RMenu" => "RAlt".into(),
        "Alt" => "LAlt".into(),
        "LWin" | "MetaLeft" => "LWin".into(),
        "RWin" | "MetaRight" => "RWin".into(),
        other => other.to_string(),
    }
}

pub(crate) fn build_hardware_record_chord(terminal: &str) -> String {
    crate::key_chord::build_pressed_chord(&normalize_hardware_key(terminal))
}

pub(crate) fn is_recordable_target_hotkey(key: &str) -> bool {
    is_volume_hotkey(key)
        || matches!(
            canonical_trigger(key).as_str(),
            "Media_Next"
                | "Media_Prev"
                | "Media_Play_Pause"
                | "Media_Stop"
                | "Browser_Back"
                | "Browser_Forward"
                | "Browser_Refresh"
                | "Launch_Mail"
                | "Launch_App1"
                | "Launch_App2"
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_keys_are_not_folded_to_xbutton() {
        assert_eq!(normalize_hardware_key("Browser_Back"), "Browser_Back");
        assert_eq!(normalize_hardware_key("Browser_Forward"), "Browser_Forward");
        assert_eq!(normalize_hardware_key("XButton1"), "XButton1");
        assert_eq!(normalize_hardware_key("XButton2"), "XButton2");
    }
}
