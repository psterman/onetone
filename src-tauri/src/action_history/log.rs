//! Append-only action history log + in-memory ring.

use std::collections::{HashMap, HashSet, VecDeque};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

use parking_lot::Mutex as ParkingMutex;
use serde::Serialize;

use super::model::{ActionHistoryEntry, RING_CAPACITY, MAX_TAIL_LIMIT};

pub const UNMAPPED_KEY: &str = "_unmapped";

#[cfg(not(test))]
static ENABLED: AtomicBool = AtomicBool::new(true);
#[cfg(test)]
static ENABLED: AtomicBool = AtomicBool::new(false);

static LOG_PATH_OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);
static SEQ: AtomicU64 = AtomicU64::new(0);
static SEQ_BOOTSTRAPPED: AtomicBool = AtomicBool::new(false);
static RING: ParkingMutex<VecDeque<ActionHistoryEntry>> = ParkingMutex::new(VecDeque::new());
// ponytail: process-local TTL cache; bump on record/clear — upgrade: file mtime watch
static MERGED_CACHE_GEN: AtomicU64 = AtomicU64::new(0);
static MERGED_CACHE: ParkingMutex<Option<(u64, u64, Vec<ActionHistoryEntry>)>> =
    ParkingMutex::new(None);
const MERGED_CACHE_TTL_MS: u64 = 5000;

pub fn set_enabled(on: bool) {
    ENABLED.store(on, Ordering::Relaxed);
}

pub fn set_log_path_override(path: Option<PathBuf>) {
    if let Ok(mut slot) = LOG_PATH_OVERRIDE.lock() {
        *slot = path;
    }
}

pub fn log_path() -> PathBuf {
    if let Ok(slot) = LOG_PATH_OVERRIDE.lock() {
        if let Some(ref p) = *slot {
            return p.clone();
        }
    }
    crate::data_root::effective_logs_dir().join("action-history.jsonl")
}

fn bootstrap_seq_from_disk() {
    if SEQ_BOOTSTRAPPED.swap(true, Ordering::Relaxed) {
        return;
    }
    let path = log_path();
    let Ok(file) = fs::File::open(&path) else {
        return;
    };
    let reader = BufReader::new(file);
    let mut max_id = 0u64;
    for line in reader.lines().flatten() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(entry) = serde_json::from_str::<ActionHistoryEntry>(line) {
            max_id = max_id.max(entry.id);
        }
    }
    if max_id > 0 {
        SEQ.store(max_id, Ordering::Relaxed);
    }
}

fn next_id() -> u64 {
    bootstrap_seq_from_disk();
    SEQ.fetch_add(1, Ordering::Relaxed) + 1
}

fn push_ring(entry: &ActionHistoryEntry) {
    let mut ring = RING.lock();
    if ring.len() >= RING_CAPACITY {
        ring.pop_front();
    }
    ring.push_back(entry.clone());
}

fn append_jsonl(entry: &ActionHistoryEntry) {
    let Ok(text) = serde_json::to_string(entry) else {
        return;
    };
    let path = log_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{text}");
    }
}

/// Record one action; assigns id + ts if missing.
pub fn record(mut entry: ActionHistoryEntry) -> ActionHistoryEntry {
    if !ENABLED.load(Ordering::Relaxed) {
        return entry;
    }
    if entry.id == 0 {
        entry.id = next_id();
    }
    if entry.ts_ms == 0 {
        entry.ts_ms = crate::runtime_event::now_ms();
    }
    push_ring(&entry);
    append_jsonl(&entry);
    bump_merged_cache_gen();
    entry
}

pub fn recent_ring(limit: usize) -> Vec<ActionHistoryEntry> {
    let limit = limit.clamp(1, RING_CAPACITY);
    let ring = RING.lock();
    let start = ring.len().saturating_sub(limit);
    ring.iter().skip(start).cloned().collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionHistoryListResult {
    pub entries: Vec<ActionHistoryEntry>,
    pub has_more: bool,
}

fn read_jsonl_entries() -> Vec<ActionHistoryEntry> {
    let path = log_path();
    let Ok(file) = fs::File::open(&path) else {
        return vec![];
    };
    let reader = BufReader::new(file);
    let mut out = Vec::new();
    for line in reader.lines().flatten() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(entry) = serde_json::from_str::<ActionHistoryEntry>(line) {
            out.push(entry);
        }
    }
    out
}

fn merge_entries(jsonl: Vec<ActionHistoryEntry>, ring: Vec<ActionHistoryEntry>) -> Vec<ActionHistoryEntry> {
    let mut seen = HashSet::new();
    let mut merged = Vec::new();
    for e in ring.into_iter().chain(jsonl) {
        if seen.insert(e.id) {
            merged.push(e);
        }
    }
    merged.sort_by(|a, b| b.ts_ms.cmp(&a.ts_ms).then(b.id.cmp(&a.id)));
    merged
}

fn bump_merged_cache_gen() {
    MERGED_CACHE_GEN.fetch_add(1, Ordering::Relaxed);
}

fn cached_merged_entries() -> Vec<ActionHistoryEntry> {
    let gen = MERGED_CACHE_GEN.load(Ordering::Relaxed);
    let now = crate::runtime_event::now_ms();
    {
        let guard = MERGED_CACHE.lock();
        if let Some((cached_gen, cached_at, ref entries)) = *guard {
            if cached_gen == gen && now.saturating_sub(cached_at) < MERGED_CACHE_TTL_MS {
                return entries.clone();
            }
        }
    }
    let entries = merge_entries(read_jsonl_entries(), recent_ring(RING_CAPACITY));
    *MERGED_CACHE.lock() = Some((gen, now, entries.clone()));
    entries
}

fn channel_matches(entry: &ActionHistoryEntry, channel: Option<&str>) -> bool {
    let Some(want) = channel.map(str::trim).filter(|s| !s.is_empty()) else {
        return true;
    };
    entry.channel.eq_ignore_ascii_case(want)
}

fn mapping_matches(entry: &ActionHistoryEntry, mapping_id: Option<&str>) -> bool {
    let Some(want) = mapping_id.map(str::trim).filter(|s| !s.is_empty()) else {
        return true;
    };
    entry
        .mapping_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|got| got == want)
        .unwrap_or(false)
}

/// Real habit usage: key / voice / SoftPad / camera — not scheme-switch navigation.
fn is_usage_entry(entry: &ActionHistoryEntry) -> bool {
    !entry.channel.eq_ignore_ascii_case("system")
        && !entry.kind.eq_ignore_ascii_case("scheme_switch")
}

/// Newest-first list with optional channel / mapping / time-window filters and cursor (`before_ts`).
pub fn tail(
    limit: usize,
    channel: Option<&str>,
    mapping_id: Option<&str>,
    before_ts: Option<u64>,
    hours: Option<u64>,
) -> ActionHistoryListResult {
    let limit = limit.clamp(1, MAX_TAIL_LIMIT);
    let merged = cached_merged_entries();
    let before = before_ts.unwrap_or(u64::MAX);
    let cutoff = hours.map(|h| {
        let h = h.clamp(1, 24 * 365);
        crate::runtime_event::now_ms().saturating_sub(h.saturating_mul(3600_000))
    });
    let filtered: Vec<ActionHistoryEntry> = merged
        .into_iter()
        .filter(|e| {
            is_usage_entry(e)
                && channel_matches(e, channel)
                && mapping_matches(e, mapping_id)
                && e.ts_ms < before
                && cutoff.is_none_or(|c| e.ts_ms >= c)
        })
        .take(limit + 1)
        .collect();
    let has_more = filtered.len() > limit;
    let entries = filtered.into_iter().take(limit).collect();
    ActionHistoryListResult { entries, has_more }
}

pub fn clear() {
    let _ = fs::remove_file(log_path());
    RING.lock().clear();
    bump_merged_cache_gen();
}

/// Test helper: wipe ring + seq bootstrap so parallel/serial tests don't leak.
pub fn reset_for_test() {
    clear();
    SEQ.store(0, Ordering::Relaxed);
    SEQ_BOOTSTRAPPED.store(false, Ordering::Relaxed);
    bump_merged_cache_gen();
}

pub fn entries_for_analysis(
    hours: u64,
    limit: usize,
    mapping_id: Option<&str>,
) -> Vec<ActionHistoryEntry> {
    let limit = limit.clamp(1, 500);
    let cutoff = crate::runtime_event::now_ms().saturating_sub(hours.saturating_mul(3600_000));
    cached_merged_entries()
        .into_iter()
        .filter(|e| {
            is_usage_entry(e) && e.ts_ms >= cutoff && mapping_matches(e, mapping_id)
        })
        .take(limit)
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MappingActionStats {
    pub mapping_id: String,
    pub count: u64,
    pub last_ts_ms: u64,
    pub first_ts_ms: u64,
    pub active_days: u64,
    pub per_day: f64,
    pub last_channel: String,
    pub by_channel: HashMap<String, u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionHistoryStatsResult {
    pub hours: u64,
    pub rows: Vec<MappingActionStats>,
}

fn day_bucket(ts_ms: u64) -> u64 {
    ts_ms / 86_400_000
}

/// Aggregate usage per mappingId within the last `hours` (None → 168 = 7d).
/// Entries without mappingId go under `_unmapped`. System/scheme_switch excluded.
pub fn stats_by_mapping(hours: Option<u64>) -> ActionHistoryStatsResult {
    let hours = hours.unwrap_or(168).clamp(1, 24 * 365);
    let cutoff = crate::runtime_event::now_ms().saturating_sub(hours.saturating_mul(3600_000));
    let merged = cached_merged_entries();

    struct Acc {
        count: u64,
        last_ts: u64,
        first_ts: u64,
        last_channel: String,
        days: HashSet<u64>,
        by_channel: HashMap<String, u64>,
    }

    let mut map: HashMap<String, Acc> = HashMap::new();
    for e in merged
        .into_iter()
        .filter(|e| e.ts_ms >= cutoff && is_usage_entry(e))
    {
        let key = e
            .mapping_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(UNMAPPED_KEY)
            .to_string();
        let acc = map.entry(key).or_insert_with(|| Acc {
            count: 0,
            last_ts: 0,
            first_ts: u64::MAX,
            last_channel: String::new(),
            days: HashSet::new(),
            by_channel: HashMap::new(),
        });
        acc.count += 1;
        if e.ts_ms >= acc.last_ts {
            acc.last_ts = e.ts_ms;
            acc.last_channel = e.channel.clone();
        }
        acc.first_ts = acc.first_ts.min(e.ts_ms);
        acc.days.insert(day_bucket(e.ts_ms));
        *acc.by_channel.entry(e.channel.clone()).or_insert(0) += 1;
    }

    let mut rows: Vec<MappingActionStats> = map
        .into_iter()
        .map(|(mapping_id, acc)| {
            let active_days = acc.days.len().max(1) as u64;
            MappingActionStats {
                mapping_id,
                count: acc.count,
                last_ts_ms: acc.last_ts,
                first_ts_ms: if acc.first_ts == u64::MAX {
                    0
                } else {
                    acc.first_ts
                },
                active_days,
                per_day: acc.count as f64 / active_days as f64,
                last_channel: acc.last_channel,
                by_channel: acc.by_channel,
            }
        })
        .collect();
    rows.sort_by(|a, b| b.count.cmp(&a.count).then(b.last_ts_ms.cmp(&a.last_ts_ms)));
    ActionHistoryStatsResult { hours, rows }
}

/// Usage counts for each of the last `days` calendar buckets (oldest → newest).
pub fn usage_counts_last_days(days: u64) -> Vec<u64> {
    let days = days.clamp(1, 30) as usize;
    let now = crate::runtime_event::now_ms();
    let today = day_bucket(now);
    let start_day = today.saturating_sub(days as u64 - 1);
    let cutoff = start_day.saturating_mul(86_400_000);
    let mut buckets = vec![0u64; days];
    let merged = cached_merged_entries();
    for e in merged.into_iter().filter(|e| e.ts_ms >= cutoff && is_usage_entry(e)) {
        let d = day_bucket(e.ts_ms);
        if d < start_day || d > today {
            continue;
        }
        let idx = (d - start_day) as usize;
        if idx < buckets.len() {
            buckets[idx] += 1;
        }
    }
    buckets
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tmp_path(name: &str) -> PathBuf {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("onetone-{name}-{ts}.jsonl"))
    }

    #[test]
    fn append_tail_clear_and_channel_filter() {
        set_enabled(true);
        let path = tmp_path("action-history");
        set_log_path_override(Some(path.clone()));
        clear();

        record(ActionHistoryEntry::new(
            0,
            1000,
            "key",
            "semantic_action",
            "executed",
            "按键 · test",
        ));
        record(ActionHistoryEntry::new(
            0,
            2000,
            "voice",
            "voice_phrase",
            "executed",
            "语音 · wake",
        ));

        let all = tail(50, None, None, None, None);
        assert_eq!(all.entries.len(), 2);
        assert!(!all.has_more);

        let voice = tail(50, Some("voice"), None, None, None);
        assert_eq!(voice.entries.len(), 1);
        assert_eq!(voice.entries[0].channel, "voice");

        let page = tail(1, None, None, None, None);
        assert_eq!(page.entries.len(), 1);
        assert!(page.has_more);

        clear();
        assert!(tail(10, None, None, None, None).entries.is_empty());
        let _ = fs::remove_file(path);
        set_log_path_override(None);
    }

    #[test]
    fn mapping_filter_and_stats() {
        set_enabled(true);
        let path = tmp_path("action-history-stats");
        set_log_path_override(Some(path.clone()));
        clear();

        let now = crate::runtime_event::now_ms();
        let mut a = ActionHistoryEntry::new(0, now, "key", "semantic_action", "executed", "a");
        a.mapping_id = Some("map-a".into());
        record(a);
        let mut b = ActionHistoryEntry::new(0, now, "voice", "voice_phrase", "executed", "b");
        b.mapping_id = Some("map-a".into());
        record(b);
        let mut c = ActionHistoryEntry::new(0, now, "key", "send_key", "executed", "c");
        c.mapping_id = Some("map-b".into());
        record(c);
        record(ActionHistoryEntry::new(
            0,
            now,
            "system",
            "scheme_switch",
            "executed",
            "orphan",
        ));

        let filtered = tail(50, None, Some("map-a"), None, None);
        assert_eq!(filtered.entries.len(), 2);

        let stats = stats_by_mapping(Some(24));
        let row_a = stats
            .rows
            .iter()
            .find(|r| r.mapping_id == "map-a")
            .expect("map-a");
        assert_eq!(row_a.count, 2);
        assert!(row_a.per_day >= 1.0);
        assert_eq!(row_a.by_channel.get("key").copied().unwrap_or(0), 1);
        assert_eq!(row_a.by_channel.get("voice").copied().unwrap_or(0), 1);
        assert!(stats.rows.iter().all(|r| r.mapping_id != "_unmapped"));
        assert!(tail(50, None, None, None, None)
            .entries
            .iter()
            .all(|e| e.channel != "system"));

        clear();
        let _ = fs::remove_file(path);
        set_log_path_override(None);
    }

    #[test]
    fn merged_cache_reuses_reads_within_ttl() {
        set_enabled(true);
        let path = tmp_path("action-history-cache");
        set_log_path_override(Some(path.clone()));
        clear();

        record(ActionHistoryEntry::new(
            0,
            1000,
            "key",
            "semantic_action",
            "executed",
            "cache test",
        ));

        let _ = cached_merged_entries();
        let _ = cached_merged_entries();
        let stats1 = stats_by_mapping(Some(24));
        let stats2 = stats_by_mapping(Some(24));
        assert_eq!(stats1.rows.len(), stats2.rows.len());

        record(ActionHistoryEntry::new(
            0,
            2000,
            "voice",
            "voice_phrase",
            "executed",
            "cache bust",
        ));
        let after = stats_by_mapping(Some(24));
        let total: u64 = after.rows.iter().map(|r| r.count).sum();
        assert_eq!(total, 2);

        clear();
        let _ = fs::remove_file(path);
        set_log_path_override(None);
    }
}
