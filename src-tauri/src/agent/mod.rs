//! Provider-agnostic AgentAction layer + Codex Micro scenario template.
//! Architecture only — not a user-facing page.

pub mod actions;
pub mod bindings_build;
pub mod execute;
pub mod insert_text;
pub mod providers;
pub mod templates;

pub use actions::{
    action_by_id, activation_scope_for, all_actions, ActivationScope, AgentActionDef,
    ExecutionMode, ProviderSupport, RiskLevel, Transport, AGENT_ACTION_IDS,
};
pub use bindings_build::build_codex_micro_13_bindings;
pub use execute::{execute_agent_action, AgentExecuteRequest, AgentExecuteResult};
pub use templates::{
    codex_micro_13_template, essential_slot_ids, AgentSlotDef, AgentTemplateDef,
    CODEX_MICRO_13_TEMPLATE_ID, CODEX_PROVIDER_ID,
};
