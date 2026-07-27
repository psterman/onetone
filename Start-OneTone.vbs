Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Function ResolveProjectRoot(scriptDir)
  Dim candidates(2), i, root
  candidates(0) = scriptDir
  candidates(1) = scriptDir & "\voice-pilot"
  candidates(2) = shell.SpecialFolders("Desktop") & "\voice-pilot"
  For i = 0 To 2
    root = candidates(i)
    If fso.FileExists(root & "\run_onetone.ps1") Then
      ResolveProjectRoot = root
      Exit Function
    End If
  Next
  ResolveProjectRoot = ""
End Function

Function Q(s)
  Q = """" & s & """"
End Function

projectRoot = ResolveProjectRoot(fso.GetParentFolderName(WScript.ScriptFullName))
launcher = projectRoot & "\run_onetone.ps1"
logFile = projectRoot & "\logs\launch.log"
ps = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
If Not fso.FileExists(ps) Then ps = "powershell.exe"

If projectRoot = "" Or Not fso.FileExists(launcher) Then
  MsgBox "Cannot find run_onetone.ps1." & vbCrLf & vbCrLf & "Keep this file on Desktop, or inside the voice-pilot folder.", 16, "OneTone"
  WScript.Quit 1
End If

' -Command + Join-Path: do not ShellExecute-open the .ps1 association (avoids Open With dialog).
cmd = Q(ps) & " -NoLogo -NoProfile -ExecutionPolicy Bypass -Command " & _
  Q("Set-Location -LiteralPath '" & projectRoot & "'; & (Join-Path '" & projectRoot & "' 'run_onetone.ps1')")
exitCode = shell.Run(cmd, 0, True)

If exitCode <> 0 Then
  MsgBox "OneTone launch failed (exit " & exitCode & ")." & vbCrLf & vbCrLf & "See log:" & vbCrLf & logFile, 16, "OneTone"
  WScript.Quit exitCode
End If
