//! 目标键解析：键盘 VK、扫描码、媒体键、鼠标键、组合键与别名回退。

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct VkKey {
    pub vk: u16,
    pub extended: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
    X1,
    X2,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SendToken {
    Key(VkKey),
    Scan { code: u16, extended: bool },
    Mouse(MouseButton),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TokenKind {
    Modifier,
    Key,
    Mouse,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct TokenDef {
    send: SendToken,
    kind: TokenKind,
}

/// 解析组合键；修饰键在前，终端键（主键/鼠标/媒体）在最后。
/// 允许多修饰键组合（如 `Ctrl+Shift`）。
pub fn parse_chord(combo: &str) -> Result<Vec<SendToken>, String> {
    let trimmed = combo.trim();
    if trimmed.is_empty() {
        return Err("empty chord".into());
    }

    let parts: Vec<&str> = trimmed
        .split('+')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if parts.is_empty() {
        return Err("empty chord".into());
    }

    let defs: Vec<TokenDef> = parts
        .iter()
        .map(|p| token_def(p).ok_or_else(|| format!("unsupported key token: {p}")))
        .collect::<Result<_, _>>()?;

    validate_chord(&defs)?;

    Ok(defs.iter().map(|d| d.send).collect())
}

fn validate_chord(defs: &[TokenDef]) -> Result<(), String> {
    if defs.iter().all(|d| d.kind == TokenKind::Modifier) {
        return Ok(());
    }

    let terminal_idx = defs
        .iter()
        .rposition(|d| d.kind != TokenKind::Modifier)
        .ok_or_else(|| "empty chord".to_string())?;

    if defs[terminal_idx + 1..]
        .iter()
        .any(|d| d.kind != TokenKind::Modifier)
    {
        return Err("only one terminal key or mouse button allowed".into());
    }

    if defs[..terminal_idx]
        .iter()
        .any(|d| d.kind != TokenKind::Modifier)
    {
        return Err("non-modifier must be the last token".into());
    }

    Ok(())
}

/// 解析为 RegisterHotKey 所需的 (fsModifiers, vk)；仅支持「修饰键 + 单终端键」。
pub fn chord_to_register_hotkey(combo: &str) -> Result<(u32, u16), String> {
    const MOD_ALT: u32 = 0x0001;
    const MOD_CONTROL: u32 = 0x0002;
    const MOD_SHIFT: u32 = 0x0004;
    const MOD_WIN: u32 = 0x0008;
    const MOD_NOREPEAT: u32 = 0x4000;

    let tokens = parse_chord(combo)?;
    if tokens.is_empty() {
        return Err("empty chord".into());
    }
    let mut mods: u32 = MOD_NOREPEAT;
    let mut terminal_vk: Option<u16> = None;
    for token in tokens {
        match token {
            SendToken::Key(VkKey { vk, .. }) if is_modifier_vk(vk) => {
                mods |= match vk {
                    0xA2 | 0xA3 => MOD_CONTROL,
                    0xA0 | 0xA1 => MOD_SHIFT,
                    0xA4 | 0xA5 => MOD_ALT,
                    0x5B | 0x5C => MOD_WIN,
                    _ => continue,
                };
            }
            SendToken::Key(VkKey { vk, .. }) => {
                if terminal_vk.is_some() {
                    return Err("only one terminal key allowed for hotkey".into());
                }
                terminal_vk = Some(vk);
            }
            _ => return Err("unsupported token for hotkey registration".into()),
        }
    }
    let vk = terminal_vk.ok_or_else(|| "hotkey requires a non-modifier key".to_string())?;
    if mods == MOD_NOREPEAT {
        return Err("hotkey requires at least one modifier".into());
    }
    Ok((mods, vk))
}

fn is_side_modifier_name(name: &str) -> bool {
    matches!(
        name,
        "LCtrl" | "RCtrl" | "LShift" | "RShift" | "LAlt" | "RAlt" | "LWin" | "RWin"
    )
}

pub fn is_modifier_name(name: &str) -> bool {
    is_side_modifier_name(name) || matches!(name.trim(), "Ctrl" | "Shift" | "Alt" | "Win")
}

pub fn chord_parts(chord: &str) -> Vec<String> {
    chord
        .split('+')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

pub fn is_modifier_only_chord(chord: &str) -> bool {
    let parts = chord_parts(chord);
    !parts.is_empty() && parts.iter().all(|p| is_modifier_name(p))
}

fn canonical_chord_token(token: &str) -> String {
    match token.trim() {
        "AltRight" | "RMenu" => "RAlt".into(),
        "ControlRight" | "RControl" => "RCtrl".into(),
        "ShiftRight" => "RShift".into(),
        "ControlLeft" | "LControl" => "LCtrl".into(),
        "ShiftLeft" => "LShift".into(),
        "AltLeft" | "LMenu" => "LAlt".into(),
        other => other.to_string(),
    }
}

pub fn chord_token_matches(stored: &str, pressed: &str) -> bool {
    let s = canonical_chord_token(stored);
    let p = canonical_chord_token(pressed);
    if s == p {
        return true;
    }
    match s.as_str() {
        "Ctrl" => matches!(p.as_str(), "LCtrl" | "RCtrl"),
        "Shift" => matches!(p.as_str(), "LShift" | "RShift"),
        "Alt" => matches!(p.as_str(), "LAlt" | "RAlt"),
        "Win" => matches!(p.as_str(), "LWin" | "RWin"),
        _ => false,
    }
}

/// App-native push-to-talk chords — must reach the foreground app physically;
/// OneTone only synthesizes them from a separate trigger (e.g. PageDown long-press).
/// Codex Start Dictation: Ctrl+Shift+D (hold). Cursor Voice Mode: Ctrl+Shift+Space (toggle).
pub fn is_hold_to_talk_chord(combo: &str) -> bool {
    let c = combo.trim();
    chords_equivalent("Ctrl+Shift+D", c) || is_toggle_voice_chord(c)
}

/// Cursor native Voice Mode — fires as a toggle pulse, not a held modifier chord.
pub fn is_toggle_voice_chord(combo: &str) -> bool {
    chords_equivalent("Ctrl+Shift+Space", combo.trim())
}

/// Bare typing / dialog keys that must reach the focused app.
/// Soft Pad documents Codex chords like Enter/Escape for `stopOrSend` / `cancel`, but
/// registering them as global hotkeys (or LL-hook swallow) hijacks chat send / dialogs.
pub fn is_pass_through_app_key(combo: &str) -> bool {
    let c = combo.trim();
    if c.is_empty() || c.contains('+') {
        return false;
    }
    matches!(
        c,
        "Enter"
            | "Return"
            | "Escape"
            | "Esc"
            | "Tab"
            | "Space"
            | "Backspace"
            | "Delete"
            | "Insert"
            | "Home"
            | "End"
            | "PageUp"
            | "PageDown"
            | "Up"
            | "Down"
            | "Left"
            | "Right"
            | "ArrowUp"
            | "ArrowDown"
            | "ArrowLeft"
            | "ArrowRight"
    )
}

/// Soft Pad / Micro `agentBindings.triggerBinding` values that are *target* chords:
/// OneTone synthesizes them into Codex via SendInput. They must never be
/// `RegisterHotKey`'d — Windows would deliver WM_HOTKEY to OneTone and Codex
/// would never see the injection (Ctrl+K / Ctrl+N look "fired" but do nothing).
pub fn is_app_synthesize_target_chord(combo: &str) -> bool {
    let c = combo.trim();
    if c.is_empty() {
        return false;
    }
    if is_hold_to_talk_chord(c) || is_pass_through_app_key(c) {
        return true;
    }
    // Keep in sync with agent::bindings_build::default_key_for_slot (non-empty rows).
    const TARGETS: &[&str] = &[
        "Ctrl+K",
        "Ctrl+N",
        "Ctrl+F",
        "Ctrl+Alt+N",
        "Ctrl+Z",
        "Ctrl+Shift+G",
        "Ctrl+Alt+B",
        "Ctrl+B",
        "Ctrl+,",
        "Ctrl+[",
        "Ctrl+]",
        "Ctrl+`",
        "Ctrl+Shift+B",
        "Ctrl+T",
        "Ctrl+L",
        "Ctrl+Alt+S",
        "Ctrl+Alt+P",
        "Ctrl+Alt+Shift+P",
        "Ctrl+Alt+R",
        "Ctrl+Alt+,",
        "Ctrl+Alt+.",
        "Ctrl+Alt+M",
        "Ctrl+Alt+A",
    ];
    TARGETS.iter().any(|t| chords_equivalent(t, c))
}

/// Compare stored binding chord with live pressed chord (Ctrl+Alt+C ≈ LCtrl+LAlt+C).
pub fn chords_equivalent(stored: &str, pressed: &str) -> bool {
    let stored_parts = chord_parts(stored);
    let pressed_parts = chord_parts(pressed);
    if stored_parts.len() != pressed_parts.len() {
        return false;
    }
    let mut used = vec![false; pressed_parts.len()];
    for sp in &stored_parts {
        let mut found = false;
        for (i, pp) in pressed_parts.iter().enumerate() {
            if used[i] {
                continue;
            }
            if chord_token_matches(sp, pp) {
                used[i] = true;
                found = true;
                break;
            }
        }
        if !found {
            return false;
        }
    }
    true
}

fn dedupe_chord_parts(parts: &mut Vec<String>) {
    let mut out: Vec<String> = Vec::new();
    for p in parts.drain(..) {
        if out.last() != Some(&p) {
            out.push(p);
        }
    }
    *parts = out;
}

/// 根据当前按下的侧修饰键与终端键，拼出与录制一致的 chord 字符串（如 `LShift+A`）。
#[cfg(windows)]
pub fn build_pressed_chord(terminal: &str) -> String {
    use winapi::um::winuser::GetAsyncKeyState;
    let term = terminal.trim();
    if term.is_empty() {
        return String::new();
    }
    let mut parts = Vec::new();
    let pairs: &[(i32, &str)] = &[
        (0xA2, "LCtrl"),
        (0xA3, "RCtrl"),
        (0xA0, "LShift"),
        (0xA1, "RShift"),
        (0xA4, "LAlt"),
        (0xA5, "RAlt"),
        (0x5B, "LWin"),
        (0x5C, "RWin"),
    ];
    for (vk, name) in pairs {
        if unsafe { GetAsyncKeyState(*vk) } as u16 & 0x8000 != 0 {
            parts.push((*name).to_string());
        }
    }
    if is_side_modifier_name(term) {
        if !parts.iter().any(|p| p == term) {
            parts.push(term.to_string());
        }
    } else {
        parts.retain(|p| p != term);
        parts.push(term.to_string());
    }
    dedupe_chord_parts(&mut parts);
    parts.join("+")
}

#[cfg(not(windows))]
pub fn build_pressed_chord(terminal: &str) -> String {
    terminal.trim().to_string()
}

pub fn chord_is_sendable(combo: &str) -> bool {
    let trimmed = combo.trim();
    if trimmed.is_empty() {
        return false;
    }
    is_right_alt_only(trimmed) || is_left_alt_only(trimmed) || parse_chord(trimmed).is_ok()
}

pub fn is_right_alt_only(combo: &str) -> bool {
    match parse_chord(combo) {
        Ok(tokens) if tokens.len() == 1 => {
            matches!(
                tokens[0],
                SendToken::Key(VkKey {
                    vk: 0xA5,
                    extended: true
                })
            )
        }
        _ => false,
    }
}

pub fn is_left_alt_only(combo: &str) -> bool {
    match parse_chord(combo) {
        Ok(tokens) if tokens.len() == 1 => {
            matches!(
                tokens[0],
                SendToken::Key(VkKey {
                    vk: 0xA4,
                    extended: false
                })
            )
        }
        _ => false,
    }
}

fn token_def(raw: &str) -> Option<TokenDef> {
    for candidate in lookup_candidates(raw) {
        if let Some(def) = token_def_exact(&candidate) {
            return Some(def);
        }
        if let Some(def) = token_def_special(&candidate) {
            return Some(def);
        }
    }
    token_def_char_fallback(raw.trim())
}

fn lookup_candidates(raw: &str) -> Vec<String> {
    let stripped = raw.trim().trim_matches(|c| c == '{' || c == '}');
    let upper = stripped.to_ascii_uppercase();
    let compact: String = upper
        .chars()
        .filter(|c| *c != '_' && *c != '-' && *c != ' ')
        .collect();
    let mut out = vec![upper.clone(), compact.clone()];
    if upper.contains('_') {
        out.push(upper.replace('_', ""));
    }
    out.sort();
    out.dedup();
    out
}

fn token_def_special(candidate: &str) -> Option<TokenDef> {
    let upper = candidate.to_ascii_uppercase();
    if let Some(rest) = upper.strip_prefix("VK") {
        let vk = parse_u16(rest)?;
        return Some(mod_or_key(vk, is_extended_vk(vk)));
    }
    if let Some(rest) = upper.strip_prefix("SC") {
        let scan = parse_u16(rest)?;
        return Some(TokenDef {
            send: SendToken::Scan {
                code: scan,
                extended: scan == 0x38 || scan == 0x1C || scan == 0x35,
            },
            kind: TokenKind::Key,
        });
    }
    if upper.starts_with("0X") {
        let vk = parse_u16(&upper[2..])?;
        return Some(mod_or_key(vk, is_extended_vk(vk)));
    }
    None
}

fn parse_u16(s: &str) -> Option<u16> {
    u16::from_str_radix(s, 16).ok().or_else(|| s.parse().ok())
}

fn mod_or_key(vk: u16, extended: bool) -> TokenDef {
    let kind = if is_modifier_vk(vk) {
        TokenKind::Modifier
    } else {
        TokenKind::Key
    };
    TokenDef {
        send: SendToken::Key(VkKey { vk, extended }),
        kind,
    }
}

fn is_modifier_vk(vk: u16) -> bool {
    matches!(vk, 0xA0..=0xA5 | 0x5B | 0x5C)
}

fn is_extended_vk(vk: u16) -> bool {
    matches!(
        vk,
        0xA3 | 0xA5
            | 0x5B
            | 0x5C
            | 0x21
            | 0x22
            | 0x23
            | 0x24
            | 0x25
            | 0x26
            | 0x27
            | 0x28
            | 0x2D
            | 0x2E
            | 0x6F
            | 0xAD..=0xB7
            | 0xA6..=0xA8
    )
}

fn token_def_char_fallback(raw: &str) -> Option<TokenDef> {
    if raw.len() == 1 {
        let ch = raw.chars().next()?;
        let upper = ch.to_ascii_uppercase();
        if upper.is_ascii_alphabetic() {
            return key(upper as u16);
        }
        if upper.is_ascii_digit() {
            return key(upper as u16);
        }
    }
    None
}

fn token_def_exact(upper: &str) -> Option<TokenDef> {
    // --- 修饰键 ---
    if matches!(
        upper,
        "CTRL" | "CONTROL" | "LCTRL" | "LEFTCTRL" | "CONTROLLEFT"
    ) {
        return modifier(0xA2, false);
    }
    if matches!(upper, "RCTRL" | "RIGHTCTRL" | "CONTROLRIGHT") {
        return modifier(0xA3, true);
    }
    if matches!(upper, "SHIFT" | "LSHIFT" | "LEFTSHIFT" | "SHIFTLEFT") {
        return modifier(0xA0, false);
    }
    if matches!(upper, "RSHIFT" | "RIGHTSHIFT" | "SHIFTRIGHT") {
        return modifier(0xA1, false);
    }
    if matches!(upper, "ALT" | "LALT" | "LEFTALT" | "ALTLEFT" | "MENU") {
        return modifier(0xA4, false);
    }
    if matches!(upper, "RALT" | "RIGHTALT" | "ALTRIGHT" | "ALTGR") {
        return modifier(0xA5, true);
    }
    if matches!(
        upper,
        "WIN" | "LWIN" | "LEFTWIN" | "METALEFT" | "META" | "CMD" | "COMMAND" | "SUPER" | "LGUI"
    ) {
        return modifier(0x5B, true);
    }
    if matches!(upper, "RWIN" | "RIGHTWIN" | "METARIGHT" | "RGUI") {
        return modifier(0x5C, true);
    }

    // --- 鼠标键 ---
    if matches!(
        upper,
        "LBUTTON" | "LEFTBUTTON" | "MOUSELEFT" | "MOUSE1" | "MBUTTONLEFT"
    ) {
        return mouse(MouseButton::Left);
    }
    if matches!(
        upper,
        "RBUTTON" | "RIGHTBUTTON" | "MOUSERIGHT" | "MOUSE2" | "MBUTTONRIGHT"
    ) {
        return mouse(MouseButton::Right);
    }
    if matches!(
        upper,
        "MBUTTON" | "MIDDLEBUTTON" | "MOUSEMIDDLE" | "MOUSE3" | "MBUTTONMIDDLE"
    ) {
        return mouse(MouseButton::Middle);
    }
    if matches!(upper, "XBUTTON1" | "MOUSE4" | "MOUSEX1" | "X1" | "MBUTTON4") {
        return mouse(MouseButton::X1);
    }
    if matches!(upper, "XBUTTON2" | "MOUSE5" | "MOUSEX2" | "X2" | "MBUTTON5") {
        return mouse(MouseButton::X2);
    }

    // --- 媒体 / 浏览器 / 启动键（与 hotkey_win 触发名对齐）---
    if matches!(upper, "VOLUMEUP" | "AUDIOVOLUMEUP" | "VOLUME_UP" | "VOLUP") {
        return ext_key(0xAF);
    }
    if matches!(
        upper,
        "VOLUMEDOWN" | "AUDIOVOLUMEDOWN" | "VOLUME_DOWN" | "VOLDOWN"
    ) {
        return ext_key(0xAE);
    }
    if matches!(
        upper,
        "VOLUMEMUTE" | "AUDIOVOLUMEMUTE" | "VOLUME_MUTE" | "MUTE"
    ) {
        return ext_key(0xAD);
    }
    if matches!(
        upper,
        "MEDIANEXT" | "MEDIATRACKNEXT" | "MEDIA_NEXT" | "NEXTTRACK"
    ) {
        return ext_key(0xB0);
    }
    if matches!(
        upper,
        "MEDIAPREV" | "MEDIATRACKPREVIOUS" | "MEDIA_PREV" | "PREVTRACK"
    ) {
        return ext_key(0xB1);
    }
    if matches!(upper, "MEDIASTOP" | "MEDIA_STOP") {
        return ext_key(0xB2);
    }
    if matches!(
        upper,
        "MEDIAPLAYPAUSE" | "MEDIA_PLAY_PAUSE" | "PLAYPAUSE" | "MEDIAPLAY"
    ) {
        return ext_key(0xB3);
    }
    if matches!(upper, "BROWSERBACK" | "BROWSER_BACK") {
        return ext_key(0xA6);
    }
    if matches!(upper, "BROWSERFORWARD" | "BROWSER_FORWARD") {
        return ext_key(0xA7);
    }
    if matches!(upper, "BROWSERREFRESH" | "BROWSER_REFRESH") {
        return ext_key(0xA8);
    }
    if matches!(upper, "BROWSERHOME" | "BROWSER_HOME") {
        return ext_key(0xAC);
    }
    if matches!(upper, "LAUNCHMAIL" | "LAUNCH_MAIL" | "MAIL") {
        return ext_key(0xB4);
    }
    if matches!(upper, "LAUNCHAPP1" | "LAUNCH_APP1") {
        return ext_key(0xB6);
    }
    if matches!(upper, "LAUNCHAPP2" | "LAUNCH_APP2") {
        return ext_key(0xB7);
    }
    if matches!(upper, "APPCALCULATOR" | "CALC") {
        return ext_key(0xB5);
    }

    // --- F1–F24 ---
    if let Some(n) = parse_fn_key(upper) {
        return key(0x6F + n);
    }

    // --- 字母 / 数字 ---
    if upper.len() == 1 {
        let b = upper.as_bytes()[0];
        if (b'A'..=b'Z').contains(&b) || (b'0'..=b'9').contains(&b) {
            return key(b as u16);
        }
    }

    if let Some(n) = upper.strip_prefix("NUMPAD") {
        return numpad_token(n);
    }

    match upper {
        "SPACE" | " " => key(0x20),
        "TAB" => key(0x09),
        "ENTER" | "RETURN" => key(0x0D),
        "NUMPADENTER" => ext_key(0x0D),
        "ESC" | "ESCAPE" => key(0x1B),
        "BACKSPACE" | "BS" => key(0x08),
        "DELETE" | "DEL" => ext_key(0x2E),
        "INSERT" | "INS" => ext_key(0x2D),
        "HOME" => ext_key(0x24),
        "END" => ext_key(0x23),
        "PAGEUP" | "PGUP" | "PRIOR" => ext_key(0x21),
        "PAGEDOWN" | "PGDN" | "NEXT" => ext_key(0x22),
        "UP" | "ARROWUP" => ext_key(0x26),
        "DOWN" | "ARROWDOWN" => ext_key(0x28),
        "LEFT" | "ARROWLEFT" => ext_key(0x25),
        "RIGHT" | "ARROWRIGHT" => ext_key(0x27),
        "PRINTSCREEN" | "PRTSC" | "SNAPSHOT" => key(0x2C),
        "SCROLLLOCK" | "SCROLL" => key(0x91),
        "PAUSE" | "BREAK" => key(0x13),
        "CAPSLOCK" | "CAPS" => key(0x14),
        "APPSKEY" | "APPS" | "CONTEXTMENU" | "MENUKEY" => key(0x5D),
        "MINUS" | "DASH" | "HYPHEN" | "-" => key(0xBD),
        "EQUAL" | "EQUALS" | "PLUS" | "=" => key(0xBB),
        "LBRACKET" | "BRACKETLEFT" | "[" => key(0xDB),
        "RBRACKET" | "BRACKETRIGHT" | "]" => key(0xDD),
        "BACKSLASH" | "\\" => key(0xDC),
        "SEMICOLON" | ";" => key(0xBA),
        "QUOTE" | "APOSTROPHE" | "'" => key(0xDE),
        "COMMA" | "," => key(0xBC),
        "PERIOD" | "DOT" | "." => key(0xBE),
        "SLASH" | "FORWARDSLASH" | "/" => key(0xBF),
        "BACKQUOTE" | "GRAVE" | "`" | "OEM3" => key(0xC0),
        "NUMLOCK" => key(0x90),
        _ => None,
    }
}

fn modifier(vk: u16, extended: bool) -> Option<TokenDef> {
    Some(TokenDef {
        send: SendToken::Key(VkKey { vk, extended }),
        kind: TokenKind::Modifier,
    })
}

fn key(vk: u16) -> Option<TokenDef> {
    Some(TokenDef {
        send: SendToken::Key(VkKey {
            vk,
            extended: false,
        }),
        kind: TokenKind::Key,
    })
}

fn ext_key(vk: u16) -> Option<TokenDef> {
    Some(TokenDef {
        send: SendToken::Key(VkKey { vk, extended: true }),
        kind: TokenKind::Key,
    })
}

fn mouse(btn: MouseButton) -> Option<TokenDef> {
    Some(TokenDef {
        send: SendToken::Mouse(btn),
        kind: TokenKind::Mouse,
    })
}

fn parse_fn_key(upper: &str) -> Option<u16> {
    let rest = upper.strip_prefix('F')?;
    let n: u16 = rest.parse().ok()?;
    if (1..=24).contains(&n) {
        Some(n)
    } else {
        None
    }
}

fn numpad_token(s: &str) -> Option<TokenDef> {
    let u = s.to_ascii_uppercase();
    if u == "ENTER" {
        return ext_key(0x0D);
    }
    if u == "ADD" || u == "+" {
        return key(0x6B);
    }
    if u == "SUBTRACT" || u == "-" {
        return key(0x6D);
    }
    if u == "MULTIPLY" || u == "*" {
        return key(0x6A);
    }
    if u == "DIVIDE" || u == "/" {
        return ext_key(0x6F);
    }
    if u == "DECIMAL" || u == "." {
        return key(0x6E);
    }
    if let Ok(n) = u.parse::<u16>() {
        if n <= 9 {
            return key(0x60 + n);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_f2() {
        let k = parse_chord("F2").unwrap();
        assert_eq!(k.len(), 1);
        assert!(matches!(k[0], SendToken::Key(VkKey { vk: 0x71, .. })));
    }

    #[test]
    fn parse_combo() {
        let k = parse_chord("Ctrl+Shift+F2").unwrap();
        assert_eq!(k.len(), 3);
    }

    #[test]
    fn parse_modifier_only() {
        let k = parse_chord("Ctrl+Shift").unwrap();
        assert_eq!(k.len(), 2);
    }

    #[test]
    fn parse_media_key() {
        assert!(parse_chord("Volume_Up").is_ok());
        assert!(parse_chord("Media_Play_Pause").is_ok());
    }

    #[test]
    fn parse_mouse() {
        assert!(parse_chord("LButton").is_ok());
        assert!(parse_chord("Ctrl+LButton").is_ok());
    }

    #[test]
    fn parse_vk_alias() {
        assert!(parse_chord("vk71").is_ok());
        assert!(parse_chord("sc138").is_ok());
    }

    #[test]
    fn parse_ralt_only() {
        assert!(is_right_alt_only("RAlt"));
    }

    #[test]
    fn chords_equivalent_side_and_generic_modifiers() {
        assert!(chords_equivalent("Ctrl+Alt+C", "LCtrl+LAlt+C"));
        assert!(!chords_equivalent("LAlt", "LAlt+Tab"));
        assert!(is_modifier_only_chord("LAlt"));
        assert!(!is_modifier_only_chord("Ctrl+Alt+C"));
    }

    #[test]
    fn soft_pad_target_chords_are_synthesize_targets() {
        assert!(is_app_synthesize_target_chord("Ctrl+K"));
        assert!(is_app_synthesize_target_chord("Ctrl+N"));
        assert!(is_app_synthesize_target_chord("Ctrl+Alt+N"));
        assert!(is_app_synthesize_target_chord("Ctrl+Shift+D"));
        assert!(is_app_synthesize_target_chord("Enter"));
        assert!(is_app_synthesize_target_chord("Escape"));
        assert!(is_app_synthesize_target_chord("Ctrl+`"));
        // OneTone-side exclusive triggers stay registerable.
        assert!(!is_app_synthesize_target_chord("F13"));
        assert!(!is_app_synthesize_target_chord("Gamepad_A"));
    }
}
