//! Bounded 16 kHz mono PCM frame bus for acoustic matching.
//!
//! Capacity is message-count based. Chunk length is driver-defined; target backlog
//! is ~500–1000ms assuming ~20ms chunks (≈320 samples @ 16 kHz):
//! `buffered_ms ≈ CAP * chunk_samples / 16000 * 1000`.
//! With CAP=48 and 320-sample chunks → ~960ms.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use crossbeam_channel::{Receiver, Sender, TryRecvError, TrySendError};

/// Message slots. See module docs for `buffered_ms` assumption.
pub const AUDIO_FRAME_BUS_CAP: usize = 48;

/// Sample rate used when estimating backlog duration.
pub const AUDIO_FRAME_SAMPLE_RATE: u32 = 16_000;

pub struct AudioFrameBus {
    tx: Sender<Vec<f32>>,
    rx: Receiver<Vec<f32>>,
    dropped: Arc<AtomicU64>,
    published: Arc<AtomicU64>,
    buffered_samples: Arc<AtomicU64>,
}

#[derive(Clone)]
pub struct AudioFramePublisher {
    tx: Sender<Vec<f32>>,
    dropped: Arc<AtomicU64>,
    published: Arc<AtomicU64>,
    buffered_samples: Arc<AtomicU64>,
}

impl AudioFrameBus {
    pub fn new() -> Self {
        let (tx, rx) = crossbeam_channel::bounded(AUDIO_FRAME_BUS_CAP);
        Self {
            tx,
            rx,
            dropped: Arc::new(AtomicU64::new(0)),
            published: Arc::new(AtomicU64::new(0)),
            buffered_samples: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn publisher(&self) -> AudioFramePublisher {
        AudioFramePublisher {
            tx: self.tx.clone(),
            dropped: Arc::clone(&self.dropped),
            published: Arc::clone(&self.published),
            buffered_samples: Arc::clone(&self.buffered_samples),
        }
    }

    pub fn subscriber(&self) -> Receiver<Vec<f32>> {
        self.rx.clone()
    }

    /// Best-effort publish; Full → drop-new (increment dropped).
    pub fn publish(&self, frames: &[f32]) {
        self.publisher().try_publish(frames.to_vec());
    }

    /// Drain at most `max` messages (≤ CAP is enough for a bounded bus).
    pub fn drain_max(&self, max: usize) -> DrainStats {
        drain_receiver(&self.rx, max, &self.buffered_samples)
    }

    pub fn dropped_frames(&self) -> u64 {
        self.dropped.load(Ordering::Relaxed)
    }

    pub fn published_frames(&self) -> u64 {
        self.published.load(Ordering::Relaxed)
    }

    pub fn buffered_samples(&self) -> u64 {
        self.buffered_samples.load(Ordering::Relaxed)
    }

    pub fn buffered_samples_handle(&self) -> Arc<AtomicU64> {
        Arc::clone(&self.buffered_samples)
    }

    pub fn buffered_ms_estimate(&self) -> u64 {
        buffered_ms_from_samples(self.buffered_samples())
    }

    pub fn capacity(&self) -> usize {
        AUDIO_FRAME_BUS_CAP
    }
}

impl Default for AudioFrameBus {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioFramePublisher {
    /// True when the bounded bus has no free slot (matcher not draining / backlog).
    pub fn is_full(&self) -> bool {
        self.tx.is_full()
    }

    /// Count a drop without allocating a frame (use when skipping publish because full).
    pub fn note_dropped(&self) {
        self.dropped.fetch_add(1, Ordering::Relaxed);
    }

    /// Drop-new on Full. Returns whether the frame was queued.
    pub fn try_publish(&self, frames: Vec<f32>) -> bool {
        if frames.is_empty() {
            return true;
        }
        let n = frames.len() as u64;
        match self.tx.try_send(frames) {
            Ok(()) => {
                self.published.fetch_add(1, Ordering::Relaxed);
                self.buffered_samples.fetch_add(n, Ordering::Relaxed);
                true
            }
            Err(TrySendError::Full(_)) => {
                self.dropped.fetch_add(1, Ordering::Relaxed);
                false
            }
            Err(TrySendError::Disconnected(_)) => false,
        }
    }

    pub fn dropped_frames(&self) -> u64 {
        self.dropped.load(Ordering::Relaxed)
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DrainStats {
    pub messages: usize,
    pub samples: u64,
}

pub fn buffered_ms_from_samples(samples: u64) -> u64 {
    samples.saturating_mul(1000) / u64::from(AUDIO_FRAME_SAMPLE_RATE)
}

/// Drain up to `max` messages from a subscriber clone; adjusts shared sample counter.
pub fn drain_receiver(
    rx: &Receiver<Vec<f32>>,
    max: usize,
    buffered_samples: &AtomicU64,
) -> DrainStats {
    let mut stats = DrainStats::default();
    for _ in 0..max {
        match rx.try_recv() {
            Ok(chunk) => {
                let n = chunk.len() as u64;
                stats.messages += 1;
                stats.samples = stats.samples.saturating_add(n);
                let _ = buffered_samples.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |cur| {
                    Some(cur.saturating_sub(n))
                });
            }
            Err(TryRecvError::Empty) | Err(TryRecvError::Disconnected) => break,
        }
    }
    stats
}

/// True while this worker's generation is still the live one.
pub fn match_worker_alive(my_gen: u64, current_gen: u64, stop: bool) -> bool {
    !stop && my_gen != 0 && my_gen == current_gen
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn bounded_drop_new_caps_depth() {
        let bus = AudioFrameBus::new();
        let pub_ = bus.publisher();
        for i in 0..AUDIO_FRAME_BUS_CAP + 20 {
            let ok = pub_.try_publish(vec![i as f32; 320]);
            if i < AUDIO_FRAME_BUS_CAP {
                assert!(ok, "slot {i} should accept");
            } else {
                assert!(!ok, "over-cap should drop-new");
            }
        }
        assert_eq!(bus.dropped_frames(), 20);
        assert_eq!(bus.published_frames(), AUDIO_FRAME_BUS_CAP as u64);
        // ~960ms if 320-sample chunks
        assert_eq!(
            buffered_ms_from_samples(AUDIO_FRAME_BUS_CAP as u64 * 320),
            960
        );
    }

    #[test]
    fn drain_max_clears_and_respects_cap() {
        let bus = AudioFrameBus::new();
        let pub_ = bus.publisher();
        for _ in 0..10 {
            assert!(pub_.try_publish(vec![0.1; 100]));
        }
        let stats = bus.drain_max(AUDIO_FRAME_BUS_CAP);
        assert_eq!(stats.messages, 10);
        assert_eq!(stats.samples, 1000);
        assert_eq!(bus.drain_max(AUDIO_FRAME_BUS_CAP).messages, 0);
    }

    #[test]
    fn match_worker_alive_requires_matching_gen() {
        assert!(match_worker_alive(3, 3, false));
        assert!(!match_worker_alive(3, 4, false));
        assert!(!match_worker_alive(3, 3, true));
        assert!(!match_worker_alive(0, 0, false));
    }

    #[test]
    fn is_full_skips_without_try_send() {
        let bus = AudioFrameBus::new();
        let pub_ = bus.publisher();
        for _ in 0..AUDIO_FRAME_BUS_CAP {
            assert!(pub_.try_publish(vec![0.0; 10]));
        }
        assert!(pub_.is_full());
        pub_.note_dropped();
        assert_eq!(bus.dropped_frames(), 1);
        assert!(!pub_.try_publish(vec![1.0; 10]));
        assert_eq!(bus.dropped_frames(), 2);
    }

    #[test]
    fn subscriber_receives_until_drained() {
        let bus = AudioFrameBus::new();
        let rx = bus.subscriber();
        bus.publisher().try_publish(vec![1.0, 2.0]);
        let got = rx.recv_timeout(Duration::from_millis(50)).expect("frame");
        assert_eq!(got, vec![1.0, 2.0]);
    }
}
