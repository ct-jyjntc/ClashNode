; ClashNode NSIS custom hooks — kill leftover processes & helper service on install/uninstall.

!macro customInit
  ; Stop Helper service if present (ignore errors)
  nsExec::ExecToLog 'sc stop ClashNodeHelperService'
  nsExec::ExecToLog 'taskkill /F /IM ClashNode.exe /T'
  nsExec::ExecToLog 'taskkill /F /IM ClashNodeHelperService.exe /T'
  nsExec::ExecToLog 'taskkill /F /IM mihomo.exe /T'
  nsExec::ExecToLog 'taskkill /F /IM mihomo-windows-amd64.exe /T'
  nsExec::ExecToLog 'taskkill /F /IM mihomo-windows-arm64.exe /T'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'sc stop ClashNodeHelperService'
  nsExec::ExecToLog 'sc delete ClashNodeHelperService'
  nsExec::ExecToLog 'taskkill /F /IM ClashNodeHelperService.exe /T'
  nsExec::ExecToLog 'taskkill /F /IM mihomo.exe /T'
  ; Best-effort: remove firewall rules created by elevate.ts
  nsExec::ExecToLog 'powershell -NoProfile -Command "Get-NetFirewallRule -DisplayName ''ClashNode mihomo*'' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue"'
!macroend
