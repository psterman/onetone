//! Domain types for smart region capture (physical-pixel space).

use serde::{Deserialize, Serialize};

/// Axis-aligned rectangle in virtual-desktop physical pixels (may be negative).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RectPx {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

impl RectPx {
    pub fn new(x: i32, y: i32, w: u32, h: u32) -> Self {
        Self { x, y, w, h }
    }

    pub fn area(self) -> u64 {
        self.w as u64 * self.h as u64
    }

    pub fn contains(self, other: RectPx) -> bool {
        other.x >= self.x
            && other.y >= self.y
            && other.x + other.w as i32 <= self.x + self.w as i32
            && other.y + other.h as i32 <= self.y + self.h as i32
    }

    pub fn contains_point(self, px: i32, py: i32) -> bool {
        px >= self.x
            && py >= self.y
            && px < self.x + self.w as i32
            && py < self.y + self.h as i32
    }

    pub fn iou(self, other: RectPx) -> f32 {
        let ax2 = self.x + self.w as i32;
        let ay2 = self.y + self.h as i32;
        let bx2 = other.x + other.w as i32;
        let by2 = other.y + other.h as i32;
        let ix1 = self.x.max(other.x);
        let iy1 = self.y.max(other.y);
        let ix2 = ax2.min(bx2);
        let iy2 = ay2.min(by2);
        let iw = (ix2 - ix1).max(0) as u64;
        let ih = (iy2 - iy1).max(0) as u64;
        let inter = iw * ih;
        if inter == 0 {
            return 0.0;
        }
        let uni = self.area() + other.area() - inter;
        if uni == 0 {
            0.0
        } else {
            inter as f32 / uni as f32
        }
    }

    /// Split into 2×2 quadrants: U=TL, I=TR, J=BL, K=BR.
    pub fn quadrant(self, q: Quadrant) -> Self {
        let hw = (self.w / 2).max(1);
        let hh = (self.h / 2).max(1);
        let rw = self.w - hw;
        let rh = self.h - hh;
        match q {
            Quadrant::U => Self::new(self.x, self.y, hw, hh),
            Quadrant::I => Self::new(self.x + hw as i32, self.y, rw.max(1), hh),
            Quadrant::J => Self::new(self.x, self.y + hh as i32, hw, rh.max(1)),
            Quadrant::K => Self::new(self.x + hw as i32, self.y + hh as i32, rw.max(1), rh.max(1)),
        }
    }

    pub fn nudge(self, dx: i32, dy: i32, bounds: RectPx) -> Self {
        let mut x = self.x + dx;
        let mut y = self.y + dy;
        let max_x = bounds.x + bounds.w as i32 - self.w as i32;
        let max_y = bounds.y + bounds.h as i32 - self.h as i32;
        x = x.clamp(bounds.x, max_x.max(bounds.x));
        y = y.clamp(bounds.y, max_y.max(bounds.y));
        Self::new(x, y, self.w, self.h)
    }

    pub fn resize(self, dw: i32, dh: i32, bounds: RectPx) -> Self {
        let w = ((self.w as i32) + dw).clamp(8, bounds.w as i32) as u32;
        let h = ((self.h as i32) + dh).clamp(8, bounds.h as i32) as u32;
        let mut r = Self::new(self.x, self.y, w, h);
        // Keep inside bounds by nudging if needed.
        r = r.nudge(0, 0, bounds);
        if r.x + r.w as i32 > bounds.x + bounds.w as i32 {
            r.x = bounds.x + bounds.w as i32 - r.w as i32;
        }
        if r.y + r.h as i32 > bounds.y + bounds.h as i32 {
            r.y = bounds.y + bounds.h as i32 - r.h as i32;
        }
        r
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Quadrant {
    U,
    I,
    J,
    K,
}

impl Quadrant {
    pub fn from_key(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "u" | "1" => Some(Self::U),
            "i" | "2" => Some(Self::I),
            "j" | "3" => Some(Self::J),
            "k" | "4" => Some(Self::K),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RegionSource {
    Window,
    Uia,
    Heuristic,
    Dom,
    Manual,
    Grid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RegionRole {
    Editor,
    Sidebar,
    Terminal,
    Chat,
    Toolbar,
    Content,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionCandidate {
    pub id: u32,
    pub rect_px: RectPx,
    pub source: RegionSource,
    pub role: RegionRole,
    pub confidence: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Keyboard / voice quick-pick key: 1-9 then A-Z.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hotkey: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CapturePhase {
    Idle,
    Capturing,
    ScreenPick,
    RegionPick,
    GridRefine,
    ManualSelect,
    RectAdjust,
    Confirmed,
    Encoding,
    SavedToInbox,
    Closed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CaptureAction {
    ChooseRegion { id: u32 },
    EnterGrid,
    ChooseQuadrant { quadrant: Quadrant },
    PopGrid,
    NudgeRect { dx: i32, dy: i32 },
    ResizeRect { dw: i32, dh: i32 },
    EnterManual,
    SetManualRect { rect: RectPx },
    Confirm,
    Cancel,
    PickScreen { index: u32 },
    ExitGrid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HandoffReceiptState {
    SavedToInbox,
    ClipboardReady,
    AgentOpened,
    ComposerPastedVerified,
    ComposerPastedUnverified,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffReceipt {
    pub state: HandoffReceiptState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub index: u32,
    pub rect_px: RectPx,
    pub scale: f32,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EntrySource {
    Home,
    SoftPad,
    Tray,
    Hotkey,
}

impl EntrySource {
    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "home" => Self::Home,
            "softpad" | "soft_pad" | "pad" => Self::SoftPad,
            "tray" => Self::Tray,
            _ => Self::Hotkey,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Home => "home",
            Self::SoftPad => "softPad",
            Self::Tray => "tray",
            Self::Hotkey => "hotkey",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quadrant_splits_even() {
        let r = RectPx::new(0, 0, 100, 80);
        let u = r.quadrant(Quadrant::U);
        assert_eq!(u, RectPx::new(0, 0, 50, 40));
        let k = r.quadrant(Quadrant::K);
        assert_eq!(k, RectPx::new(50, 40, 50, 40));
    }

    #[test]
    fn iou_overlap() {
        let a = RectPx::new(0, 0, 100, 100);
        let b = RectPx::new(50, 50, 100, 100);
        let v = a.iou(b);
        assert!(v > 0.1 && v < 0.3, "{v}");
    }
}
