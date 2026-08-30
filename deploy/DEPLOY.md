# 部署文档（Linux + Nginx + PM2 + 自建 PostgreSQL）

> 适用：Ubuntu 22.04 / 24.04，单机部署
> 架构：浏览器 → Nginx(80/443) → 静态文件(frontend/dist) + 反代 API(127.0.0.1:3000, PM2) → PostgreSQL(本机)

## 目录

1. [本地准备：代码入库](#1-本地准备代码入库)
2. [服务器初始化（一次性）](#2-服务器初始化一次性)
3. [首次部署](#3-首次部署)
4. [域名与 HTTPS](#4-域名与-https)
5. [日常更新与回滚](#5-日常更新与回滚)
6. [备份](#6-备份)
7. [常见问题](#7-常见问题)

---

## 1. 本地准备：代码入库

```bash
cd saas/
git init                      # 本目录此前不是独立仓库，必须初始化
git add .
git commit -m "chore: initial release"
# 在 GitHub/Gitee 新建【私有】仓库后：
git remote add origin <你的私有仓库地址>
git push -u origin main
```

> 已配置 `.gitignore`：`node_modules/ dist/ .env docs/har/ PROGRESS.md` 均不入库。
> **仓库必须私有**（含业务代码；`docs/har/` 含原站会话数据已排除）。

## 2. 服务器初始化（一次性）

```bash
# 本地上传脚本
scp deploy/setup-server.sh root@<服务器IP>:/root/

# 登录服务器执行（可先编辑脚本顶部变量区填数据库密码）
ssh root@<服务器IP>
bash /root/setup-server.sh
```

脚本完成后摘要会输出 `DATABASE_URL`（若自动生成密码请记录）。

接着以部署用户克隆代码并创建生产 `.env`：

```bash
su - deploy
git clone <你的私有仓库地址> /opt/saas

cat > /opt/saas/backend/.env <<'EOF'
DATABASE_URL="postgresql://saas:<数据库密码>@localhost:5432/saas_prod?schema=public"
JWT_SECRET="<openssl rand -hex 32 生成>"
PORT=3000
EOF
chmod 600 /opt/saas/backend/.env
```

## 3. 首次部署

```bash
su - deploy
bash /opt/saas/deploy/deploy.sh
```

脚本自动完成：拉代码 → 后端 npm ci → `prisma migrate deploy` → build → PM2 启动 → 前端 build → 发布到 `/var/www/saas-web`。

**创建生产管理员（仅首次，环境变量传参，不落盘）：**

```bash
cd /opt/saas/backend
PROD_ADMIN_PHONE=<管理员手机号> \
PROD_ADMIN_PASSWORD='<强密码>' \
PROD_COMPANY_NAME='<公司名>' \
npm run seed:prod
```

> `seed:prod` 只创建：模块树、公司、管理员、默认品牌。**不含演示数据**，且幂等可重跑。

验证：

```bash
curl -s -o /dev/null -w '%{http_code}\' http://127.0.0.1/                      # 200
curl -s http://127.0.0.1/api/agency-api/brand/myList                           # {"code":401,...} 即正常
```

浏览器访问 `http://<服务器IP>`，用管理员账号登录。

## 4. 域名与 HTTPS

```bash
# 1. DNS：A 记录 <域名> -> <服务器IP>（国内服务器需完成 ICP 备案）

# 2. 服务器上修改 nginx 站点的 server_name
sed -i 's/server_name _;/server_name <你的域名>;/' /etc/nginx/sites-available/saas
nginx -t && systemctl reload nginx

# 3. 签发证书（自动改写 nginx 配置并加 443）
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d <你的域名> --redirect
```

> Let's Encrypt 90 天有效，certbot 已自动配 systemd 定时续期。
> 验证续期：`certbot renew --dry-run`

## 5. 日常更新与回滚

**更新**（本地 push 后）：

```bash
su - deploy
bash /opt/saas/deploy/deploy.sh
```

**回滚**（回到上一次发布）：

```bash
cd /opt/saas
git reflog                       # 找到上一个 commit hash
git reset --hard <hash>
bash /opt/saas/deploy/deploy.sh
```

**重启后端 / 查看日志：**

```bash
pm2 restart saas-api
pm2 logs saas-api --lines 100
```

## 6. 备份

```bash
# root 身份配置每日 03:00 备份，保留 30 天
(crontab -l 2>/dev/null; echo '0 3 * * * /bin/bash /opt/saas/deploy/backup.sh >> /var/log/saas-backup.log 2>&1') | crontab -

# 恢复示例：
# sudo -u postgres pg_restore -d saas_prod --clean --if-exists /var/backups/saas/saas_prod_<时间戳>.dump
```

建议：另配 `scp`/`rclone` 将 `/var/backups/saas` 异地同步（OSS/S3）。

## 7. 常见问题

| 现象 | 排查 |
|------|------|
| 页面 502 | `pm2 ls` 后端是否 online；`pm2 logs saas-api` |
| 登录 401/数据库错误 | 检查 `/opt/saas/backend/.env` 的 DATABASE_URL；`sudo -u postgres psql -c '\l'` |
| 刷新 404 | Nginx 缺 `try_files`（核对 sites-available/saas） |
| API 404 且带 Nginx 字样 | `location /api/` 未生效，`nginx -t && systemctl reload nginx` |
| 前端更新不生效 | 强刷（Ctrl+F5）；核对 `/var/www/saas-web/assets` 文件时间戳 |
| 端口被占 | `ss -ltnp \| grep 3000`，`pm2 delete saas-api && pm2 start dist/main.js --name saas-api` |

---

### 安全清单（上线前自查）

- [ ] `.env` 权限 600，`JWT_SECRET`/数据库密码非开发默认值
- [ ] 云安全组仅放行 22/80/443（5432 不对外）
- [ ] Git 仓库为私有
- [ ] 管理员密码为强密码且未写入任何文件
- [ ] crontab 备份已配置并验证过一次恢复
