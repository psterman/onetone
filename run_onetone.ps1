param(
  [switch]$Rebuild,
  [switch]$Safe
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$tauri = Join-Path $root 'src-tauri'
$buildRoot = Join-Path $tauri 'target-release-live'
$logDir = Join-Path $root 'logs'
$logFile = Join-Path $logDir 'launch.log'
$voskDir = Join-Path $tauri 'resources\vosk'
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

function Test-OnetoneRunning {
  return $null -ne (Get-Process onetone -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Start-OnetoneExe {
  param(
    [string]$ExePath,
    [switch]$Safe
  )
  $exeDir = Split-Path -Parent $ExePath
  if ($Safe -and (Test-OnetoneRunning)) {
    Write-LaunchLog "safe mode requested, stopping existing onetone"
    Stop-AppProcessGracefully -Name 'onetone'
  }
  if (Test-OnetoneRunning) {
    Write-LaunchLog "onetone already running, bring to front"
    Start-Process -FilePath $ExePath -WorkingDirectory $exeDir
    return
  }
  Copy-VoskRuntimeDlls -DestDir $exeDir
  Write-LaunchLog "runtime log: $(Join-Path $logDir 'runtime-live.log')"
  $oldLogDir = $env:ONETONE_LOG_DIR
  if ($Safe) {
    Write-LaunchLog "launching safe mode"
    $oldSafe = $env:ONETONE_SAFE_MODE
    try {
      $env:ONETONE_LOG_DIR = $logDir
      $env:ONETONE_SAFE_MODE = '1'
      Start-Process -FilePath $ExePath -WorkingDirectory $exeDir
    } finally {
      if ($null -eq $oldLogDir) {
        Remove-Item Env:\ONETONE_LOG_DIR -ErrorAction SilentlyContinue
      } else {
        $env:ONETONE_LOG_DIR = $oldLogDir
      }
      if ($null -eq $oldSafe) {
        Remove-Item Env:\ONETONE_SAFE_MODE -ErrorAction SilentlyContinue
      } else {
        $env:ONETONE_SAFE_MODE = $oldSafe
      }
    }
  } else {
    try {
      $env:ONETONE_LOG_DIR = $logDir
      Start-Process -FilePath $ExePath -WorkingDirectory $exeDir
    } finally {
      if ($null -eq $oldLogDir) {
        Remove-Item Env:\ONETONE_LOG_DIR -ErrorAction SilentlyContinue
      } else {
        $env:ONETONE_LOG_DIR = $oldLogDir
      }
    }
  }
  Write-LaunchLog "launched onetone.exe from $ExePath"
}

function Get-LaunchCandidates {
  $candidates = @(
    (Join-Path $buildRoot 'release\onetone.exe'),
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
  $releaseExe = Join-Path $buildRoot 'release\onetone.exe'

  if (-not $Rebuild) {
    $existing = Resolve-LaunchExe
    if ($existing) {
      Write-LaunchLog "launch only: $existing"
      Start-OnetoneExe -ExePath $existing -Safe:$Safe
      exit 0
    }
    Write-LaunchLog 'no exe found, building'
  }

  Write-LaunchLog 'building...'

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
    & cargo tauri build --no-bundle -- --target-dir $buildRoot
    if ($LASTEXITCODE -ne 0) {
      throw "cargo tauri build failed with exit code $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }

  if (-not (Test-Path $releaseExe)) {
    throw "build finished but exe missing: $releaseExe"
  }

  Write-LaunchLog 'build ok'
  Start-OnetoneExe -ExePath $releaseExe -Safe:$Safe
  exit 0
}
catch {
  Write-LaunchLog "launch failed: $($_.Exception.Message)"
  Write-Error $_.Exception.Message
  exit 1
}
