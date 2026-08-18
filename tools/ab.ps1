# agent-browser invocation helper - works around PS wrapper encoding bug
# by calling the underlying exe directly via cmd.

param(
    [Parameter(Mandatory=$true)]
    [string]$ArgsString,

    [string]$Label = 'ab',

    [int]$MaxOutput = 200000
)

$ErrorActionPreference = 'Continue'

$bin = Join-Path $env:APPDATA 'npm\node_modules\agent-browser\bin\agent-browser-win32-x64.exe'
if (-not (Test-Path $bin)) {
    Write-Output "BINARY_NOT_FOUND: $bin"
    exit 1
}

$tmpOut = Join-Path $env:TEMP ("ab-" + $Label + "-" + [Guid]::NewGuid().ToString('N') + ".out.txt")
$tmpErr = Join-Path $env:TEMP ("ab-" + $Label + "-" + [Guid]::NewGuid().ToString('N') + ".err.txt")

# Build command-line for cmd.exe: ""<bin>" arg1 "arg with spaces" ..."
$quoted = '""' + $bin + '"'
$tokens = $ArgsString -split ' (?=(?:[^"]*"[^"]*")*[^"]*$)'
foreach ($t in $tokens) {
    if ([string]::IsNullOrWhiteSpace($t)) { continue }
    if ($t.StartsWith('"') -and $t.EndsWith('"') -and $t.Length -ge 2) {
        $inner = $t.Substring(1, $t.Length - 2)
    } else {
        $inner = $t
    }
    $escaped = $inner -replace '"','""'
    $quoted += ' "' + $escaped + '"'
}

$proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/d','/s','/c', $quoted) `
    -NoNewWindow -Wait `
    -PassThru `
    -RedirectStandardOutput $tmpOut `
    -RedirectStandardError $tmpErr


$out = ''
if (Test-Path $tmpOut) {
    $content = Get-Content $tmpOut -Raw -ErrorAction SilentlyContinue
    if ($content) { $out += "`n--- STDOUT ---`n" + $content }
}
if (Test-Path $tmpErr) {
    $ec = Get-Content $tmpErr -Raw -ErrorAction SilentlyContinue
    if ($ec) { $out += "`n--- STDERR ---`n" + $ec }
}

if ($out.Length -gt $MaxOutput) {
    $out = $out.Substring(0, $MaxOutput) + "`n...[truncated]..."
}

Remove-Item -Force $tmpOut,$tmpErr -ErrorAction SilentlyContinue
Write-Output ("EXITCODE=" + $proc.ExitCode)
Write-Output $out
