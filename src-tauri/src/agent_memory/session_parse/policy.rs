//! Commit policy + versioned ignored-type allowlists (not user config).

use super::types::{
    FactLayer, ParseCompleteness, ParseCoverage, ParseIntent, SessionParseStatus, SessionProvider,
};
use agent_sessions::VERSION;
use std::collections::BTreeMap;

pub(crate) struct IgnoredTypePolicy {
    pub provider: SessionProvider,
    pub parser_version: &'static str,
    pub allowed: &'static [&'static str],
}

pub(crate) fn ignored_policy(provider: SessionProvider) -> IgnoredTypePolicy {
    match provider {
        SessionProvider::Codex => IgnoredTypePolicy {
            provider,
            parser_version: VERSION,
            allowed: &[],
        },
        SessionProvider::ClaudeCode => IgnoredTypePolicy {
            provider,
            parser_version: VERSION,
            allowed: &[],
        },
    }
}

pub(crate) fn count_allowlist_violations(
    provider: SessionProvider,
    ignored: &BTreeMap<String, u64>,
) -> u64 {
    let policy = ignored_policy(provider);
    ignored
        .iter()
        .filter(|(key, _)| !policy.allowed.iter().any(|a| a == key))
        .map(|(_, n)| *n)
        .sum()
}

pub(crate) fn compute_completeness(
    provider: SessionProvider,
    parser_status: SessionParseStatus,
    intent: ParseIntent,
    coverage: ParseCoverage,
    line_error_count: u64,
    unknown: &BTreeMap<String, u64>,
    ignored: &BTreeMap<String, u64>,
    adapter_mapping_error_count: u64,
    source_changed_during_read: bool,
) -> ParseCompleteness {
    let unknown_record_count: u64 = unknown.values().sum();
    let ignored_record_count: u64 = ignored.values().sum();
    let unknown_records_present = unknown_record_count > 0;
    let ignored_allowlist_violations = count_allowlist_violations(provider, ignored);
    let whole_snapshot_commit_allowed = !source_changed_during_read
        && matches!(intent, ParseIntent::FullSnapshot)
        && coverage.is_fully_complete()
        && matches!(parser_status, SessionParseStatus::Complete)
        && line_error_count == 0
        && !unknown_records_present
        && ignored_allowlist_violations == 0
        && adapter_mapping_error_count == 0;

    ParseCompleteness {
        parser_status,
        intent,
        coverage,
        unknown_record_count,
        ignored_record_count,
        line_error_count,
        adapter_mapping_error_count,
        whole_snapshot_commit_allowed,
        unknown_records_present,
        ignored_allowlist_violations,
        source_changed_during_read,
        commit_policy_layer: FactLayer::ProductInference,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn full_coverage() -> ParseCoverage {
        ParseCoverage {
            all_event_kinds: true,
            tool_arguments_included: true,
            tool_results_included: true,
            reached_captured_end: true,
            event_limit_absent: true,
            content_complete: true,
        }
    }

    #[test]
    fn empty_ignored_allows_complete_commit() {
        let c = compute_completeness(
            SessionProvider::ClaudeCode,
            SessionParseStatus::Complete,
            ParseIntent::FullSnapshot,
            full_coverage(),
            0,
            &BTreeMap::new(),
            &BTreeMap::new(),
            0,
            false,
        );
        assert!(c.whole_snapshot_commit_allowed);
    }

    #[test]
    fn source_changed_denies_commit() {
        let c = compute_completeness(
            SessionProvider::ClaudeCode,
            SessionParseStatus::Complete,
            ParseIntent::FullSnapshot,
            full_coverage(),
            0,
            &BTreeMap::new(),
            &BTreeMap::new(),
            0,
            true,
        );
        assert!(!c.whole_snapshot_commit_allowed);
    }

    #[test]
    fn incomplete_coverage_denies_commit() {
        let mut cov = full_coverage();
        cov.tool_arguments_included = false;
        let c = compute_completeness(
            SessionProvider::ClaudeCode,
            SessionParseStatus::Complete,
            ParseIntent::FullSnapshot,
            cov,
            0,
            &BTreeMap::new(),
            &BTreeMap::new(),
            0,
            false,
        );
        assert!(!c.whole_snapshot_commit_allowed);
    }

    #[test]
    fn adapter_mapping_errors_block_commit() {
        let c = compute_completeness(
            SessionProvider::ClaudeCode,
            SessionParseStatus::Complete,
            ParseIntent::FullSnapshot,
            full_coverage(),
            0,
            &BTreeMap::new(),
            &BTreeMap::new(),
            1,
            false,
        );
        assert!(!c.whole_snapshot_commit_allowed);
    }
}
