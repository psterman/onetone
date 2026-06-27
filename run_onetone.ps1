$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$tauri = Join-Path $root 'src-tauri'
$releaseExe = Join-Path $tauri 'target\release\onetone.exe'
$voskDir = Join-Path $tauri 'resources\vosk'
$voskDlls = @(
  'libvosk.dll',
  'libgcc_s_seh-1.dll',
  'libstdc++-6.dll',
  'libwinpthread-1.dll'
)

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

foreach ($name in @('onetone', 'voice-pilot')) {
  $procs = Get-Process $name -ErrorAction SilentlyContinue
  if ($procs) {
    $procs | Stop-Process -Force
    Start-Sleep -Milliseconds 500
  }
}

$cargoTauri = Join-Path $env:USERPROFILE '.cargo\bin\cargo-tauri.exe'
if (-not (Test-Path $cargoTauri)) {
  throw "找不到 cargo-tauri.exe: $cargoTauri"
}

Push-Location $tauri
try {
  python (Join-Path $root 'scripts\generate_onetone_icon.py')
  & $cargoTauri build
} finally {
  Pop-Location
}

if (-not (Test-Path $releaseExe)) {
  throw "构建完成但未找到 exe: $releaseExe"
}

Copy-VoskRuntimeDlls -DestDir (Split-Path -Parent $releaseExe)

Start-Process -FilePath $releaseExe -WorkingDirectory (Split-Path -Parent $releaseExe)
