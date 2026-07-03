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

projectRoot = ResolveProjectRoot(fso.GetParentFolderName(WScript.ScriptFullName))
launcher = projectRoot & "\run_onetone.ps1"
logFile = projectRoot & "\logs\launch.log"

If projectRoot = "" Or Not fso.FileExists(launcher) Then
  MsgBox "Cannot find run_onetone.ps1.", 16, "OneTone"
  WScript.Quit 1
End If

cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File """ & launcher & """ -Rebuild"
exitCode = shell.Run(cmd, 0, True)

If exitCode <> 0 Then
  MsgBox "OneTone rebuild failed (exit " & exitCode & ")." & vbCrLf & vbCrLf & "See log:" & vbCrLf & logFile, 16, "OneTone"
  WScript.Quit exitCode
End If
