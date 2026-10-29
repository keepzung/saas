rem WARNING: this file MUST stay GBK/ANSI encoded - do NOT resave as UTF-8 (cmd.exe would mangle Chinese lines)
@echo off
rem 每日手工登录例程 (建议每天 21:00 左右运行, 由当值人员执行; 拉数在凌晨 04:00, 晚间登录可保会话 7h 龄覆盖拉数窗口)
rem 顺序: partner -> 专业号 -> 荣威 -> MDD -> 东风 -> 格力
rem 会话还活着时前两步会静默通过; 死了才弹窗等滑块/扫码
rem MCC 四个账号会自动填账密, 只需要在弹滑块时拖一下; 不要修改预填的账号密码
rem 登录完成后自动把 cookie 推送生产库
cd /d "%~dp0"
set "NODE=C:\Program Files\nodejs\node.exe"
set HEADLESS=0

echo [1/6] partner (特斯拉盯盘) ...
"%NODE%" partner-keepalive-local.cjs
if errorlevel 2 "%NODE%" partner-keepalive-local.cjs --interactive

echo [2/6] 专业号 (KOS/线索) ...
"%NODE%" pro-keepalive-local.cjs
if errorlevel 2 "%NODE%" pro-keepalive-local.cjs --interactive

set TAG=RW
set BRAND=2
echo [3/6] 荣威 MCC ...
"%NODE%" login.cjs
"%NODE%" push-state-to-prod.cjs RW 2

set TAG=MDD
set BRAND=5
echo [4/6] MDD MCC ...
"%NODE%" login.cjs
"%NODE%" push-state-to-prod.cjs MDD 5

set TAG=DF
set BRAND=7
echo [5/6] 东风 MCC ...
"%NODE%" login.cjs
"%NODE%" push-state-to-prod.cjs DF 7

set TAG=GREE
set BRAND=8
rem 格力 MCC 组织权限未开通, 默认跳过; 权限开通后删除下面这行 set SKIP_GREE=1 即可恢复
set SKIP_GREE=1
if defined SKIP_GREE (
  echo [6/6] 格力 MCC - 权限未开通, 跳过
) else (
  echo [6/6] 格力 MCC ...
  "%NODE%" login.cjs
  "%NODE%" push-state-to-prod.cjs GREE 8
)

echo ===== 每日登录例程完成, cookie 已自动推送生产库 =====
pause

