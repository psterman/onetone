# OneTone hang / crash dump analysis

## Capture tools

| Tool | Purpose | Path |
|---|---|---|
| **ProcDump `-h`** | Windows window-not-responding (AppHang) | `%LOCALAPPDATA%\OneTone\HangDumps` |
| **LocalDumps** | Panic / unhandled exception / crash | `%LOCALAPPDATA%\OneTone\CrashDumps` |

Registry keys are **not** proof of success. A real `.dmp` file is.

## Scripts

```powershell
cd scripts\hang-dumps
.\hang-dumps.ps1 install        # 下载微软官方 ProcDump，并校验 Microsoft 数字签名
.\hang-dumps.ps1 setup          # LocalDumps + dirs; locate ProcDump
.\hang-dumps.ps1 verify-hang    # MUST produce a hang .dmp via hung WinForms probe
.\hang-dumps.ps1 start          # wait for onetone.exe AppHang (−h −n 3 −s 5)
.\hang-dumps.ps1 status
.\hang-dumps.ps1 stop
.\hang-dumps.ps1 cleanup
```

## One-pass voice settings capture

Use this path when the failure is intermittent and the user will run one reproduction pass:

```powershell
cd scripts\hang-dumps
.\hang-dumps.ps1 install        # first use only
.\hang-dumps.ps1 arm
# Run OneTone, open Voice settings, leave a frozen window untouched for >=20 seconds.
.\hang-dumps.ps1 collect
```

`arm` creates an isolated `%LOCALAPPDATA%\OneTone\HangDumps\voice-<timestamp>`
session and starts ProcDump with `-ma -h -n 3 -s 5`. `collect` stops the monitor and
adds the runtime log, last UI stall marker, matching Windows AppHang 1002 events,
dump hashes, and a collection summary. Do not terminate the frozen app before the
three dumps have had time to finish.

Install [Sysinternals ProcDump](https://learn.microsoft.com/en-us/sysinternals/downloads/procdump) as `scripts/hang-dumps/procdump.exe` or under `%LOCALAPPDATA%\OneTone\tools\`.

Microsoft documents ProcDump `-h` as capturing when a process window is unresponsive for longer than 5 seconds.

## WinDbg (hang)

```text
.sympath srv*https://msdl.microsoft.com/download/symbols
.sympath+ <path-to-onetone-pdb>
.reload
!analyze -v
~*k
```

Look for:

- UI / WebView2 / V8 thread stuck in MediaPipe / WASM / `detectForVideo`
- Tauri / Tao event-loop thread blocked on lock or `join`
- Many threads waiting on the same mutex (`TM_LOCK`, `cfg`, `log_ring`)

Capture **2–3 dumps a few seconds apart** (`-n 3 -s 5`) to distinguish deadlock (same stacks) from long compute (progressing stacks).

## Do not commit dumps

Keep `*.dmp` out of git. They live under `%LOCALAPPDATA%\OneTone\`.

## Event log query口径

```powershell
# Application AppHang for onetone.exe since test start
Get-WinEvent -FilterHashtable @{LogName='Application'; Id=1002; StartTime=$testStart} |
  Where-Object { $_.Message -match 'onetone\.exe' }
```

Reliability Records and Application Id=1002 counts differ; always state which口径 you used.
