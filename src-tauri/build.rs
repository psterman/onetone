use std::fs;
use std::io::BufWriter;
use std::path::Path;

use image::{ImageEncoder, Rgba, RgbaImage};

fn main() {
    ensure_icons_exist();

    tauri_build::build();
}

fn ensure_icons_exist() {
    let png_path = Path::new("icons/icon.png");
    let ico_path = Path::new("icons/icon.ico");
    if png_path.exists() && ico_path.exists() {
        return;
    }

    // Generate placeholder icons only when the bundled onetone assets are missing.
    let mut img = RgbaImage::new(32, 32);
    for (_, _, pixel) in img.enumerate_pixels_mut() {
        *pixel = Rgba([0x00, 0x7A, 0xFF, 0xFF]); // iOS blue
    }

    fs::create_dir_all("icons").ok();
    if !png_path.exists() {
        img.save(png_path).expect("failed to save icon PNG");
    }

    if !ico_path.exists() {
        let file = fs::File::create(ico_path).expect("failed to create icon.ico");
        let writer = BufWriter::new(file);
        let ico = image::codecs::ico::IcoEncoder::new(writer);
        ico.write_image(img.as_raw(), 32, 32, image::ExtendedColorType::Rgba8)
            .expect("failed to encode ICO");
    }
}
