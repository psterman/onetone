#Requires -Version 5.1
<#
.SYNOPSIS
  Read-only desktop acceptance diagnostics for OneTone Home Agent Roster.
  Distinguishes app-launch issues from CUA/desktop-control channel issues.
  Does NOT replace CUA (A4–A7 must be confirmed in the desktop control session).

.NOTES
  exit 0 never means real desktop acceptance passed.
  Default mode always exits 0 (diagnostic).
  -Strict: exit 1 if A1–A3 or port 5173 fail; exit 0 only means local launch gate OK.
  This script MUST NOT mark A4–A7 as passed.
#>
param(
  [string]$OutFile = '',
  [int]$LogTail = 20,
  [switch]$Strict
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not (Test-Path (Join-Path $root 'package.json'))) {
  $root = (Get-Location).Path
}

function Test-PortListening {
  param([int]$Port)
  try {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -First 1
    return [bool]$c
  } catch {
    try {
      $tcp = New-Object System.Net.Sockets.TcpClient
      $iar = $tcp.BeginConnect('127.0.0.1', $Port, $null, $null)
      $ok = $iar.AsyncWaitHandle.WaitOne(400)
      if ($ok) { $tcp.EndConnect($iar) | Out-Null }
      $tcp.Close()
      return $ok
    } catch {
      return $false
    }
  }
}

function Get-WindowTitle {
  param(
    [IntPtr]$Hwnd,
    [int]$ProcessId = 0
  )
  $code = @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class NativeWin {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  public static string FindTitleForPid(uint pid) {
    string found = "";
    EnumWindows((h, _) => {
      uint wpid;
      GetWindowThreadProcessId(h, out wpid);
      if (wpid != pid) return true;
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, sb.Capacity);
      var t = sb.ToString();
      if (!string.IsNullOrWhiteSpace(t)) { found = t; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
  try {
    if (-not ('NativeWin' -as [type])) {
      Add-Type -TypeDefinition $code -ErrorAction Stop
    }
    $title = ''
    $visible = $null
    if ($Hwnd -ne [IntPtr]::Zero) {
      $sb = New-Object System.Text.StringBuilder 512
      [void][NativeWin]::GetWindowText($Hwnd, $sb, $sb.Capacity)
      $title = $sb.ToString()
      $visible = [NativeWin]::IsWindowVisible($Hwnd)
    }
    if ([string]::IsNullOrWhiteSpace($title) -and $ProcessId -gt 0) {
      $title = [NativeWin]::FindTitleForPid([uint32]$ProcessId)
      if ($title) { $visible = $true }
    }
    return @{ Title = $title; Visible = $visible }
  } catch {
    return @{ Title = ''; Visible = $null; Error = $_.Exception.Message }
  }
}

function Find-RuntimeLiveLog {
  $candidates = @(
    (Join-Path $root 'logs\runtime-live.log'),
    (Join-Path $root 'src-tauri\target-release-live\release\logs\runtime-live.log'),
    (Join-Path $root 'src-tauri\target-release-live\logs\runtime-live.log'),
    (Join-Path $env:APPDATA 'oneTone\app\config\logs\runtime-live.log')
  )
  foreach ($p in $candidates) {
    if (Test-Path -LiteralPath $p) { return $p }
  }
  return $null
}

$now = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$lines = New-Object System.Collections.Generic.List[string]
function L([string]$s) { $script:lines.Add($s); Write-Output $s }

L "=== OneTone desktop acceptance diagnose ==="
L "time: $now"
L "root: $root"
L ""

# --- A1 process ---
$procs = @(Get-Process -Name onetone -ErrorAction SilentlyContinue)
$a1 = $procs.Count -gt 0
L "A1 OneTone process exists: $a1"
if (-not $a1) {
  L "  fail: no onetone process (app not launched or wrong name)"
} else {
  foreach ($p in $procs) {
    $path = ''
    try { $path = $p.Path } catch { $path = '(path unavailable)' }
    L ("  PID={0} MainWindowHandle={1} Responding={2} Path={3}" -f $p.Id, [int64]$p.MainWindowHandle, $p.Responding, $path)
  }
}

# --- A2 handle ---
$ui = $procs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
$a2 = [bool]$ui
L "A2 MainWindowHandle != 0: $a2"
if (-not $a2 -and $a1) {
  L "  fail: process exists but MainWindowHandle=0 (tray-only / hidden / still starting)"
}

# --- A3 title ---
$a3 = $false
$title = ''
$visible = $null
if ($ui) {
  $wt = Get-WindowTitle -Hwnd $ui.MainWindowHandle -ProcessId $ui.Id
  $title = [string]$wt.Title
  $visible = $wt.Visible
  $a3 = $title.Length -gt 0
  L "A3 window title readable: $a3"
  L ("  title='{0}' visible={1} hwnd={2}" -f $title, $visible, [int64]$ui.MainWindowHandle)
  if (-not $a3) {
    L "  fail: GetWindowText empty (invalid hwnd or non-UI owner)"
  }
} else {
  L "A3 window title readable: False"
  L "  skip: no nonzero MainWindowHandle"
}

# --- 5173 ---
$portOk = Test-PortListening -Port 5173
L "port 5173 listening: $portOk"
if (-not $portOk) {
  L "  fail: frontend serve not listening (webview may show ERR_CONNECTION_REFUSED)"
}

# --- logs ---
$launchLog = Join-Path $root 'logs\launch.log'
L "launch.log: $(if (Test-Path $launchLog) { $launchLog } else { 'MISSING' })"
if (Test-Path $launchLog) {
  L "--- launch.log tail ---"
  Get-Content -LiteralPath $launchLog -Tail $LogTail -ErrorAction SilentlyContinue | ForEach-Object { L "  $_" }
}

$runtimeLog = Find-RuntimeLiveLog
L "runtime-live.log: $(if ($runtimeLog) { $runtimeLog } else { 'MISSING (checked logs/, target-release-live, %APPDATA%/oneTone)' })"
$runtimeRecent = $false
if ($runtimeLog) {
  L "--- runtime-live.log tail ---"
  Get-Content -LiteralPath $runtimeLog -Tail $LogTail -ErrorAction SilentlyContinue | ForEach-Object { L "  $_" }
  $item = Get-Item -LiteralPath $runtimeLog
  $ageMin = [math]::Round(((Get-Date) - $item.LastWriteTime).TotalMinutes, 1)
  $runtimeRecent = $ageMin -le 30
  L ("runtime-live.log lastWrite={0} ageMin={1} recent30m={2}" -f $item.LastWriteTime.ToString('s'), $ageMin, $runtimeRecent)
}

# --- enter-CUA gate (local only) ---
$responding = if ($ui) { [bool]$ui.Responding } else { $false }
$enterCua = $a2 -and $responding -and $portOk -and ($runtimeRecent -or (Test-Path $launchLog))
L ""
L "local enter-CUA prerequisites:"
L "  MainWindowHandle!=0: $a2"
L "  Responding: $responding"
L "  5173 listening: $portOk"
L "  runtime recent OR launch.log present: $($runtimeRecent -or (Test-Path $launchLog))"
L "  ENTER_CUA_READY: $enterCua"

L ""
L "DIAGNOSTIC_ONLY=true"
L "CUA_A4_A7=unchecked"
L ""
L "=== CUA-only checks (this script CANNOT verify) ==="
L "A4 CUA lists Windows app surface — confirm in cua_repl / desktop plugin"
L "A5 CUA can bind OneTone window"
L "A6 screenshot works"
L "A7 click + AX/UI read works"
L "If A1–A3 pass but A4 fails: likely missing Windows native surface or CUA plugin fault (not OneTone launch)."
L "NOTE: exit 0 != real desktop acceptance passed; A4–A7 stay unchecked_by_this_script."

L ""
L "JSON_SUMMARY_BEGIN"
$summary = [ordered]@{
  time              = $now
  diagnostic_only   = $true
  a1_process        = $a1
  a2_main_hwnd      = $a2
  a3_title          = $a3
  title             = $title
  visible           = $visible
  pid               = if ($ui) { $ui.Id } elseif ($procs) { $procs[0].Id } else { $null }
  hwnd              = if ($ui) { [int64]$ui.MainWindowHandle } else { 0 }
  responding        = $responding
  exe               = if ($ui) { try { $ui.Path } catch { '' } } else { '' }
  port_5173         = $portOk
  runtime_log       = $runtimeLog
  runtime_recent    = $runtimeRecent
  enter_cua_ready   = $enterCua
  cua_a4_a7         = 'unchecked_by_this_script'
  strict            = [bool]$Strict
}
L ($summary | ConvertTo-Json -Compress)
L "JSON_SUMMARY_END"

# Default: always exit 0 (diagnostic). -Strict: local A1–A3 + 5173 gate only.
# exit 0 never means real desktop acceptance / A4–A7 passed.
$localOk = $a1 -and $a2 -and $a3 -and $portOk
$exitCode = 0
if ($Strict -and -not $localOk) {
  L "STRICT_EXIT=1 (A1–A3 or 5173 failed)"
  $exitCode = 1
} elseif ($Strict) {
  L "STRICT_EXIT=0 (local A1–A3 + 5173 OK; A4–A7 still unchecked)"
}

if ($OutFile) {
  $dir = Split-Path -Parent $OutFile
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $lines -join "`r`n" | Set-Content -LiteralPath $OutFile -Encoding UTF8
  Write-Output "wrote: $OutFile"
}

exit $exitCode
