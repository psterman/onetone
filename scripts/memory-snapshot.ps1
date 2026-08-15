# Measure OneTone + WebView2 process tree (P0/P1 acceptance helper).
param(
  [string]$OutFile = ""
)
$ErrorActionPreference = 'Stop'
$procs = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'onetone.exe' -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -match 'onetone')
}
$rows = foreach ($p in $procs) {
  $gp = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
  if (-not $gp) { continue }
  $type = if ($p.Name -eq 'onetone.exe') { 'host' }
    elseif ($p.CommandLine -match '--type=(\S+)') { $Matches[1] }
    else { 'browser' }
  [PSCustomObject]@{
    Pid = $p.ProcessId
    Type = $type
    WS_MB = [math]::Round($gp.WorkingSet64 / 1MB, 1)
    Priv_MB = [math]::Round($gp.PrivateMemorySize64 / 1MB, 1)
  }
}
$renderers = @($rows | Where-Object Type -eq 'renderer')
$hostRow = $rows | Where-Object Type -eq 'host' | Select-Object -First 1
$summary = [ordered]@{
  AT = (Get-Date -Format o)
  PROCESS_COUNT = $rows.Count
  RENDERER_COUNT = $renderers.Count
  RENDERER_WS_SUM_MB = [math]::Round((($renderers | Measure-Object WS_MB -Sum).Sum), 1)
  HOST_PRIV_MB = $(if ($hostRow) { $hostRow.Priv_MB } else { 0 })
  HOST_WS_MB = $(if ($hostRow) { $hostRow.WS_MB } else { 0 })
  TREE_WS_MB = [math]::Round((($rows | Measure-Object WS_MB -Sum).Sum), 1)
  TREE_PRIV_MB = [math]::Round((($rows | Measure-Object Priv_MB -Sum).Sum), 1)
}
$rows | Format-Table -AutoSize | Out-String | Write-Host
$summary.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
if ($OutFile) {
  $lines = @($summary.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })
  $lines + "" + ($rows | ConvertTo-Csv -NoTypeInformation) | Set-Content -Encoding utf8 $OutFile
}
