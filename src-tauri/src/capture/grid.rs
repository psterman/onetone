//! Recursive 2×2 grid that shrinks the candidate crop rect (not a pointer).

use super::types::{CaptureAction, Quadrant, RectPx};

#[derive(Debug, Clone)]
pub struct GridEngine {
    stack: Vec<RectPx>,
    bounds: RectPx,
}

impl GridEngine {
    pub fn start(initial: RectPx, bounds: RectPx) -> Self {
        Self {
            stack: vec![initial],
            bounds,
        }
    }

    pub fn depth(&self) -> usize {
        self.stack.len()
    }

    pub fn current(&self) -> RectPx {
        *self.stack.last().unwrap_or(&self.bounds)
    }

    pub fn apply(&mut self, action: &CaptureAction) -> Result<RectPx, &'static str> {
        match action {
            CaptureAction::ChooseQuadrant { quadrant } => {
                let next = self.current().quadrant(*quadrant);
                self.stack.push(next);
                Ok(next)
            }
            CaptureAction::PopGrid => {
                if self.stack.len() <= 1 {
                    return Err("grid_at_root");
                }
                self.stack.pop();
                Ok(self.current())
            }
            CaptureAction::NudgeRect { dx, dy } => {
                let next = self.current().nudge(*dx, *dy, self.bounds);
                if let Some(last) = self.stack.last_mut() {
                    *last = next;
                }
                Ok(next)
            }
            CaptureAction::ResizeRect { dw, dh } => {
                let next = self.current().resize(*dw, *dh, self.bounds);
                if let Some(last) = self.stack.last_mut() {
                    *last = next;
                }
                Ok(next)
            }
            _ => Err("unsupported_grid_action"),
        }
    }
}

/// Pure helper for tests / fixtures: apply a sequence of quadrant keys.
pub fn shrink_by_keys(initial: RectPx, keys: &[&str]) -> RectPx {
    let mut eng = GridEngine::start(initial, initial);
    for k in keys {
        let q = Quadrant::from_key(k).expect("key");
        let _ = eng.apply(&CaptureAction::ChooseQuadrant { quadrant: q });
    }
    eng.current()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn four_levels_shrink() {
        let start = RectPx::new(0, 0, 800, 600);
        let end = shrink_by_keys(start, &["k", "u", "i", "j"]);
        assert!(end.w < 100, "w={}", end.w);
        assert!(end.h < 80, "h={}", end.h);
        assert!(end.area() < start.area() / 8);
    }

    #[test]
    fn pop_restores() {
        let mut eng = GridEngine::start(RectPx::new(10, 20, 400, 300), RectPx::new(0, 0, 800, 600));
        let _ = eng.apply(&CaptureAction::ChooseQuadrant {
            quadrant: Quadrant::I,
        });
        assert_eq!(eng.depth(), 2);
        let _ = eng.apply(&CaptureAction::PopGrid);
        assert_eq!(eng.depth(), 1);
        assert_eq!(eng.current(), RectPx::new(10, 20, 400, 300));
    }

    #[test]
    fn nudge_stays_in_bounds() {
        let bounds = RectPx::new(0, 0, 200, 200);
        let mut eng = GridEngine::start(RectPx::new(0, 0, 50, 50), bounds);
        let r = eng
            .apply(&CaptureAction::NudgeRect { dx: -100, dy: -100 })
            .unwrap();
        assert_eq!(r.x, 0);
        assert_eq!(r.y, 0);
    }
}
