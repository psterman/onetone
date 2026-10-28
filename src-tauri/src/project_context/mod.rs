//! Local read-only project context (Phase2). No writes / scripts / agent tool loop.

mod contracts;
mod find_grant;
mod git_evidence;
mod passport;
mod reader;
mod scope;
mod search;

pub use contracts::*;
pub use find_grant::{
    grant_find_materials, open_confirmed, revoke_grant, GrantDto, GrantFindMaterialsArgs,
    OpenConfirmedArgs, RevokeGrantArgs,
};
pub use scope::{close, open_at, open_with_dialog, require_scope, revoke_window};

use std::sync::Arc;

use scope::{end_busy, try_begin_busy, ProjectScope};

pub fn cancel_request(
    window: &str,
    scope_id: &str,
    request_id: &str,
) -> Result<&'static str, ContextError> {
    scope::require_main_window(window)?;
    let s = scope::get(scope_id).ok_or(ContextError::ScopeRequired)?;
    if s.owner_window != window {
        return Err(ContextError::WrongOwner);
    }
    if !s.is_active() {
        return Err(ContextError::ScopeRevoked);
    }
    s.request_cancel(request_id);
    Ok("cancelled")
}

pub fn run_query(
    window: &str,
    args: &QueryArgs,
) -> Result<QueryResult, ContextError> {
    let scope = require_scope(window, &args.scope_id, &args.task_scope_id)?;
    try_begin_busy(&scope)?;
    scope.clear_cancel();
    let res = run_query_inner(&scope, args);
    end_busy(&scope);
    res
}

fn run_query_inner(scope: &Arc<ProjectScope>, args: &QueryArgs) -> Result<QueryResult, ContextError> {
    let rid = args.request_id.as_str();
    match &args.query {
        ContextQuery::Passport => {
            let record = passport::build_passport(scope, rid, &[])?;
            Ok(QueryResult {
                request_id: args.request_id.clone(),
                scope_id: scope.scope_id.clone(),
                task_scope_id: scope.task_scope_id.clone(),
                truncated: record.truncated,
                limit_reason: record.limit_reason.clone(),
                usage: BudgetUsage {
                    walked: record.source_refs.len() as u32,
                    shown: 1,
                    bytes: record.content.len() as u64,
                    limit_reason: record.limit_reason.clone(),
                },
                result: QueryPayload::Passport { record },
            })
        }
        ContextQuery::ListFiles { relative_dir } => {
            let (items, truncated, limit_reason, usage) =
                reader::list_files(scope, rid, relative_dir)?;
            Ok(QueryResult {
                request_id: args.request_id.clone(),
                scope_id: scope.scope_id.clone(),
                task_scope_id: scope.task_scope_id.clone(),
                truncated,
                limit_reason,
                usage,
                result: QueryPayload::ListFiles { items },
            })
        }
        ContextQuery::ReadExcerpt {
            relative_path,
            start_line,
            end_line,
        } => {
            let record = reader::read_excerpt(scope, rid, relative_path, *start_line, *end_line)?;
            Ok(QueryResult {
                request_id: args.request_id.clone(),
                scope_id: scope.scope_id.clone(),
                task_scope_id: scope.task_scope_id.clone(),
                truncated: record.truncated,
                limit_reason: record.limit_reason.clone(),
                usage: BudgetUsage {
                    walked: 1,
                    shown: 1,
                    bytes: record.content.len() as u64,
                    limit_reason: record.limit_reason.clone(),
                },
                result: QueryPayload::ReadExcerpt { record },
            })
        }
        ContextQuery::GitChanges { mode } => {
            let (items, truncated, limit_reason) = git_evidence::list_changes(scope, rid, mode)?;
            Ok(QueryResult {
                request_id: args.request_id.clone(),
                scope_id: scope.scope_id.clone(),
                task_scope_id: scope.task_scope_id.clone(),
                truncated,
                limit_reason: limit_reason.clone(),
                usage: BudgetUsage {
                    walked: items.len() as u32,
                    shown: items.len() as u32,
                    bytes: 0,
                    limit_reason,
                },
                result: QueryPayload::GitChanges {
                    mode: mode.clone(),
                    items,
                },
            })
        }
        ContextQuery::GitDiff {
            mode,
            relative_path,
            expected_version,
        } => {
            let record = git_evidence::file_diff(
                scope,
                rid,
                mode,
                relative_path,
                expected_version.as_deref(),
            )?;
            Ok(QueryResult {
                request_id: args.request_id.clone(),
                scope_id: scope.scope_id.clone(),
                task_scope_id: scope.task_scope_id.clone(),
                truncated: record.truncated,
                limit_reason: record.limit_reason.clone(),
                usage: BudgetUsage {
                    walked: 1,
                    shown: 1,
                    bytes: record.content.len() as u64,
                    limit_reason: record.limit_reason.clone(),
                },
                result: QueryPayload::GitDiff { record },
            })
        }
        ContextQuery::Search {
            literal,
            relative_dir,
        } => {
            let (hits, truncated, limit_reason, usage) =
                search::search_literal(scope, rid, literal, relative_dir.as_deref())?;
            Ok(QueryResult {
                request_id: args.request_id.clone(),
                scope_id: scope.scope_id.clone(),
                task_scope_id: scope.task_scope_id.clone(),
                truncated,
                limit_reason,
                usage,
                result: QueryPayload::Search { hits },
            })
        }
        ContextQuery::Validate {
            evidence_ids,
            records,
        } => {
            let mut items = Vec::new();
            for id in evidence_ids {
                let rec = records.iter().find(|r| r.id == *id);
                let freshness = match rec {
                    None => "unverifiable".into(),
                    Some(_) if !scope.is_active() => "unverifiable".into(),
                    Some(r) => match r.kind.as_str() {
                        "file_excerpt" | "search_excerpt" => {
                            if let Some(rel) = r.relative_path.as_deref() {
                                match reader::fingerprint_file(scope, rel) {
                                    Ok(h) if h == r.source_version => "fresh".into(),
                                    Ok(_) => "changed".into(),
                                    Err(ContextError::NotFound) => "missing".into(),
                                    Err(_) => "unverifiable".into(),
                                }
                            } else {
                                "unverifiable".into()
                            }
                        }
                        "git_diff" => {
                            // Re-diff expensive; mark unverifiable without re-run budget overflow.
                            "unverifiable".into()
                        }
                        "passport" => "unverifiable".into(),
                        _ => "unverifiable".into(),
                    },
                };
                items.push(ValidateItem {
                    evidence_id: id.clone(),
                    freshness,
                    reason: None,
                });
            }
            Ok(QueryResult {
                request_id: args.request_id.clone(),
                scope_id: scope.scope_id.clone(),
                task_scope_id: scope.task_scope_id.clone(),
                truncated: false,
                limit_reason: None,
                usage: BudgetUsage {
                    walked: items.len() as u32,
                    shown: items.len() as u32,
                    bytes: 0,
                    limit_reason: None,
                },
                result: QueryPayload::Validate { items },
            })
        }
    }
}
