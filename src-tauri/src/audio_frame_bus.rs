//! Shared 16 kHz mono PCM frame bus for runtime acoustic matching.
//! Producers (Vosk/KWS workers) publish; acoustic runtime subscribes.

use crossbeam_channel::{Receiver, Sender, TrySendError};

pub struct AudioFrameBus {
    tx: Sender<Vec<f32>>,
    rx: Receiver<Vec<f32>>,
}

impl AudioFrameBus {
    pub fn new() -> Self {
        let (tx, rx) = crossbeam_channel::unbounded();
        Self { tx, rx }
    }

    pub fn publisher(&self) -> Sender<Vec<f32>> {
        self.tx.clone()
    }

    pub fn subscriber(&self) -> Receiver<Vec<f32>> {
        self.rx.clone()
    }

    /// Best-effort publish; drops when the channel is disconnected.
    pub fn publish(&self, frames: &[f32]) {
        if frames.is_empty() {
            return;
        }
        match self.tx.try_send(frames.to_vec()) {
            Ok(()) | Err(TrySendError::Full(_)) => {}
            Err(TrySendError::Disconnected(_)) => {}
        }
    }
}

impl Default for AudioFrameBus {
    fn default() -> Self {
        Self::new()
    }
}
