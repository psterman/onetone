#Requires -Version 5.1
<#
.SYNOPSIS
  Codex Desktop → OneTone 止损线验证编排（Phase 1–4 自动化 + artifact 输出）。

.DESCRIPTION
  输出结构化 JSON 到 logs/stoploss/，内置 8h 总预算计时。
  Phase 1 可自动：环境检查、loopback 探针、SendMicroAction 输入、READ_OUTPUT 扫描。
  Phase 2–3 调用 codex-desktop-micro-static-scan.ps1 与日志/争用检查。

.EXAMPLE
  .\scripts\run-codex-micro-stoploss-verify.ps1
  .\scripts\run-codex-micro-stoploss-verify.ps1 -SkipLaunch -Phase 2
  .\scripts\run-codex-micro-stoploss-verify.ps1 -InputKey ACT06 -ObserveSeconds 90
#>
param(
  [ValidateSet(0, 1, 2, 3, 4, 'all')]
  [object]$Phase = 'all',
  [switch]$SkipLaunch,
  [string]$LoopbackUrl = 'http://127.0.0.1:8796/api/codex-micro/protocol',
  [string]$JsonlPath = '',
  [string]$TapCalledPath = '',
  [string]$InputKey = 'ACT06',
  [int]$ObserveSeconds = 60,
  [int]$BudgetHours = 8,
  [string]$CodexPackageRoot = 'C:\Program Files\WindowsApps\OpenAI.Codex_26.715.9868.0_x64__2p2nqsd0c76g0'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$artifactDir = Join-Path $root 'logs\stoploss'
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDir = Join-Path $artifactDir $runId
$budgetStart = Get-Date
$budgetEnd = $budgetStart.AddHours($BudgetHours)

if (-not $JsonlPath) {
  $JsonlPath = Join-Path $env:LOCALAPPDATA 'OpenAI\CodexMicro\codex-micro-rpc.jsonl'
}
if (-not $TapCalledPath) {
  $TapCalledPath = Join-Path (Split-Path $JsonlPath -Parent) 'codex-micro-rpc-tap-called.log'
}
$brokerLock = Join-Path (Split-Path $JsonlPath -Parent) 'broker-v1.lock'
$staticScanScript = Join-Path $PSScriptRoot 'codex-desktop-micro-static-scan.ps1'
$sendMicroExe = Join-Path $root '.agentcontroller-tmp\.agentcontroller-tmp\_tmpSendMicro\bin\Release\net9.0-windows10.0.19041.0\SendMicroAction.exe'

function New-Artifact($name, $obj) {
  if (-not (Test-Path $runDir)) {
    New-Item -ItemType Directory -Path $runDir -Force | Out-Null
  }
  $path = Join-Path $runDir $name
  $obj | ConvertTo-Json -Depth 12 | Set-Content -Path $path -Encoding UTF8
  return $path
}

function Test-BudgetExceeded {
  $exceeded = (Get-Date) -ge $budgetEnd
  return @{
    exceeded = $exceeded
    startedAt = $budgetStart.ToString('o')
    endsAt = $budgetEnd.ToString('o')
    elapsedMinutes = [math]::Round(((Get-Date) - $budgetStart).TotalMinutes, 1)
  }
}

function Test-PortListening($port) {
  $m = netstat -ano | Select-String ":$port\s+.*LISTENING"
  return [bool]$m
}

function Get-JsonlSnapshot($path, $sinceBytes = 0) {
  $methods = @()
  $lines = @()
  if (-not (Test-Path $path)) {
    return @{ exists = $false; byteLength = 0; methods = @(); lines = @(); newBytes = 0 }
  }
  $info = Get-Item $path
  $raw = [System.IO.File]::ReadAllText($path)
  $allLines = $raw -split "`n" | Where-Object { $_.Trim() }
  foreach ($line in $allLines) {
    try {
      $j = $line | ConvertFrom-Json
      $m = if ($j.m) { $j.m } elseif ($j.method) { $j.method } else { '' }
      if ($m) { $methods += $m }
      $lines += $line.Trim()
    } catch {
      # skip malformed
    }
  }
  return @{
    exists = $true
    byteLength = $info.Length
    methods = ($methods | Select-Object -Unique)
    lines = $lines
    newBytes = [math]::Max(0, $info.Length - $sinceBytes)
  }
}

function Get-TapCalledSnapshot($path, $sinceBytes = 0) {
  if (-not (Test-Path $path)) {
    return @{ exists = $false; lineCount = 0; lines = @(); newBytes = 0 }
  }
  $info = Get-Item $path
  $lines = @(Get-Content $path -ErrorAction SilentlyContinue)
  return @{
    exists = $true
    lineCount = $lines.Count
    lines = $lines
    newBytes = [math]::Max(0, $info.Length - $sinceBytes)
  }
}

function Invoke-LoopbackProbe($url) {
  $body = '{"method":"v.oai.thstatus","params":[{"id":0,"c":3166206,"b":1,"e":4,"s":0.4}],"id":42}'
  $probeResult = node -e "const u=new URL(process.argv[1]);const body=process.argv[2];const mod=u.protocol==='https:'?require('https'):require('http');const req=mod.request({hostname:u.hostname,port:u.port||(u.protocol==='https:'?443:80),path:u.pathname+u.search,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{let s='';res.on('data',d=>s+=d);res.on('end',()=>{try{const j=JSON.parse(s);const cells=Array.isArray(j.snapshot&&j.snapshot.cells)?j.snapshot.cells:[];const nativeAg=cells.filter(c=>String(c.microKeyId||c.micro_key_id||'').startsWith('AG')&&(c.statusSource||c.status_source)==='native').length;console.log(JSON.stringify({ok:!!j.ok,connectionState:(j.snapshot&&(j.snapshot.connectionState||j.snapshot.connection_state))||'?',nativeAg,raw:s.slice(0,500)}));}catch(e){console.error(e.message);process.exit(2);}});});req.on('error',e=>{console.error(e.message);process.exit(3)});req.write(body);req.end();" $url $body
  return $probeResult | ConvertFrom-Json
}

function Invoke-MicroInputTap($key) {
  if (-not (Test-Path $sendMicroExe)) {
    return @{
      attempted = $false
      reason = "SendMicroAction.exe not found: $sendMicroExe"
      inputAccepted = $false
    }
  }
  $down = & $sendMicroExe 'StoplossVerify' $key 1 2>&1 | Out-String
  Start-Sleep -Milliseconds 80
  $up = & $sendMicroExe 'StoplossVerify' $key 0 2>&1 | Out-String
  $combined = "$down`n$up"
  $accepted = $combined -match 'submit=Accepted|submit=OutcomeUnknown'
  $notSent = $combined -match 'submit=NotSent'
  return @{
    attempted = $true
    key = $key
    inputAccepted = [bool]$accepted
    notSent = [bool]$notSent
    downLog = $down.Trim()
    upLog = $up.Trim()
  }
}

function Invoke-Phase1 {
  Write-Host '=== Phase 1: Device layer minimal diagnosis ===' -ForegroundColor Cyan

  $drv = @(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like '*Codex*Micro*' -or $_.DeviceID -like '*CodexMicro*' })

  if (-not $SkipLaunch) {
    $launcher = Join-Path $root 'run_onetone.ps1'
    if (Test-Path $launcher) {
      & $launcher -LaunchOnly -CodexMicroProtocol -Safe
      Start-Sleep -Seconds 3
    }
  }

  $port8796 = Test-PortListening 8796
  $probe = $null
  if ($port8796) {
    try { $probe = Invoke-LoopbackProbe $LoopbackUrl } catch { $probe = @{ ok = $false; error = $_.Exception.Message } }
  }

  $jsonlBefore = (Get-JsonlSnapshot $JsonlPath).byteLength
  $tapBefore = (Get-TapCalledSnapshot $TapCalledPath).lines.Count

  $input = Invoke-MicroInputTap $InputKey

  Write-Host "Observing READ_OUTPUT for ${ObserveSeconds}s (trigger a Codex task if possible)..."
  Start-Sleep -Seconds $ObserveSeconds

  $jsonlAfter = Get-JsonlSnapshot $JsonlPath $jsonlBefore
  $tapAfter = Get-TapCalledSnapshot $TapCalledPath $tapBefore

  $statusMethods = @('v.oai.thstatus', 'v.oai.rgbcfg', 'lights.preview', 'device.status', 'sys.version')
  $foundMethods = @($jsonlAfter.methods | Where-Object { $_ -in $statusMethods })
  $hasThstatus = 'v.oai.thstatus' -in $jsonlAfter.methods
  $hasAnyReadOutput = $jsonlAfter.exists -and ($jsonlAfter.methods.Count -gt 0 -or $tapAfter.lineCount -gt $tapBefore)

  $phase1 = @{
    phase = 1
    timestamp = (Get-Date).ToString('o')
    budget = Test-BudgetExceeded
    driver = @{
      detected = ($drv.Count -gt 0)
      names = @($drv | ForEach-Object { $_.Name })
    }
    brokerLock = @{
      path = $brokerLock
      exists = Test-Path $brokerLock
    }
    loopback = @{
      port8796Listening = $port8796
      probe = $probe
    }
    envHints = @{
      AGENTCONTROLLER_CODEX_MICRO_RPC_JSONL = $JsonlPath
      AGENTCONTROLLER_CODEX_MICRO_RPC_TAP_DEBUG = '1 (set before AgentController restart)'
    }
    inputProbe = $input
    readOutputScan = @{
      jsonlPath = $JsonlPath
      tapCalledPath = $TapCalledPath
      jsonlBeforeBytes = $jsonlBefore
      jsonlAfter = $jsonlAfter
      tapBeforeLines = $tapBefore
      tapAfter = $tapAfter
      hasAnyReadOutput = $hasAnyReadOutput
      hasThstatus = $hasThstatus
      foundStatusMethods = $foundMethods
      sampleLines = @($jsonlAfter.lines | Select-Object -Last 5)
    }
    judgment = @{
      dCandidateNoInput = (-not $input.inputAccepted) -and (-not $hasAnyReadOutput)
      continuePhase2 = $input.inputAccepted -and (-not $hasThstatus)
      noReadOutputAtAll = -not $hasAnyReadOutput
    }
  }

  $path = New-Artifact 'phase1-device-diagnosis.json' $phase1
  Write-Host "Phase 1 artifact: $path" -ForegroundColor Green
  return $phase1
}

function Invoke-Phase2 {
  Write-Host '=== Phase 2: Codex package static scan ===' -ForegroundColor Cyan
  if (-not (Test-Path $staticScanScript)) {
    throw "Missing static scan script: $staticScanScript"
  }
  $outJson = Join-Path $runDir 'phase2-static-scan.json'
  & $staticScanScript -PackageRoot $CodexPackageRoot -OutputJson $outJson | Out-Null
  if (Test-Path $outJson) {
    $p2 = Get-Content $outJson -Raw | ConvertFrom-Json
    New-Artifact 'phase2-static-scan.json' $p2 | Out-Null
    return $p2
  }
  return @{ phase = 2; error = 'static scan produced no output' }
}

function Invoke-Phase3 {
  Write-Host '=== Phase 3: Handshake and handle contention ===' -ForegroundColor Cyan

  $jsonl = Get-JsonlSnapshot $JsonlPath
  $requestMethods = @()
  foreach ($line in $jsonl.lines) {
    if ($line -match '"method"\s*:\s*"(sys\.version|device\.status|v\.oai\.rgbcfg|v\.oai\.thstatus|lights\.preview)"') {
      if ($line -notmatch '"result"\s*:') {
        $requestMethods += $Matches[1]
      }
    }
  }
  $requestMethods = @($requestMethods | Select-Object -Unique)

  $codexLogDirs = @(
    (Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\logs'),
    (Join-Path $env:LOCALAPPDATA 'Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\OpenAI\Codex\logs'),
    (Join-Path $env:USERPROFILE '.codex\logs')
  )
  $codexLogHits = @()
  foreach ($dir in $codexLogDirs) {
    if (-not (Test-Path $dir)) { continue }
    $files = Get-ChildItem $dir -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-7) } |
      Select-Object -First 20
    foreach ($f in $files) {
      $matches = Select-String -Path $f.FullName -Pattern 'micro|303A|8360|HID|thstatus|rejected|unsupported|Incompatible' -ErrorAction SilentlyContinue |
        Select-Object -First 5
      if ($matches) {
        $codexLogHits += @{
          file = $f.FullName
          hits = @($matches | ForEach-Object { $_.Line.Trim().Substring(0, [math]::Min(200, $_.Line.Trim().Length)) })
        }
      }
    }
  }

  $simProc = Get-Process -Name 'CodexMicro.Desktop' -ErrorAction SilentlyContinue
  $acProc = Get-Process -Name 'AgentController' -ErrorAction SilentlyContinue
  $codexProc = Get-Process -Name 'ChatGPT','Codex' -ErrorAction SilentlyContinue

  $phase3 = @{
    phase = 3
    timestamp = (Get-Date).ToString('o')
    budget = Test-BudgetExceeded
    codexRequestsSeen = @{
      methods = $requestMethods
      codexNeverSentRequest = ($requestMethods.Count -eq 0)
      note = 'If empty, Codex did not establish RPC session — not a handler bug'
    }
    broker = @{
      lockExists = Test-Path $brokerLock
      lockPath = $brokerLock
    }
    processes = @{
      AgentController = [bool]$acProc
      CodexMicroSimulator = [bool]$simProc
      CodexDesktop = [bool]$codexProc
      contentionRisk = ([bool]$simProc -and [bool]$acProc)
    }
    codexLogHits = $codexLogHits
    handlerImplemented = @('sys.version', 'device.status', 'v.oai.thstatus', 'v.oai.rgbcfg')
  }

  $path = New-Artifact 'phase3-handshake-contention.json' $phase3
  Write-Host "Phase 3 artifact: $path" -ForegroundColor Green
  return $phase3
}

function Invoke-Phase4($phase2) {
  Write-Host '=== Phase 4: Version comparison (optional) ===' -ForegroundColor Cyan
  $baselineHashes = @{
    'codex-micro-service' = '0bb261e3eed89ff69384754ab67df49c9f10dbd2fa567104c5859f43d026c911'
    'codex-micro-bridge' = 'df6063eb17046594e769050c6bbb3ed169b1352bbd5867fffb4d1f8c724f3e93'
    'codex-micro-slot-signals' = 'e5f0084a27fc0e908c4514a5d3bd0a90dba3f953a48521fb4ae2a43b1e5b28bb'
  }
  $current = @{}
  if ($phase2 -and $phase2.keyFiles) {
    foreach ($kf in $phase2.keyFiles) {
      if ($kf.sha256) {
        $label = $kf.label
        if (-not $label) { $label = [System.IO.Path]::GetFileName($kf.path) }
        $current[$label] = $kf.sha256.ToLowerInvariant()
      }
    }
  }
  $drift = @()
  foreach ($key in $baselineHashes.Keys) {
    $match = $current.GetEnumerator() | Where-Object { $_.Key -like "*$key*" } | Select-Object -First 1
    if ($match -and $match.Value -ne $baselineHashes[$key]) {
      $drift += @{ file = $match.Key; baseline = $baselineHashes[$key]; current = $match.Value }
    }
  }

  $installedVersions = @()
  $wa = 'C:\Program Files\WindowsApps'
  if (Test-Path $wa) {
    $installedVersions = @(Get-ChildItem $wa -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like 'OpenAI.Codex_*' } |
      ForEach-Object { $_.Name })
  }

  $phase4 = @{
    phase = 4
    timestamp = (Get-Date).ToString('o')
    budget = Test-BudgetExceeded
    baselineVersion = '26.707.12708.0'
    currentPackage = $CodexPackageRoot
    installedCodexPackages = $installedVersions
    hashDrift = $drift
    triggeredBecause = 'Phase 2 hash drift or feature flag hint'
    readOutputInCurrentEnv = $false
    note = 'No safe downgrade performed; compare hashes only'
  }
  $path = New-Artifact 'phase4-version-compare.json' $phase4
  Write-Host "Phase 4 artifact: $path" -ForegroundColor Green
  return $phase4
}

function Get-RecommendedConclusion($p1, $p2, $p3) {
  if ($p1.readOutputScan.hasThstatus) { return 'A' }
  if ($p1.judgment.dCandidateNoInput) { return 'D' }
  if ($p2 -and $p2.judgment.physicalGateLikely) { return 'D' }
  if ($p2 -and $p2.judgment.featureFlagHint) { return 'C' }
  if ($p1.judgment.noReadOutputAtAll -and $p3.codexRequestsSeen.codexNeverSentRequest) { return 'D' }
  if ($p1.loopback.probe -and $p1.loopback.probe.ok -and -not $p1.readOutputScan.hasThstatus) { return 'B' }
  return 'D'
}

# --- Main ---
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
Write-Host "Stoploss verify run: $runDir" -ForegroundColor Cyan
Write-Host "Budget: $BudgetHours h (ends $($budgetEnd.ToString('HH:mm')))"

$meta = @{
  runId = $runId
  startedAt = $budgetStart.ToString('o')
  budgetEndsAt = $budgetEnd.ToString('o')
  voicePilotRoot = $root
  codexPackageRoot = $CodexPackageRoot
}
New-Artifact 'run-meta.json' $meta | Out-Null

$p1 = $null; $p2 = $null; $p3 = $null; $p4 = $null
$runPhase = [string]$Phase

if ($runPhase -eq 'all' -or $runPhase -eq '0' -or $runPhase -eq '1') {
  $p1 = Invoke-Phase1
}
if (($runPhase -eq 'all' -or $runPhase -eq '2') -and -not (Test-BudgetExceeded).exceeded) {
  $p2 = Invoke-Phase2
}
if ($runPhase -eq 'all' -or $runPhase -eq '3') {
  if (-not $p1) { $p1 = @{ readOutputScan = @{ hasThstatus = $false; hasAnyReadOutput = $false }; judgment = @{}; loopback = @{}; inputProbe = @{} } }
  $p3 = Invoke-Phase3
}
if (($runPhase -eq 'all' -or $runPhase -eq '4') -and $p2) {
  $p2j = if ($p2.judgment) { $p2.judgment } elseif ($p2[0].judgment) { $p2[0].judgment } else { $null }
  if ($p2j -and ($p2j.hashDrift -or $p2j.featureFlagHint)) {
    $p4 = Invoke-Phase4 $p2
  }
}

$conclusion = Get-RecommendedConclusion $p1 $p2 $p3
$summary = @{
  runId = $runId
  artifactDir = $runDir
  budget = Test-BudgetExceeded
  recommendedConclusion = $conclusion
  phase1 = $p1
  phase2 = $p2
  phase3 = $p3
  phase4 = $p4
  nextSteps = switch ($conclusion) {
    'A' { @('Document triple evidence in stoploss report') }
    'B' { @('Continue Phase 2-3 static/handshake analysis') }
    'C' { @('Verify feature flag / handshake gap within 1-2 days') }
    'D' { @('Run codex-app-state-relay.js PoC', 'Fill docs/codex-micro-bridge-stoploss-report.md') }
    default { @() }
  }
}
$summaryPath = New-Artifact 'summary.json' $summary
Write-Host ''
Write-Host "Recommended conclusion: $conclusion" -ForegroundColor $(if ($conclusion -eq 'A') { 'Green' } elseif ($conclusion -eq 'C') { 'Yellow' } else { 'Magenta' })
Write-Host "Summary: $summaryPath" -ForegroundColor Cyan
