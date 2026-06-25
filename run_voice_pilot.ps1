$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$tauri = Join-Path $root 'src-tauri'
$releaseExe = Join-Path $tauri 'target\release\voice-pilot.exe'

$procs = Get-Process voice-pilot -ErrorAction SilentlyContinue
if ($procs) {
  $procs | Stop-Process -Force
  Start-Sleep -Milliseconds 500
}

$cargoTauri = Join-Path $env:USERPROFILE '.cargo\bin\cargo-tauri.exe'
if (-not (Test-Path $cargoTauri)) {
  throw "找不到 cargo-tauri.exe: $cargoTauri"
}

Push-Location $tauri
try {
  & $cargoTauri build
} finally {
  Pop-Location
}

if (-not (Test-Path $releaseExe)) {
  throw "构建完成但未找到 exe: $releaseExe"
}

Start-Process -FilePath $releaseExe -WorkingDirectory (Split-Path -Parent $releaseExe)
