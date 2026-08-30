#!/usr/bin/env bash
#=============================================================================
# setup-server-coexist.sh — 共存部署初始化（OpenCloudOS / CentOS / RHEL 系）
#
# 与 setup-server.sh（Ubuntu 独占整机版）的区别：
#   1. dnf/yum 包管理（非 apt-get）
#   2. 跳过 Node 安装（服务器已有 v22；若缺失会自动装 NodeSource 22.x）
#   3. 跳过防火墙变更（避免误封已运行服务的端口，3000/5432 仅本机监听）
#   4. Nginx 只新增 conf.d/saas.conf，不删除/修改任何现有配置；
#      nginx -t 失败自动删除新文件回滚，保证旧站不受影响；
#      若 Nginx 未 include conf.d（宝塔自建等场景），打印手动步骤后安全退出
#   5. PostgreSQL 未安装时才安装（dnf 源内版本即可，Prisma 支持 PG12+）
#
# 用法：root 执行，可重复（幂等）
#   bash setup-server-coexist.sh
#=============================================================================
set -euo pipefail

#------------------------------- 变量区 --------------------------------------
DB_NAME="${DB_NAME:-saas_prod}"
DB_USER="${DB_USER:-saas}"
DB_PASSWORD="${DB_PASSWORD:-}"          # 留空自动生成
APP_DIR="${APP_DIR:-/opt/saas}"
WEB_DIR="${WEB_DIR:-/var/www/saas-web}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
API_PORT="${API_PORT:-3000}"            # 部署前请确认该端口空闲
NGINX_CONF="${NGINX_CONF:-/etc/nginx/conf.d/saas.conf}"
#-----------------------------------------------------------------------------

log() { echo "==> $*"; }

if [ -z "$DB_PASSWORD" ]; then
  DB_PASSWORD="$(openssl rand -hex 16)"
  echo "（已自动生成数据库密码，见下方摘要，请记录）"
fi

echo "=============================================="
echo " 共存部署初始化 · OpenCloudOS/EL 系"
echo "=============================================="

log "[1/8] 检测端口 ${API_PORT} 是否空闲"
if ss -ltn "( sport = :${API_PORT} )" | grep -q LISTEN; then
  echo "错误：端口 ${API_PORT} 已被占用，请换端口：API_PORT=3001 bash $0" >&2
  exit 1
fi

log "[2/8] 基础依赖（git/openssl）"
dnf install -y git openssl-tools 2>/dev/null || dnf install -y git openssl

log "[3/8] Node.js 检测"
if command -v node >/dev/null 2>&1; then
  echo "Node 已安装：$(node -v)（跳过安装）"
else
  echo "未检测到 Node，安装 NodeSource 22.x ..."
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
  dnf install -y nodejs
fi

log "[4/8] PM2 安装"
command -v pm2 >/dev/null 2>&1 || npm install -g pm2 --registry=https://registry.npmmirror.com

log "[5/8] 部署用户与目录"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
fi
mkdir -p "$APP_DIR" "$WEB_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR" "$WEB_DIR"

log "[6/8] PostgreSQL"
if ! command -v psql >/dev/null 2>&1 && [ ! -d /var/lib/pgsql ]; then
  dnf install -y postgresql-server
  postgresql-setup --initdb 2>/dev/null || /usr/bin/postgresql-setup --initdb
  systemctl enable --now postgresql
  echo "PostgreSQL 已安装并启动：$(psql --version)"
else
  systemctl is-active --quiet postgresql || systemctl enable --now postgresql
  echo "PostgreSQL 已存在：$(su - postgres -c 'psql --version' 2>/dev/null || echo '检测到已有安装')"
fi

# 建库建用户（幂等）
su - postgres -c "psql -v ON_ERROR_STOP=1" <<SQL
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

# 确保仅本机监听（默认即是，显式兜底）
PG_CONF="$(su - postgres -c "psql -tAc 'SHOW config_file;'" 2>/dev/null || true)"
if [ -n "$PG_CONF" ] && grep -qE "^listen_addresses\s*=\s*'\*'" "$PG_CONF"; then
  echo "警告：PostgreSQL 监听所有地址，已改为仅本机"
  sed -i "s/^listen_addresses.*/listen_addresses = 'localhost'/" "$PG_CONF"
  systemctl restart postgresql
fi

log "[7/8] Nginx 站点（共存安全模式）"
if ! command -v nginx >/dev/null 2>&1; then
  echo "错误：未检测到 Nginx（本脚本面向已有 Nginx 的共存场景）" >&2
  echo "请先安装 Nginx 或改用 setup-server.sh" >&2
  exit 1
fi

# 检测 nginx.conf 是否 include conf.d/*.conf
if ! nginx -T 2>/dev/null | grep -qE "conf\.d/\*\.conf"; then
  cat <<BT

------------------------------------------------------------------
检测到当前 Nginx 未加载 /etc/nginx/conf.d/（可能是宝塔自建 Nginx）。
为不影响现有站点，脚本不自动改配置，请手动操作（二选一）：

方案 A · 宝塔面板（推荐）：
  1. 面板 → 网站 → 添加站点：
     域名：saas.你的域名（不要建数据库/FTP）
  2. 站点设置 → 配置文件，替换为 deploy/nginx.conf 内容
     （server_name 改为实际子域名）
  3. 保存（宝塔会自动 reload）

方案 B · 命令行：
  1. 在 /etc/nginx/nginx.conf 的 http{} 内确认或加入：
     include /etc/nginx/conf.d/*.conf;
  2. 重新执行本脚本
------------------------------------------------------------------
BT
  exit 0
fi

cat >"$NGINX_CONF" <<'NGINX'
server {
    listen 80;
    server_name _;

    root /var/www/saas-web;
    index index.html;

    client_max_body_size 20m;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;
    gzip_min_length 1k;

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

if nginx -t 2>/dev/null; then
  systemctl reload nginx
  echo "Nginx 站点已生效：$NGINX_CONF（现有站点未受影响）"
else
  echo "nginx -t 校验失败，自动回滚（删除 $NGINX_CONF），旧配置保持原样"
  rm -f "$NGINX_CONF"
  nginx -t && systemctl reload nginx
  exit 1
fi

log "[8/8] PM2 开机自启（以 ${DEPLOY_USER} 身份）"
sudo -u "$DEPLOY_USER" bash -c 'pm2 startup systemd -u '"$DEPLOY_USER"' --hp /home/'"$DEPLOY_USER"' 2>/dev/null | tail -n 1 | bash 2>/dev/null || true'

cat <<SUMMARY

====================== 共存初始化完成 · 摘要 ======================
数据库：      ${DB_NAME}
数据库用户：  ${DB_USER}
数据库密码：  ${DB_PASSWORD}
DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}?schema=public
API 端口：    ${API_PORT}（仅本机监听，由 Nginx 反代）
代码目录：    ${APP_DIR}      （属主 ${DEPLOY_USER}）
前端目录：    ${WEB_DIR}
Nginx 配置：  ${NGINX_CONF}（server_name 请改为实际子域名后 reload）
==================================================================

下一步：
  1. su - ${DEPLOY_USER}
  2. git clone https://github.com/keepzung/saas.git ${APP_DIR}
  3. 创建 ${APP_DIR}/backend/.env：
       DATABASE_URL 见上方
       JWT_SECRET=<openssl rand -hex 32 生成>
       PORT=${API_PORT}
  4. bash ${APP_DIR}/deploy/deploy.sh
  5. seed:prod 创建管理员（见 DEPLOY.md 第 3 节）
SUMMARY
