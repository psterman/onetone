# Real Provider interrupt acceptance — C1 / U1 / X1–X4
# REQUIRES: ONETONE_AGENT_REAL_INTERRUPT_E2E=1 and prepared sessions (see scenario-prep.md)
# Uses REAL AppData — does NOT set ONETONE_E2E_DATA_ROOT.
param(
  [string]$OutDir = "",
  [string]$Exe = "",
  [string[]]$Scenarios = @("C1", "U1", "X1", "X2", "X3", "X4")
)
$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $Here "..")).Path
if (-not $OutDir) {
  $OutDir = Join-Path $Root "docs\acceptance-artifacts\20261005\real-provider"
}
if (-not $Exe) {
  $Exe = Join-Path $Root "src-tauri\target\debug\onetone.exe"
  if (-not (Test-Path $Exe)) {
    $Exe = Join-Path $Root "src-tauri\target\release\onetone.exe"
  }
}

$gate = $env:ONETONE_AGENT_REAL_INTERRUPT_E2E
if ($gate -ne "1") {
  Write-Host "BLOCKED: set ONETONE_AGENT_REAL_INTERRUPT_E2E=1 after preparing real sessions (scenario-prep.md)"
  exit 2
}
if ($env:ONETONE_E2E_DATA_ROOT) {
  Write-Host "BLOCKED: unset ONETONE_E2E_DATA_ROOT — real Provider tests must use production AppData"
  exit 2
}
if (-not (Test-Path $Exe)) {
  throw "missing onetone exe: $Exe"
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function Write-JsonFile([string]$Path, $Object) {
  Write-Utf8NoBom $Path ($Object | ConvertTo-Json -Depth 8)
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

# Local readiness probe (honest — does not imply scenarios passed)
$procNames = @("claude", "codex", "Cursor", "onetone")
$procs = @{}
foreach ($n in $procNames) {
  $hits = @(Get-Process -Name $n -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  $procs[$n] = @{ running = ($hits.Count -gt 0); pids = $hits }
}
$readiness = @{
  probedAt = (Get-Date).ToString("o")
  exe = $Exe
  onetoneRunning = [bool]$procs["onetone"].running
  providers = $procs
  dirs = @{
    claudeHome = (Test-Path (Join-Path $env:USERPROFILE ".claude"))
    codexHome = (Test-Path (Join-Path $env:USERPROFILE ".codex"))
    cursorHome = (Test-Path (Join-Path $env:USERPROFILE ".cursor"))
  }
  note = "Process/dir presence != active interruptible session. Operator must prepare waiting sessions per scenario-prep.md."
}
Write-JsonFile (Join-Path $OutDir "readiness.json") $readiness

$sessionLog = @"
# Real Provider session log — fill during each scenario
# Do not mark any scenario passed without action-result.json

probedAt: $($readiness.probedAt)
onetone: running=$($procs['onetone'].running) pids=$($procs['onetone'].pids -join ',')
claude:  running=$($procs['claude'].running) pids=$($procs['claude'].pids -join ',')
codex:   running=$($procs['codex'].running) pids=$($procs['codex'].pids -join ',')
cursor:  running=$($procs['Cursor'].running) pids=$($procs['Cursor'].pids -join ',')

--- per scenario ---
# provider:
# sessionId / externalSessionId:
# projectRoot: E:\voice-pilot
# projectId:
# pid:
# hwnd:
# startedAt:
# interruptedAt:
# outcome / ok / verified / attemptId:
"@
Write-Utf8NoBom (Join-Path $OutDir "_session-log.txt") $sessionLog

$hints = @{
  C1 = @{ agentKind = "claude"; expectedOutcome = "verified_only_after_post_stop_probe"; note = "Claude active -> verified only after post-stop probe" }
  U1 = @{ agentKind = "cursor"; expectedOutcome = "attemptedUnverified_never_verified"; note = "Cursor -> attemptedUnverified; never verified in UI" }
  X1 = @{ agentKind = "codex"; expectedOutcome = "verified_when_inactive_after_force_fresh"; note = "Codex inactive exact -> verified" }
  X2 = @{ agentKind = "codex"; expectedOutcome = "attemptedUnverified_when_still_active"; note = "Codex still active -> attemptedUnverified" }
  X3 = @{ agentKind = "codex"; expectedOutcome = "attemptedUnverified_session_mismatch"; note = "Session mismatch -> attemptedUnverified" }
  X4 = @{ agentKind = "codex"; expectedOutcome = "attemptedUnverified_probe_fail"; note = "Probe/ForceFresh fail -> attemptedUnverified" }
}

$actionTemplate = @{
  status = "pending_manual"
  note = "Replace this file after real interrupt. Do not invent outcome."
  actionId = "agent.interrupt"
  attemptId = ""
  outcome = $null
  ok = $null
  verified = $null
  error = $null
  toast = $null
}

$summary = @{
  gate = "ONETONE_AGENT_REAL_INTERRUPT_E2E"
  gateValue = "1"
  startedAt = (Get-Date).ToString("o")
  exe = $Exe
  outDir = $OutDir
  phase = "scaffolded"
  scenarios = @{}
  note = "Checklists + templates only. Scenarios remain pending_manual until real action-result evidence exists."
}

Write-Host "Real Provider interrupt E2E — manual session required per scenario."
Write-Host "OutDir: $OutDir"
Write-Host "For each scenario: prepare session -> snapshot -> interrupt -> save action-result + after snapshot + screenshot"
Write-Host ""

foreach ($id in $Scenarios) {
  $dir = Join-Path $OutDir $id
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  $hint = $hints[$id]
  $meta = @{
    id = $id
    hint = $hint
    status = "pending_manual"
    requiredEvidence = @(
      "snapshot-before.json",
      "action-result.json",
      "snapshot-after.png",
      "toast-or-roster.png"
    )
    steps = @(
      "1. Prepare session per scenario-prep.md",
      "2. cmd_agent_center_snapshot -> save snapshot-before.json",
      "3. cmd_agent_center_action agent.interrupt -> save action-result.json",
      "4. Refresh snapshot -> save snapshot-after.json",
      "5. Capture screenshot of toast + roster row"
    )
  }
  Write-JsonFile (Join-Path $dir "checklist.json") $meta
  $tpl = $actionTemplate.Clone()
  $tpl["scenario"] = $id
  $tpl["expectedOutcome"] = $hint.expectedOutcome
  Write-JsonFile (Join-Path $dir "action-result.TEMPLATE.json") $tpl
  $summary.scenarios[$id] = "pending_manual"
}

$summary.endedAt = (Get-Date).ToString("o")
Write-JsonFile (Join-Path $OutDir "run-summary.json") $summary

# Keep NOT_EXECUTED as the honest machine-readable marker until any scenario has real action-result.json
$notExec = @{
  gate = "ONETONE_AGENT_REAL_INTERRUPT_E2E"
  gateValue = "1"
  executed = $false
  phase = "scaffolded"
  reason = "Gate set and checklists written; no scenario has real action-result.json yet"
  scenarios = @{
    C1 = @{ status = "pending_manual"; expectedOutcome = $hints.C1.expectedOutcome }
    U1 = @{ status = "pending_manual"; expectedOutcome = $hints.U1.expectedOutcome }
    X1 = @{ status = "pending_manual"; expectedOutcome = $hints.X1.expectedOutcome }
    X2 = @{ status = "pending_manual"; expectedOutcome = $hints.X2.expectedOutcome }
    X3 = @{ status = "pending_manual"; expectedOutcome = $hints.X3.expectedOutcome }
    X4 = @{ status = "pending_manual"; expectedOutcome = $hints.X4.expectedOutcome }
  }
  readiness = "readiness.json"
  prepDoc = "docs/acceptance-artifacts/20261005/scenario-prep.md"
  runnerScript = "scripts/run-real-provider-interrupt-e2e.ps1"
}
Write-JsonFile (Join-Path $OutDir "NOT_EXECUTED.json") $notExec

Write-Host "Wrote checklists/templates under $OutDir"
Write-Host "Readiness: onetone=$($procs['onetone'].running) claude=$($procs['claude'].running) codex=$($procs['codex'].running) cursor=$($procs['Cursor'].running)"
Write-Host "STATUS: scaffolded — not passed. Complete interrupts manually, then replace NOT_EXECUTED when evidence exists."
exit 0
