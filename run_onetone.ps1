$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$tauri = Join-Path $root 'src-tauri'
$buildRoot = Join-Path $tauri 'target-release-live'
$releaseExe = Join-Path $buildRoot 'release\onetone.exe'
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
    if (Test-Path $src) {
      Copy-Item -Path $src -Destination (Join-Path $DestDir $name) -Force
    }
  }
}

Write-LaunchLog 'building...'

foreach ($name in @('onetone', 'voice-pilot')) {
  $procs = Get-Process $name -ErrorAction SilentlyContinue
  if ($procs) {
    Write-LaunchLog "stopping $name"
    $procs | Stop-Process -Force
    Start-Sleep -Milliseconds 500
  }
}

$iconIco = Join-Path $tauri 'icons\icon.ico'
$iconPng = Join-Path $tauri 'icons\icon.png'
$iconScript = Join-Path $root 'scripts\generate_onetone_icon.py'
if ((-not (Test-Path $iconIco)) -or (-not (Test-Path $iconPng))) {
  if (-not (Test-Path $iconScript)) {
    throw "缺少图标且找不到生成脚本: $iconScript"
  }
  Write-LaunchLog 'generating icons...'
  py -3 $iconScript
}

Push-Location $tauri
try {
  & cargo tauri build --no-bundle -- --target-dir $buildRoot
}
finally {
  Pop-Location
}

if (-not (Test-Path $releaseExe)) {
  throw "构建完成但未找到 exe: $releaseExe"
}

Write-LaunchLog 'build ok'

Copy-VoskRuntimeDlls -DestDir (Split-Path -Parent $releaseExe)

Start-Process -FilePath $releaseExe -WorkingDirectory (Split-Path -Parent $releaseExe)
Write-LaunchLog "launched onetone.exe from $releaseExe"
