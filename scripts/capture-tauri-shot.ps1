# Capture OneTone main window to PNG via PrintWindow (BitBlt fallback).
# Fail closed on ambiguous windows or blank/undecodable output.
param(
  [Parameter(Mandatory = $true)]
  [string]$Name,

  [Parameter(Mandatory = $true)]
  [string]$OutDir,

  [int]$ProcessId = 0,

  [Int64]$WindowHandle = 0
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing | Out-Null

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class OtWinCapture {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern IntPtr GetWindowDC(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
  [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
  [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);
  [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);
  [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr hObject);
  [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
  [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr hdcDest, int x, int y, int w, int h, IntPtr hdcSrc, int x1, int y1, int rop);

  public const int SRCCOPY = 0x00CC0020;
  public const uint PW_RENDERFULLCONTENT = 0x00000002;

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  public static string GetTitle(IntPtr hWnd) {
    int len = GetWindowTextLength(hWnd);
    if (len <= 0) return "";
    var sb = new StringBuilder(len + 1);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }
}
"@

function Test-IsMainCandidate([IntPtr]$Hwnd) {
  if (-not [OtWinCapture]::IsWindow($Hwnd)) { return $false }
  # Allow briefly non-visible during transitions; still require a real frame size.
  $rect = New-Object OtWinCapture+RECT
  if (-not [OtWinCapture]::GetWindowRect($Hwnd, [ref]$rect)) { return $false }
  $w = $rect.Right - $rect.Left
  $h = $rect.Bottom - $rect.Top
  if ($w -lt 80 -or $h -lt 80) { return $false }
  return $true
}

function Find-OnetoneWindow {
  param([int]$PidHint, [IntPtr]$HwndHint)

  if ($HwndHint -ne [IntPtr]::Zero) {
    if ([OtWinCapture]::IsWindow($HwndHint) -and (Test-IsMainCandidate $HwndHint)) {
      $pidOut = 0
      [void][OtWinCapture]::GetWindowThreadProcessId($HwndHint, [ref]$pidOut)
      return @{ Hwnd = $HwndHint; Pid = [int]$pidOut }
    }
    Write-Host ("WindowHandle {0} unusable; falling back to PID/name" -f $HwndHint.ToInt64())
  }

  $pids = @()
  if ($PidHint -gt 0) {
    $proc = Get-Process -Id $PidHint -ErrorAction SilentlyContinue
    if (-not $proc) { throw "ProcessId $PidHint not found" }
    $pids = @($PidHint)
  } else {
    $procs = @(Get-Process -Name onetone -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) { throw "no onetone process found" }
    if ($procs.Count -gt 1) {
      throw "multiple onetone processes ($($procs.Count)); pass -ProcessId or -WindowHandle"
    }
    $pids = @($procs[0].Id)
  }

  $deadline = (Get-Date).AddSeconds(12)
  $lastErr = "no visible main window"
  while ((Get-Date) -lt $deadline) {
    $matches = New-Object System.Collections.Generic.List[object]
    $pidSet = New-Object 'System.Collections.Generic.HashSet[uint32]'
    foreach ($p in $pids) { [void]$pidSet.Add([uint32]$p) }

    $callback = [OtWinCapture+EnumWindowsProc]{
      param([IntPtr]$hWnd, [IntPtr]$lParam)
      $pidOut = [uint32]0
      [void][OtWinCapture]::GetWindowThreadProcessId($hWnd, [ref]$pidOut)
      if (-not $pidSet.Contains($pidOut)) { return $true }
      if (-not (Test-IsMainCandidate $hWnd)) { return $true }
      $script:__otMatches.Add(@{
        Hwnd = $hWnd
        Pid = [int]$pidOut
        Title = [OtWinCapture]::GetTitle($hWnd)
      }) | Out-Null
      return $true
    }

    $script:__otMatches = $matches
    [void][OtWinCapture]::EnumWindows($callback, [IntPtr]::Zero)

    if ($matches.Count -eq 1) {
      return @{ Hwnd = $matches[0].Hwnd; Pid = $matches[0].Pid }
    }
    if ($matches.Count -gt 1) {
      # Prefer the titled main window (empty-title overlays are common under Tauri).
      $titled = @($matches | Where-Object { $_.Title -and $_.Title.Trim().Length -gt 0 })
      if ($titled.Count -eq 1) {
        return @{ Hwnd = $titled[0].Hwnd; Pid = $titled[0].Pid }
      }
      $onetone = @($matches | Where-Object { $_.Title -match 'OneTone' })
      if ($onetone.Count -eq 1) {
        return @{ Hwnd = $onetone[0].Hwnd; Pid = $onetone[0].Pid }
      }
      # Largest area fallback when titles collide.
      $best = $null
      $bestArea = -1
      foreach ($m in $matches) {
        $rect = New-Object OtWinCapture+RECT
        if (-not [OtWinCapture]::GetWindowRect($m.Hwnd, [ref]$rect)) { continue }
        $area = [Math]::Abs(($rect.Right - $rect.Left) * ($rect.Bottom - $rect.Top))
        if ($area -gt $bestArea) { $bestArea = $area; $best = $m }
      }
      if ($best) {
        Write-Host ("ambiguous windows resolved by area hwnd=$($best.Hwnd.ToInt64()) title='$($best.Title)' area=$bestArea")
        return @{ Hwnd = $best.Hwnd; Pid = $best.Pid }
      }
      $detail = ($matches | ForEach-Object { "hwnd=$($_.Hwnd.ToInt64()) title='$($_.Title)'" }) -join '; '
      throw "ambiguous windows ($($matches.Count)): $detail"
    }
    $lastErr = "no visible main window for pid(s) $($pids -join ',')"
    Start-Sleep -Milliseconds 400
  }
  throw $lastErr
}

function Test-BitmapNonBlank([System.Drawing.Bitmap]$Bmp) {
  # Sample a grid; reject if every sample is near-black or near-white identical.
  $w = $Bmp.Width
  $h = $Bmp.Height
  if ($w -le 0 -or $h -le 0) { return $false }
  $samples = New-Object System.Collections.Generic.List[string]
  for ($yi = 0; $yi -lt 8; $yi++) {
    for ($xi = 0; $xi -lt 8; $xi++) {
      $x = [int](($xi + 0.5) * $w / 8)
      $y = [int](($yi + 0.5) * $h / 8)
      if ($x -ge $w) { $x = $w - 1 }
      if ($y -ge $h) { $y = $h - 1 }
      $c = $Bmp.GetPixel($x, $y)
      $samples.Add("$($c.R),$($c.G),$($c.B)") | Out-Null
    }
  }
  $uniq = $samples | Select-Object -Unique
  if ($uniq.Count -le 1) {
    $only = $uniq[0]
    # Single uniform color → treat as blank capture failure.
    return $false
  }
  return $true
}

function Capture-WindowPng {
  param([IntPtr]$Hwnd, [string]$Path)

  $rect = New-Object OtWinCapture+RECT
  if (-not [OtWinCapture]::GetWindowRect($Hwnd, [ref]$rect)) {
    throw "GetWindowRect failed for hwnd=$($Hwnd.ToInt64())"
  }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) {
    throw "invalid window bounds ${width}x${height}"
  }

  $hdcWindow = [OtWinCapture]::GetWindowDC($Hwnd)
  if ($hdcWindow -eq [IntPtr]::Zero) { throw "GetWindowDC failed" }
  $hdcMem = [OtWinCapture]::CreateCompatibleDC($hdcWindow)
  $hbmp = [OtWinCapture]::CreateCompatibleBitmap($hdcWindow, $width, $height)
  $old = [OtWinCapture]::SelectObject($hdcMem, $hbmp)

  $method = 'PrintWindow'
  $ok = [OtWinCapture]::PrintWindow($Hwnd, $hdcMem, [OtWinCapture]::PW_RENDERFULLCONTENT)
  if (-not $ok) {
    $ok = [OtWinCapture]::PrintWindow($Hwnd, $hdcMem, 0)
  }
  if (-not $ok) {
    $method = 'BitBlt'
    $ok = [OtWinCapture]::BitBlt($hdcMem, 0, 0, $width, $height, $hdcWindow, 0, 0, [OtWinCapture]::SRCCOPY)
    if (-not $ok) {
      [void][OtWinCapture]::SelectObject($hdcMem, $old)
      [void][OtWinCapture]::DeleteObject($hbmp)
      [void][OtWinCapture]::DeleteDC($hdcMem)
      [void][OtWinCapture]::ReleaseDC($Hwnd, $hdcWindow)
      throw "PrintWindow and BitBlt both failed for hwnd=$($Hwnd.ToInt64())"
    }
    Write-Host "capture fallback=BitBlt"
  }

  $bmp = [System.Drawing.Bitmap]::FromHbitmap($hbmp)
  [void][OtWinCapture]::SelectObject($hdcMem, $old)
  [void][OtWinCapture]::DeleteObject($hbmp)
  [void][OtWinCapture]::DeleteDC($hdcMem)
  [void][OtWinCapture]::ReleaseDC($Hwnd, $hdcWindow)

  try {
    if ($bmp.Width -le 0 -or $bmp.Height -le 0) {
      throw "captured bitmap has zero size"
    }
    if (-not (Test-BitmapNonBlank $bmp)) {
      throw "captured bitmap appears blank/uniform (method=$method)"
    }
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bmp.Dispose()
  }

  return @{
    Width = $width
    Height = $height
    Method = $method
    Bounds = @{
      Left = $rect.Left
      Top = $rect.Top
      Right = $rect.Right
      Bottom = $rect.Bottom
    }
  }
}

function Assert-ValidPng([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "PNG missing: $Path" }
  $len = (Get-Item -LiteralPath $Path).Length
  if ($len -le 0) { throw "PNG empty: $Path" }
  $img = [System.Drawing.Image]::FromFile($Path)
  try {
    if ($img.Width -le 0 -or $img.Height -le 0) {
      throw "PNG undecodable or zero size: $Path"
    }
    return @{ Width = $img.Width; Height = $img.Height; Length = $len }
  } finally {
    $img.Dispose()
  }
}

# --- main ---
if (-not (Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

$fileName = if ($Name -match '\.png$') { $Name } else { "$Name.png" }
$outPath = Join-Path $OutDir $fileName
$outPath = [System.IO.Path]::GetFullPath($outPath)

$hwndHint = [IntPtr]::Zero
if ($WindowHandle -ne 0) { $hwndHint = [IntPtr]$WindowHandle }

$found = Find-OnetoneWindow -PidHint $ProcessId -HwndHint $hwndHint
$hwnd = [IntPtr]$found.Hwnd
$targetPid = [int]$found.Pid
$title = [OtWinCapture]::GetTitle($hwnd)

$cap = Capture-WindowPng -Hwnd $hwnd -Path $outPath
$info = Assert-ValidPng $outPath

Write-Host ("pid={0}" -f $targetPid)
Write-Host ("hwnd={0}" -f $hwnd.ToInt64())
Write-Host ("title={0}" -f $title)
Write-Host ("bounds=L{0},T{1},R{2},B{3} ({4}x{5})" -f `
  $cap.Bounds.Left, $cap.Bounds.Top, $cap.Bounds.Right, $cap.Bounds.Bottom, $cap.Width, $cap.Height)
Write-Host ("png={0}" -f $outPath)
Write-Host ("decoded={0}x{1} bytes={2} method={3}" -f $info.Width, $info.Height, $info.Length, $cap.Method)

exit 0
