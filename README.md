# Nono

Nono 是一个可自托管的网址导航、后台管理和 AI 智能收藏工具。当前版本已经从零依赖单体 Node.js 应用重构为 monorepo：

- `apps/blog`：Next.js 博客、文章与图片管理
- `apps/nomoney`：NoMoney 资产、账单与提醒管理
- `packages/server`：Fastify + Prisma + PostgreSQL API
- `packages/web`：Vue 3 + Vite + Pinia + Vue Router
- `packages/extension`：Chrome Manifest V3 一键收藏插件

## 功能

- 多用户认证：Cookie session + Bearer API Token
- 管理后台：站点配置、Notab、文件夹、链接、用户、Token、LLM 设置
- Notab 管理：独立更名、拖动排序和带影响统计的删除确认
- 文件夹图标：紧凑触发器 + 浅白磨砂弹窗，支持搜索、推荐、最近和全部图标
- 自适应后台：内容区随工作区流体铺满，浏览器缩放和宽屏下保持左右对齐
- 浏览器书签：Netscape Bookmark HTML 导入和导出
- AI 智能收藏：OpenAI / Claude 分析网页并推荐文件夹
- 公开导航：`/:username`，默认搜索为 Google
- 统一 API 响应：`{ code, data, message }`
- 安全加固：Helmet、CORS、限流、2MB 请求体限制、密码策略、LLM Key 加密
- 一体化 Docker：单个业务镜像内包含 Nono、Nodesk 与 NoMoney，外加 PostgreSQL

## 本地开发

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

前端开发服务：

```bash
npm run dev:web
```

博客首次开发前安装其锁定依赖：

```bash
npm run install:blog
npm run dev:blog
```

默认访问：

```text
http://127.0.0.1:3000/
http://127.0.0.1:3000/admin
```

## 生产构建

```bash
npm run build
npm start
```

生产模式下 Fastify 会托管 `packages/web/dist`，并对非 API 路由提供 SPA fallback。

## Docker 部署

```bash
cp .env.example .env
docker compose up -d --build
```

请先修改 `.env` 里的 `SESSION_SECRET`、`ENCRYPTION_KEY` 和 `NOMONEY_JWT_SECRET`。`ENCRYPTION_KEY` 必须是 64 位十六进制字符串，可用 `openssl rand -hex 32` 生成；生产环境缺失、格式错误或仍为旧公开默认值时，服务会拒绝启动。Compose 会启动 PostgreSQL 和一个一体化业务容器。业务镜像直接从本仓库构建三套应用，启动前运行 Prisma migration，再由内置网关统一转发：

```text
Nono: http://127.0.0.1:3000
Nodesk: http://127.0.0.1:3000/nodesk
NoMoney: http://127.0.0.1:3000/nomoney
```

`docker compose ps` 中只会看到 `nono` 与 `nono-postgres` 两个容器，不再单独运行博客容器，也不再依赖相邻目录或外部 Git 构建上下文。

正式部署时将 `NONO_PUBLIC_URL` 设置为站点根地址，将 `BLOG_PUBLIC_URL` 设置为 Nodesk 的完整公网地址。站内互跳默认使用同域名相对路径 `/` 与 `/nodesk`，无需绑定服务器 IP：

```text
NONO_PUBLIC_URL=https://example.com
BLOG_PUBLIC_URL=https://example.com/nodesk
NONO_NAVIGATION_URL=/
BLOG_NAVIGATION_URL=/nodesk
```

`NONO_PUBLIC_URL` 与 `BLOG_PUBLIC_URL` 用于公开站点地址和 Nodesk 元数据；`NONO_NAVIGATION_URL` 与 `BLOG_NAVIGATION_URL` 专门控制两端入口。两端公开页面的中心图片和右上角入口也可以在后台覆盖，后台保存的设置优先。旧 `/blog` 地址会以 308 重定向到 `/nodesk`。

若容器端口仅由同机 Nginx/Caddy 反向代理访问，可设置 `GATEWAY_TRUST_FORWARDED_HEADERS=true`，让登录限流按真实客户端 IP 计算；容器端口直接暴露公网时应保持 `false`。默认 CORS 仅允许 Chrome 扩展来源，若还需独立网页跨域调用，可在 `CORS_ORIGIN` 中填写逗号分隔的完整 Origin 白名单。

Nodesk 的文章、图片和站点配置由 Nono 后台直接写入本机持久化目录，不再需要 GitHub App、Token 或私钥。Docker 部署会使用 `nodesk_content` 命名卷保存内容；首次启动会导入镜像内现有内容，后续重建容器不会覆盖该卷。请勿在升级时删除此卷。

NoMoney 使用独立的 `nomoney_data` 命名卷保存 SQLite 数据。已有 MoneyPulse 数据迁移、生产切换和回滚步骤见 [NoMoney 部署迁移手册](docs/deployment/nomoney-production-migration.md)。

## 旧数据迁移

旧版 `data/nono.json` 可以迁移到 PostgreSQL：

```bash
npm run migrate:json -w packages/server -- data/nono.json
```

旧版密码哈希不可逆，迁移脚本会为迁移用户设置临时密码，默认是 `Password2026!`。可以通过 `MIGRATED_ADMIN_PASSWORD` 覆盖。

## 浏览器插件

构建插件：

```bash
npm run build -w packages/extension
```

开发安装：在 Chrome 扩展管理页开启“开发者模式”，选择“加载已解压的扩展程序”，打开 `packages/extension/dist`。

打包安装文件：

```text
packages/extension/nono-quick-bookmark-chrome-v0.2.1.zip
```

插件设置中填入 Nono 服务地址和后台创建的 API Token。插件会自动读取当前网页并记住上次使用的文件夹；可在弹窗中选择“Notab → 文件夹”后收藏，也可通过右键菜单直接保存到上次文件夹。AI 整理仅在需要时手动触发。更完整的安装、权限和快捷键说明见 `packages/extension/README.md`。
