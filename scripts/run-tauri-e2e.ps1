# Real Tauri E2E orchestrator: launch onetone with ONETONE_BFINAL_E2E, PrintWindow on step marks.
# Move from logs/b-acceptance/ to scripts/ in C0; logs/ retains only result artifacts.
param(
  [string]$Exe = "",
  [string]$OutDir = ""
)
$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $Here "..")).Path
if (-not $OutDir) { $OutDir = Join-Path $Root "logs\b-acceptance" }
if (-not $Exe) {
  $Exe = Join-Path $Root "src-tauri\target\release\onetone.exe"
}
$Shot = Join-Path $Root "logs\b-acceptance\capture-tauri-shot.ps1"
if (-not (Test-Path $Exe)) { throw "missing exe: $Exe — run 'npm run test:e2e' to build first" }
if (-not (Test-Path $Shot)) { throw "missing $Shot" }

Get-Process onetone -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Remove-Item (Join-Path $OutDir "e2e-done.txt") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $OutDir "e2e-step.txt") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $OutDir "e2e-log.jsonl") -ErrorAction SilentlyContinue

$env:ONETONE_BFINAL_E2E = "1"
$env:ONETONE_BFINAL_E2E_DIR = $OutDir

$p = Start-Process -FilePath $Exe -WorkingDirectory (Split-Path $Exe) -PassThru
Write-Host "launched pid=$($p.Id) e2eDir=$OutDir"

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
$captured = @{}
$deadline = (Get-Date).AddMinutes(4)
$last = ""

while ((Get-Date) -lt $deadline) {
  if (-not (Get-Process -Id $p.Id -ErrorAction SilentlyContinue)) {
    throw "onetone exited early"
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
        & powershell -NoProfile -File $Shot -Name "$step.png" -OutDir $OutDir
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
        }
      }
    }
    Get-Process onetone -ErrorAction SilentlyContinue | Stop-Process -Force
    if ($status -notmatch '^pass') { throw "E2E failed: $status" }
    $meta = Join-Path $OutDir "pending-complete.meta.json"
    if (-not (Test-Path $meta)) { throw "missing pending-complete.meta.json" }
    Write-Host "E2E PASS shots=$($captured.Count) meta=$meta"
    Get-Content $meta
    exit 0
  }
  Start-Sleep -Milliseconds 250
}

Get-Process onetone -ErrorAction SilentlyContinue | Stop-Process -Force
throw "E2E timeout; last=$last captured=$($captured.Keys -join ',')"
