rem WARNING: this file MUST stay GBK/ANSI encoded - do NOT resave as UTF-8 (cmd.exe would mangle Chinese lines)
@echo off
rem Ã¿ÈÕÊÖ¹¤µÇÂ¼Àı³Ì (½¨ÒéÃ¿Ìì 21:00 ×óÓÒÔËĞĞ, ÓÉµ±ÖµÈËÔ±Ö´ĞĞ; À­ÊıÔÚÁè³¿ 04:00, Íí¼äµÇÂ¼¿É±£»á»° 7h Áä¸²¸ÇÀ­Êı´°¿Ú)
rem Ë³Ğò: partner -> ×¨ÒµºÅ -> ÈÙÍş -> MDD -> ¶«·ç -> ¸ñÁ¦
rem »á»°»¹»î×ÅÊ±Ç°Á½²½»á¾²Ä¬Í¨¹ı; ËÀÁË²Åµ¯´°µÈ»¬¿é/É¨Âë
rem MCC ËÄ¸öÕËºÅ»á×Ô¶¯ÌîÕËÃÜ, Ö»ĞèÒªÔÚµ¯»¬¿éÊ±ÍÏÒ»ÏÂ; ²»ÒªĞŞ¸ÄÔ¤ÌîµÄÕËºÅÃÜÂë
rem µÇÂ¼Íê³Éºó×Ô¶¯°Ñ cookie ÍÆËÍÉú²ú¿â
cd /d "%~dp0"
set "NODE=C:\Program Files\nodejs\node.exe"
set HEADLESS=0

echo [1/6] partner (ÌØË¹À­¶¢ÅÌ) ...
"%NODE%" partner-keepalive-local.cjs
if errorlevel 2 "%NODE%" partner-keepalive-local.cjs --interactive

echo [2/6] ×¨ÒµºÅ (KOS/ÏßË÷) ...
"%NODE%" pro-keepalive-local.cjs
if errorlevel 2 "%NODE%" pro-keepalive-local.cjs --interactive

set TAG=RW
set BRAND=2
echo [3/6] ÈÙÍş MCC ...
"%NODE%" login.cjs
"%NODE%" push-state-to-prod.cjs RW 2

set TAG=MDD
set BRAND=5
echo [4/6] MDD MCC ...
"%NODE%" login.cjs
"%NODE%" push-state-to-prod.cjs MDD 5

set TAG=DF
set BRAND=7
echo [5/6] ¶«·ç MCC ...
"%NODE%" login.cjs
"%NODE%" push-state-to-prod.cjs DF 7

set TAG=GREE
set BRAND=8
rem ¸ñÁ¦ MCC ×éÖ¯È¨ÏŞÎ´¿ªÍ¨, Ä¬ÈÏÌø¹ı; È¨ÏŞ¿ªÍ¨ºóÉ¾³ıÏÂÃæÕâĞĞ rem set SKIP_GREE=1É»Ö¸´
set SKIP_GREE=1
if defined SKIP_GREE (
  echo [6/6] ¸ñÁ¦ MCC - È¨ÏŞÎ´¿ªÍ¨, Ìø¹ı
) else (
  echo [6/6] ¸ñÁ¦ MCC ...
  "%NODE%" login.cjs
  "%NODE%" push-state-to-prod.cjs GREE 8
)

echo ===== Ã¿ÈÕµÇÂ¼Àı³ÌÍê³É, cookie ÒÑ×Ô¶¯ÍÆËÍÉú²ú¿â =====
pause

