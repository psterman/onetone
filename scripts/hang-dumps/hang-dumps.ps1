# OneTone hang/crash dump helpers.
# Usage: .\hang-dumps.ps1 <install|setup|arm|collect|start|stop|status|cleanup|verify-hang>
param(
  [Parameter(Position = 0, Mandatory = $true)]
  [ValidateSet('install', 'setup', 'arm', 'collect', 'start', 'stop', 'status', 'cleanup', 'verify-hang')]
  [string]$Action,
  [string]$ProcDumpPath = '',
  [string]$ExeName = 'onetone.exe',
  [int]$VerifyHangSeconds = 8
)

$ErrorActionPreference = 'Stop'
$HangDir = Join-Path $env:LOCALAPPDATA 'OneTone\HangDumps'
$CrashDir = Join-Path $env:LOCALAPPDATA 'OneTone\CrashDumps'
$StateDir = Join-Path $env:LOCALAPPDATA 'OneTone\hang-dumps-state'
$PidFile = Join-Path $StateDir 'procdump.pid'
$CurrentSessionFile = Join-Path $StateDir 'current-voice-hang-session.json'
$ToolDir = Join-Path $env:LOCALAPPDATA 'OneTone\tools'
$LocalDumpsKey = 'HKCU:\Software\Microsoft\Windows\Windows Error Reporting\LocalDumps\onetone.exe'
$ProcDumpDownloadUrl = 'https://download.sysinternals.com/files/Procdump.zip'

function Find-ProcDump {
  if ($ProcDumpPath -and (Test-Path $ProcDumpPath)) { return (Resolve-Path $ProcDumpPath).Path }
  $candidates = @(
    (Join-Path $PSScriptRoot 'procdump.exe'),
    (Join-Path $PSScriptRoot 'procdump64.exe'),
    "$env:LOCALAPPDATA\OneTone\tools\procdump.exe",
    "$env:LOCALAPPDATA\OneTone\tools\procdump64.exe",
    'C:\Tools\Sysinternals\procdump.exe',
    'C:\Sysinternals\procdump.exe'
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { return (Resolve-Path $c).Path }
  }
  $cmd = Get-Command procdump.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Ensure-Dirs {
  New-Item -ItemType Directory -Force -Path $HangDir, $CrashDir, $StateDir, $ToolDir | Out-Null
}

function Invoke-Install {
  Ensure-Dirs
  $existing = Find-ProcDump
  if ($existing) {
    Write-Host "ProcDump already available: $existing"
    return
  }

  $tempDir = Join-Path $env:TEMP ("OneTone-ProcDump-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tempDir | Out-Null
  try {
    $zipPath = Join-Path $tempDir 'Procdump.zip'
    $extractDir = Join-Path $tempDir 'expanded'
    Write-Host "Downloading Microsoft Sysinternals ProcDump..."
    Invoke-WebRequest -Uri $ProcDumpDownloadUrl -OutFile $zipPath -UseBasicParsing
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir
    $sourceExe = Join-Path $extractDir 'procdump64.exe'
    if (-not (Test-Path -LiteralPath $sourceExe)) {
      throw "Downloaded package does not contain procdump64.exe"
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $sourceExe
    if ($signature.Status -ne 'Valid' -or
        -not $signature.SignerCertificate -or
        $signature.SignerCertificate.Subject -notmatch 'Microsoft') {
      throw "ProcDump signature verification failed: status=$($signature.Status) signer=$($signature.SignerCertificate.Subject)"
    }
    $destination = Join-Path $ToolDir 'procdump64.exe'
    Copy-Item -LiteralPath $sourceExe -Destination $destination -Force
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash
    $version = (Get-Item -LiteralPath $destination).VersionInfo.FileVersion
    [ordered]@{
      source = $ProcDumpDownloadUrl
      installedAt = (Get-Date).ToString('o')
      path = $destination
      version = $version
      sha256 = $hash
      signer = $signature.SignerCertificate.Subject
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ToolDir 'procdump-install.json') -Encoding UTF8
    Write-Host "Installed verified ProcDump: $destination version=$version sha256=$hash"
  } finally {
    if (Test-Path -LiteralPath $tempDir) {
      Remove-Item -LiteralPath $tempDir -Recurse -Force
    }
  }
}

function Invoke-Setup {
  Ensure-Dirs
  New-Item -Path $LocalDumpsKey -Force | Out-Null
  Set-ItemProperty -Path $LocalDumpsKey -Name 'DumpFolder' -Value $CrashDir -Type ExpandString
  Set-ItemProperty -Path $LocalDumpsKey -Name 'DumpType' -Value 2 -Type DWord
  Set-ItemProperty -Path $LocalDumpsKey -Name 'DumpCount' -Value 10 -Type DWord
  $pd = Find-ProcDump
  Write-Host "LocalDumps DumpFolder=$CrashDir DumpType=2"
  if ($pd) { Write-Host "ProcDump found: $pd" } else {
    Write-Warning "ProcDump not found. Download from Microsoft Sysinternals and place as scripts/hang-dumps/procdump.exe or set -ProcDumpPath."
  }
  Write-Host "Hang dumps dir: $HangDir"
  Write-Host "NOTE: registry presence is NOT verification. Run 'verify-hang' or 'start' + real AppHang to confirm .dmp output."
}

function Invoke-Start {
  Ensure-Dirs
  $pd = Find-ProcDump
  if (-not $pd) { throw "procdump.exe not found. Run setup and install Sysinternals ProcDump." }
  if (Test-Path $PidFile) {
    $old = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) {
      Write-Host "ProcDump already running pid=$old"
      return
    }
  }
  # -h: capture when window is unresponsive (Windows hang standard)
  # -n 3 -s 5: up to 3 dumps, 5s apart (deadlock vs long compute)
  $args = @('-accepteula', '-ma', '-h', '-n', '3', '-s', '5', '-w', $ExeName, $HangDir)
  $p = Start-Process -FilePath $pd -ArgumentList $args -PassThru -WindowStyle Hidden
  Set-Content -Path $PidFile -Value $p.Id -Encoding ascii
  Write-Host "ProcDump started pid=$($p.Id) waiting for $ExeName hangs -> $HangDir"
}

function Invoke-Arm {
  Ensure-Dirs
  $pd = Find-ProcDump
  if (-not $pd) { throw "procdump.exe not found. Run '.\hang-dumps.ps1 install' first." }

  if (Test-Path -LiteralPath $PidFile) {
    $oldPid = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue
    if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
      throw "A ProcDump monitor is already active (pid=$oldPid). Run 'collect' or 'stop' first."
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  }

  $sessionId = 'voice-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
  $sessionDir = Join-Path $HangDir $sessionId
  New-Item -ItemType Directory -Path $sessionDir | Out-Null
  $runtimeLog = Join-Path $env:APPDATA 'oneTone\app\config\logs\runtime-live.log'
  $runtimeLength = if (Test-Path -LiteralPath $runtimeLog) { (Get-Item -LiteralPath $runtimeLog).Length } else { 0 }
  $session = [ordered]@{
    sessionId = $sessionId
    startedAt = (Get-Date).ToString('o')
    startedAtUnixMs = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    exeName = $ExeName
    sessionDir = $sessionDir
    runtimeLog = $runtimeLog
    runtimeLogStartLength = $runtimeLength
    procdumpPath = $pd
    command = "-accepteula -ma -h -n 3 -s 5 -w $ExeName $sessionDir"
  }
  $session | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $sessionDir 'session.json') -Encoding UTF8
  $session | ConvertTo-Json | Set-Content -LiteralPath $CurrentSessionFile -Encoding UTF8

  # Microsoft ProcDump -h uses the same hung-window definition as Windows/Task Manager.
  # Three full dumps five seconds apart distinguish a deadlock from progressing work.
  $args = @('-accepteula', '-ma', '-h', '-n', '3', '-s', '5', '-w', $ExeName, $sessionDir)
  $monitor = Start-Process -FilePath $pd -ArgumentList $args -PassThru -WindowStyle Hidden
  Set-Content -LiteralPath $PidFile -Value $monitor.Id -Encoding ascii
  Write-Host "VOICE HANG DIAGNOSTICS ARMED"
  Write-Host "Session: $sessionId"
  Write-Host "Monitor pid=$($monitor.Id), waiting for $ExeName"
  Write-Host "Run OneTone, open Voice settings, and leave the frozen window open for at least 20 seconds."
  Write-Host "After reproducing (or completing a clean run), execute: .\hang-dumps.ps1 collect"
  Write-Host "Artifacts: $sessionDir"
}

function Invoke-Stop {
  if (Test-Path $PidFile) {
    $old = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($old) {
      Stop-Process -Id $old -Force -ErrorAction SilentlyContinue
      Get-CimInstance Win32_Process -Filter "Name='procdump.exe' OR Name='procdump64.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match [regex]::Escape($ExeName) } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  }
  Write-Host "ProcDump stop requested"
}

function Invoke-Status {
  Ensure-Dirs
  $pd = Find-ProcDump
  Write-Host "ProcDump binary: $(if ($pd) { $pd } else { 'MISSING' })"
  Write-Host "HangDir=$HangDir"
  Write-Host "CrashDir=$CrashDir"
  if (Test-Path $LocalDumpsKey) {
    Get-ItemProperty $LocalDumpsKey | Select-Object DumpFolder, DumpType, DumpCount | Format-List
  } else {
    Write-Host "LocalDumps key: missing (run setup)"
  }
  $hangs = @(Get-ChildItem $HangDir -Filter *.dmp -File -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
  $crashes = @(Get-ChildItem $CrashDir -Filter *.dmp -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
  Write-Host "Hang dumps: $($hangs.Count)  Crash dumps: $($crashes.Count)"
  $hangs | Select-Object -First 5 Name, Length, LastWriteTime | Format-Table -AutoSize
  if (Test-Path $PidFile) {
    $trackedPid = Get-Content $PidFile
    $alive = Get-Process -Id $trackedPid -ErrorAction SilentlyContinue
    Write-Host "Tracked ProcDump pid=$trackedPid alive=$([bool]$alive)"
  }
  if (Test-Path -LiteralPath $CurrentSessionFile) {
    $current = Get-Content -Raw -LiteralPath $CurrentSessionFile | ConvertFrom-Json
    Write-Host "Current voice session: $($current.sessionId) -> $($current.sessionDir)"
  }
}

function Invoke-Collect {
  Ensure-Dirs
  if (-not (Test-Path -LiteralPath $CurrentSessionFile)) {
    throw "No armed voice-hang session found. Run 'arm' first."
  }
  $session = Get-Content -Raw -LiteralPath $CurrentSessionFile | ConvertFrom-Json
  $sessionDir = [string]$session.sessionDir
  if (-not (Test-Path -LiteralPath $sessionDir)) {
    throw "Session directory is missing: $sessionDir"
  }

  Invoke-Stop
  $logsDir = Join-Path $env:APPDATA 'oneTone\app\config\logs'
  foreach ($name in @('runtime-live.log', 'last-ui-stall.json', 'session-running.json')) {
    $source = Join-Path $logsDir $name
    if (Test-Path -LiteralPath $source) {
      Copy-Item -LiteralPath $source -Destination (Join-Path $sessionDir $name) -Force
    }
  }
  $runtimeLog = Join-Path $logsDir 'runtime-live.log'
  if (Test-Path -LiteralPath $runtimeLog) {
    Get-Content -LiteralPath $runtimeLog -Tail 3000 |
      Set-Content -LiteralPath (Join-Path $sessionDir 'runtime-live-tail.log') -Encoding UTF8
  }

  $start = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$session.startedAtUnixMs).LocalDateTime
  $events = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1002; StartTime = $start } -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match [regex]::Escape($ExeName) } |
    Select-Object TimeCreated, Id, ProviderName, Message)
  $events | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $sessionDir 'windows-apphang-1002.json') -Encoding UTF8

  $dumps = @(Get-ChildItem -LiteralPath $sessionDir -Filter *.dmp -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)
  $summary = [ordered]@{
    sessionId = $session.sessionId
    startedAt = $session.startedAt
    collectedAt = (Get-Date).ToString('o')
    dumpCount = $dumps.Count
    dumps = @($dumps | ForEach-Object { [ordered]@{
      name = $_.Name
      bytes = $_.Length
      lastWriteTime = $_.LastWriteTime.ToString('o')
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
    } })
    appHangEventCount = $events.Count
    lastUiStallPresent = (Test-Path -LiteralPath (Join-Path $sessionDir 'last-ui-stall.json'))
  }
  $summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $sessionDir 'collection-summary.json') -Encoding UTF8
  Write-Host "VOICE HANG DIAGNOSTICS COLLECTED"
  Write-Host "Dumps=$($dumps.Count) AppHangEvents=$($events.Count)"
  Write-Host "Artifacts: $sessionDir"
}

function Invoke-Cleanup {
  Ensure-Dirs
  Invoke-Stop
  Get-ChildItem $HangDir -Filter *.dmp -ErrorAction SilentlyContinue | Remove-Item -Force
  Get-ChildItem $CrashDir -Filter *.dmp -ErrorAction SilentlyContinue | Remove-Item -Force
  Write-Host "Cleaned dump directories (LocalDumps registry left intact; re-run setup if needed)"
}

function Invoke-VerifyHang {
  # Spawns a minimal WinForms hung UI so ProcDump -h can produce a real .dmp.
  Ensure-Dirs
  $pd = Find-ProcDump
  if (-not $pd) { throw "procdump.exe not found" }
  $before = @(Get-ChildItem $HangDir -Filter *.dmp -ErrorAction SilentlyContinue)
  $cs = @"
using System;
using System.Threading;
using System.Windows.Forms;
class HangProbe {
  [STAThread] static void Main() {
    var f = new Form();
    f.Text = "OneToneHangProbe";
    f.Shown += (s,e) => { Thread.Sleep(60000); };
    Application.Run(f);
  }
}
"@
  $tmp = Join-Path $env:TEMP 'OneToneHangProbe'
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $src = Join-Path $tmp 'HangProbe.cs'
  $exe = Join-Path $tmp 'HangProbe.exe'
  Set-Content -Path $src -Value $cs -Encoding UTF8
  $windowsRoot = if ($env:WINDIR) { $env:WINDIR } elseif ($env:SystemRoot) { $env:SystemRoot } else { 'C:\Windows' }
  $csc = Join-Path $windowsRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  if (-not (Test-Path $csc)) { $csc = Join-Path $windowsRoot 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
  & $csc /nologo /target:winexe /r:System.Windows.Forms.dll /out:$exe $src
  if ($LASTEXITCODE -ne 0) { throw "csc failed" }
  $probe = Start-Process -FilePath $exe -PassThru
  $dumpArgs = @('-accepteula', '-ma', '-h', '-n', '1', '-s', '1', $probe.Id, $HangDir)
  $monitor = Start-Process -FilePath $pd -ArgumentList $dumpArgs -PassThru -WindowStyle Hidden
  Write-Host "Hung probe pid=$($probe.Id); waiting up to ${VerifyHangSeconds}s for .dmp..."
  $deadline = (Get-Date).AddSeconds([Math]::Max(12, $VerifyHangSeconds + 10))
  $newDump = $null
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    $newDump = Get-ChildItem $HangDir -Filter *.dmp -ErrorAction SilentlyContinue |
      Where-Object { $before -notcontains $_ -and $_.LastWriteTime -gt (Get-Date).AddMinutes(-2) } |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($newDump) { break }
  }
  Stop-Process -Id $probe.Id -Force -ErrorAction SilentlyContinue
  Stop-Process -Id $monitor.Id -Force -ErrorAction SilentlyContinue
  Get-Process HangProbe -ErrorAction SilentlyContinue | Stop-Process -Force
  if (-not $newDump) {
    throw "VERIFY FAILED: no hang dump produced. ProcDump -h capture chain is not working."
  }
  Write-Host "VERIFY OK: $($newDump.FullName) ($([math]::Round($newDump.Length/1MB,1)) MB)"
}

switch ($Action) {
  'install' { Invoke-Install }
  'setup' { Invoke-Setup }
  'arm' { Invoke-Arm }
  'collect' { Invoke-Collect }
  'start' { Invoke-Start }
  'stop' { Invoke-Stop }
  'status' { Invoke-Status }
  'cleanup' { Invoke-Cleanup }
  'verify-hang' { Invoke-VerifyHang }
}
