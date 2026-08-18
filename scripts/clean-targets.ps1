<#
.SYNOPSIS
  Trim Rust build artifacts under src-tauri/{target,target-release-live}.

.DESCRIPTION
  Safe (default): deletes *.pdb (debug symbols, only useful for source-level
    debugging) and incremental/ caches that Cargo will rebuild next compile.
    Keeps onetone.exe and bundled DLLs intact — runnable right after.
  -Full: additionally runs `cargo clean --target-dir <path>`, removing
    everything. Next build is from scratch (~8 min).

  After moving target to D: drive, drop the two C: target dirs entirely;
  this script is mainly useful for periodic tidy-up.

.EXAMPLE
  .\scripts\clean-targets.ps1
  .\scripts\clean-targets.ps1 -Full
#>
param([switch]$Full)
$ErrorActionPreference = 'Stop'

$root  = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tauri = Join-Path $root 'src-tauri'

$targets = @('target', 'target-release-live') | ForEach-Object { Join-Path $tauri $_ }

function Format-Gb([long]$Bytes) {
  return [math]::Round($Bytes / 1GB, 2)
}

function Invoke-TrimTree([string]$Path) {
  if (-not (Test-Path $Path)) { return 0 }
  $before = (Get-ChildItem $Path -Recurse -Force -ErrorAction SilentlyContinue |
             Measure-Object -Property Length -Sum).Sum

  # *.pdb — debug symbol files; not needed for runtime.
  Get-ChildItem -Path $Path -Recurse -Filter '*.pdb' -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

  # incremental/ — Cargo's per-session recompile cache. Safe to drop.
  # Skip release/incremental because release builds are already incremental=false
  # in Cargo.toml, and the dir is mostly empty.
  Get-ChildItem -Path $Path -Directory -Filter 'incremental' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '[\\/]release[\\/]incremental$' } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

  $after = (Get-ChildItem $Path -Recurse -Force -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum).Sum
  return ($before - $after)
}

$totalFreed = 0
foreach ($path in $targets) {
  $tag = Split-Path $path -Leaf
  if (-not (Test-Path $path)) {
    Write-Host "[skip] $tag (not present)" -ForegroundColor DarkGray
    continue
  }
  Write-Host "[trim] $tag" -ForegroundColor Cyan
  $freedBytes = Invoke-TrimTree $path
  $gb = Format-Gb $freedBytes
  $totalFreed += $gb
  Write-Host "  freed ~${gb} GB"

  if ($Full) {
    # Wipe the target dir entirely. CARGO_TARGET_DIR (if set) redirects
    # future builds elsewhere, so the next compile will repopulate it
    # from scratch wherever CARGO_TARGET_DIR points — not here.
    Write-Host "[wipe] $tag (recursive delete)" -ForegroundColor Yellow
    Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ""
Write-Host "Total reclaimed: ~${totalFreed} GB" -ForegroundColor Green
