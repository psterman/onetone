# install-deepseek-web-autostart.ps1
# One-shot installer:
#   1. Drops a shortcut to ..\Start-DeepSeek-Web.vbs into shell:startup (runs at every logon)
#   2. Optionally also registers a Task Scheduler entry "AtStartup" (no logon required)
#
# Run from the project root, or just double-click.
#
# Usage:
#   .\install-deepseek-web-autostart.ps1
#   .\install-deepseek-web-autostart.ps1 -AlsoCreateTask
#   .\install-deepseek-web-autostart.ps1 -Uninstall

[CmdletBinding()]
param(
    [switch]$AlsoCreateTask,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$parentRel   = Join-Path $scriptDir '..'
$projectRoot = [System.IO.Path]::GetFullPath($parentRel)
$vbs         = Join-Path $projectRoot 'Start-DeepSeek-Web.vbs'
$startupDir  = [Environment]::GetFolderPath('Startup')
$startupLink = Join-Path $startupDir 'Start-DeepSeek-Web.vbs.lnk'

function Remove-IfExists([string]$p) {
    if (Test-Path $p) { Remove-Item $p -Force }
}

$taskName = 'DeepSeekWebAutostart'

if ($Uninstall) {
    Write-Host "Uninstalling autostart ..."
    Remove-IfExists $startupLink
    & schtasks.exe /Delete /TN $taskName /F 2>$null | Out-Null
    Write-Host "Removed startup link and (any) task '$taskName'."
    exit 0
}

if (-not (Test-Path $vbs)) {
    throw "Missing $vbs. Re-run from the project root, or double-check that Start-DeepSeek-Web.vbs exists."
}

# 1) Per-user Startup folder shortcut
$wsh = New-Object -ComObject WScript.Shell
$lnk = $wsh.CreateShortcut($startupLink)
$lnk.TargetPath = $vbs
$lnk.WorkingDirectory = $projectRoot
$lnk.IconLocation = "shell32.dll,13"
$lnk.Description = "Start DeepSeek Harness Web GUI"
$lnk.Save()
Write-Host "Installed shortcut: $startupLink"

# 2) Optional: Task Scheduler "At startup" (works even before user logs in)
if ($AlsoCreateTask) {
    $arg = "`"$vbs`""
    & schtasks.exe /Create /TN $taskName /TR $arg /SC ONSTART /RL HIGHEST /F | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Created scheduled task '$taskName' (trigger: At startup)."
    } else {
        Write-Warning "Failed to create scheduled task (exit $LASTEXITCODE). Re-run from an elevated shell if you want At-startup boot."
    }
}

Write-Host ""
Write-Host "Done. DeepSeek Web will now start automatically at every Windows logon."
Write-Host "URL: http://127.0.0.1:3080"
Write-Host "Uninstall with: .\install-deepseek-web-autostart.ps1 -Uninstall"