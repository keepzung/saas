#!/usr/bin/env bash
#=============================================================================
# deploy.sh — 发布脚本（服务器上以部署用户执行）
# 作用：拉取代码 → 后端依赖/迁移/构建/重启 → 前端依赖/构建/发布到 Nginx 目录
# 可重复执行（日常更新入口）
#
# 用法：
#   bash /opt/saas/deploy/deploy.sh
#=============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/saas}"
BRANCH="${BRANCH:-main}"
WEB_DIR="${WEB_DIR:-/var/www/saas-web}"
PM2_APP="${PM2_APP:-saas-api}"

cd "$APP_DIR"

echo "==> [1/7] 拉取最新代码（${BRANCH}）"
git fetch origin "$BRANCH"
git reset --hard "origin/${BRANCH}"

echo "==> [2/7] 后端依赖"
cd "$APP_DIR/backend"
npm ci --registry=https://registry.npmmirror.com || npm ci

if [ ! -f .env ]; then
  echo "错误：缺少 $APP_DIR/backend/.env，请先创建（参考 .env.example）" >&2
  exit 1
fi

echo "==> [3/7] 数据库迁移（prisma migrate deploy）"
npx prisma migrate deploy

echo "==> [4/7] 后端构建"
npm run build

echo "==> [5/7] 重启后端（PM2: ${PM2_APP}）"
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
else
  pm2 start dist/main.js --name "$PM2_APP"
fi
pm2 save

echo "==> [6/7] 前端依赖与构建"
cd "$APP_DIR/frontend"
npm ci --registry=https://registry.npmmirror.com || npm ci
npm run build

echo "==> [7/7] 发布前端到 ${WEB_DIR}"
mkdir -p "$WEB_DIR"
rm -rf "${WEB_DIR:?}"/*
cp -r dist/* "$WEB_DIR"/

echo ""
echo "发布完成。健康检查："
echo "  curl -s http://127.0.0.1:3000/api/agency-api/brand/myList   # 应返回 401 包络"
echo "  curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1/  # 应返回 200"
pm2 ls
