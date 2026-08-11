//! Provider-agnostic AgentAction layer + Codex Micro scenario template.
//! Architecture only — not a user-facing page.
//! Semantic dotted IDs / routing: see `semantic`, `route`, `binding_view`.

pub mod actions;
pub mod binding_view;
pub mod bindings_build;
pub mod context_risk;
pub mod dispatch;
pub mod execute;
pub mod insert_text;
pub mod layer1_native;
pub mod options;
pub mod pending_confirm;
pub mod providers;
pub mod route;
pub mod semantic;
pub mod templates;

pub use actions::{
    action_by_id, activation_scope_for, all_actions, ActivationScope, AgentActionDef,
    ExecutionMode, ProviderSupport, RiskLevel, Transport, AGENT_ACTION_IDS,
};
pub use binding_view::{
    project_action_bindings_for_mapping, project_all_action_bindings, ActionBindingView,
};
pub use bindings_build::build_codex_micro_13_bindings;
pub use execute::{execute_agent_action, AgentExecuteRequest, AgentExecuteResult};
pub use layer1_native::commit_policy_for_raw_action;
pub use route::{route_semantic_action, SemanticActionRequest, SemanticRouteResult};
pub use semantic::{
    camera_may_execute_directly, channel_allowed, public_catalog_dto, resolve_canonical_action_id,
    route_disposition, semantic_meta_by_id, ActionChannel, FinishPolicy, ALL_CHANNELS,
    FEATURE_ACTION_PICKER_UI, FEATURE_DYNAMIC_CONTEXT_ACTIONS, RouteDisposition,
};
pub use dispatch::{dispatch_semantic_action_ids, dispatch_semantic_binding};
pub use templates::{
    codex_micro_13_template, essential_slot_ids, AgentSlotDef, AgentTemplateDef,
    CODEX_MICRO_13_TEMPLATE_ID, CODEX_PROVIDER_ID,
};
pub use crate::voice_end_runtime::CommitPolicy;
