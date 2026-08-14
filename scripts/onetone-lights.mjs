#!/usr/bin/env node
/**
 * Soft Pad status lights CLI (four commands only).
 * Usage:
 *   node scripts/onetone-lights.mjs status
 *   node scripts/onetone-lights.mjs focus <session-id>
 *   node scripts/onetone-lights.mjs clear [--session=X]
 *   node scripts/onetone-lights.mjs doctor
 */
const BASE = process.env.ONETONE_LIGHTS_URL || 'http://127.0.0.1:8796';

async function postState(body) {
  const res = await fetch(`${BASE}/api/codex-app/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  if (!res.ok) throw new Error(text || res.statusText);
  return json || text;
}

async function status() {
  // Probe via idle heartbeat with meta-only show path is not available;
  // print loopback reachability + last write echo.
  const r = await postState({
    source: 'codex_hook',
    agent: 'codex',
    event: 'SessionStart',
    state: 'idle',
    sessionId: 'onetone-lights-status',
    cwd: process.cwd(),
    message: 'status-ping',
  });
  console.log(JSON.stringify({ ok: true, loopback: BASE, echo: r }, null, 2));
}

async function focus(sessionId) {
  if (!sessionId) throw new Error('usage: focus <session-id>');
  // Raise needs_input then rely on app focus_session from UI; CLI marks attention via state.
  const r = await postState({
    source: 'codex_hook',
    agent: 'codex',
    event: 'PermissionRequest',
    state: 'needs_input',
    sessionId,
    cwd: process.cwd(),
    message: 'focus-request',
  });
  console.log(JSON.stringify({ ok: true, sessionId, echo: r, hint: 'Click Soft Pad chip / Soft RGB to focus' }, null, 2));
}

async function clear(session) {
  // Clear via idle event for session; full clear needs Tauri IPC (doctor notes).
  const body = {
    source: 'codex_hook',
    agent: 'codex',
    event: 'Stop',
    state: 'idle',
    cwd: process.cwd(),
    message: 'clear',
  };
  if (session) body.sessionId = session;
  else body.sessionId = 'onetone-lights-clear-all';
  const r = await postState(body);
  console.log(JSON.stringify({
    ok: true,
    session: session || null,
    echo: r,
    hint: session
      ? 'Session idle posted; for PadStatus/Attention clear use Hub「清除红灯」or doctor'
      : 'Posted idle; Hub clear_errors clears all lamps',
  }, null, 2));
}

async function doctor() {
  let loopback = { ok: false };
  try {
    const r = await postState({
      source: 'codex_hook',
      agent: 'codex',
      event: 'SessionStart',
      state: 'idle',
      sessionId: 'onetone-lights-doctor',
      cwd: process.cwd(),
    });
    loopback = { ok: true, echo: r };
  } catch (e) {
    loopback = { ok: false, error: String(e && e.message || e) };
  }
  console.log(JSON.stringify({
    ok: loopback.ok,
    base: BASE,
    loopback,
    hint: 'Full diagnose: Soft Pad Hub → refresh diagnose (cmd_pad_status_diagnose)',
  }, null, 2));
  if (!loopback.ok) process.exitCode = 1;
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'status') return status();
  if (cmd === 'focus') return focus(arg);
  if (cmd === 'clear') {
    const sessionArg = process.argv.slice(2).find((a) => a.startsWith('--session='));
    return clear(sessionArg ? sessionArg.slice('--session='.length) : null);
  }
  if (cmd === 'doctor') return doctor();
  console.error(`usage:
  onetone-lights status
  onetone-lights focus <session-id>
  onetone-lights clear [--session=X]
  onetone-lights doctor`);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(String(e && e.message || e));
  process.exitCode = 1;
});
