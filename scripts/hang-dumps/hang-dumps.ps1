# OneTone hang/crash dump helpers.
# Usage: .\hang-dumps.ps1 <setup|start|stop|status|cleanup|verify-hang>
param(
  [Parameter(Position = 0, Mandatory = $true)]
  [ValidateSet('setup', 'start', 'stop', 'status', 'cleanup', 'verify-hang')]
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
$LocalDumpsKey = 'HKCU:\Software\Microsoft\Windows\Windows Error Reporting\LocalDumps\onetone.exe'

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
  New-Item -ItemType Directory -Force -Path $HangDir, $CrashDir, $StateDir | Out-Null
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
  $hangs = @(Get-ChildItem $HangDir -Filter *.dmp -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
  $crashes = @(Get-ChildItem $CrashDir -Filter *.dmp -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
  Write-Host "Hang dumps: $($hangs.Count)  Crash dumps: $($crashes.Count)"
  $hangs | Select-Object -First 5 Name, Length, LastWriteTime | Format-Table -AutoSize
  if (Test-Path $PidFile) {
    $pid = Get-Content $PidFile
    $alive = Get-Process -Id $pid -ErrorAction SilentlyContinue
    Write-Host "Tracked ProcDump pid=$pid alive=$([bool]$alive)"
  }
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
  $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
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
  'setup' { Invoke-Setup }
  'start' { Invoke-Start }
  'stop' { Invoke-Stop }
  'status' { Invoke-Status }
  'cleanup' { Invoke-Cleanup }
  'verify-hang' { Invoke-VerifyHang }
}
