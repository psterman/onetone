<#
.SYNOPSIS
  Kill every msedgewebview2 process whose ancestor chain does NOT
  reach the currently-running onetone.exe. Use this to clear out
  the "ghost OneTone window that the task manager doesn't show"
  symptom — ghost webview2 children whose onetone parent has
  long since exited.

.PARAMETER Yes
  Skip the confirmation prompt and kill immediately.

.EXAMPLE
  pwsh -File scripts\kill-orphans.ps1           # show plan, then confirm
  pwsh -File scripts\kill-orphans.ps1 -Yes      # nuke
#>
[CmdletBinding()]
param([switch]$Yes)

$ErrorActionPreference = 'Stop'

# Build parent map
$wmi = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
$parent = @{}
foreach ($p in $wmi) { $parent[[int]$p.ProcessId] = [int]$p.ParentProcessId }

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

$onetone = Get-Process onetone -ErrorAction SilentlyContinue
$onetonePid = if ($onetone) { $onetone.Id } else { 0 }

$wv2 = Get-Process msedgewebview2 -ErrorAction SilentlyContinue
if (-not $wv2) { Write-Output "no msedgewebview2 process found, nothing to do"; exit 0 }

$orphans = @()
foreach ($w in $wv2) {
  $chain = Get-AncestorChain $w.Id
  $healthy = $chain | Where-Object { $_ -eq "$onetonePid" }
  if (-not $healthy) { $orphans += $w }
}

if (-not $orphans) {
  Write-Output "no orphan webview2 (all ${($wv2.Count)} are tied to onetone.exe pid=$onetonePid)"
  exit 0
}

Write-Output ("will kill {0} orphan webview2 processes (onetone.exe pid={1} is preserved):" -f $orphans.Count, $onetonePid)
$orphans | ForEach-Object { Write-Output ("  pid={0,-6} started={1}" -f $_.Id, $_.StartTime.ToString('HH:mm:ss')) }

if (-not $Yes) {
  $ans = Read-Host "proceed? [y/N]"
  if ($ans -notmatch '^[Yy]') { Write-Output "cancelled"; exit 0 }
}

foreach ($o in $orphans) {
  try { Stop-Process -Id $o.Id -Force -ErrorAction Stop; Write-Output ("killed {0}" -f $o.Id) }
  catch { Write-Output ("skip {0}: {1}" -f $o.Id, $_.Exception.Message) }
}

$left = (Get-Process msedgewebview2 -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Output ("remaining msedgewebview2: {0}" -f $left)
