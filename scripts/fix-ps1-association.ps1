# Fix broken .ps1 association that causes Windows "Open with" dialog.
# Root cause seen on this machine:
#   assoc .ps1=Microsoft.PowerShellScript.1
#   ftype Microsoft.PowerShellScript.1="...\notepad.exe" "%1"
# cmd.exe uses assoc/ftype (not HKCU Explorer UserChoice), so `.\foo.ps1` pops the dialog.

param(
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $psExe)) {
  $psExe = (Get-Command powershell.exe -ErrorAction Stop).Source
}

$openCmd = '"{0}" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%1" %*' -f $psExe
$progId = 'Microsoft.PowerShellScript.1'

function Set-RegDefault([string]$Path, [string]$Value) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -Path $Path -Force | Out-Null
  }
  if ($WhatIf) {
    Write-Host "WHATIF: $Path = $Value"
    return
  }
  Set-ItemProperty -LiteralPath $Path -Name '(default)' -Value $Value -Force
}

Write-Host "Restoring .ps1 -> PowerShell association..."
Write-Host "  open command: $openCmd"

# User-level (no admin): overrides Explorer; also helps some shells.
Set-RegDefault 'HKCU:\Software\Classes\.ps1' $progId
Set-RegDefault "HKCU:\Software\Classes\$progId" 'Windows PowerShell Script'
Set-RegDefault "HKCU:\Software\Classes\$progId\shell\open\command" $openCmd

# Remove stale OneTone-only ProgID if present (was incomplete / confusing).
$ot = 'HKCU:\Software\Classes\OneTone.PowerShellScript'
if (Test-Path -LiteralPath $ot) {
  if ($WhatIf) { Write-Host "WHATIF: remove $ot" }
  else { Remove-Item -LiteralPath $ot -Recurse -Force -ErrorAction SilentlyContinue }
}

# Clear Open-With UI sticky state that forces the chooser dialog.
$ext = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.ps1'
foreach ($leaf in @('UserChoice', 'OpenWithList', 'OpenWithProgids')) {
  $p = Join-Path $ext $leaf
  if (Test-Path -LiteralPath $p) {
    if ($WhatIf) { Write-Host "WHATIF: remove $p" }
    else { Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

# Machine-level (admin): this is what cmd.exe `assoc`/`ftype` use.
$machineCmd = "HKLM:\Software\Classes\$progId\Shell\Open\Command"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (Test-Path -LiteralPath $machineCmd) {
  $current = (Get-ItemProperty -LiteralPath $machineCmd -Name '(default)' -ErrorAction SilentlyContinue).'(default)'
  Write-Host "  HKLM current: $current"
  if ($isAdmin) {
    Set-RegDefault $machineCmd $openCmd
    if (-not $WhatIf) {
      cmd /c "assoc .ps1=$progId" | Out-Host
      cmd /c "ftype $progId=$openCmd" | Out-Host
    }
    Write-Host "HKLM ftype restored (admin)."
  } else {
    Write-Host "Not elevated: HKLM still notepad (cmd.exe will keep popping Open-With)."
    Write-Host "Re-run elevated to fix permanently, or always launch via run_onetone.bat / rebuild_onetone.bat."
  }
}

Write-Host "Done. Prefer: .\run_onetone.bat -Rebuild   (bypasses file association entirely)"
