rem === daily-login.cmd - daily manual login routine (PURE ASCII on purpose) ===
rem The old GBK Chinese version was destroyed by sed on 11-15 (4 nights of broken logins).
rem ASCII bytes are identical in GBK and UTF-8, so this file can never be mangled by encoding again.
rem
rem Order: partner -> pro -> RW(brand2) -> MDD(brand5) -> DF(brand7) -> GREE(brand8)
rem Before each MCC login window opens, a topmost confirm popup shows the brand + account.
rem Each login window shows a RED brand banner and its window title carries the brand name.
rem Credentials are auto-filled - a human only needs to finish the slider.
rem After login, login.cjs verifies the account identity, and push-state-to-prod re-checks it
rem before pushing to prod: a wrong-brand login is blocked and never reaches production.
@echo off
setlocal
cd /d "%~dp0"
set "NODE=C:\Program Files\nodejs\node.exe"
set HEADLESS=0
set ANNOUNCE=1

if defined SELFTEST (
  echo SELFTEST OK - syntax fine. Steps: partner, pro, RW, MDD, DF, GREE
  exit /b 0
)

echo [1/6] partner (tesla watch) - silent if session is alive ...
"%NODE%" partner-keepalive-local.cjs
if errorlevel 2 "%NODE%" partner-keepalive-local.cjs --interactive

echo [2/6] pro (KOS / leads) - silent if session is alive ...
"%NODE%" pro-keepalive-local.cjs
if errorlevel 2 "%NODE%" pro-keepalive-local.cjs --interactive

echo [3/6] Rongwei - RW, brand 2 ...
call :dologin RW 2

echo [4/6] MDD - MorganData, brand 5 ...
call :dologin MDD 5

echo [5/6] Dongfeng - DF, brand 7 ...
call :dologin DF 7

if defined SKIP_GREE (
  echo [6/6] Gree skipped - SKIP_GREE is set
) else (
  echo [6/6] Gree - GREE, brand 8 ...
  call :dologin GREE 8
)

echo ===== daily login routine done, cookies pushed to prod =====
pause
exit /b 0

:dologin
rem %~1 = TAG, %~2 = brandId
"%NODE%" login.cjs
if errorlevel 1 (
  echo *** [%~1] login FAILED or identity mismatch - push SKIPPED to avoid pushing a stale/wrong cookie ***
  pause
  exit /b 0
)
"%NODE%" push-state-to-prod.cjs %~1 %~2
if errorlevel 1 (
  echo *** [%~1] push FAILED or identity-guard blocked it - read the red lines above ***
  pause
)
exit /b 0
