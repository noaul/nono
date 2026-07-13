# Nono

Nono 是一个可自托管的网址导航、后台管理和 AI 智能收藏工具。当前版本已经从零依赖单体 Node.js 应用重构为 monorepo：

- `apps/blog`：Next.js 博客、文章与图片管理
- `packages/server`：Fastify + Prisma + PostgreSQL API
- `packages/web`：Vue 3 + Vite + Pinia + Vue Router
- `packages/extension`：Chrome Manifest V3 一键收藏插件

## 功能

- 多用户认证：Cookie session + Bearer API Token
- 管理后台：站点配置、文件夹、链接、用户、Token、LLM 设置
- 浏览器书签：Netscape Bookmark HTML 导入和导出
- AI 智能收藏：OpenAI / Claude 分析网页并推荐文件夹
- 公开导航：`/:username`，默认搜索为 Google
- 统一 API 响应：`{ code, data, message }`
- 安全加固：Helmet、CORS、限流、2MB 请求体限制、密码策略、LLM Key 加密
- 一体化 Docker：单个业务镜像内包含导航与博客，外加 PostgreSQL

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

请先修改 `.env` 里的 `SESSION_SECRET` 和 `ENCRYPTION_KEY`。Compose 会启动 PostgreSQL 和一个一体化业务容器。业务镜像直接从本仓库的 `apps/blog` 构建博客，启动前运行 Prisma migration，再由内置网关统一转发：

```text
Nono: http://127.0.0.1:3000
Blog: http://127.0.0.1:3000/blog
```

`docker compose ps` 中只会看到 `nono` 与 `nono-postgres` 两个容器，不再单独运行博客容器，也不再依赖相邻目录或外部 Git 构建上下文。

正式部署时将 `NONO_PUBLIC_URL` 设置为站点根地址，将 `BLOG_PUBLIC_URL` 设置为博客的完整公网地址。站内互跳默认使用同域名相对路径 `/` 与 `/blog`，无需绑定服务器 IP：

```text
NONO_PUBLIC_URL=https://example.com
BLOG_PUBLIC_URL=https://example.com/blog
NONO_NAVIGATION_URL=/
BLOG_NAVIGATION_URL=/blog
```

`NONO_PUBLIC_URL` 与 `BLOG_PUBLIC_URL` 用于公开站点地址和博客元数据；`NONO_NAVIGATION_URL` 与 `BLOG_NAVIGATION_URL` 专门控制两端入口。两端公开页面的中心图片和右上角入口也可以在各自后台覆盖，后台保存的设置优先。

博客后台通过 GitHub App 提交文章与图片时，默认写入当前 `nono` 仓库的 `apps/blog` 目录：

```text
NEXT_PUBLIC_GITHUB_REPO=nono
NEXT_PUBLIC_GITHUB_BRANCH=main
NEXT_PUBLIC_GITHUB_ROOT_PATH=apps/blog
```

GitHub App 必须安装到 `nono` 仓库并拥有 Contents 写权限。

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

在 Chrome 扩展管理页加载 `packages/extension/dist`，填入服务地址和后台创建的 API Token，即可一键分析当前网页并确认保存。
