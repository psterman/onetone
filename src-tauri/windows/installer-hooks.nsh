!macro NSIS_HOOK_POSTINSTALL
  ; Windows loads link-time DLL dependencies from the app directory at startup.
  ; Copy Vosk beside onetone.exe from whichever resource layout Tauri produced.
  IfFileExists "$INSTDIR\libvosk.dll" 0 try_resource_root
    Goto hook_done
  try_resource_root:
  IfFileExists "$INSTDIR\resources\libvosk.dll" 0 try_resource_vosk
    CopyFiles /SILENT "$INSTDIR\resources\libvosk.dll" "$INSTDIR\"
    CopyFiles /SILENT "$INSTDIR\resources\libgcc_s_seh-1.dll" "$INSTDIR\"
    CopyFiles /SILENT "$INSTDIR\resources\libstdc++-6.dll" "$INSTDIR\"
    CopyFiles /SILENT "$INSTDIR\resources\libwinpthread-1.dll" "$INSTDIR\"
    Goto hook_done
  try_resource_vosk:
  IfFileExists "$INSTDIR\resources\vosk\libvosk.dll" 0 try_nested
    CopyFiles /SILENT "$INSTDIR\resources\vosk\libvosk.dll" "$INSTDIR\"
    CopyFiles /SILENT "$INSTDIR\resources\vosk\libgcc_s_seh-1.dll" "$INSTDIR\"
    CopyFiles /SILENT "$INSTDIR\resources\vosk\libstdc++-6.dll" "$INSTDIR\"
    CopyFiles /SILENT "$INSTDIR\resources\vosk\libwinpthread-1.dll" "$INSTDIR\"
    Goto hook_done
  try_nested:
  IfFileExists "$INSTDIR\resources\resources\vosk\libvosk.dll" 0 hook_done
    CopyFiles /SILENT "$INSTDIR\resources\resources\vosk\libvosk.dll" "$INSTDIR\"
    CopyFiles /SILENT "$INSTDIR\resources\resources\vosk\libgcc_s_seh-1.dll" "$INSTDIR\"
    CopyFiles /SILENT "$INSTDIR\resources\resources\vosk\libstdc++-6.dll" "$INSTDIR\"
    CopyFiles /SILENT "$INSTDIR\resources\resources\vosk\libwinpthread-1.dll" "$INSTDIR\"
  hook_done:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Best-effort cleanup of copied runtime DLLs beside the exe.
  Delete "$INSTDIR\libvosk.dll"
  Delete "$INSTDIR\libgcc_s_seh-1.dll"
  Delete "$INSTDIR\libstdc++-6.dll"
  Delete "$INSTDIR\libwinpthread-1.dll"
!macroend
