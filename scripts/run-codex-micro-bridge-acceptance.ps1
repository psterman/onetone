#Requires -Version 5.1
<#
.SYNOPSIS
  Codex Micro 真桥验收编排（OneTone loopback + 探针 + 可选 relay）。

.DESCRIPTION
  步骤 0–3 可在无驱动时跑通（预期结论 B）。
  步骤 4+ 需安装 CodexMicroVhfUm + AgentController + Codex Desktop。

.EXAMPLE
  .\scripts\run-codex-micro-bridge-acceptance.ps1
  .\scripts\run-codex-micro-bridge-acceptance.ps1 -SkipLaunch
#>
param(
  [switch]$SkipLaunch,
  [string]$LoopbackUrl = 'http://127.0.0.1:8796/api/codex-micro/protocol',
  [string]$RelayScript = (Join-Path $PSScriptRoot 'codex-micro-agentcontroller-relay.js'),
  [string]$JsonlPath = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

function Write-Step($n, $msg) {
  Write-Host ""
  Write-Host "=== Step $n : $msg ===" -ForegroundColor Cyan
}

function Test-PortListening($port) {
  $m = netstat -ano | Select-String ":$port\s+.*LISTENING"
  return [bool]$m
}

Write-Step 0 'Driver health (optional)'
$drv = Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like '*Codex*Micro*' -or $_.DeviceID -like '*CodexMicro*' }
if ($drv) {
  Write-Host "Found: $($drv.Name -join ', ')" -ForegroundColor Green
} else {
  Write-Host 'CodexMicro driver not detected — real bridge likely conclusion B until installed.' -ForegroundColor Yellow
  Write-Host 'See .agentcontroller-tmp/docs/CodexMicroSimulator-安装教程.zh-CN.md'
}

Write-Step 1 'Launch OneTone with loopback'
if (-not $SkipLaunch) {
  $launcher = Join-Path $root 'run_onetone.ps1'
  if (-not (Test-Path $launcher)) { throw "Missing $launcher" }
  & $launcher -LaunchOnly -CodexMicroProtocol -Safe
  Start-Sleep -Seconds 3
}

if (-not (Test-PortListening 8796)) {
  Write-Host '8796 not LISTENING — start OneTone with ONETONE_CODEX_MICRO_PROTOCOL=1' -ForegroundColor Red
  exit 2
}
Write-Host '8796 LISTENING' -ForegroundColor Green

Write-Step 2 'Loopback probe (Codex native thstatus shape)'
$body = '{"method":"v.oai.thstatus","params":[{"id":0,"c":3166206,"b":1,"e":4,"s":0.4}],"id":42}'
try {
  $probeResult = node -e "const u=new URL(process.argv[1]);const body=process.argv[2];const mod=u.protocol==='https:'?require('https'):require('http');const req=mod.request({hostname:u.hostname,port:u.port||(u.protocol==='https:'?443:80),path:u.pathname+u.search,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{let s='';res.on('data',d=>s+=d);res.on('end',()=>{try{const j=JSON.parse(s);const cells=Array.isArray(j.snapshot&&j.snapshot.cells)?j.snapshot.cells:[];const nativeAg=cells.filter(c=>String(c.microKeyId||c.micro_key_id||'').startsWith('AG')&&(c.statusSource||c.status_source)==='native').length;console.log(JSON.stringify({ok:!!j.ok,connectionState:(j.snapshot&& (j.snapshot.connectionState||j.snapshot.connection_state))||'?',nativeAg}));}catch(e){console.error(e.message);process.exit(2);}});});req.on('error',e=>{console.error(e.message);process.exit(3)});req.write(body);req.end();" $LoopbackUrl $body
  $probe = $probeResult | ConvertFrom-Json
  Write-Host ("ok={0} connectionState={1} nativeAg={2}" -f $probe.ok, $probe.connectionState, $probe.nativeAg) -ForegroundColor $(if ($probe.ok -and $probe.nativeAg -ge 1) { 'Green' } else { 'Yellow' })
} catch {
  Write-Host "Probe failed: $_" -ForegroundColor Red
  exit 3
}

Write-Step 3 "Stale window (wait 4s, optional manual re-probe)"
Write-Host 'Wait 4s to avoid stale pollution from step 2...'
Start-Sleep -Seconds 4

Write-Step 4 'AgentController jsonl tap'
if (-not $JsonlPath) {
  $JsonlPath = Join-Path $env:LOCALAPPDATA 'OpenAI\CodexMicro\codex-micro-rpc.jsonl'
}
Write-Host "Set AGENTCONTROLLER_CODEX_MICRO_RPC_JSONL=$JsonlPath"
Write-Host 'Restart AgentController after setting env. Expected stderr: [AgentController] READ_OUTPUT v.oai.thstatus'

Write-Step 5 "Relay (--file tail)"
if (-not (Test-Path $RelayScript)) { throw "Missing relay: $RelayScript" }
Write-Host "node `"$RelayScript`" --file `"$JsonlPath`" --url `"$LoopbackUrl`""
Write-Host 'Expected: [relay] POST 200 method=v.oai.thstatus ... nativeAg>=1'

Write-Step 6 'Acceptance UI'
Write-Host 'node design-mock/_serve.js'
Write-Host 'Open http://127.0.0.1:8766/codex-onetone-linkage-acceptance.html'
Write-Host 'Paste real snapshot + triple log for conclusion A.'
Write-Host "Fill docs/codex-micro-real-bridge-acceptance.md"

Write-Host ''
Write-Host 'Done (orchestration hints). Conclusion A requires driver + Codex task + triple evidence.' -ForegroundColor Cyan
