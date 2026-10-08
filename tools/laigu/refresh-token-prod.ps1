# 来鼓 token 每日刷新（计划任务调用）：本机登录来鼓后台抓新 token → 推送生产
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\Ning\Desktop\马克听\saas\tools\laigu'

Write-Output ("[{0}] laigu token refresh start" -f (Get-Date -Format s))
node laigu-login-token.cjs
if ($LASTEXITCODE -ne 0) { Write-Output 'login script failed'; exit 1 }

$token = (Get-Content state\laigu-token-latest.txt -Raw -ErrorAction SilentlyContinue).Trim()
if (-not $token) { Write-Output 'no token captured'; exit 1 }

scp -o BatchMode=yes state\laigu-token-latest.txt root@marketineok.com:/tmp/laigu-token.txt
if ($LASTEXITCODE -ne 0) { Write-Output 'scp failed'; exit 1 }
ssh -o BatchMode=yes root@marketineok.com "node /opt/saas/tools/laigu-push-token.cjs; rm -f /tmp/laigu-token.txt"
Write-Output ("[{0}] laigu token refresh done" -f (Get-Date -Format s))
