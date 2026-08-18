<#
.SYNOPSIS
  Redirect Rust build output for the voice-pilot project to D:\rust-target\onetone.

.DESCRIPTION
  - Pre-creates D:\rust-target\onetone.
  - Sets user-scope CARGO_TARGET_DIR=D:\rust-target\onetone (persistent, no
    admin needed). All `cargo build`, `cargo tauri build`, and the
    run_onetone.ps1 launcher honor this env var.
  - Rewrites the hardcoded path in .trae/hooks.json so the Trae IDE hook
    continues to find agent-shell-hook-probe.js under the new location.

  Idempotent — running twice is a no-op.

  After running this:
    1. Close and reopen every terminal / IDE so the new env var takes effect.
    2. ./scripts/clean-targets.ps1 -Full   (reclaims ~44 GB on C:)
    3. ./run_onetone.ps1 -Rebuild         (builds land on D:)

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\move-target-to-d-drive.ps1
#>
$ErrorActionPreference = 'Stop'

$TargetDir = 'D:\rust-target\onetone'
$HookFile  = Join-Path $PSScriptRoot '..\.trae\hooks.json'

# 1) Pre-create the new target dir on D:.
if (-not (Test-Path $TargetDir)) {
  New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
  Write-Host "Created $TargetDir" -ForegroundColor Cyan
} else {
  Write-Host "Reusing $TargetDir" -ForegroundColor DarkGray
}

# 2) Persistent user-scope env var; cargo picks it up for every new process.
[Environment]::SetEnvironmentVariable('CARGO_TARGET_DIR', $TargetDir, 'User')
Write-Host "Set user CARGO_TARGET_DIR=$TargetDir" -ForegroundColor Cyan

# 3) Rewrite hardcoded path in .trae/hooks.json so Trae IDE hook scripts
#    resolve under the new location. Forward slashes stay — Node on Windows
#    accepts both, and the existing file already uses forward slashes.
#    Always match the literal full command-prefix that we know the file uses
#    (write it out whole) rather than substring-replacing — the substring
#    approach leaves a mangled prefix behind.
if (Test-Path $HookFile) {
  $oldCmd = 'node "C:/Users/Administrator/Desktop/voice-pilot/src-tauri/target-release-live/release/scripts/agent-shell-hook-probe.js"'
  $newCmd = 'node "D:/rust-target/onetone/release/scripts/agent-shell-hook-probe.js"'
  $json   = Get-Content -LiteralPath $HookFile -Raw
  if ($json.Contains($oldCmd)) {
    $json = $json.Replace($oldCmd, $newCmd)
    Set-Content -LiteralPath $HookFile -Value $json -Encoding UTF8
    Write-Host "Rewrote $HookFile" -ForegroundColor Cyan
  } elseif ($json.Contains($newCmd)) {
    Write-Host "hooks.json already up to date" -ForegroundColor DarkGray
  } else {
    Write-Host "hooks.json did not match expected prefix — inspect manually" -ForegroundColor Yellow
  }
} else {
  Write-Host "hooks.json not found at $HookFile — Trae IDE hooks may break" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host "  1. Close + reopen every terminal / IDE (env vars are per-process)."
Write-Host "  2. ./scripts/clean-targets.ps1 -Full   # reclaims ~44 GB on C:"
Write-Host "  3. ./run_onetone.ps1 -Rebuild          # rebuild lands on D:"
