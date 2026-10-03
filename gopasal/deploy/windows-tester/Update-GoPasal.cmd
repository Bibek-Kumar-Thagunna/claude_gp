@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-GoPasal.ps1" -ForceUpdate
if errorlevel 1 pause
