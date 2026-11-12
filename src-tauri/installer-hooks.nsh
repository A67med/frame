!include "LogicLib.nsh"
!include "FileFunc.nsh"

; Ends this installation's own sidecars (mpv, yt-dlp, ffmpeg, ffprobe and the
; stremio-server sidecar) so their files can be overwritten. A process is ended
; only when its executable lives under $INSTDIR: an mpv or ffmpeg the user runs
; from anywhere else keeps running. Native Win32 calls only (no PowerShell, WMI
; or other script host), so AV/EDR products cannot stall the installer here.
; Frame's own job object normally ends these with the app; this covers orphans.
Function FrameEndInstalledSidecars
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  Push $9

  StrCpy $9 "$INSTDIR\"
  StrLen $8 $9
  ; Room for 8192 process ids.
  System::Alloc 32768
  Pop $0
  System::Call 'kernel32::K32EnumProcesses(p r0, i 32768, *i .r1) i .r2'
  ${If} $2 <> 0
    IntOp $1 $1 / 4
    StrCpy $3 0
    ${DoWhile} $3 < $1
      IntOp $4 $3 * 4
      IntPtrOp $4 $0 + $4
      System::Call '*$4(i .r5)'
      ; PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE
      System::Call 'kernel32::OpenProcess(i 0x1001, i 0, i r5) p .r6'
      ${If} $6 P<> 0
        StrCpy $7 1024
        System::Call 'kernel32::QueryFullProcessImageNameW(p r6, i 0, w .r4, *i r7) i .r2'
        ${If} $2 <> 0
          StrCpy $7 $4 $8
          ; StrCmp is case-insensitive, matching Windows path semantics.
          ${If} $7 == $9
            ${GetFileName} $4 $7
            StrCpy $2 $7 14
            ${If} $7 == "mpv.exe"
            ${OrIf} $7 == "yt-dlp.exe"
            ${OrIf} $7 == "ffmpeg.exe"
            ${OrIf} $7 == "ffprobe.exe"
            ${OrIf} $2 == "stremio-server"
              System::Call 'kernel32::TerminateProcess(p r6, i 1)'
            ${EndIf}
          ${EndIf}
        ${EndIf}
        System::Call 'kernel32::CloseHandle(p r6)'
      ${EndIf}
      IntOp $3 $3 + 1
    ${Loop}
  ${EndIf}
  System::Free $0

  Pop $9
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; #419/#812: free Frame's bundled sidecars so their files aren't locked when we overwrite them during
  ; install/update/reinstall. Only processes started from this installation are ended (see above).
  Call FrameEndInstalledSidecars
  Sleep 500
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; v0.1.0 installed its binary as harbor.exe; an in-place update would otherwise leave it behind.
  Delete "$INSTDIR\harbor.exe"
!macroend
