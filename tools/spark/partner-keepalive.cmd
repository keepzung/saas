@echo off
rem partner 会话本地保活计划任务入口 (由 Windows 计划任务每 12 小时调用)
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" partner-keepalive-local.cjs >> "%~dp0keepalive-local.log" 2>&1
