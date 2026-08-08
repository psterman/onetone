//! Shared 16 kHz mono PCM frame bus for runtime acoustic matching.
//! Producers (Vosk/KWS workers) publish; acoustic runtime subscribes.
//!
//! Implementation lives in `onetone-logic` so behavior is testable without the
//! full Tauri native harness (`[lib] test = false` on Windows).

pub use onetone_logic::audio_frame_bus::{
    drain_receiver, match_worker_alive, AudioFrameBus, AudioFramePublisher, AUDIO_FRAME_BUS_CAP,
    AUDIO_FRAME_SAMPLE_RATE,
};
