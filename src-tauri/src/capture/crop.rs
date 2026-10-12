//! Crop from clean RGBA frame using virtual-desktop physical rect mapped to frame pixels.

use super::types::RectPx;
use image::{ImageBuffer, RgbaImage};

/// Frame origin is the captured monitor's top-left in virtual-desktop space.
pub fn crop_rgba(
    rgba: &[u8],
    frame_w: u32,
    frame_h: u32,
    frame_origin: RectPx,
    crop: RectPx,
) -> Result<RgbaImage, String> {
    if rgba.len() < (frame_w as usize) * (frame_h as usize) * 4 {
        return Err("frame_buf_short".into());
    }
    // Map virtual-desktop crop → frame-local.
    let lx = crop.x - frame_origin.x;
    let ly = crop.y - frame_origin.y;
    if lx < 0 || ly < 0 {
        return Err("crop_outside_frame".into());
    }
    let x = lx as u32;
    let y = ly as u32;
    if x >= frame_w || y >= frame_h {
        return Err("crop_oob".into());
    }
    let w = crop.w.min(frame_w - x).max(1);
    let h = crop.h.min(frame_h - y).max(1);

    let full: RgbaImage = ImageBuffer::from_raw(frame_w, frame_h, rgba.to_vec())
        .ok_or_else(|| "bad_frame".to_string())?;
    let cropped = image::imageops::crop_imm(&full, x, y, w, h).to_image();
    Ok(cropped)
}

pub fn encode_png(img: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    let enc = image::codecs::png::PngEncoder::new(&mut buf);
    use image::ImageEncoder;
    enc.write_image(
        img.as_raw(),
        img.width(),
        img.height(),
        image::ExtendedColorType::Rgba8,
    )
    .map_err(|e| format!("png_encode:{e}"))?;
    Ok(buf)
}

/// Tint-free identity check helper for tests.
pub fn solid_frame(w: u32, h: u32, color: [u8; 4]) -> Vec<u8> {
    let mut v = Vec::with_capacity((w * h * 4) as usize);
    for _ in 0..(w * h) {
        v.extend_from_slice(&color);
    }
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crop_center_block() {
        // 10x10 red frame; crop 2,2,4,4 → still red
        let rgba = solid_frame(10, 10, [255, 0, 0, 255]);
        let origin = RectPx::new(0, 0, 10, 10);
        let crop = RectPx::new(2, 2, 4, 4);
        let img = crop_rgba(&rgba, 10, 10, origin, crop).unwrap();
        assert_eq!(img.width(), 4);
        assert_eq!(img.height(), 4);
        assert_eq!(img.get_pixel(0, 0).0, [255, 0, 0, 255]);
        let png = encode_png(&img).unwrap();
        assert!(png.starts_with(&[0x89, b'P', b'N', b'G']));
    }

    #[test]
    fn crop_with_monitor_offset() {
        let rgba = solid_frame(100, 80, [0, 128, 0, 255]);
        let origin = RectPx::new(-1920, 0, 100, 80);
        let crop = RectPx::new(-1920 + 10, 20, 30, 20);
        let img = crop_rgba(&rgba, 100, 80, origin, crop).unwrap();
        assert_eq!(img.dimensions(), (30, 20));
    }
}
