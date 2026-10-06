# Orchestrate one real-provider scenario (default U1).
# REQUIRES prepared Provider session when interrupt must be enabled.
param(
  [ValidateSet("C1", "U1", "X1", "X2", "X3", "X4")]
  [string]$Scenario = "U1",
  [string]$Exe = "",
  [int]$TimeoutSec = 90
)
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $Here "..")).Path
$OutDir = Join-Path $Root "docs\acceptance-artifacts\20261005\real-provider"
$ScenarioDir = Join-Path $OutDir $Scenario

if ($env:ONETONE_E2E_DATA_ROOT) {
  throw "Unset ONETONE_E2E_DATA_ROOT — real Provider must use production AppData"
}
if (-not $Exe) {
  $Exe = Join-Path $Root "src-tauri\target\debug\onetone.exe"
  if (-not (Test-Path $Exe)) {
    $Exe = Join-Path $Root "src-tauri\target\release\onetone.exe"
  }
}
if (-not (Test-Path $Exe)) { throw "missing exe: $Exe" }

Get-Process onetone -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
New-Item -ItemType Directory -Path $ScenarioDir -Force | Out-Null
Remove-Item (Join-Path $ScenarioDir "e2e-done.txt") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ScenarioDir "e2e-step.txt") -ErrorAction SilentlyContinue

$env:ONETONE_AGENT_REAL_INTERRUPT_E2E = "1"
$env:ONETONE_REAL_INTERRUPT_SCENARIO = $Scenario
$env:ONETONE_REAL_PROVIDER_OUT = $OutDir
$env:ONETONE_REAL_INTERRUPT_EXIT = "1"

Write-Host "Starting $Exe scenario=$Scenario out=$OutDir"
$p = Start-Process -FilePath $Exe -PassThru
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$donePath = Join-Path $ScenarioDir "e2e-done.txt"
while ((Get-Date) -lt $deadline) {
  if (Test-Path $donePath) { break }
  Start-Sleep -Milliseconds 500
}

# Capture while window still up if ready-for-shot / done present
$shotScript = Join-Path $Root "scripts\capture-tauri-shot.ps1"
if (Test-Path $shotScript) {
  try {
    & $shotScript -Name "roster-$Scenario" -OutDir $ScenarioDir -ProcessId $p.Id
  } catch {
    Write-Host "capture warning: $_"
  }
}

if (-not (Test-Path $donePath)) {
  Write-Host "TIMEOUT waiting for $donePath"
  Get-Process onetone -ErrorAction SilentlyContinue | Stop-Process -Force
  exit 4
}

$done = (Get-Content $donePath -Raw).Trim()
Write-Host "e2e-done=$done"
if (Test-Path (Join-Path $ScenarioDir "action-result.json")) {
  Get-Content (Join-Path $ScenarioDir "action-result.json") -Raw
}
if (Test-Path (Join-Path $ScenarioDir "acceptance.json")) {
  Get-Content (Join-Path $ScenarioDir "acceptance.json") -Raw
}

# Allow process to self-exit; force if still around
Start-Sleep -Seconds 2
Get-Process onetone -ErrorAction SilentlyContinue | Stop-Process -Force

if ($done -eq "pass" -or $done -eq "recorded") { exit 0 }
exit 3
