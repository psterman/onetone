//! Semantic action hub A2/A3 closure acceptance (integration tests).

use onetone::semantic_action::{
    camera_may_execute_directly, camera_pending_eligible, channel_allowed,
    commit_policy_for_raw_action, context_risk_gate, ingest_codex_app_server_event, insert_pending,
    kind_from_attention_cause, peek_public, pending_test_lock, project_action_bindings_for_mapping,
    project_needs_input_kind, public_catalog_dto, reset_for_test, reset_pending_for_test,
    resolve_canonical_action_id, resolve_input_start_target_from_parts, semantic_action_options,
    semantic_meta_by_id, semantic_slot_id, take_unique_match, take_valid,
    take_valid_if_action_matches, test_lock, ActionChannel, AgentBinding, AgentKind,
    AttentionCause, CameraOverride, CodexMicroPadConfig, CodexMicroPadKeyRoute, CommitPolicy,
    FinishPolicy, NeedsInputKind, VoiceConfig, ALL_CHANNELS, FEATURE_ACTION_PICKER_UI,
    FEATURE_DYNAMIC_CONTEXT_ACTIONS, LAYER1_ACTION_IDS,
};

#[test]
fn soft_pad_is_formal_channel() {
    assert!(ALL_CHANNELS.iter().any(|c| *c == ActionChannel::SoftPad));
    assert!(public_catalog_dto().channels.iter().any(|c| *c == "softPad"));
}

#[test]
fn commit_send_policies_differ_from_alias() {
    assert_eq!(
        commit_policy_for_raw_action("input.commit", "input.commit"),
        Some(CommitPolicy::Never)
    );
    assert_eq!(
        commit_policy_for_raw_action("input.send", "input.send"),
        Some(CommitPolicy::Force)
    );
    assert_eq!(
        commit_policy_for_raw_action("stopOrSendDictation", "input.send"),
        Some(CommitPolicy::AutoConfig)
    );
    assert_eq!(
        commit_policy_for_raw_action("stopOrSendDictation", "input.commit"),
        Some(CommitPolicy::AutoConfig)
    );
    // Explicit send stays Force even when habit is confirm-mode (canonical still input.send).
    assert_ne!(
        commit_policy_for_raw_action("input.commit", "input.commit"),
        commit_policy_for_raw_action("input.send", "input.send")
    );
}

#[test]
fn layer1_all_implemented_in_catalogue() {
    let dto = public_catalog_dto();
    for id in LAYER1_ACTION_IDS {
        let e = dto.entries.iter().find(|e| e.id == *id).expect(id);
        assert!(e.implemented, "{id} must be implemented");
        assert_eq!(e.executor, "onetoneRuntime");
        let meta = semantic_meta_by_id(id).unwrap();
        assert!(meta.implemented);
    }
}

#[test]
fn respond_continue_implemented_retry_deferred() {
    let respond = semantic_meta_by_id("agent.respond").unwrap();
    assert!(respond.implemented);
    assert_eq!(respond.executor, "onetoneRuntime");
    let cont = semantic_meta_by_id("agent.continue").unwrap();
    assert!(cont.implemented);
    assert_eq!(cont.executor, "onetoneRuntime");
    let retry = semantic_meta_by_id("agent.retry").unwrap();
    assert!(!retry.implemented);
    let next = semantic_meta_by_id("session.next").unwrap();
    assert!(!next.implemented);
    let approve = semantic_meta_by_id("agent.approve").unwrap();
    assert!(approve.implemented);
    assert_eq!(approve.executor, "agentAdapter");
}

#[test]
fn status_read_is_onetone_runtime_not_slash() {
    let meta = semantic_meta_by_id("status.read").unwrap();
    assert_eq!(meta.executor, "onetoneRuntime");
    assert!(meta.implemented);
    assert_eq!(
        resolve_canonical_action_id("status.read", FinishPolicy::Commit),
        "status.read"
    );
}

#[test]
fn camera_cannot_direct_send_or_approve() {
    assert!(!camera_may_execute_directly("input.send"));
    assert!(!camera_may_execute_directly("agent.approve"));
    let send = semantic_meta_by_id("input.send").unwrap();
    // Bindable on camera; disposition still Pending (not direct execute).
    assert!(channel_allowed(send, ActionChannel::Camera));
}

#[test]
fn projects_four_storages_including_camera_local() {
    let mut cfg = VoiceConfig::default();
    let mid = cfg.mappings[0].id.clone();
    if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mid) {
        m.agent_bindings = vec![
            AgentBinding {
            action_instance_id: String::new(),
            action_args: None,
                slot_id: "pushToTalk".into(),
                action_id: "startDictation".into(),
                trigger_type: "key".into(),
                trigger_binding: "Ctrl+Shift+D".into(),
                enabled: true,
                execution_mode: None,
                activation_scope: "global".into(),
            },
            AgentBinding {
            action_instance_id: String::new(),
            action_args: None,
                slot_id: "cancel".into(),
                action_id: "cancel".into(),
                trigger_type: "voice".into(),
                trigger_binding: "取消".into(),
                enabled: true,
                execution_mode: None,
                activation_scope: "global".into(),
            },
        ];
        m.camera_override = Some(CameraOverride {
            shake_head: Some("pressEsc".into()),
            deliberate_blink: Some("agent:startDictation".into()),
            ..Default::default()
        });
        m.codex_micro_pad = Some(CodexMicroPadConfig {
            enabled: true,
            keys: vec![CodexMicroPadKeyRoute {
                micro_key_id: "D1".into(),
                slot_id: "pushToTalk".into(),
                enabled: true,
                ..Default::default()
            }],
            ..Default::default()
        });
    }
    let views = project_action_bindings_for_mapping(&cfg, &mid);
    assert!(
        views.iter().any(|v| {
            v.source_storage == "agentBindings"
                && v.channel == "key"
                && v.binding_ref == "pushToTalk"
        }),
        "{views:?}"
    );
    assert!(
        views.iter().any(|v| {
            v.source_storage == "agentBindings"
                && v.channel == "voice"
                && !v.binding_ref.is_empty()
        }),
        "{views:?}"
    );
    assert!(
        views.iter().any(|v| {
            v.source_storage == "cameraOverride"
                && v.action_id == "camera.local.pressEsc"
                && v.binding_ref == "shakeHead"
        }),
        "missing local camera token: {views:?}"
    );
    assert!(
        views.iter().any(|v| {
            v.source_storage == "cameraOverride"
                && v.action_id == "input.start"
                && v.binding_ref == "deliberateBlink"
        }),
        "{views:?}"
    );
    assert!(
        views.iter().any(|v| {
            v.source_storage == "codexMicroPad"
                && v.channel == "softPad"
                && v.binding_ref == "D1"
        }),
        "{views:?}"
    );
}

#[test]
fn needs_input_kind_maps_causes() {
    assert_eq!(
        kind_from_attention_cause(AttentionCause::Permission),
        NeedsInputKind::WaitingApproval
    );
    assert_eq!(
        kind_from_attention_cause(AttentionCause::UserInput),
        NeedsInputKind::WaitingText
    );
    assert_eq!(
        kind_from_attention_cause(AttentionCause::Elicitation),
        NeedsInputKind::WaitingText
    );
}

#[test]
fn codex_app_server_approval_is_waiting_approval() {
    let _g = test_lock();
    reset_for_test();
    ingest_codex_app_server_event("item/agentMessage/approval", "s1", "r1");
    let snap = project_needs_input_kind(false);
    assert_eq!(snap.kind, "waitingApproval", "{snap:?}");
}

#[test]
fn codex_app_server_request_user_input_is_waiting_text() {
    let _g = test_lock();
    reset_for_test();
    ingest_codex_app_server_event("requestUserInput", "s2", "r2");
    let snap = project_needs_input_kind(false);
    assert_eq!(snap.kind, "waitingText", "{snap:?}");
}

#[test]
fn pending_confirmation_lifecycle() {
    let _g = pending_test_lock();
    reset_pending_for_test();
    let row = insert_pending(
        "pc-1".into(),
        "input.send".into(),
        "camera".into(),
        Some("map1".into()),
        None,
    );
    assert!(peek_public(&row.id).is_some());
    assert!(take_valid(&row.id, "camera").is_err());
    assert!(peek_public(&row.id).is_some());
    let taken = take_valid(&row.id, "key").expect("key may complete");
    assert_eq!(taken.action_id, "input.send");
    assert!(peek_public(&row.id).is_none());
}

#[test]
fn camera_route_pending_before_channel_gate() {
    // Camera bindable + Pending disposition (requiresSecondChannelFrom), not direct execute.
    assert!(camera_pending_eligible(ActionChannel::Camera, "input.send"));
    assert!(camera_pending_eligible(ActionChannel::Camera, "agent.approve"));
    assert!(!camera_pending_eligible(ActionChannel::Key, "input.send"));
    assert!(!camera_pending_eligible(ActionChannel::Voice, "agent.approve"));
    assert!(!camera_pending_eligible(ActionChannel::Camera, "input.start"));
    let send = semantic_meta_by_id("input.send").unwrap();
    let approve = semantic_meta_by_id("agent.approve").unwrap();
    assert!(channel_allowed(send, ActionChannel::Camera));
    assert!(channel_allowed(approve, ActionChannel::Camera));
}

#[test]
fn camera_cannot_complete_pending_confirm() {
    let _g = pending_test_lock();
    reset_pending_for_test();
    let row = insert_pending(
        "pc-cam".into(),
        "agent.approve".into(),
        "camera".into(),
        None,
        Some("codex".into()),
    );
    assert_eq!(
        take_valid(&row.id, "camera").unwrap_err(),
        "camera_cannot_complete_confirmation"
    );
    assert!(peek_public(&row.id).is_some(), "camera self-confirm leaves row");
    assert!(take_valid(&row.id, "voice").is_ok());
}

#[test]
fn softpad_may_complete_pending() {
    let _g = pending_test_lock();
    reset_pending_for_test();
    let row = insert_pending(
        "pc-pad".into(),
        "input.send".into(),
        "camera".into(),
        Some("m1".into()),
        Some("codex".into()),
    );
    let taken = take_valid(&row.id, "softPad").expect("softPad may complete");
    assert_eq!(taken.action_id, "input.send");
    assert!(peek_public(&row.id).is_none());
}

#[test]
fn input_start_provider_scope_current_target() {
    let dto = public_catalog_dto();
    let start = dto.entries.iter().find(|e| e.id == "input.start").unwrap();
    assert_eq!(start.provider_scope, "currentTarget");

    let mut cfg = VoiceConfig::default();
    let mid = cfg.mappings[0].id.clone();
    if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mid) {
        m.app_target_id = "claude-code".into();
        m.agent_provider_id = "claude".into();
    }
    let t = resolve_input_start_target_from_parts(&cfg, Some(&mid), None).unwrap();
    assert_eq!(t.provider_id, "claude");
    assert_eq!(t.app_target_id.as_deref(), Some("claude-code"));

    // Soft Pad lane wins when no explicit mapping.
    let lane_mid = mid.clone();
    let t2 = resolve_input_start_target_from_parts(
        &cfg,
        None,
        Some((AgentKind::Claude, lane_mid)),
    )
    .unwrap();
    assert_eq!(t2.provider_id, "claude");
}

#[test]
fn catalog_b0_meta_fields_stable() {
    let dto = public_catalog_dto();
    let start = dto.entries.iter().find(|e| e.id == "input.start").unwrap();
    assert_eq!(start.category, "input");
    assert_eq!(start.provider_scope, "currentTarget");
    assert!(start.available_when.contains(&"none"));
    assert!(start.requires_second_channel_from.is_empty());
    let send = dto.entries.iter().find(|e| e.id == "input.send").unwrap();
    assert_eq!(send.requires_second_channel_from, vec!["camera"]);
    assert_eq!(send.available_when, vec!["dictating"]);
    let approve = dto.entries.iter().find(|e| e.id == "agent.approve").unwrap();
    assert_eq!(approve.category, "decision");
    assert_eq!(approve.requires_second_channel_from, vec!["camera"]);
    let overlay = dto.entries.iter().find(|e| e.id == "overlay.toggle").unwrap();
    assert_eq!(overlay.provider_scope, "none");
    assert_eq!(overlay.category, "system");
}

#[test]
fn app_open_and_shortcut_catalogue_contract() {
    let open = semantic_meta_by_id("app.open").expect("app.open");
    assert!(open.implemented);
    assert_eq!(open.executor, "onetoneRuntime");
    assert_eq!(open.provider_scope, "currentTarget");
    assert_eq!(open.category.as_str(), "system");
    assert!(channel_allowed(open, ActionChannel::Key));
    assert!(channel_allowed(open, ActionChannel::Voice));
    assert!(channel_allowed(open, ActionChannel::SoftPad));
    assert!(!channel_allowed(open, ActionChannel::Camera));

    let shortcut = semantic_meta_by_id("app.shortcut").expect("app.shortcut");
    assert!(shortcut.implemented);
    assert_eq!(shortcut.executor, "onetoneRuntime");
    assert!(channel_allowed(shortcut, ActionChannel::Key));
    assert!(channel_allowed(shortcut, ActionChannel::SoftPad));
    assert!(!channel_allowed(shortcut, ActionChannel::Voice));
    assert!(!channel_allowed(shortcut, ActionChannel::Camera));

    let dto = public_catalog_dto();
    let open_e = dto.entries.iter().find(|e| e.id == "app.open").unwrap();
    assert_eq!(open_e.risk, "safe");
    let short_e = dto.entries.iter().find(|e| e.id == "app.shortcut").unwrap();
    assert_eq!(short_e.risk, "confirm");
    assert!(!short_e.channels.iter().any(|c| c == "voice" || c == "camera"));
    assert!(LAYER1_ACTION_IDS.contains(&"app.open"));
    assert!(LAYER1_ACTION_IDS.contains(&"app.shortcut"));
}

#[test]
fn pending_unique_match_and_scope() {
    let _g = pending_test_lock();
    reset_pending_for_test();
    insert_pending(
        "a".into(),
        "input.send".into(),
        "camera".into(),
        Some("m1".into()),
        Some("codex".into()),
    );
    assert!(take_unique_match("input.send", "key", None, Some("codex"))
        .unwrap()
        .is_none());
    let taken = take_unique_match("input.send", "voice", Some("m1"), Some("codex"))
        .unwrap()
        .expect("unique");
    assert_eq!(taken.action_id, "input.send");
    assert!(take_unique_match("input.send", "key", Some("m1"), Some("codex"))
        .unwrap()
        .is_none());
}

#[test]
fn mismatch_confirmation_preserves_pending() {
    let _g = pending_test_lock();
    reset_pending_for_test();
    let row = insert_pending(
        "ttl-1".into(),
        "agent.approve".into(),
        "camera".into(),
        Some("m1".into()),
        Some("codex".into()),
    );
    let before = peek_public(&row.id).unwrap().expires_in_ms;
    assert_eq!(
        take_valid_if_action_matches(&row.id, "key", "agent.reject").unwrap_err(),
        "confirmation_action_mismatch"
    );
    let after = peek_public(&row.id).expect("still present");
    assert_eq!(after.action_id, "agent.approve");
    // TTL must not jump back up to a fresh 60s (allow 2s clock slack).
    assert!(after.expires_in_ms <= before + 2000);
    assert!(after.expires_in_ms > 50_000);
}

#[test]
fn context_risk_send_requires_dictating_for_camera() {
    assert_eq!(
        context_risk_gate("input.send", "camera", "waitingText", true, false),
        Some("requires_dictating")
    );
    assert_eq!(
        context_risk_gate("input.send", "camera", "none", true, false),
        Some("requires_dictating")
    );
    assert_eq!(
        context_risk_gate("input.send", "camera", "dictating", true, false),
        None
    );
    assert_eq!(
        context_risk_gate("agent.approve", "key", "none", false, false),
        Some("requires_waiting_approval")
    );
    assert_eq!(
        context_risk_gate("agent.approve", "camera", "none", true, false),
        Some("requires_waiting_approval")
    );
    assert_eq!(
        context_risk_gate("agent.approve", "camera", "waitingApproval", true, false),
        None
    );
}

#[test]
fn semantic_slot_id_stable() {
    assert_eq!(
        semantic_slot_id(ActionChannel::Key, "input.cancel"),
        "semantic:key:input.cancel"
    );
}

#[test]
fn waiting_choice_has_no_v1_producer() {
    assert_eq!(
        kind_from_attention_cause(AttentionCause::Elicitation),
        NeedsInputKind::WaitingText
    );
    assert_eq!(
        kind_from_attention_cause(AttentionCause::UserInput),
        NeedsInputKind::WaitingText
    );
    assert_eq!(
        kind_from_attention_cause(AttentionCause::Permission),
        NeedsInputKind::WaitingApproval
    );
}

#[test]
fn feature_gates_bfinal_candidate_dynamic_on() {
    assert!(FEATURE_DYNAMIC_CONTEXT_ACTIONS);
    assert!(FEATURE_ACTION_PICKER_UI);
}

#[test]
fn no_choice_select_explosion() {
    assert!(semantic_meta_by_id("choice.select").is_some());
    for i in 1..10 {
        assert!(semantic_meta_by_id(&format!("choice.select{i}")).is_none());
    }
}

#[test]
fn claude_cursor_layer2_basic_bindable_no_fallback() {
    let _g = test_lock();
    reset_for_test();
    let mut cfg = VoiceConfig::default();
    let mid = cfg.mappings[0].id.clone();
    if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mid) {
        m.app_target_id = "claude-code".into();
        m.agent_provider_id = "claude".into();
    }
    let opts = semantic_action_options(&cfg, &mid, ActionChannel::Key, false).unwrap();
    assert!(opts.iter().find(|o| o.action_id == "agent.focus").unwrap().bindable);
    assert!(!opts.iter().find(|o| o.action_id == "agent.interrupt").unwrap().bindable);
    assert_eq!(
        opts.iter()
            .find(|o| o.action_id == "agent.interrupt")
            .unwrap()
            .reason_code
            .as_deref(),
        Some("provider_unsupported")
    );
    assert!(opts.iter().find(|o| o.action_id == "agent.approve").unwrap().bindable);
    let voice = semantic_action_options(&cfg, &mid, ActionChannel::Voice, false).unwrap();
    assert!(!voice.iter().find(|o| o.action_id == "agent.status").unwrap().bindable);
    assert_eq!(
        voice
            .iter()
            .find(|o| o.action_id == "agent.status")
            .unwrap()
            .reason_code
            .as_deref(),
        Some("provider_unsupported")
    );

    if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mid) {
        m.app_target_id = "cursor-chat".into();
        m.agent_provider_id = "cursor".into();
    }
    let opts2 = semantic_action_options(&cfg, &mid, ActionChannel::Key, false).unwrap();
    assert!(opts2.iter().find(|o| o.action_id == "agent.focus").unwrap().bindable);
    assert!(opts2.iter().find(|o| o.action_id == "agent.interrupt").unwrap().bindable);
    assert!(!opts2.iter().find(|o| o.action_id == "session.new").unwrap().bindable);

    if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mid) {
        m.app_target_id = "".into();
        m.agent_provider_id = "nope".into();
    }
    let opts3 = semantic_action_options(&cfg, &mid, ActionChannel::Key, false).unwrap();
    assert!(!opts3.iter().find(|o| o.action_id == "agent.focus").unwrap().bindable);
    assert_eq!(
        opts3
            .iter()
            .find(|o| o.action_id == "agent.focus")
            .unwrap()
            .reason_code
            .as_deref(),
        Some("provider_unsupported")
    );
}

#[test]
fn respond_continue_options_and_risk_gate() {
    let _g = test_lock();
    reset_for_test();
    let mut cfg = VoiceConfig::default();
    let mid = cfg.mappings[0].id.clone();
    if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mid) {
        m.app_target_id = "cursor-chat".into();
        m.agent_provider_id = "cursor".into();
    }
    let opts = semantic_action_options(&cfg, &mid, ActionChannel::SoftPad, false).unwrap();
    let respond = opts.iter().find(|o| o.action_id == "agent.respond").unwrap();
    assert!(respond.bindable);
    assert!(!respond.executable_now); // idle — needs waitingText
    assert!(opts.iter().find(|o| o.action_id == "agent.continue").unwrap().bindable);
    assert!(!opts.iter().find(|o| o.action_id == "session.next").unwrap().bindable);

    assert_eq!(
        context_risk_gate("agent.respond", "voice", "waitingApproval", false, false),
        Some("requires_waiting_text")
    );
    assert_eq!(
        context_risk_gate("agent.respond", "voice", "waitingText", false, false),
        None
    );
}
