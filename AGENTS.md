# AGENTS.md — AI 会话项目约定

任何 AI 编码会话（Claude Code / opencode / Cursor 等）在本仓库工作前必须阅读并遵守本文件。

## 🚨 部署纪律（强制，违反会造成生产事故）

生产服务器：`marketineok.com`（腾讯云，PM2 + Nginx + PostgreSQL 本机）。

1. **一切部署 / 重启 / PM2 操作必须以 `root` 执行**：
   ```bash
   ssh root@marketineok.com
   bash /opt/saas/deploy/deploy.sh          # 标准部署入口（拉代码→迁移→构建→重启→发布）
   ```
2. **禁止以 `deploy` 用户部署**，禁止设置 `PM2_HOME=/home/deploy/.pm2`——
   会产生第二个 PM2 实例与 root 实例互抢 3000 端口。
   历史事故：saas-api 崩溃循环数千次、部署 EACCES 反复失败（2026-10 多次）。
   如发现 deploy 侧双实例：`PM2_HOME=/home/deploy/.pm2 pm2 kill`。
3. 修改代码后本地 `git push`，服务器以 root 执行 `deploy.sh` 完成发布。
   不要在服务器上直接改文件。
4. root 跑 git 如报 dubious ownership：
   `git config --global --add safe.directory /opt/saas`

## 生产环境速记

- 数据库：`saas_prod`（本机 PostgreSQL），本地开发库为 `saas`
- 工作区 brandId：2 荣威 / 4 大众 / 5 Morgandada / 6 特斯拉 / **7 东风奕境** / 8 格力
- 后端全局前缀 `/api/agency-api`；鉴权头为自定义 `token`（非 Authorization）
- LLM（内容工厂 AI 生成）：生产 `.env` 已配智谱 `glm-4-flash`；
  Spark/聚光/来鼓同步依赖 `sparkOrgConfig.cookie`（MCC 会话），
  失效时用 `tools/spark/mcc-login-headed.cjs` 有头登录恢复
- 工具脚本在 `tools/spark/`（MCC 登录、头像/封面回填等）
