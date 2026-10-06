# Incremental rebuild of E2E exe + run (uses existing CARGO_TARGET_DIR isolation).
param(
  [int]$TimeoutMinutes = 10,
  [switch]$SkipBuild,
  [switch]$AgentRoster
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $Root) { $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }
Set-Location $Root

Get-Process onetone -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

$E2eTarget = Join-Path $Root 'src-tauri\target\e2e'
$E2eExe = Join-Path $E2eTarget 'release\onetone.exe'
$env:CARGO_TARGET_DIR = $E2eTarget

if (-not $SkipBuild) {
  $tauriCmd = Join-Path $Root 'node_modules\.bin\tauri.cmd'
  if (-not (Test-Path $tauriCmd)) {
    throw "missing $tauriCmd"
  }
  Write-Host "Building E2E EXE via $tauriCmd ..."
  & $tauriCmd build --no-bundle --features bfinal_e2e
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not (Test-Path $E2eExe)) { throw "missing $E2eExe" }

$Runner = Join-Path $Root 'scripts\run-tauri-e2e.ps1'
$runnerArgs = @('-NoProfile', '-File', $Runner, '-Exe', $E2eExe, '-TimeoutMinutes', $TimeoutMinutes)
if ($AgentRoster) { $runnerArgs += '-AgentRoster' }
& powershell @runnerArgs
exit $LASTEXITCODE
