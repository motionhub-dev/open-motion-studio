!ifdef BUILD_UNINSTALLER
  !define OMS_PROCESS_CHECK "un.OmsCheckProcesses"
!else
  !define OMS_PROCESS_CHECK "OmsCheckProcesses"
!endif

!macro customHeader
  ; The NSIS stub is x86, so PROCESSENTRY32W occupies 556 bytes.
  Function ${OMS_PROCESS_CHECK}
    Exch $0 ; 0 = detect, 1 = terminate
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    Push $6
    Push $7
    Push $8
    Push $9

    StrCpy $9 0
    GetFullPathName $1 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    System::Call 'kernel32::CreateToolhelp32Snapshot(i 2, i 0) p.r2'
    StrCmp $2 -1 done
    System::Alloc 556
    Pop $3
    System::Call '*$3(i 556)'
    System::Call 'kernel32::Process32FirstW(p r2, p r3) i.r4'
    ${While} $4 != 0
      System::Call '*$3(i,i,i.r5,i,i,i,i,i,i,&w260.r7)'
      ${If} $7 == "${APP_EXECUTABLE_FILENAME}"
        ; Hold the same process handle while checking its path and terminating it.
        StrCpy $8 4096 ; PROCESS_QUERY_LIMITED_INFORMATION
        ${If} $0 == 1
          IntOp $8 $8 | 1 ; PROCESS_TERMINATE
        ${EndIf}
        System::Call 'kernel32::OpenProcess(i r8, i 0, i r5) p.r6'
        ${If} $6 == 0
        ${AndIf} $0 == 1
          System::Call 'kernel32::OpenProcess(i 4096, i 0, i r5) p.r6'
        ${EndIf}
        ${If} $6 != 0
          StrCpy $8 ${NSIS_MAX_STRLEN}
          System::Call 'kernel32::QueryFullProcessImageNameW(p r6, i 0, w .r7, *i r8) i.r8'
          ${If} $8 != 0
          ${AndIf} $7 == $1
            StrCpy $9 1
            ${If} $0 == 1
              System::Call 'kernel32::TerminateProcess(p r6, i 0)'
            ${EndIf}
          ${EndIf}
          System::Call 'kernel32::CloseHandle(p r6)'
        ${EndIf}
      ${EndIf}
      System::Call 'kernel32::Process32NextW(p r2, p r3) i.r4'
    ${EndWhile}
    System::Free $3
    System::Call 'kernel32::CloseHandle(p r2)'

    done:
    StrCpy $0 $9
    Pop $9
    Pop $8
    Pop $7
    Pop $6
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Exch $0
  FunctionEnd
!macroend

!macro customCheckAppRunning
  ${If} ${isUpdated}
    Sleep 1000
  ${EndIf}
  Push 0
  Call ${OMS_PROCESS_CHECK}
  Pop $R0
  ${If} $R0 == 1
    ${IfNot} ${isUpdated}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK close_oms
      SetErrorLevel 2
      Quit
    ${EndIf}
    close_oms:
    DetailPrint "$(appClosing)"
    Push 1
    Call ${OMS_PROCESS_CHECK}
    Pop $R0
    StrCpy $R1 0
    ${Do}
      Sleep 500
      Push 0
      Call ${OMS_PROCESS_CHECK}
      Pop $R0
      IntOp $R1 $R1 + 1
    ${LoopWhile} $R0 == 1
    ${AndIf} $R1 < 6
    ${If} $R0 == 1
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY close_oms
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  !insertmacro UAC_GetIntegrityLevel $0
  ${If} $0 < 8192 ; SECURITY_MANDATORY_MEDIUM_RID
    ${If} $LANGUAGE == 2052 ; Simplified Chinese
      MessageBox MB_OK|MB_ICONSTOP "Windows 以低完整性级别启动了安装程序。请将安装包复制到普通文件夹（如“文档”），再运行副本。" /SD IDOK
    ${Else}
      MessageBox MB_OK|MB_ICONSTOP "Windows started this installer with low integrity. Copy it to a regular folder, such as Documents, and run the copy." /SD IDOK
    ${EndIf}
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend
