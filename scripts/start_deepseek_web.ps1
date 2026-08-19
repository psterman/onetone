# start_deepseek_web.ps1
# Silent launcher for the DeepSeek Harness Web GUI.
# Invoked from ..\Start-DeepSeek-Web.vbs (or directly from a shell).
#
# Parameters:
#   -NoBrowser     do not open the system browser after the server is ready
#   -Host <host>   bind host (default: 127.0.0.1)
#   -Port <port>   listen port (default: 3080)
#
# Logs are appended to logs\deepseek-web.log next to the project root.

[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [string]$Host = '127.0.0.1',
    [int]$Port = 3080
)

$ErrorActionPreference = 'Stop'

# Resolve project root from this script's location (…\voice-pilot\scripts\start_deepseek_web.ps1)
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDir '..'))

$logDir  = Join-Path $projectRoot 'logs'
$logFile = Join-Path $logDir 'deepseek-web.log'
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-LaunchLog {
    param([string]$Message)
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $logFile -Value $line -ErrorAction SilentlyContinue
}

function Test-PortOpen {
    param([int]$CheckPort)
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $iar = $c.BeginConnect('127.0.0.1', $CheckPort, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(400)
        if (-not $ok) { $c.Close(); return $false }
        $c.EndConnect($iar) | Out-Null
        $c.Close()
        return $true
    } catch {
        return $false
    }
}

# Locate the dsh CLI. Prefer the user-installed copy on PATH; fall back to the npm shim.
$dshCmd = Get-Command 'dsh' -ErrorAction SilentlyContinue
if (-not $dshCmd) {
    $npmShim = Join-Path $env:APPDATA 'npm\dsh.cmd'
    if (Test-Path $npmShim) {
        $dshCmd = @{ Source = $npmShim; Path = $npmShim }
    }
}
if (-not $dshCmd) {
    Write-LaunchLog 'dsh CLI not found on PATH or %APPDATA%\npm\dsh.cmd'
    throw 'dsh CLI not found. Install DeepSeek Harness first (npm i -g @deepseek-ai/dsh).'
}

# If a previous instance is already serving on the target port, do nothing.
if (Test-PortOpen -CheckPort $Port) {
    Write-LaunchLog "port $Port already open; skipping relaunch"
    if (-not $NoBrowser) {
        Start-Process "http://$($Host):$($Port)" | Out-Null
    }
    exit 0
}

# Build the dsh command. Quote every path segment so spaces in the project root are safe.
$dshExe   = '"' + $dshCmd.Source + '"'
$hostArg  = '--host'
$portArg  = '--port'
$hostVal  = '"' + $Host + '"'
$portVal  = [string]$Port
$argList  = @($hostArg, $hostVal, $portArg, $portVal) -join ' '
$cmdLine  = "$dshExe --profile web $argList"

Write-LaunchLog "starting: $cmdLine (no-browser=$([bool]$NoBrowser))"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $dshCmd.Source
$psi.Arguments = "--profile web $hostArg $Host $portArg $Port"
$psi.WorkingDirectory = $projectRoot
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.WindowStyle = 'Hidden'

# Inherit environment so VISION_API_KEY / DSH_* etc. flow through.
foreach ($key in [System.Environment]::GetEnvironmentVariables('Process').Keys) {
    $psi.EnvironmentVariables[$key] = [System.Environment]::GetEnvironmentVariable($key, 'Process')
}

try {
    $proc = [System.Diagnostics.Process]::Start($psi)
    Write-LaunchLog "dsh pid=$($proc.Id) launched"
} catch {
    Write-LaunchLog "launch failed: $($_.Exception.Message)"
    throw
}

# Wait for the port to open (max ~15s) so the .vbs can return success only after the server is up.
$ready = $false
$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
    if (Test-PortOpen -CheckPort $Port) {
        $ready = $true
        break
    }
    if ($proc.HasExited) {
        Write-LaunchLog "dsh exited early with code $($proc.ExitCode)"
        throw "DeepSeek Web exited with code $($proc.ExitCode) before opening port $Port. See log: $logFile"
    }
    Start-Sleep -Milliseconds 400
}

if (-not $ready) {
    Write-LaunchLog "dsh did not open port $Port within 15s"
    throw "DeepSeek Web failed to listen on $Host:$Port within 15 seconds. See log: $logFile"
}

Write-LaunchLog "dsh ready on http://$($Host):$($Port)"

if (-not $NoBrowser) {
    Start-Process "http://$($Host):$($Port)" | Out-Null
}

exit 0