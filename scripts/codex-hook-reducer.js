#!/usr/bin/env node
'use strict';

/**
 * Mirror of Rust CodexAppStateStore reducer (P0).
 * Global / status-slot host lights only — no six-slot mapping.
 */

var IDLE_AFTER_DONE_MS = 600;
var STALE_MS = 3000;

function nowMs() {
  return Date.now();
}

function createStore() {
  return {
    source: '',
    status: 'idle',
    lastEvent: '',
    lastSource: '',
    sessionId: '',
    turnId: '',
    updatedAtMs: 0,
    pendingIdleAtMs: 0
  };
}

function mapEventToStatus(eventName) {
  var e = String(eventName || '').trim();
  if (e === 'UserPromptSubmit' || e === 'PreToolUse' || e === 'PostToolUse') return 'running';
  if (e === 'PermissionRequest') return 'needs_input';
  if (e === 'Stop') return 'done';
  if (e === 'SessionStart') return 'idle';
  // Subagent*: record only — do not force light changes in P0
  return null;
}

function applyEvent(store, payload, now) {
  var s = store || createStore();
  var t = now != null ? now : nowMs();
  var event = String((payload && (payload.event || payload.hook_event_name)) || '').trim();
  var source = String((payload && payload.source) || 'codex_hook').trim();
  if (source !== 'codex_hook' && source !== 'codex_app') {
    source = 'codex_hook';
  }

  s.lastEvent = event || s.lastEvent;
  s.lastSource = source;
  s.source = source;
  s.updatedAtMs = t;
  if (payload && payload.sessionId) s.sessionId = String(payload.sessionId);
  if (payload && payload.turnId) s.turnId = String(payload.turnId);

  var mapped = mapEventToStatus(event);
  if (mapped != null) {
    s.status = mapped;
    if (mapped === 'done') {
      s.pendingIdleAtMs = t + IDLE_AFTER_DONE_MS;
    } else {
      s.pendingIdleAtMs = 0;
    }
  }
  // SubagentStart/Stop: keep lastEvent, leave status unchanged
  return settle(s, t);
}

function settle(store, now) {
  var s = store || createStore();
  var t = now != null ? now : nowMs();
  if (s.pendingIdleAtMs > 0 && t >= s.pendingIdleAtMs && s.status === 'done') {
    s.status = 'idle';
    s.pendingIdleAtMs = 0;
  }
  return s;
}

function snapshot(store, now) {
  var s = settle(store, now);
  var t = now != null ? now : nowMs();
  var age = s.updatedAtMs > 0 ? Math.max(0, t - s.updatedAtMs) : 0;
  var sticky = s.status === 'needs_input' || s.status === 'running';
  return {
    source: s.source || s.lastSource || '',
    status: s.status || 'idle',
    event: s.lastEvent || '',
    lastEvent: s.lastEvent || '',
    lastSource: s.lastSource || s.source || '',
    ageMs: age,
    sessionId: s.sessionId || '',
    turnId: s.turnId || '',
    // needs_input / running stick until next Hook event (permission dialogs > STALE_MS).
    fresh: s.updatedAtMs > 0 && (sticky || age <= STALE_MS)
  };
}

module.exports = {
  IDLE_AFTER_DONE_MS: IDLE_AFTER_DONE_MS,
  STALE_MS: STALE_MS,
  createStore: createStore,
  mapEventToStatus: mapEventToStatus,
  applyEvent: applyEvent,
  settle: settle,
  snapshot: snapshot
};
