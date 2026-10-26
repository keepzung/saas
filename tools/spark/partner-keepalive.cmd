@echo off
rem 数据源会话本地保活计划任务入口 (每天 08:50 / 20:50)
rem 第一步 partner (特斯拉盯盘/聚光), 第二步 专业号 (KOS/线索)
cd /d "%~dp0"
echo ===== %date% %time% keepalive round start ===== >> "%~dp0keepalive-local.log"
"C:\Program Files\nodejs\node.exe" partner-keepalive-local.cjs >> "%~dp0keepalive-local.log" 2>&1
"C:\Program Files\nodejs\node.exe" pro-keepalive-local.cjs >> "%~dp0keepalive-local.log" 2>&1
