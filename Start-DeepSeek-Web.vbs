' Start-DeepSeek-Web.vbs
' Silent launcher for the DeepSeek Harness Web GUI.
' Double-click to run, OR copy/symlink this file into:
'   shell:startup   (per-user autostart at logon)
'   shell:common startup  (all users)

Option Explicit

Dim shell, fso, ps, projectRoot, launcher, logFile, cmd, exitCode

Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")

projectRoot = fso.GetParentFolderName(WScript.ScriptFullName)
launcher    = projectRoot & "\scripts\start_deepseek_web.ps1"
logFile     = projectRoot & "\logs\deepseek-web.log"
ps          = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
If Not fso.FileExists(ps) Then ps = "powershell.exe"

If Not fso.FileExists(launcher) Then
    MsgBox "Cannot find start_deepseek_web.ps1." & vbCrLf & _
           "Expected at: " & launcher & vbCrLf & vbCrLf & _
           "Keep this .vbs next to the project's 'scripts' folder.", _
           16, "DeepSeek Web"
    WScript.Quit 1
End If

cmd = """" & ps & """ -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command " & _
      """& '" & launcher & "' -NoBrowser"""

exitCode = shell.Run(cmd, 0, True)

If exitCode <> 0 Then
    MsgBox "DeepSeek Web failed to start (exit " & exitCode & ")." & vbCrLf & vbCrLf & _
           "Log: " & logFile, 16, "DeepSeek Web"
    WScript.Quit exitCode
End If