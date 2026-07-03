use crate::config::{canonical_trigger, is_volume_hotkey};

pub(crate) fn normalize_hardware_key(key: &str) -> String {
    match key {
        "AudioVolumeDown" | "VolumeDown" | "Audio_Volume_Down" => "Volume_Down".into(),
        "AudioVolumeUp" | "VolumeUp" | "Audio_Volume_Up" => "Volume_Up".into(),
        "AudioVolumeMute" | "VolumeMute" | "Audio_Volume_Mute" => "Volume_Mute".into(),
        "RControl" => "RCtrl".into(),
        "LControl" | "ControlLeft" => "LCtrl".into(),
        "Control" => "LCtrl".into(),
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
