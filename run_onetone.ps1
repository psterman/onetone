param(
  [switch]$Rebuild,
  [switch]$LaunchOnly,
  [switch]$Safe,
  [switch]$Kws,
  [switch]$CodexMicroProtocol
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$tauri = Join-Path $root 'src-tauri'
# Honor CARGO_TARGET_DIR when set (e.g. by scripts/move-target-to-d-drive.ps1
# to D:\rust-target\onetone). Default keeps the historical
# src-tauri\target-release-live location for backward compatibility.
$defaultBuildRoot = Join-Path $tauri 'target-release-live'
$buildRoot = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { $defaultBuildRoot }
$releaseExe = Join-Path $buildRoot 'release\onetone.exe'
$logDir = Join-Path $root 'logs'
$logFile = Join-Path $logDir 'launch.log'
$voskDir = Join-Path $tauri 'resources\vosk'
$kwsDir = Join-Path $tauri 'resources\kws'
$kwsModelName = 'sherpa-kws-zh-small'
$voskDlls = @(
  'libvosk.dll',
  'libgcc_s_seh-1.dll',
  'libstdc++-6.dll',
  'libwinpthread-1.dll'
)

function Write-LaunchLog {
  param([string]$Message)
  if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -Path $logFile -Value $line -ErrorAction SilentlyContinue
}

function Copy-VoskRuntimeDlls {
  param([string]$DestDir)
  if (-not (Test-Path $DestDir)) { return }
  foreach ($name in $voskDlls) {
    $src = Join-Path $voskDir $name
    $dest = Join-Path $DestDir $name
    if (-not (Test-Path $src)) { continue }
    try {
      $srcResolved = (Resolve-Path -LiteralPath $src -ErrorAction Stop).Path
      $destResolved = if (Test-Path $dest) { (Resolve-Path -LiteralPath $dest -ErrorAction Stop).Path } else { $dest }
      if ($srcResolved -eq $destResolved) { continue }
      Copy-Item -LiteralPath $srcResolved -Destination $dest -Force -ErrorAction Stop
    } catch {
      Write-LaunchLog "dll copy skipped ($name in use): $($_.Exception.Message)"
      continue
    }
  }
}

function Sync-VoskBundleResources {
  param([string]$ReleaseDir)
  if (-not (Test-Path $ReleaseDir)) { return }
  $bundleVosk = Join-Path $ReleaseDir 'resources\vosk'
  if (-not (Test-Path $bundleVosk)) {
    New-Item -ItemType Directory -Path $bundleVosk -Force | Out-Null
  }
  Copy-VoskRuntimeDlls -DestDir $ReleaseDir
  Copy-VoskRuntimeDlls -DestDir $bundleVosk
  $models = @('vosk-model-small-cn-0.22', 'vosk-model-small-en-us-0.15')
  foreach ($modelName in $models) {
    $srcModel = Join-Path $voskDir $modelName
    $destModel = Join-Path $bundleVosk $modelName
    $marker = Join-Path $destModel 'conf\model.conf'
    if ((Test-Path (Join-Path $srcModel 'conf\model.conf')) -and -not (Test-Path $marker)) {
      Write-LaunchLog "syncing vosk model: $modelName"
      Copy-Item -LiteralPath $srcModel -Destination $destModel -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Sync-KwsBundleResources {
  param([string]$ReleaseDir)
  if (-not (Test-Path $ReleaseDir)) { return }
  $srcModel = Join-Path $kwsDir $kwsModelName
  $marker = Join-Path $srcModel 'tokens.txt'
  if (-not (Test-Path $marker)) {
    Write-LaunchLog "kws model missing at $srcModel (download via app or place sherpa-kws-zh-small)"
    return
  }
  $bundleKws = Join-Path $ReleaseDir 'resources\kws'
  $destModel = Join-Path $bundleKws $kwsModelName
  $destMarker = Join-Path $destModel 'tokens.txt'
  if (-not (Test-Path $destMarker)) {
    Write-LaunchLog "syncing kws model: $kwsModelName"
    New-Item -ItemType Directory -Path $bundleKws -Force | Out-Null
    Copy-Item -LiteralPath $srcModel -Destination $destModel -Recurse -Force -ErrorAction SilentlyContinue
  }
  $bundledKeywords = Join-Path $kwsDir 'onetone-keywords.txt'
  if (Test-Path $bundledKeywords) {
    $destKeywords = Join-Path $destModel 'keywords.txt'
    if ((Test-Path $destModel) -and -not (Test-Path $destKeywords)) {
      Copy-Item -LiteralPath $bundledKeywords -Destination $destKeywords -Force -ErrorAction SilentlyContinue
    }
  }
}

function Clear-StaleBundleResources {
  param([string]$BuildRoot)
  $resourcesDir = Join-Path $BuildRoot 'release\resources'
  if (-not (Test-Path $resourcesDir)) { return }
  $voskPath = Join-Path $resourcesDir 'vosk'
  if ((Test-Path -LiteralPath $voskPath) -and -not (Test-Path -LiteralPath $voskPath -PathType Container)) {
    Write-LaunchLog "removing stale bundle file: $voskPath"
    Remove-Item -LiteralPath $voskPath -Force -ErrorAction SilentlyContinue
  }
}

$script:BuildLockPath = Join-Path $logDir 'build.lock'

function Enter-BuildLock {
  $deadline = (Get-Date).AddMinutes(8)
  while (Test-Path -LiteralPath $script:BuildLockPath) {
    $holder = $null
    try { $holder = (Get-Content -LiteralPath $script:BuildLockPath -ErrorAction SilentlyContinue | Select-Object -First 1).Trim() } catch {}
    $holderAlive = $false
    if ($holder -match '^\d+$') {
      $holderAlive = $null -ne (Get-Process -Id ([int]$holder) -ErrorAction SilentlyContinue)
    }
    if (-not $holderAlive) {
      Write-LaunchLog "clearing stale build.lock (holder pid=$holder not running)"
      Remove-Item -LiteralPath $script:BuildLockPath -Force -ErrorAction SilentlyContinue
      break
    }
    if ((Get-Date) -gt $deadline) {
      Write-LaunchLog 'build lock timeout, clearing stale lock'
      Remove-Item -LiteralPath $script:BuildLockPath -Force -ErrorAction SilentlyContinue
      break
    }
    Write-Host "waiting for build lock (pid=$holder)..."
    Write-LaunchLog "waiting for another build to finish (pid=$holder)..."
    Start-Sleep -Seconds 3
  }
  if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  Set-Content -LiteralPath $script:BuildLockPath -Value $PID -Encoding ascii
  Write-LaunchLog "build.lock acquired pid=$PID"
}

function Exit-BuildLock {
  Remove-Item -LiteralPath $script:BuildLockPath -Force -ErrorAction SilentlyContinue
}

function Test-OnetoneRunning {
  return $null -ne (Get-Process onetone -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Test-PortOpen {
  param([int]$Port)
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $iar = $c.BeginConnect('127.0.0.1', $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(400)
    if (-not $ok) { $c.Close(); return $false }
    $c.EndConnect($iar) | Out-Null
    $c.Close()
    return $true
  } catch {
    return $false
  }
}

## Dev webview loads http://localhost:1420 — without serve, the window shows ERR_CONNECTION_REFUSED.
## Release embeds frontendDist, but this launcher still starts serve for hybrid/dev asset reloads.
function Ensure-FrontendServe {
  if (Test-PortOpen -Port 1420) {
    Write-LaunchLog 'frontend serve already on :1420'
    return
  }
  Write-LaunchLog 'starting frontend serve on :1420 (required for webview)'
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npm) {
    Write-LaunchLog 'npm not found; cannot start serve — UI will show localhost refused'
    return
  }
  # npm.cmd via Start-Process often exits immediately; use cmd /c so serve stays up.
  Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', 'npm', 'run', 'serve') -WorkingDirectory $root -WindowStyle Hidden | Out-Null
  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortOpen -Port 1420) {
      Write-LaunchLog 'frontend serve ready on :1420'
      return
    }
    Start-Sleep -Milliseconds 400
  }
  Write-LaunchLog 'frontend serve did not become ready on :1420'
}

function Start-OnetoneProcess {
  param(
    [string]$ExePath,
    [string]$WorkingDirectory,
    [hashtable]$ExtraEnv = @{}
  )
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $ExePath
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  foreach ($key in [System.Environment]::GetEnvironmentVariables('Process').Keys) {
    $psi.EnvironmentVariables[$key] = [System.Environment]::GetEnvironmentVariable($key, 'Process')
  }
  foreach ($entry in $ExtraEnv.GetEnumerator()) {
    if ($null -eq $entry.Value -or $entry.Value -eq '') {
      $psi.EnvironmentVariables.Remove($entry.Key) | Out-Null
    } else {
      $psi.EnvironmentVariables[$entry.Key] = [string]$entry.Value
    }
  }
  [System.Diagnostics.Process]::Start($psi) | Out-Null
}

function Start-OnetoneExe {
  param(
    [string]$ExePath,
    [switch]$Safe,
    [switch]$CodexMicroProtocol
  )
  $exeDir = Split-Path -Parent $ExePath
  if (($Safe -or $CodexMicroProtocol) -and (Test-OnetoneRunning)) {
    $why = if ($CodexMicroProtocol) { 'CodexMicroProtocol' } else { 'safe mode' }
    Write-LaunchLog "$why requested, stopping existing onetone"
    Stop-AppProcessGracefully -Name 'onetone'
  }
  if (Test-OnetoneRunning) {
    Ensure-FrontendServe
    Write-LaunchLog 'onetone already running, bring to front'
    Start-Process -FilePath $ExePath -WorkingDirectory $exeDir
    return
  }
  Copy-VoskRuntimeDlls -DestDir $exeDir
  $releaseDir = Split-Path -Parent $ExePath
  Sync-VoskBundleResources -ReleaseDir $releaseDir
  Sync-KwsBundleResources -ReleaseDir $releaseDir
  Ensure-FrontendServe
  Write-LaunchLog "runtime log: $(Join-Path $logDir 'runtime-live.log')"
  $extraEnv = @{ ONETONE_LOG_DIR = $logDir }
  if ($Safe) {
    Write-LaunchLog 'launching safe mode'
    $extraEnv['ONETONE_SAFE_MODE'] = '1'
  }
  if ($CodexMicroProtocol) {
    $extraEnv['ONETONE_CODEX_MICRO_PROTOCOL'] = '1'
    Write-LaunchLog 'Labs: ONETONE_CODEX_MICRO_PROTOCOL=1 (loopback 8796)'
  }
  Start-OnetoneProcess -ExePath $ExePath -WorkingDirectory $exeDir -ExtraEnv $extraEnv
  Write-LaunchLog "launched onetone.exe from $ExePath"
}

function Get-DevSourceFiles {
  $files = @()
  foreach ($path in @(
      (Join-Path $root 'src'),
      (Join-Path $tauri 'src'),
      (Join-Path $tauri 'Cargo.toml'),
      (Join-Path $tauri 'Cargo.lock'),
      (Join-Path $tauri 'tauri.conf.json'),
      (Join-Path $tauri 'build.rs')
    )) {
    if (-not (Test-Path $path)) { continue }
    $item = Get-Item -LiteralPath $path
    if ($item.PSIsContainer) {
      $files += Get-ChildItem -Path $item.FullName -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
          $_.FullName -notmatch '\\target\\' -and
          $_.Extension -in @('.html', '.js', '.css', '.rs', '.toml', '.json')
        }
    } else {
      $files += $item
    }
  }
  return $files | Sort-Object FullName -Unique
}

function Test-DevBuildStale {
  if (-not (Test-Path $releaseExe)) { return $true }
  $exeTime = (Get-Item -LiteralPath $releaseExe).LastWriteTimeUtc
  foreach ($file in (Get-DevSourceFiles)) {
    if ($file.LastWriteTimeUtc -gt $exeTime) { return $true }
  }
  return $false
}

function Get-LaunchCandidates {
  $candidates = @(
    $releaseExe,
    (Join-Path $tauri 'target\release\onetone.exe')
  )

  $localApp = [Environment]::GetFolderPath('LocalApplicationData')
  foreach ($dir in @(
      (Join-Path $localApp 'Programs\com.onetone.app'),
      (Join-Path $localApp 'Programs\onetone')
    )) {
    $candidates += (Join-Path $dir 'onetone.exe')
    $candidates += (Join-Path $dir '_up_\onetone.exe')
  }

  $programFiles = $env:ProgramFiles
  $programFilesX86 = ${env:ProgramFiles(x86)}
  foreach ($dir in @(
      (Join-Path $programFiles 'onetone'),
      (Join-Path $programFilesX86 'onetone')
    )) {
    if ($dir) {
      $candidates += (Join-Path $dir 'onetone.exe')
    }
  }

  return $candidates | Select-Object -Unique
}

function Resolve-LaunchExe {
  foreach ($path in (Get-LaunchCandidates)) {
    if (Test-Path $path) {
      return (Resolve-Path $path).Path
    }
  }
  return $null
}

function Stop-AppProcessGracefully {
  param(
    [string]$Name,
    [int]$WaitMs = 2500
  )
  $procs = Get-Process $Name -ErrorAction SilentlyContinue
  if (-not $procs) { return }
  Write-LaunchLog "stopping $Name gracefully"
  foreach ($p in $procs) {
    try {
      if ($p.MainWindowHandle -ne 0) {
        [void]$p.CloseMainWindow()
      } else {
        Stop-Process -Id $p.Id -ErrorAction SilentlyContinue
      }
    } catch {
      Stop-Process -Id $p.Id -ErrorAction SilentlyContinue
    }
  }

  Start-Sleep -Milliseconds $WaitMs

  $left = Get-Process $Name -ErrorAction SilentlyContinue
  if ($left) {
    Write-LaunchLog "forcing stop for $Name"
    $left | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
  }
}

try {
  $stale = Test-DevBuildStale
  $needBuild = $Rebuild -or ($stale -and -not $LaunchOnly)

  if (-not $needBuild -and (Test-Path $releaseExe)) {
    Sync-VoskBundleResources -ReleaseDir (Split-Path -Parent $releaseExe)
    Sync-KwsBundleResources -ReleaseDir (Split-Path -Parent $releaseExe)
    Write-LaunchLog "launch dev build (up to date): $releaseExe"
    Start-OnetoneExe -ExePath (Resolve-Path $releaseExe).Path -Safe:$Safe -CodexMicroProtocol:$CodexMicroProtocol
    exit 0
  }

  if ($LaunchOnly -and -not $Rebuild) {
    $existing = Resolve-LaunchExe
    if ($existing) {
      Write-LaunchLog "launch only: $existing"
      Start-OnetoneExe -ExePath $existing -Safe:$Safe -CodexMicroProtocol:$CodexMicroProtocol
      exit 0
    }
    if (-not (Test-Path $releaseExe)) {
      Write-LaunchLog 'no exe found, building'
      $needBuild = $true
    } else {
      Write-LaunchLog "launch dev build: $releaseExe"
      Start-OnetoneExe -ExePath (Resolve-Path $releaseExe).Path -Safe:$Safe -CodexMicroProtocol:$CodexMicroProtocol
      exit 0
    }
  }

  if ($stale -and -not $Rebuild) {
    Write-LaunchLog 'source changed since last build, rebuilding...'
  } else {
    Write-LaunchLog 'building...'
  }

  foreach ($name in @('onetone', 'voice-pilot')) {
    Stop-AppProcessGracefully -Name $name
  }

  $iconIco = Join-Path $tauri 'icons\icon.ico'
  $iconPng = Join-Path $tauri 'icons\icon.png'
  $iconScript = Join-Path $root 'scripts\generate_onetone_icon.py'
  if ((-not (Test-Path $iconIco)) -or (-not (Test-Path $iconPng)) -or ((Get-Item $iconScript).LastWriteTimeUtc -gt (Get-Item $iconIco).LastWriteTimeUtc)) {
    if (-not (Test-Path $iconScript)) {
      throw "missing icon generator: $iconScript"
    }
    Write-LaunchLog 'generating icons...'
    py -3 $iconScript
  }

  Push-Location $tauri
  try {
    Enter-BuildLock
    Clear-StaleBundleResources -BuildRoot $buildRoot
    $kwsFeature = if ($Kws) { @('--features', 'kws-engine') } else { @() }
    & cargo tauri build --no-bundle @kwsFeature -- --target-dir $buildRoot
    if ($LASTEXITCODE -ne 0) {
      throw "cargo tauri build failed with exit code $LASTEXITCODE"
    }
  }
  finally {
    Exit-BuildLock
    Pop-Location
  }

  if (-not (Test-Path $releaseExe)) {
    throw "build finished but exe missing: $releaseExe"
  }

  Sync-VoskBundleResources -ReleaseDir (Split-Path -Parent $releaseExe)
  Sync-KwsBundleResources -ReleaseDir (Split-Path -Parent $releaseExe)

  Write-LaunchLog 'build ok'
  Start-OnetoneExe -ExePath $releaseExe -Safe:$Safe -CodexMicroProtocol:$CodexMicroProtocol
  exit 0
}
catch {
  Exit-BuildLock
  Write-LaunchLog "launch failed: $($_.Exception.Message)"
  Write-Error $_.Exception.Message
  exit 1
}
