<#
.SYNOPSIS
  List every msedgewebview2 tree on the box, marking which are tied to
  the current onetone.exe and which are orphans (parent chain no longer
  reaches a live onetone).

.OUTPUTS
  Prints one row per webview2 process; columns: STATUS / rootPid / rootName /
  rootStart / n / chain. Orphans are easy to spot — root points to a
  dead webview2 or to an app other than onetone.exe.
#>
$ErrorActionPreference = 'Stop'

$wmi = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
$parent = @{}
$name   = @{}
foreach ($p in $wmi) { $parent[[int]$p.ProcessId] = [int]$p.ParentProcessId; $name[[int]$p.ProcessId] = $p.Name }

$procs = Get-Process | ForEach-Object {
  [PSCustomObject]@{ Pid = [int]$_.Id; Name = $_.ProcessName; StartTime = $_.StartTime }
}
$start    = @{}; $procName = @{}
foreach ($p in $procs) { $start[$p.Pid] = $p.StartTime; $procName[$p.Pid] = $p.Name }

function Get-AncestorChain([int]$procId) {
  $chain = @()
  $cur = $procId
  for ($i = 0; $i -lt 16; $i++) {
    $chain += $cur
    $pp = $parent[$cur]
    if ($null -eq $pp -or $pp -eq 0 -or $pp -eq $cur) { break }
    if (-not $parent.ContainsKey($pp)) { break }
    $cur = $pp
  }
  return ,$chain
}

$onetone      = Get-Process onetone -ErrorAction SilentlyContinue
$onetonePid   = if ($onetone) { $onetone.Id } else { 0 }
$onetoneStart = if ($onetone) { $onetone.StartTime } else { $null }

$wv2 = $procs | Where-Object { $_.Name -eq 'msedgewebview2' }
Write-Output ("onetone.exe: pid={0} start={1} hwnd=0x{2:X} title='{3}'" -f `
  $onetonePid, $onetoneStart, $onetone.MainWindowHandle, $onetone.MainWindowTitle)
Write-Output ("webview2 total: {0}" -f $wv2.Count)
Write-Output ""

$grouped = @{}
foreach ($w in $wv2) {
  $key = ((Get-AncestorChain $w.Pid) -join '>')
  if (-not $grouped.ContainsKey($key)) { $grouped[$key] = New-Object System.Collections.ArrayList }
  $null = $grouped[$key].Add($w.Pid)
}

foreach ($k in $grouped.Keys) {
  $pids   = $grouped[$k]
  $chain  = $k -split '>'
  $root   = [int]$chain[-1]
  $rootStart = $start[$root]
  $rootName  = $procName[$root]
  $healthy = $chain | Where-Object { $_ -eq "$onetonePid" }
  $sameRun = $false
  if ($rootStart -and $onetoneStart) {
    $sameRun = [Math]::Abs(($rootStart - $onetoneStart).TotalSeconds) -lt 60
  }
  $status = if ($healthy) { 'HEALTHY ' }
            elseif ($sameRun) { 'HEALTHY-?  ' }
            else { 'ORPHAN   ' }
  $rootStartStr = if ($rootStart) { $rootStart.ToString('HH:mm:ss') } else { '?' }
  Write-Output ("{0} rootPid={1,-6} rootName={2,-22} rootStart={3,-10} n={4,-2}" -f `
    $status, $root, $rootName, $rootStartStr, $pids.Count)
  Write-Output ("         chain: {0}" -f $k)
  Write-Output ("         pids : {0}" -f ($pids -join ','))
}
