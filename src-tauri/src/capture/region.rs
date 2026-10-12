//! Region Engine v0 — window list for hover match + number/letter hotkeys.

use super::types::{MonitorInfo, RectPx, RegionCandidate, RegionRole, RegionSource};

const MIN_AREA: u64 = 40 * 40;
const MAX_REGIONS: usize = 16;
const IOU_DEDUP: f32 = 0.92;

fn hotkey_for(i: usize) -> String {
    if i < 9 {
        format!("{}", i + 1)
    } else {
        let c = b'A' + (i - 9) as u8;
        format!("{}", c as char)
    }
}

/// Session regions = top-level windows on the capture surface (+ 全桌面 fallback).
pub fn build_session_regions(
    screen: RectPx,
    monitors: &[MonitorInfo],
    _active_monitor: u32,
    _fg_client: Option<RectPx>,
    windows: &[RectPx],
) -> Vec<RegionCandidate> {
    let mut raw: Vec<(RectPx, RegionRole, f32, String, RegionSource)> = Vec::new();

    let mut wins: Vec<RectPx> = windows
        .iter()
        .copied()
        .filter_map(|w| clip_to(w, screen))
        .filter(|c| c.area() >= MIN_AREA)
        .collect();
    wins.sort_by(|a, b| a.area().cmp(&b.area()));

    let mut wi = 1u32;
    for c in wins {
        raw.push((
            c,
            RegionRole::Content,
            0.9,
            format!("窗口 {}", wi),
            RegionSource::Window,
        ));
        wi += 1;
    }

    let mut out = dedupe_near_identical(raw);
    let screen_label = if monitors.len() > 1 {
        "全桌面".into()
    } else {
        "整屏".into()
    };
    let has_near_full = out.iter().any(|r| r.rect_px.iou(screen) >= 0.92);
    if !has_near_full {
        out.push(RegionCandidate {
            id: (out.len() + 1) as u32,
            rect_px: screen,
            source: RegionSource::Manual,
            role: RegionRole::Content,
            confidence: 0.35,
            label: Some(screen_label),
            hotkey: None,
        });
    }
    for (i, r) in out.iter_mut().enumerate() {
        r.id = (i + 1) as u32;
        let hk = hotkey_for(i);
        r.hotkey = Some(hk.clone());
        if let Some(lab) = r.label.as_mut() {
            if !lab.starts_with(&hk) {
                *lab = format!("{hk} · {lab}");
            }
        } else {
            r.label = Some(format!("{hk} · 区域"));
        }
    }
    out.truncate(MAX_REGIONS);
    out
}

pub fn build_geometric_regions(screen: RectPx, fg_client: Option<RectPx>) -> Vec<RegionCandidate> {
    let Some(win) = fg_client.filter(|r| r.w >= 80 && r.h >= 80) else {
        return Vec::new();
    };

    let mut raw: Vec<(RectPx, RegionRole, f32, String, RegionSource)> = Vec::new();
    raw.push((
        win,
        RegionRole::Content,
        0.55,
        "前台窗口".into(),
        RegionSource::Heuristic,
    ));
    for (rect, role, conf, label) in geometric_panes(win) {
        if let Some(c) = clip_to(rect, screen) {
            if c.area() >= MIN_AREA {
                raw.push((c, role, conf, label.into(), RegionSource::Heuristic));
            }
        }
    }
    let mut out = dedupe_near_identical(raw);
    for (i, r) in out.iter_mut().enumerate() {
        r.id = (i + 1) as u32;
        r.hotkey = Some(hotkey_for(i));
    }
    out
}

fn geometric_panes(win: RectPx) -> Vec<(RectPx, RegionRole, f32, &'static str)> {
    let side_w = (win.w as f32 * 0.18).round().clamp(80.0, 280.0) as u32;
    let chat_w = (win.w as f32 * 0.22).round().clamp(120.0, 360.0) as u32;
    let top_h = (win.h as f32 * 0.06).round().clamp(28.0, 64.0) as u32;
    let bot_h = (win.h as f32 * 0.22).round().clamp(80.0, 220.0) as u32;
    let mid_h = win.h.saturating_sub(top_h + bot_h).max(40);
    let mid_w = win.w.saturating_sub(side_w + chat_w).max(80);

    vec![
        (
            RectPx::new(win.x, win.y, win.w, top_h),
            RegionRole::Toolbar,
            0.7,
            "顶部导航",
        ),
        (
            RectPx::new(win.x, win.y + top_h as i32, side_w, mid_h + bot_h),
            RegionRole::Sidebar,
            0.75,
            "左侧文件树",
        ),
        (
            RectPx::new(win.x + side_w as i32, win.y + top_h as i32, mid_w, mid_h),
            RegionRole::Editor,
            0.9,
            "代码编辑区",
        ),
        (
            RectPx::new(
                win.x + side_w as i32,
                win.y + (top_h + mid_h) as i32,
                mid_w,
                bot_h,
            ),
            RegionRole::Terminal,
            0.8,
            "底部终端",
        ),
        (
            RectPx::new(
                win.x + (side_w + mid_w) as i32,
                win.y + top_h as i32,
                chat_w,
                mid_h + bot_h,
            ),
            RegionRole::Chat,
            0.78,
            "右侧聊天",
        ),
    ]
}

fn clip_to(r: RectPx, screen: RectPx) -> Option<RectPx> {
    let x1 = r.x.max(screen.x);
    let y1 = r.y.max(screen.y);
    let x2 = (r.x + r.w as i32).min(screen.x + screen.w as i32);
    let y2 = (r.y + r.h as i32).min(screen.y + screen.h as i32);
    if x2 <= x1 || y2 <= y1 {
        return None;
    }
    Some(RectPx::new(x1, y1, (x2 - x1) as u32, (y2 - y1) as u32))
}

fn dedupe_near_identical(
    mut items: Vec<(RectPx, RegionRole, f32, String, RegionSource)>,
) -> Vec<RegionCandidate> {
    items.sort_by(|a, b| {
        b.2.partial_cmp(&a.2)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.0.area().cmp(&b.0.area()))
    });
    let mut kept: Vec<(RectPx, RegionRole, f32, String, RegionSource)> = Vec::new();
    for it in items {
        let dup = kept.iter().any(|(r, _, _, _, _)| r.iou(it.0) >= IOU_DEDUP);
        if !dup {
            kept.push(it);
        }
    }
    kept.truncate(MAX_REGIONS);
    kept.into_iter()
        .enumerate()
        .map(|(i, (rect, role, confidence, label, source))| RegionCandidate {
            id: (i + 1) as u32,
            rect_px: rect,
            source,
            role,
            confidence,
            label: Some(label),
            hotkey: Some(hotkey_for(i)),
        })
        .collect()
}

pub fn hit_stack(regions: &[RegionCandidate], px: i32, py: i32) -> Vec<&RegionCandidate> {
    let mut hits: Vec<&RegionCandidate> = regions
        .iter()
        .filter(|r| r.rect_px.contains_point(px, py))
        .collect();
    hits.sort_by(|a, b| a.rect_px.area().cmp(&b.rect_px.area()));
    hits
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn produces_between_six_and_twelve() {
        let screen = RectPx::new(0, 0, 1920, 1080);
        let win = RectPx::new(100, 50, 1600, 900);
        let regs = build_geometric_regions(screen, Some(win));
        assert!(!regs.is_empty());
        assert!(regs.len() <= 12, "len={}", regs.len());
        assert!(regs.len() >= 5, "len={}", regs.len());
        assert_eq!(regs[0].id, 1);
    }

    #[test]
    fn empty_without_window() {
        let screen = RectPx::new(0, 0, 1920, 1080);
        assert!(build_geometric_regions(screen, None).is_empty());
    }

    #[test]
    fn session_assigns_hotkeys() {
        let screen = RectPx::new(0, 0, 1920, 1080);
        let mons = vec![MonitorInfo {
            index: 0,
            rect_px: screen,
            scale: 1.0,
            is_primary: true,
        }];
        let a = RectPx::new(0, 0, 400, 300);
        let b = RectPx::new(500, 0, 400, 300);
        let regs = build_session_regions(screen, &mons, 0, None, &[a, b]);
        assert!(regs.iter().any(|r| r.hotkey.as_deref() == Some("1")));
        assert!(regs.len() >= 2);
    }

    #[test]
    fn multi_desktop_label() {
        let a = RectPx::new(0, 0, 1920, 1080);
        let b = RectPx::new(1920, 0, 1920, 1080);
        let screen = RectPx::new(0, 0, 3840, 1080);
        let mons = vec![
            MonitorInfo {
                index: 0,
                rect_px: a,
                scale: 1.0,
                is_primary: true,
            },
            MonitorInfo {
                index: 1,
                rect_px: b,
                scale: 1.0,
                is_primary: false,
            },
        ];
        let regs = build_session_regions(screen, &mons, 0, None, &[]);
        assert!(regs.iter().any(|r| r.label.as_deref().is_some_and(|l| l.contains("全桌面"))));
    }

    #[test]
    fn hit_stack_leaf_first() {
        let outer = RegionCandidate {
            id: 1,
            rect_px: RectPx::new(0, 0, 800, 600),
            source: RegionSource::Window,
            role: RegionRole::Content,
            confidence: 0.9,
            label: Some("外".into()),
            hotkey: Some("1".into()),
        };
        let inner = RegionCandidate {
            id: 2,
            rect_px: RectPx::new(100, 100, 200, 200),
            source: RegionSource::Window,
            role: RegionRole::Content,
            confidence: 0.9,
            label: Some("内".into()),
            hotkey: Some("2".into()),
        };
        let regs = [outer, inner];
        let stack = hit_stack(&regs, 150, 150);
        assert_eq!(stack.len(), 2);
        assert_eq!(stack[0].id, 2);
        assert_eq!(stack[1].id, 1);
    }

    #[test]
    fn session_always_has_screen_tile() {
        let screen = RectPx::new(0, 0, 1920, 1080);
        let mons = vec![MonitorInfo {
            index: 0,
            rect_px: screen,
            scale: 1.0,
            is_primary: true,
        }];
        let regs = build_session_regions(screen, &mons, 0, None, &[]);
        assert!(!regs.is_empty());
        assert!(regs.iter().any(|r| r.label.as_deref().is_some_and(|l| l.contains("整屏"))));
    }

    #[test]
    fn dedupes_high_iou() {
        let screen = RectPx::new(0, 0, 1000, 800);
        let win = RectPx::new(0, 0, 1000, 800);
        let regs = build_geometric_regions(screen, Some(win));
        for i in 0..regs.len() {
            for j in (i + 1)..regs.len() {
                assert!(
                    regs[i].rect_px.iou(regs[j].rect_px) < 0.95,
                    "regions {} and {} nearly identical",
                    regs[i].id,
                    regs[j].id
                );
            }
        }
    }
}
