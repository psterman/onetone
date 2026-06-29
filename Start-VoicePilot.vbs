Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = scriptDir

If LCase(fso.GetFileName(scriptDir)) = "desktop" Then
  projectRoot = scriptDir & "\voice-pilot"
End If

If Not fso.FileExists(projectRoot & "\run_onetone.ps1") Then
  projectRoot = "C:\Users\Administrator\Desktop\voice-pilot"
End If

launcher = projectRoot & "\run_onetone.ps1"

If Not fso.FileExists(launcher) Then
  MsgBox "找不到启动脚本: " & launcher, 16, "一声 oneTone"
  WScript.Quit 1
End If

shell.Run "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File """ & launcher & """", 1, False
