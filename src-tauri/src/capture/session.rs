//! Capture session state machine — Region / Grid / Manual → one RectPx.

use super::grid::GridEngine;
use super::types::{
    CaptureAction, CapturePhase, EntrySource, MonitorInfo, RectPx, RegionCandidate,
};

#[derive(Debug, Clone)]
pub struct CaptureSessionLogic {
    pub phase: CapturePhase,
    pub entry: EntrySource,
    pub screen_rect: RectPx,
    pub monitors: Vec<MonitorInfo>,
    pub active_monitor: u32,
    pub regions: Vec<RegionCandidate>,
    pub candidate_rect: Option<RectPx>,
    pub grid: Option<GridEngine>,
    pub confirmed: Option<RectPx>,
}

impl CaptureSessionLogic {
    pub fn new(
        entry: EntrySource,
        screen_rect: RectPx,
        monitors: Vec<MonitorInfo>,
        active_monitor: u32,
        regions: Vec<RegionCandidate>,
    ) -> Self {
        let phase = if regions.is_empty() {
            CapturePhase::GridRefine
        } else {
            CapturePhase::RegionPick
        };
        let mut s = Self {
            phase,
            entry,
            screen_rect,
            monitors,
            active_monitor,
            regions,
            candidate_rect: None,
            grid: None,
            confirmed: None,
        };
        if s.phase == CapturePhase::GridRefine {
            s.enter_grid(screen_rect);
        }
        s
    }

    fn enter_grid(&mut self, initial: RectPx) {
        self.grid = Some(GridEngine::start(initial, self.screen_rect));
        self.candidate_rect = Some(initial);
        self.phase = CapturePhase::GridRefine;
    }

    pub fn apply(&mut self, action: CaptureAction) -> Result<(), String> {
        match (&self.phase, action) {
            (CapturePhase::RegionPick, CaptureAction::ChooseRegion { id }) => {
                let r = self
                    .regions
                    .iter()
                    .find(|c| c.id == id)
                    .ok_or_else(|| "unknown_region".to_string())?;
                // Select only — Confirm crops (keeps EnterGrid / HUD path open).
                self.candidate_rect = Some(r.rect_px);
                Ok(())
            }
            (CapturePhase::RegionPick, CaptureAction::Confirm) => {
                let rect = self.candidate_rect.ok_or_else(|| "no_candidate".to_string())?;
                self.confirmed = Some(rect);
                self.phase = CapturePhase::Confirmed;
                Ok(())
            }
            (CapturePhase::RegionPick, CaptureAction::EnterGrid) => {
                let initial = self
                    .candidate_rect
                    .or_else(|| self.regions.first().map(|r| r.rect_px))
                    .unwrap_or(self.screen_rect);
                self.enter_grid(initial);
                Ok(())
            }
            (CapturePhase::RegionPick, CaptureAction::EnterManual) => {
                self.phase = CapturePhase::ManualSelect;
                Ok(())
            }
            (CapturePhase::RegionPick | CapturePhase::ManualSelect | CapturePhase::RectAdjust, CaptureAction::SetManualRect { rect }) => {
                self.candidate_rect = Some(rect);
                self.phase = CapturePhase::RectAdjust;
                Ok(())
            }
            (CapturePhase::GridRefine, ref a @ CaptureAction::ChooseQuadrant { .. })
            | (CapturePhase::GridRefine, ref a @ CaptureAction::PopGrid)
            | (CapturePhase::GridRefine, ref a @ CaptureAction::NudgeRect { .. })
            | (CapturePhase::GridRefine, ref a @ CaptureAction::ResizeRect { .. }) => {
                let grid = self.grid.as_mut().ok_or("no_grid")?;
                let rect = grid.apply(a).map_err(|e| e.to_string())?;
                self.candidate_rect = Some(rect);
                Ok(())
            }
            (CapturePhase::GridRefine, CaptureAction::Confirm) => {
                let rect = self.candidate_rect.ok_or("no_candidate")?;
                self.confirmed = Some(rect);
                self.phase = CapturePhase::Confirmed;
                Ok(())
            }
            (CapturePhase::GridRefine, CaptureAction::ExitGrid) => {
                self.grid = None;
                if self.regions.is_empty() {
                    self.phase = CapturePhase::ManualSelect;
                } else {
                    self.phase = CapturePhase::RegionPick;
                }
                Ok(())
            }
            (CapturePhase::GridRefine, CaptureAction::EnterManual) => {
                self.grid = None;
                self.phase = CapturePhase::ManualSelect;
                Ok(())
            }
            (CapturePhase::RectAdjust | CapturePhase::ManualSelect, CaptureAction::Confirm) => {
                let rect = self.candidate_rect.ok_or("no_candidate")?;
                self.confirmed = Some(rect);
                self.phase = CapturePhase::Confirmed;
                Ok(())
            }
            (CapturePhase::RegionPick, CaptureAction::PickScreen { index }) => {
                if let Some(m) = self.monitors.iter().find(|m| m.index == index) {
                    self.active_monitor = index;
                    self.screen_rect = m.rect_px;
                    // Regions stay until re-capture; UI may restart session.
                    self.phase = CapturePhase::ScreenPick;
                }
                Ok(())
            }
            (_, CaptureAction::Cancel) => {
                self.phase = CapturePhase::Closed;
                Ok(())
            }
            (phase, other) => Err(format!("invalid_action:{phase:?}:{other:?}")),
        }
    }

    pub fn take_confirmed(&self) -> Option<RectPx> {
        self.confirmed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture::types::{RegionRole, RegionSource};

    fn sample() -> CaptureSessionLogic {
        let screen = RectPx::new(0, 0, 1000, 800);
        let regions = vec![RegionCandidate {
            id: 1,
            rect_px: RectPx::new(100, 100, 400, 300),
            source: RegionSource::Heuristic,
            role: RegionRole::Editor,
            confidence: 0.9,
            label: Some("编辑器".into()),
            hotkey: Some("1".into()),
        }];
        CaptureSessionLogic::new(EntrySource::Hotkey, screen, vec![], 0, regions)
    }

    fn sample_two_regions() -> CaptureSessionLogic {
        let screen = RectPx::new(0, 0, 1000, 800);
        let regions = vec![
            RegionCandidate {
                id: 1,
                rect_px: RectPx::new(100, 100, 400, 300),
                source: RegionSource::Heuristic,
                role: RegionRole::Editor,
                confidence: 0.9,
                label: Some("编辑器".into()),
                hotkey: Some("1".into()),
            },
            RegionCandidate {
                id: 2,
                rect_px: RectPx::new(520, 100, 300, 250),
                source: RegionSource::Heuristic,
                role: RegionRole::Chat,
                confidence: 0.8,
                label: Some("聊天".into()),
                hotkey: Some("2".into()),
            },
        ];
        CaptureSessionLogic::new(EntrySource::SoftPad, screen, vec![], 0, regions)
    }

    #[test]
    fn choose_region_then_confirm() {
        let mut s = sample();
        s.apply(CaptureAction::ChooseRegion { id: 1 }).unwrap();
        assert_eq!(s.phase, CapturePhase::RegionPick);
        assert_eq!(s.candidate_rect.unwrap().w, 400);
        s.apply(CaptureAction::Confirm).unwrap();
        assert_eq!(s.phase, CapturePhase::Confirmed);
        assert_eq!(s.confirmed.unwrap().w, 400);
    }

    #[test]
    fn choose_region_then_enter_grid_uses_that_rect() {
        let mut s = sample_two_regions();
        s.apply(CaptureAction::ChooseRegion { id: 2 }).unwrap();
        s.apply(CaptureAction::EnterGrid).unwrap();
        assert_eq!(s.phase, CapturePhase::GridRefine);
        let rect = s.candidate_rect.expect("grid candidate");
        assert_eq!(rect, RectPx::new(520, 100, 300, 250));
        assert_ne!(rect, RectPx::new(100, 100, 400, 300));
        let grid = s.grid.as_ref().expect("grid");
        assert_eq!(grid.current(), rect);
    }

    #[test]
    fn grid_path() {
        let mut s = sample();
        s.apply(CaptureAction::EnterGrid).unwrap();
        assert_eq!(s.phase, CapturePhase::GridRefine);
        s.apply(CaptureAction::ChooseQuadrant {
            quadrant: crate::capture::types::Quadrant::K,
        })
        .unwrap();
        s.apply(CaptureAction::Confirm).unwrap();
        let r = s.confirmed.unwrap();
        assert!(r.w <= 200);
        assert!(r.h <= 150);
    }

    #[test]
    fn empty_regions_start_in_grid() {
        let screen = RectPx::new(0, 0, 800, 600);
        let s = CaptureSessionLogic::new(EntrySource::Home, screen, vec![], 0, vec![]);
        assert_eq!(s.phase, CapturePhase::GridRefine);
        assert!(s.grid.is_some());
    }
}
