//! Compose tray icon bitmaps — mic body + optional static agent ring.

use image::{Rgba, RgbaImage};

pub const THEME_BG: Rgba<u8> = Rgba([3, 14, 42, 255]);
pub const ICON_SIZE: u32 = 32;

const TRAY_READY: &[u8] = include_bytes!("../icons/tray-32.png");
const TRAY_MUTED: &[u8] = include_bytes!("../icons/tray-32-muted.png");
const TRAY_MISSING: &[u8] = include_bytes!("../icons/tray-32-missing.png");

/// Build a 32×32 tray icon for the given mic state and agent light.
pub fn compose_tray_icon(mic_key: &str, agent_light: &str) -> RgbaImage {
    let mut img = match mic_key {
        "ready" => load_embedded(TRAY_READY),
        "muted" => load_embedded(TRAY_MUTED),
        "missing" => load_embedded(TRAY_MISSING),
        "recording" => paint_recording_icon(),
        "paused" => paint_paused_icon(),
        _ => load_embedded(TRAY_READY),
    };

    let ring_light = if mic_key == "muted" || mic_key == "paused" {
        "idle"
    } else {
        agent_light
    };
    paint_agent_ring(&mut img, ring_light);
    img
}

fn load_embedded(bytes: &[u8]) -> RgbaImage {
    image::load_from_memory(bytes)
        .expect("embedded tray icon")
        .to_rgba8()
}

fn paint_recording_icon() -> RgbaImage {
    let mut img = solid_background(THEME_BG);
    paint_red_record_dot(&mut img);
    img
}

fn paint_paused_icon() -> RgbaImage {
    let mut img = solid_background(THEME_BG);
    paint_pause_bars(&mut img);
    img
}

fn solid_background(color: Rgba<u8>) -> RgbaImage {
    RgbaImage::from_pixel(ICON_SIZE, ICON_SIZE, color)
}

fn paint_red_record_dot(img: &mut RgbaImage) {
    let w = img.width() as i32;
    let h = img.height() as i32;
    let cx = w / 2;
    let cy = h / 2;
    let radius = (w as f32 * 0.18).round() as i32;
    let r2 = radius * radius;
    let core = Rgba([229, 57, 53, 255]);
    let hi = Rgba([255, 107, 107, 255]);
    for y in (cy - radius)..=(cy + radius) {
        if y < 0 || y >= h {
            continue;
        }
        for x in (cx - radius)..=(cx + radius) {
            if x < 0 || x >= w {
                continue;
            }
            let dx = x - cx;
            let dy = y - cy;
            let d2 = dx * dx + dy * dy;
            if d2 > r2 {
                continue;
            }
            let t = if radius > 0 {
                (dx + dy + radius * 2) as f32 / (radius * 4) as f32
            } else {
                0.5
            };
            let color = if t < 0.35 { hi } else { core };
            img.put_pixel(x as u32, y as u32, color);
        }
    }
}

fn paint_pause_bars(img: &mut RgbaImage) {
    let w = img.width() as i32;
    let h = img.height() as i32;
    let bar_h = (h as f32 * 0.42).round() as i32;
    let bar_w = (w as f32 * 0.11).round().max(2.0) as i32;
    let gap = (w as f32 * 0.09).round() as i32;
    let top = (h - bar_h) / 2;
    let left = (w - bar_w * 2 - gap) / 2;
    let white = Rgba([255, 255, 255, 255]);
    fill_rect(img, left, top, bar_w, bar_h, white);
    fill_rect(img, left + bar_w + gap, top, bar_w, bar_h, white);
}

fn fill_rect(img: &mut RgbaImage, x: i32, y: i32, w: i32, h: i32, color: Rgba<u8>) {
    let max_w = img.width() as i32;
    let max_h = img.height() as i32;
    for py in y..(y + h) {
        if py < 0 || py >= max_h {
            continue;
        }
        for px in x..(x + w) {
            if px < 0 || px >= max_w {
                continue;
            }
            img.put_pixel(px as u32, py as u32, color);
        }
    }
}

fn paint_agent_ring(img: &mut RgbaImage, agent_light: &str) {
    let Some(color) = agent_ring_color(agent_light) else {
        return;
    };
    let w = img.width() as i32;
    let h = img.height() as i32;
    let thickness = 2_i32;
    for y in 0..h {
        for x in 0..w {
            let on_edge = x < thickness
                || y < thickness
                || x >= w - thickness
                || y >= h - thickness;
            if on_edge {
                blend_pixel(img, x as u32, y as u32, color);
            }
        }
    }
}

fn agent_ring_color(agent_light: &str) -> Option<Rgba<u8>> {
    match agent_light.trim() {
        "running" => Some(Rgba([42, 156, 196, 220])),
        "listening" => Some(Rgba([0, 163, 255, 230])),
        "needs_input" => Some(Rgba([245, 166, 35, 235])),
        "done" => Some(Rgba([64, 180, 120, 220])),
        "failed" => Some(Rgba([220, 80, 90, 235])),
        _ => None,
    }
}

fn blend_pixel(img: &mut RgbaImage, x: u32, y: u32, color: Rgba<u8>) {
    let base = *img.get_pixel(x, y);
    let alpha = color[3] as f32 / 255.0;
    let inv = 1.0 - alpha;
    let r = (base[0] as f32 * inv + color[0] as f32 * alpha).round() as u8;
    let g = (base[1] as f32 * inv + color[1] as f32 * alpha).round() as u8;
    let b = (base[2] as f32 * inv + color[2] as f32 * alpha).round() as u8;
    img.put_pixel(x, y, Rgba([r, g, b, 255]));
}

pub fn tray_icon_image(mic_key: &str, agent_light: &str) -> tauri::image::Image<'static> {
    let rgba = compose_tray_icon(mic_key, agent_light);
    let (width, height) = rgba.dimensions();
    tauri::image::Image::new_owned(rgba.into_raw(), width, height)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compose_outputs_32x32() {
        for mic in ["ready", "muted", "recording", "paused", "missing"] {
            let img = compose_tray_icon(mic, "running");
            assert_eq!(img.dimensions(), (32, 32), "mic={mic}");
        }
    }

    #[test]
    fn muted_has_white_glyph_pixels() {
        let img = compose_tray_icon("muted", "idle");
        let mut white = 0_u32;
        for px in img.pixels() {
            if px[0] == 255 && px[1] == 255 && px[2] == 255 {
                white += 1;
            }
        }
        assert!(white > 20, "expected white glyph pixels, got {white}");
    }

    #[test]
    fn recording_center_is_red() {
        let img = compose_tray_icon("recording", "idle");
        let c = img.get_pixel(16, 16);
        assert!(c[0] > 180 && c[1] < 120 && c[2] < 120);
    }

    #[test]
    fn muted_skips_agent_ring() {
        let with_ring = compose_tray_icon("ready", "running");
        let muted = compose_tray_icon("muted", "running");
        assert_ne!(with_ring.get_pixel(0, 0), muted.get_pixel(0, 0));
        let idle_ring = compose_tray_icon("ready", "idle");
        assert_eq!(muted.get_pixel(0, 0), idle_ring.get_pixel(0, 0));
    }

    #[test]
    fn agent_ring_colors_differ() {
        let running = compose_tray_icon("ready", "running");
        let failed = compose_tray_icon("ready", "failed");
        assert_ne!(running.get_pixel(0, 0), failed.get_pixel(0, 0));
    }
}
