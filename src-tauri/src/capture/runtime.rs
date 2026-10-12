//! Global mutable capture runtime (one session at a time).

use std::sync::{LazyLock, Mutex};

use serde::Serialize;

use super::crop::{crop_rgba, encode_png};
use super::grab::{grab_for_session, GrabbedFrame};
use super::region::build_session_regions;
use super::session::CaptureSessionLogic;
use super::types::{
    CaptureAction, CapturePhase, EntrySource, HandoffReceipt, HandoffReceiptState, MonitorInfo,
    RectPx, RegionCandidate,
};

static RUNTIME: LazyLock<Mutex<Option<ActiveCapture>>> = LazyLock::new(|| Mutex::new(None));

struct ActiveCapture {
    logic: CaptureSessionLogic,
    frame: GrabbedFrame,
    frame_origin: RectPx,
    /// Cached overlay preview (encoded once at begin).
    freeze_preview_b64: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePublicState {
    pub phase: CapturePhase,
    pub entry: EntrySource,
    pub regions: Vec<RegionCandidate>,
    pub candidate_rect: Option<RectPx>,
    pub grid_depth: u32,
    pub monitors: Vec<MonitorInfo>,
    pub active_monitor: u32,
    pub screen_rect: RectPx,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub freeze_png_base64: Option<String>,
}

fn public_from(active: &ActiveCapture, include_frame: bool) -> CapturePublicState {
    let grid_depth = active.logic.grid.as_ref().map(|g| g.depth() as u32).unwrap_or(0);
    CapturePublicState {
        phase: active.logic.phase,
        entry: active.logic.entry,
        regions: active.logic.regions.clone(),
        candidate_rect: active.logic.candidate_rect,
        grid_depth,
        monitors: active.logic.monitors.clone(),
        active_monitor: active.logic.active_monitor,
        screen_rect: active.logic.screen_rect,
        freeze_png_base64: if include_frame {
            active.freeze_preview_b64.clone()
        } else {
            None
        },
    }
}

fn encode_freeze_preview(frame: &GrabbedFrame) -> Result<String, String> {
    let img = image::RgbaImage::from_raw(frame.width, frame.height, frame.rgba.clone())
        .ok_or_else(|| "bad_frame".to_string())?;
    // Keep sharp for box selection — only shrink extreme virtual-desktop captures.
    const MAX_EDGE: u32 = 5120;
    let (w, h) = (img.width(), img.height());
    let preview = if w.max(h) > MAX_EDGE {
        let scale = MAX_EDGE as f32 / w.max(h) as f32;
        let nw = ((w as f32) * scale).round().max(1.0) as u32;
        let nh = ((h as f32) * scale).round().max(1.0) as u32;
        image::imageops::resize(&img, nw, nh, image::imageops::FilterType::CatmullRom)
    } else {
        img
    };
    // JPEG is smaller/faster over IPC than PNG at similar perceived sharpness.
    let mut buf = Vec::new();
    {
        let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 90);
        use image::ImageEncoder;
        let rgb = image::DynamicImage::ImageRgba8(preview).to_rgb8();
        enc.write_image(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("jpeg_encode:{e}"))?;
    }
    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(buf))
}

fn encode_list_thumb(img: &image::RgbaImage) -> Option<String> {
    const EDGE: u32 = 160;
    let (w, h) = (img.width(), img.height());
    if w == 0 || h == 0 {
        return None;
    }
    let scale = EDGE as f32 / w.max(h) as f32;
    let nw = ((w as f32) * scale).round().max(1.0) as u32;
    let nh = ((h as f32) * scale).round().max(1.0) as u32;
    let thumb = image::imageops::resize(img, nw, nh, image::imageops::FilterType::Triangle);
    let png = encode_png(&thumb).ok()?;
    use base64::Engine;
    Some(base64::engine::general_purpose::STANDARD.encode(png))
}

/// Begin a capture session. Caller should hide overlay chrome first.
pub fn begin(
    entry: EntrySource,
    prefer_monitor: Option<u32>,
    fg_before_hide: Option<RectPx>,
) -> Result<CapturePublicState, String> {
    let bundle = grab_for_session(prefer_monitor, fg_before_hide)?;
    let screen = bundle.frame.monitor.rect_px;
    let fg = bundle.fg_client.and_then(|r| {
        if r.w < 80 || r.h < 80 {
            return None;
        }
        let overlaps = r.x < screen.x + screen.w as i32
            && r.x + r.w as i32 > screen.x
            && r.y < screen.y + screen.h as i32
            && r.y + r.h as i32 > screen.y;
        overlaps.then_some(r)
    });
    let regions = build_session_regions(
        screen,
        &bundle.monitors,
        bundle.active_index,
        fg,
        &bundle.windows,
    );
    let logic = CaptureSessionLogic::new(
        entry,
        screen,
        bundle.monitors.clone(),
        bundle.active_index,
        regions,
    );
    let freeze_preview_b64 = encode_freeze_preview(&bundle.frame).ok();
    let frame_origin = bundle.frame.monitor.rect_px;
    let active = ActiveCapture {
        logic,
        frame: bundle.frame,
        frame_origin,
        freeze_preview_b64,
    };
    let pub_state = public_from(&active, true);
    *RUNTIME.lock().unwrap_or_else(|e| e.into_inner()) = Some(active);
    Ok(pub_state)
}

pub fn get_state(include_frame: bool) -> Option<CapturePublicState> {
    let g = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());
    g.as_ref().map(|a| public_from(a, include_frame))
}

pub fn apply_action(action: CaptureAction) -> Result<CapturePublicState, String> {
    let mut g = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());
    let active = g.as_mut().ok_or_else(|| "no_session".to_string())?;
    active.logic.apply(action)?;
    Ok(public_from(active, false))
}

pub fn cancel() {
    *RUNTIME.lock().unwrap_or_else(|e| e.into_inner()) = None;
}

/// Drop session without restore — used when switching monitors (chrome stays hidden).
pub fn cancel_session_only() {
    cancel();
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmResult {
    pub receipt: HandoffReceipt,
    pub rect_px: RectPx,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_base64: Option<String>,
}

/// Apply Confirm if needed, then take session off runtime so UI can close before encode.
pub fn take_confirmed_pending() -> Result<PendingSave, String> {
    let mut g = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());
    let mut active = g.take().ok_or_else(|| "no_session".to_string())?;
    if active.logic.phase != CapturePhase::Confirmed {
        if let Err(e) = active.logic.apply(CaptureAction::Confirm) {
            *g = Some(active);
            return Err(e);
        }
    }
    let rect = match active.logic.take_confirmed() {
        Some(r) => r,
        None => {
            *g = Some(active);
            return Err("not_confirmed".into());
        }
    };
    Ok(PendingSave {
        frame: active.frame,
        frame_origin: active.frame_origin,
        rect,
    })
}

/// Requires phase Confirmed — does not auto-confirm (for tests / strict path).
pub fn take_if_confirmed() -> Result<PendingSave, String> {
    let mut g = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());
    let mut active = g.take().ok_or_else(|| "no_session".to_string())?;
    if active.logic.phase != CapturePhase::Confirmed {
        *g = Some(active);
        return Err("not_confirmed".into());
    }
    let rect = match active.logic.take_confirmed() {
        Some(r) => r,
        None => {
            *g = Some(active);
            return Err("not_confirmed".into());
        }
    };
    Ok(PendingSave {
        frame: active.frame,
        frame_origin: active.frame_origin,
        rect,
    })
}

pub struct PendingSave {
    pub frame: GrabbedFrame,
    pub frame_origin: RectPx,
    pub rect: RectPx,
}

pub fn encode_pending(pending: PendingSave) -> Result<ConfirmResult, String> {
    let img = crop_rgba(
        &pending.frame.rgba,
        pending.frame.width,
        pending.frame.height,
        pending.frame_origin,
        pending.rect,
    )?;
    let preview_base64 = encode_list_thumb(&img);
    let png = encode_png(&img)?;
    let name = format!("capture_{}x{}.png", img.width(), img.height());
    let path = crate::home_tray_snapshot::write_inbox_bytes(Some(name), &png)?;
    Ok(ConfirmResult {
        receipt: HandoffReceipt {
            state: HandoffReceiptState::SavedToInbox,
            detail: Some("已保存截图，正在加入素材列表".into()),
            path: Some(path),
        },
        rect_px: pending.rect,
        preview_base64,
    })
}

/// Confirm current candidate → crop → write inbox → clear session (sync helper / tests).
pub fn confirm_and_save() -> Result<ConfirmResult, String> {
    let pending = take_if_confirmed()?;
    encode_pending(pending)
}

pub fn confirm_action_and_save() -> Result<ConfirmResult, String> {
    let pending = take_confirmed_pending()?;
    encode_pending(pending)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture::types::{RegionRole, RegionSource};

    fn seed_unconfirmed() {
        let screen = RectPx::new(0, 0, 40, 40);
        let regions = vec![RegionCandidate {
            id: 1,
            rect_px: RectPx::new(0, 0, 20, 20),
            source: RegionSource::Heuristic,
            role: RegionRole::Content,
            confidence: 0.5,
            label: None,
            hotkey: Some("1".into()),
        }];
        let mut logic = CaptureSessionLogic::new(EntrySource::Home, screen, vec![], 0, regions);
        logic.apply(CaptureAction::ChooseRegion { id: 1 }).unwrap();
        let rgba = vec![0u8; 40 * 40 * 4];
        let active = ActiveCapture {
            logic,
            frame: GrabbedFrame {
                width: 40,
                height: 40,
                rgba,
                monitor: MonitorInfo {
                    index: 0,
                    rect_px: screen,
                    scale: 1.0,
                    is_primary: true,
                },
            },
            frame_origin: screen,
            freeze_preview_b64: None,
        };
        *RUNTIME.lock().unwrap_or_else(|e| e.into_inner()) = Some(active);
    }

    #[test]
    fn confirm_and_save_requires_confirmed() {
        seed_unconfirmed();
        let err = confirm_and_save().unwrap_err();
        assert_eq!(err, "not_confirmed");
        assert!(get_state(false).is_some());
        cancel();
    }
}
