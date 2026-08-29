' OneTone Website 无窗口启动器
' 双击 .vbs 不会弹黑窗，自动起 server + 打开浏览器
' 关闭方式：任务管理器结束 python.exe，或运行 stop-server.bat

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = scriptDir & "\start-server.bat"

If Not fso.FileExists(batPath) Then
    MsgBox "找不到 start-server.bat，请确保两个文件在同一目录", vbExclamation, "OneTone"
    WScript.Quit 1
End If

' 第二参数 0 = 隐藏窗口，第三个 False = 不等待 bat 结束
WshShell.Run "cmd /c """ & batPath & """", 0, False

Set WshShell = Nothing
Set fso = Nothing
