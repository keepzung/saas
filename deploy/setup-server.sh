#!/usr/bin/env bash
#=============================================================================
# setup-server.sh — 服务器一次性初始化（Ubuntu 22.04 / 24.04，root 执行）
# 作用：安装 Node 22 / PostgreSQL / Nginx / PM2，创建数据库与部署用户，配置防火墙
# 幂等：可重复执行
#
# 用法：
#   1. 将本文件上传到服务器（scp deploy/setup-server.sh root@<IP>:/root/）
#   2. （建议）编辑下方变量区，填入数据库密码；留空则自动生成随机密码
#   3. bash setup-server.sh
#=============================================================================
set -euo pipefail

#------------------------------- 变量区 --------------------------------------
DB_NAME="${DB_NAME:-saas_prod}"
DB_USER="${DB_USER:-saas}"
DB_PASSWORD="${DB_PASSWORD:-}"          # 留空自动生成
APP_DIR="${APP_DIR:-/opt/saas}"         # 代码目录
WEB_DIR="${WEB_DIR:-/var/www/saas-web}" # 前端静态文件目录
DEPLOY_USER="${DEPLOY_USER:-deploy}"
#-----------------------------------------------------------------------------

echo "==> [1/8] 系统更新与基础依赖"
apt-get update -y
apt-get install -y curl git nginx postgresql postgresql-contrib ufw

if [ -z "$DB_PASSWORD" ]; then
  DB_PASSWORD="$(openssl rand -hex 16)"
  echo "================================================"
  echo " 已自动生成数据库密码（请立即记录）："
  echo " ${DB_PASSWORD}"
  echo "================================================"
fi

echo "==> [2/8] 安装 Node.js 22 LTS（NodeSource）"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2-3)" != "22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> [3/8] 安装 PM2"
npm install -g pm2 --registry=https://registry.npmmirror.com || npm install -g pm2

echo "==> [4/8] 创建部署用户 ${DEPLOY_USER}"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
fi
mkdir -p "$APP_DIR" "$WEB_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR" "$WEB_DIR"

echo "==> [5/8] 初始化 PostgreSQL 数据库"
systemctl enable --now postgresql
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL
# 确保仅监听本机（Ubuntu 默认即是，显式确认）
PG_CONF="$(sudo -u postgres psql -tAc 'SHOW config_file;')"
if grep -qE "^listen_addresses\s*=\s*'\*'" "$PG_CONF"; then
  echo "警告：PostgreSQL 监听了所有地址，已改为仅本机，请重启 postgresql"
  sed -i "s/^listen_addresses.*/listen_addresses = 'localhost'/" "$PG_CONF"
  systemctl restart postgresql
fi

echo "==> [6/8] Nginx 站点配置"
cat >/etc/nginx/sites-available/saas <<'NGINX'
server {
    listen 80;
    server_name _;

    root /var/www/saas-web;
    index index.html;

    # 上传体积（批量导入等场景）
    client_max_body_size 20m;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;
    gzip_min_length 1k;

    # 前端静态资源长缓存（Vite 产物带 hash）
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # 后端 API 反向代理（保留 /api/agency-api 前缀）
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # Vue Router history 模式回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # index.html 禁缓存：避免发版后旧分片 404 白屏
    location = /index.html {
        add_header Cache-Control "no-cache";
    }
}
NGINX
ln -sf /etc/nginx/sites-available/saas /etc/nginx/sites-enabled/saas
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
systemctl enable nginx

echo "==> [7/8] 防火墙（仅放行 22 / 80 / 443）"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
echo "y" | ufw enable >/dev/null 2>&1 || true

echo "==> [8/8] PM2 开机自启（以部署用户身份）"
sudo -u "$DEPLOY_USER" bash -c 'pm2 startup systemd -u '"$DEPLOY_USER"' --hp /home/'"$DEPLOY_USER"' 2>/dev/null | tail -n 1 | bash 2>/dev/null || true'

cat <<SUMMARY

====================== 初始化完成 · 摘要 ======================
数据库：      ${DB_NAME}
数据库用户：  ${DB_USER}
数据库密码：  ${DB_PASSWORD}
DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}?schema=public
代码目录：    ${APP_DIR}      （属主 ${DEPLOY_USER}）
前端目录：    ${WEB_DIR}
==============================================================

下一步：
  1. 用 ${DEPLOY_USER} 用户克隆代码到 ${APP_DIR}
  2. 创建 ${APP_DIR}/backend/.env（参考上方 DATABASE_URL，JWT_SECRET 用 openssl rand -hex 32）
  3. 执行 bash ${APP_DIR}/deploy/deploy.sh
SUMMARY
