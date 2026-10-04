//! Plan A: paginated session event reads (observed + lifecycle rows already in store).

use crate::agent_memory::model::HomeEventDto;
use crate::agent_memory::store::with_read_path;
use rusqlite::params;

/// Paginated events (`before` = exclusive upper bound on timestamp_ms).
pub fn list_session_events(
    session_id: &str,
    limit: usize,
    before_ms: Option<u64>,
) -> (Vec<HomeEventDto>, bool) {
    let lim = limit.clamp(1, 200);
    let rows = with_read_path(|conn| {
        let mut out = Vec::new();
        if let Some(before) = before_ms {
            let mut stmt = conn
                .prepare(
                    "SELECT event_id, event_type, event_class, summary, timestamp_ms, session_id
                     FROM agent_events
                     WHERE session_id = ?1 AND timestamp_ms < ?2
                     ORDER BY timestamp_ms DESC
                     LIMIT ?3",
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![session_id, before as i64, (lim + 1) as i64], |r| {
                    Ok(HomeEventDto {
                        event_id: r.get(0)?,
                        event_type: r.get(1)?,
                        event_class: r.get(2)?,
                        summary: r.get(3)?,
                        timestamp: r.get::<_, i64>(4)? as u64,
                        session_id: r.get(5)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            for row in mapped.flatten() {
                out.push(row);
            }
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT event_id, event_type, event_class, summary, timestamp_ms, session_id
                     FROM agent_events
                     WHERE session_id = ?1
                     ORDER BY timestamp_ms DESC
                     LIMIT ?2",
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![session_id, (lim + 1) as i64], |r| {
                    Ok(HomeEventDto {
                        event_id: r.get(0)?,
                        event_type: r.get(1)?,
                        event_class: r.get(2)?,
                        summary: r.get(3)?,
                        timestamp: r.get::<_, i64>(4)? as u64,
                        session_id: r.get(5)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            for row in mapped.flatten() {
                out.push(row);
            }
        }
        Ok(out)
    })
    .unwrap_or_default();
    let complete = rows.len() <= lim;
    let events = rows.into_iter().take(lim).collect();
    (events, complete)
}
