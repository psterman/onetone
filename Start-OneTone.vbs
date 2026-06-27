Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projectRoot = fso.GetParentFolderName(WScript.ScriptFullName)
launcher = projectRoot & "\run_onetone.ps1"

If Not fso.FileExists(launcher) Then
  MsgBox "找不到启动脚本: " & launcher, 16, "一声 onetone"
  WScript.Quit 1
End If

shell.Run "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File """ & launcher & """", 1, False
