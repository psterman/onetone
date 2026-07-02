# Stage Vosk runtime DLLs next to onetone.exe before NSIS bundling.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$vosk = Join-Path $root 'src-tauri\resources\vosk'
$release = Join-Path $root 'src-tauri\target\release'
$names = @('libvosk.dll', 'libgcc_s_seh-1.dll', 'libstdc++-6.dll', 'libwinpthread-1.dll')
if (-not (Test-Path $release)) { New-Item -ItemType Directory -Path $release -Force | Out-Null }
foreach ($name in $names) {
  $src = Join-Path $vosk $name
  if (Test-Path $src) {
    Copy-Item -Path $src -Destination (Join-Path $release $name) -Force
  }
}
