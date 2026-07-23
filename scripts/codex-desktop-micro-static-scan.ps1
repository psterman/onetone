#Requires -Version 5.1
<#
.SYNOPSIS
  只读扫描 Codex Desktop 包内的 codex-micro 相关代码与设备枚举条件。

.EXAMPLE
  .\scripts\codex-desktop-micro-static-scan.ps1
  .\scripts\codex-desktop-micro-static-scan.ps1 -OutputJson logs\stoploss\phase2.json
#>
param(
  [string]$PackageRoot = 'C:\Program Files\WindowsApps\OpenAI.Codex_26.715.9868.0_x64__2p2nqsd0c76g0',
  [string]$OutputJson = '',
  [int]$ContextLines = 1
)

$ErrorActionPreference = 'Continue'

$keywords = @(
  'codex-micro',
  'micro-service',
  'micro-bridge',
  'thstatus',
  'lights.preview',
  'v.oai.thstatus',
  'v.oai.rgbcfg',
  'device.status',
  'sys.version',
  '0x303A',
  '0x8360',
  '303A',
  '8360',
  'VID',
  'PID',
  'HID',
  'Work Louder',
  'worklouder',
  'serial',
  'manufacturer',
  'feature flag',
  'featureFlag',
  'settings/codex-micro',
  'codex-micro-agent-source',
  'isVirtual',
  'physical'
)

$baselineHashes = @{
  'codex-micro-service' = '0bb261e3eed89ff69384754ab67df49c9f10dbd2fa567104c5859f43d026c911'
  'codex-micro-bridge' = 'df6063eb17046594e769050c6bbb3ed169b1352bbd5867fffb4d1f8c724f3e93'
  'codex-micro-slot-signals' = 'e5f0084a27fc0e908c4514a5d3bd0a90dba3f953a48521fb4ae2a43b1e5b28bb'
  'rpc_api_oai' = '80815366885246cd9644e13b770f38c7f9c0587db13cc8979310571ba0fa029a'
}

function Get-FileSha256($path) {
  try {
    $hash = Get-FileHash -Path $path -Algorithm SHA256 -ErrorAction Stop
    return $hash.Hash.ToLowerInvariant()
  } catch {
    return $null
  }
}

function Ensure-AsarExtract($packageRoot) {
  $asar = Join-Path $packageRoot 'app\resources\app.asar'
  if (-not (Test-Path $asar)) { return $null }
  $extractRoot = Join-Path $env:TEMP 'codex-asar-extract'
  $marker = Join-Path $extractRoot '.extract-package.txt'
  $pkgNorm = (Resolve-Path $packageRoot -ErrorAction SilentlyContinue).Path
  if (
    (Test-Path $extractRoot) -and
    (Test-Path $marker) -and
    (Get-Content $marker -Raw).Trim() -eq $pkgNorm
  ) {
    return $extractRoot
  }
  if (Test-Path $extractRoot) {
    Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null
  & npx --yes @electron/asar extract $asar $extractRoot 2>&1 | Out-Null
  if ($pkgNorm) { Set-Content -Path $marker -Value $pkgNorm -Encoding UTF8 }
  return $extractRoot
}

function Find-KeyFiles($root) {
  $patterns = @(
    '*codex-micro-service*.js',
    '*codex-micro-bridge*.js',
    '*codex-micro-slot-signals*.js',
    '*rpc_api_oai*.js',
    '*wl-device-kit*index.js'
  )
  $found = @()
  if (-not (Test-Path $root)) { return $found }
  foreach ($pat in $patterns) {
    $files = Get-ChildItem -Path $root -Recurse -Filter $pat -File -ErrorAction SilentlyContinue
    foreach ($f in $files) {
      $label = $f.Name
      foreach ($bk in $baselineHashes.Keys) {
        if ($f.Name -like "*$bk*") { $label = $bk; break }
      }
      $sha = Get-FileSha256 $f.FullName
      $baseline = $null
      foreach ($bk in $baselineHashes.Keys) {
        if ($f.Name -like "*$bk*" -or $label -eq $bk) {
          $baseline = $baselineHashes[$bk]
          break
        }
      }
      $found += @{
        path = $f.FullName
        name = $f.Name
        label = $label
        sha256 = $sha
        baselineSha256 = $baseline
        hashMatch = if ($baseline -and $sha) { $sha -eq $baseline } else { $null }
        sizeBytes = $f.Length
      }
    }
  }
  return $found
}

function Search-TextFiles($root, $terms) {
  $hits = @()
  if (-not (Test-Path $root)) { return $hits }

  $extensions = @('*.js', '*.json', '*.toml', '*.md', '*.txt', '*.asar')
  $files = Get-ChildItem -Path $root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Extension -in @('.js', '.json', '.toml', '.md', '.txt', '.mjs', '.cjs') -or
      $_.Name -like '*codex-micro*' -or
      $_.FullName -like '*worklouder*'
    } |
    Select-Object -First 500

  foreach ($file in $files) {
    foreach ($term in $terms) {
      try {
        $matches = Select-String -Path $file.FullName -Pattern [regex]::Escape($term) -SimpleMatch -Context 0, $ContextLines -ErrorAction SilentlyContinue
        if ($matches) {
          foreach ($m in $matches | Select-Object -First 3) {
            $hits += @{
              keyword = $term
              file = $file.FullName
              line = $m.LineNumber
              text = $m.Line.Trim().Substring(0, [math]::Min(240, $m.Line.Trim().Length))
            }
          }
        }
      } catch {
        # access denied or binary
      }
    }
  }
  return $hits
}

$accessible = Test-Path $PackageRoot
$scanRoot = $PackageRoot
$asarExtract = $null
$keyFiles = @()
$grepHits = @()
$accessError = $null

if ($accessible) {
  $asarExtract = Ensure-AsarExtract $PackageRoot
  if ($asarExtract -and (Test-Path $asarExtract)) {
    $scanRoot = $asarExtract
  }
  $keyFiles = Find-KeyFiles $scanRoot
  $grepHits = Search-TextFiles $scanRoot $keywords
} else {
  $accessError = "Package root not accessible: $PackageRoot"
  # Try listing WindowsApps for any Codex version
  $wa = 'C:\Program Files\WindowsApps'
  if (Test-Path $wa) {
    $alternates = @(Get-ChildItem $wa -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like 'OpenAI.Codex_*' } |
      ForEach-Object { $_.FullName })
    foreach ($alt in $alternates) {
      if ($alt -eq $PackageRoot) { continue }
      if (Test-Path $alt) {
        $keyFiles += Find-KeyFiles $alt
        if ($keyFiles.Count -gt 0) {
          $PackageRoot = $alt
          $accessible = $true
          break
        }
      }
    }
  }
}

$physicalGatePatterns = @('serial', 'manufacturer', 'USB', 'isVirtual', 'physical', 'bluetooth')
$physicalHits = @($grepHits | Where-Object { $_.keyword -in $physicalGatePatterns })
$featureFlagHits = @($grepHits | Where-Object {
  $_.keyword -match 'feature|settings/codex-micro|codex-micro-agent-source'
})
$thstatusHits = @($grepHits | Where-Object {
  $_.keyword -match 'thstatus|lights\.preview'
})
$vidPidHits = @($grepHits | Where-Object {
  $_.keyword -match '303A|8360|VID|PID'
})

$hashDrift = @($keyFiles | Where-Object { $_.baselineSha256 -and $_.sha256 -and -not $_.hashMatch })

$result = @{
  phase = 2
  timestamp = (Get-Date).ToString('o')
  packageRoot = $PackageRoot
  scanRoot = $scanRoot
  asarExtract = $asarExtract
  accessible = $accessible
  accessError = $accessError
  keyFiles = $keyFiles
  hitCounts = @{
    total = $grepHits.Count
    thstatus = $thstatusHits.Count
    vidPid = $vidPidHits.Count
    physicalGate = $physicalHits.Count
    featureFlag = $featureFlagHits.Count
  }
  sampleHits = @{
    thstatus = @($thstatusHits | Select-Object -First 8)
    vidPid = @($vidPidHits | Select-Object -First 8)
    physicalGate = @($physicalHits | Select-Object -First 8)
    featureFlag = @($featureFlagHits | Select-Object -First 8)
  }
  judgment = @{
    microCodeFound = ($keyFiles.Count -gt 0)
    hashDrift = ($hashDrift.Count -gt 0)
    physicalGateLikely = ($physicalHits.Count -gt 0 -and $vidPidHits.Count -gt 0)
    featureFlagHint = ($featureFlagHits.Count -gt 0)
    noMicroCode = ($keyFiles.Count -eq 0 -and -not $accessible)
  }
}

Write-Host "Package: $PackageRoot (accessible=$accessible)" -ForegroundColor Cyan
Write-Host "Key files: $($keyFiles.Count), grep hits: $($grepHits.Count)" -ForegroundColor Cyan
if ($hashDrift.Count -gt 0) {
  Write-Host "Hash drift vs 26.707 baseline: $($hashDrift.Count) file(s)" -ForegroundColor Yellow
}

if ($OutputJson) {
  $dir = Split-Path $OutputJson -Parent
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $result | ConvertTo-Json -Depth 10 | Set-Content -Path $OutputJson -Encoding UTF8
  Write-Host "Wrote $OutputJson" -ForegroundColor Green
} else {
  $result | ConvertTo-Json -Depth 8
}
