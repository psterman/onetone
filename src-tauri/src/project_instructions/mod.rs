//! 项目说明书（Project Instructions）—— Batch A 后端闭环。
//!
//! 依赖单向：apply ← render ← decide ← {derive, signals} ← store
//! 读取一律走既有 project_context scope 路径；写入必须经用户显式确认。

pub mod apply;
pub mod decide;
pub mod derive;
pub mod model;
pub mod render;
pub mod signals;
pub mod store;
pub mod targets;
