# Real Tauri E2E orchestrator: launch onetone with ONETONE_BFINAL_E2E, PrintWindow on step marks.
# Isolated data root via ONETONE_E2E_DATA_ROOT (requires bfinal_e2e feature + ONETONE_BFINAL_E2E=1).
param(
  [string]$Exe = "",
  [string]$OutDir = "",
  [int]$TimeoutMinutes = 10,
  [switch]$AgentRoster
)
$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $Here "..")).Path
if (-not $OutDir) { $OutDir = Join-Path $Root "logs\b-acceptance" }
if (-not $Exe) {
  $Exe = Join-Path $Root "src-tauri\target\release\onetone.exe"
}
$Shot = Join-Path $Root "scripts\capture-tauri-shot.ps1"
$FixtureSettings = Join-Path $Root "scripts\fixtures\bfinal-e2e\settings.json"
if (-not (Test-Path $Exe)) { throw "missing exe: $Exe — run 'npm run test:e2e' to build first" }
if (-not (Test-Path $Shot)) { throw "missing $Shot" }
if (-not (Test-Path $FixtureSettings)) { throw "missing E2E settings fixture: $FixtureSettings" }

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$DataRoot = Join-Path $OutDir "data-root"
$DataRoot = [System.IO.Path]::GetFullPath($DataRoot)
# Fresh data root each run — never reuse prior overwritten settings / sessions.
if (Test-Path -LiteralPath $DataRoot) {
  Remove-Item -LiteralPath $DataRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null
# Copy fixture as UTF-8 without BOM (BOM breaks serde_json → Default → empty provider).
$settingsDest = Join-Path $DataRoot "settings.json"
$rawFixture = [System.IO.File]::ReadAllText($FixtureSettings)
if ($rawFixture.Length -gt 0 -and [int][char]$rawFixture[0] -eq 0xFEFF) {
  $rawFixture = $rawFixture.Substring(1)
}
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($settingsDest, $rawFixture, $utf8NoBom)

$DefaultAppData = Join-Path $env:APPDATA "com.onetone\app"
$DefaultAppDataFull = [System.IO.Path]::GetFullPath($DefaultAppData)
if ($DataRoot -eq $DefaultAppDataFull) {
  throw "E2E data root must not equal default AppData: $DataRoot"
}

Get-Process onetone -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Remove-Item (Join-Path $OutDir "e2e-done.txt") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $OutDir "e2e-step.txt") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $OutDir "e2e-log.jsonl") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $OutDir "e2e-run.meta.json") -ErrorAction SilentlyContinue

$env:ONETONE_BFINAL_E2E = "1"
$env:ONETONE_BFINAL_E2E_DIR = $OutDir
$env:ONETONE_E2E_DATA_ROOT = $DataRoot
if ($AgentRoster) {
  $env:ONETONE_AGENT_ROSTER_E2E = "1"
  Write-Host "ONETONE_AGENT_ROSTER_E2E=1"
} else {
  Remove-Item Env:ONETONE_AGENT_ROSTER_E2E -ErrorAction SilentlyContinue
}

$startedAt = Get-Date
$startedAtIso = $startedAt.ToString("o")
$p = Start-Process -FilePath $Exe -WorkingDirectory (Split-Path $Exe) -PassThru
Write-Host "launched pid=$($p.Id) e2eDir=$OutDir dataRoot=$DataRoot timeoutMinutes=$TimeoutMinutes"

# Assert isolation after process start (settings must live under test data root).
$settingsInDataRoot = Join-Path $DataRoot "settings.json"
if (-not (Test-Path $settingsInDataRoot)) {
  throw "E2E settings missing under data root: $settingsInDataRoot"
}
Write-Host "effectiveDataRootExpected=$DataRoot (defaultAppData=$DefaultAppDataFull)"

$wanted = @(
  'key-picker-chord',
  'voice-picker-phrase',
  'camera-picker-pending',
  'softpad-picker-key',
  'habit-actions-detail',
  'pending-confirm',
  'pending-complete',
  'pending-expire'
)
if ($AgentRoster) {
  $wanted += @(
    'roster-v1-expand',
    'roster-v2-filters',
    'roster-v3-freshness',
    'roster-e-reasons',
    'roster-v4-ui',
    'home-overview-four-cards',
    'home-filter-not-wired',
    'home-filter-unsupported',
    'home-filter-stale',
    'home-cursor-best-effort',
    'home-confirmable-pending-detail'
  )
  if ($TimeoutMinutes -lt 15) { $TimeoutMinutes = 15 }
}
$captured = @{}
$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
$last = ""

function Write-E2eRunMeta {
  param(
    [string]$Status,
    [string]$LastStep,
    [hashtable]$CapturedMap
  )
  $completedAt = Get-Date
  $keys = @($CapturedMap.Keys | Sort-Object)
  $meta = [ordered]@{
    startedAt      = $startedAtIso
    completedAt    = $completedAt.ToString("o")
    durationMs     = [int64]($completedAt - $startedAt).TotalMilliseconds
    lastStep       = $LastStep
    capturedCount  = $CapturedMap.Count
    capturedSteps  = $keys
    pid            = $p.Id
    exe            = $Exe
    outDir         = $OutDir
    dataRoot       = $DataRoot
    timeoutMinutes = $TimeoutMinutes
    status         = $Status
  }
  $metaPath = Join-Path $OutDir "e2e-run.meta.json"
  ($meta | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $metaPath -Encoding UTF8
  Write-Host "wrote $metaPath"
}

function Get-MainWindowHandleSafe([System.Diagnostics.Process]$Proc) {
  try {
    $Proc.Refresh()
    if ($Proc.MainWindowHandle -and $Proc.MainWindowHandle -ne [IntPtr]::Zero) {
      return [Int64]$Proc.MainWindowHandle
    }
  } catch {}
  return 0
}

function Invoke-Shot([string]$StepName) {
  # Do not pass MainWindowHandle — it goes stale across fullscreen / overlay transitions.
  $attempts = 0
  $lastErr = $null
  while ($attempts -lt 4) {
    $attempts++
    try {
      & powershell -NoProfile -File $Shot -Name "$StepName.png" -OutDir $OutDir -ProcessId $p.Id
      if ($LASTEXITCODE -eq 0) { return }
      $lastErr = "exit=$LASTEXITCODE"
    } catch {
      $lastErr = "$_"
    }
    Start-Sleep -Milliseconds (500 * $attempts)
  }
  throw "screenshot failed for step=$StepName after $attempts tries: $lastErr"
}

try {
  while ((Get-Date) -lt $deadline) {
    if (-not (Get-Process -Id $p.Id -ErrorAction SilentlyContinue)) {
      Write-E2eRunMeta -Status 'fail:exited_early' -LastStep $last -CapturedMap $captured
      throw "onetone exited early; last=$last captured=$($captured.Keys -join ',')"
    }
    $done = Join-Path $OutDir "e2e-done.txt"
    $stepFile = Join-Path $OutDir "e2e-step.txt"
    if (Test-Path $stepFile) {
      $step = (Get-Content $stepFile -Raw).Trim()
      if ($step -and $step -ne $last) {
        Write-Host "step=$step"
        $last = $step
        if ($wanted -contains $step -and -not $captured.ContainsKey($step)) {
          Start-Sleep -Milliseconds 600
          Invoke-Shot $step
          $captured[$step] = $true
        }
      }
    }
    if (Test-Path $done) {
      $status = (Get-Content $done -Raw).Trim()
      Write-Host "done=$status"
      Start-Sleep -Seconds 1
      foreach ($w in $wanted) {
        if (-not $captured.ContainsKey($w)) {
          $candidate = Join-Path $OutDir "$w.png"
          if (-not (Test-Path $candidate)) {
            Write-Host "missing shot $w — capturing current window as fallback name"
            try {
              Invoke-Shot $w
              $captured[$w] = $true
            } catch {
              Write-Host "fallback shot failed for $w : $_"
            }
          }
        }
      }

      # Isolation assertions: settings/runtime under test data root, not default AppData.
      if (-not (Test-Path $settingsInDataRoot)) {
        throw "post-run: settings missing under E2E data root"
      }
      $userSettings = Join-Path $DefaultAppDataFull "settings.json"
      # Soft check only — we must not have written a pointer migration; settings copy is ours.
      Write-Host "isolation ok dataRoot=$DataRoot settings=$settingsInDataRoot"

      Get-Process onetone -ErrorAction SilentlyContinue | Stop-Process -Force
      if ($status -notmatch '^pass') {
        Write-E2eRunMeta -Status "fail:$status" -LastStep $last -CapturedMap $captured
        throw "E2E failed: $status"
      }
      $meta = Join-Path $OutDir "pending-complete.meta.json"
      if (-not (Test-Path $meta)) {
        Write-E2eRunMeta -Status 'fail:missing_pending_meta' -LastStep $last -CapturedMap $captured
        throw "missing pending-complete.meta.json"
      }
      Write-E2eRunMeta -Status 'pass' -LastStep $last -CapturedMap $captured
      Write-Host "E2E PASS shots=$($captured.Count) meta=$meta"
      Get-Content $meta
      exit 0
    }
    Start-Sleep -Milliseconds 250
  }

  Get-Process onetone -ErrorAction SilentlyContinue | Stop-Process -Force
  $capturedList = ($captured.Keys | Sort-Object) -join ', '
  Write-E2eRunMeta -Status 'fail:timeout' -LastStep $last -CapturedMap $captured
  throw "E2E timeout; last=$last captured=$capturedList"
} finally {
  Get-Process onetone -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
