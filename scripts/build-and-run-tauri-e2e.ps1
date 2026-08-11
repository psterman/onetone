# E2E build + run wrapper.
# Builds with --features bfinal_e2e into an isolated CARGO_TARGET_DIR so the
# production target/release EXE and NSIS are never touched.
# Exit codes: build failure = cargo exit code; runner failure = runner exit code;
#             isolation check failure = 3; all pass = 0.
param()
$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $Here "..")).Path

function Get-Sha256([string]$Path) {
    $Stream = [System.IO.File]::OpenRead($Path)
    try {
        $Sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $Bytes = $Sha.ComputeHash($Stream)
            return ([System.BitConverter]::ToString($Bytes) -replace '-', '')
        }
        finally {
            $Sha.Dispose()
        }
    }
    finally {
        $Stream.Dispose()
    }
}

$E2eTarget     = Join-Path $Root "src-tauri\target\e2e"
$E2eExe        = Join-Path $E2eTarget "release\onetone.exe"
$Runner        = Join-Path $Root "scripts\run-tauri-e2e.ps1"
$ProductionExe = Join-Path $Root "src-tauri\target\release\onetone.exe"

# Snapshot production EXE state BEFORE build so we can assert it is unchanged after.
$ProdExistedBefore = Test-Path $ProductionExe
$ProdHashBefore    = if ($ProdExistedBefore) {
    Get-Sha256 $ProductionExe
} else {
    $null
}

Write-Host "E2E target : $E2eExe"
Write-Host "Production : $ProductionExe (exists=$ProdExistedBefore)"
if ($ProdHashBefore) { Write-Host "Prod SHA256 before: $ProdHashBefore" }

# Save and override CARGO_TARGET_DIR with absolute path.
$HadOld = Test-Path Env:CARGO_TARGET_DIR
$OldVal = $env:CARGO_TARGET_DIR
$RunnerExitCode = 1

try {
    $env:CARGO_TARGET_DIR = $E2eTarget

    # --no-bundle: build EXE only; do NOT generate NSIS/installer artifacts.
    # --features bfinal_e2e: include the acceptance runner module.
    Write-Host "Building E2E EXE..."
    tauri build --no-bundle --features bfinal_e2e
    if ($LASTEXITCODE -ne 0) {
        Write-Host "tauri build failed (exit $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }

    if (-not (Test-Path $E2eExe)) {
        Write-Host "E2E EXE not found after build: $E2eExe" -ForegroundColor Red
        exit 1
    }

    # Launch runner as a child PowerShell process so its internal 'exit 0'
    # does not terminate this script before finally/post-checks run.
    Write-Host "Launching E2E runner..."
    & powershell -NoProfile -File $Runner -Exe $E2eExe
    $RunnerExitCode = $LASTEXITCODE
    Write-Host "Runner exit code: $RunnerExitCode"
} finally {
    # Restore CARGO_TARGET_DIR exactly, distinguishing absent from empty.
    if ($HadOld) {
        $env:CARGO_TARGET_DIR = $OldVal
    } else {
        Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
    }
}

if ($RunnerExitCode -ne 0) {
    exit $RunnerExitCode
}

# Post-run isolation check — runner succeeded; now verify production artifacts are untouched.
Write-Host "Checking production EXE isolation..."

if ($ProdExistedBefore) {
    if (-not (Test-Path $ProductionExe)) {
        Write-Host "ISOLATION FAIL: production EXE was removed by E2E build" -ForegroundColor Red
        exit 3
    }

    $ProdHashAfter = Get-Sha256 $ProductionExe
    Write-Host "Prod SHA256 after : $ProdHashAfter"

    if ($ProdHashAfter -ne $ProdHashBefore) {
        Write-Host "ISOLATION FAIL: production EXE hash changed — E2E build overwrote it" -ForegroundColor Red
        exit 3
    }

    # rg exit code: 0 = match found (bad), 1 = no match (good), anything else = error.
    & rg -a -q "ONETONE_BFINAL_E2E" $ProductionExe
    $RgExit = $LASTEXITCODE
    if ($RgExit -eq 0) {
        Write-Host "ISOLATION FAIL: production EXE contains E2E marker ONETONE_BFINAL_E2E" -ForegroundColor Red
        exit 3
    }
    if ($RgExit -ne 1) {
        Write-Host "ISOLATION FAIL: rg inspection of production EXE failed (exit $RgExit)" -ForegroundColor Red
        exit 3
    }

    Write-Host "ISOLATION PASS: production EXE hash unchanged, no E2E markers found"
} elseif (Test-Path $ProductionExe) {
    Write-Host "ISOLATION FAIL: E2E build created an artifact in the production target directory" -ForegroundColor Red
    exit 3
} else {
    Write-Host "ISOLATION PASS: no production EXE before or after (clean environment)"
}

Write-Host "All checks passed."
exit 0
