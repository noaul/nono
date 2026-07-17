# NoStar

NoStar 是并入 Nono 的 GitHub Stars 工作台，提供 Star 仓库同步、AI 分析、分类、语义搜索、Release 追踪、项目发现、WebDAV 备份、网络代理和 aria2 远程下载。

[English](README.md)

## 一体化架构

- 同域名路径为 `/nostar`。
- 复用 Nono Session；未登录时跳转到 `/login?next=/nostar`。
- 仓库、Release、分类和配置全部按 Nono 用户隔离，通过 Prisma 存入 PostgreSQL。
- GitHub Token、AI Key、WebDAV 密码、代理密码和 aria2 密钥统一使用 Nono 的 `ENCRYPTION_KEY` 加密。
- NoStar AI 配置也可以在 Nono 后台的 LLM 页面管理。
- 生产镜像同时包含 Nono、Nodesk、NoMoney 和 NoStar，不需要额外运行 NoStar 容器或 SQLite 服务。

## 本地开发

在仓库根目录运行：

```bash
npm install
npm run dev
npm run dev:nostar
```

Vite 开发服务通过 `/api/nostar` 调用后端。用户数据接口要求浏览器已有有效的 Nono 登录会话。

测试和构建：

```bash
npm run test:nostar
npm run build:nostar
```

## Docker 部署

在仓库根目录构建并启动完整 Nono：

```bash
docker compose up -d --build
```

访问：

```text
http://127.0.0.1:3000/nostar
```

业务容器启动前会自动执行 Prisma migration。NoStar 与 Nono 共用 PostgreSQL 和加密密钥。

## 旧 SQLite 数据迁移

把已有 GithubStars `data.db` 迁入指定 Nono 用户：

```bash
npm run migrate:nostar -- --sqlite /path/to/data.db --username admin --dry-run
npm run migrate:nostar -- --sqlite /path/to/data.db --username admin
```

脚本会自动读取 SQLite 数据库同目录的 `.encryption-key`，也支持 `--source-key <64-hex>`。正式迁移前会生成带时间戳的数据库备份，并通过幂等 upsert 写入 PostgreSQL。

## 技术栈

- React、TypeScript、Vite、Tailwind CSS、Zustand
- Fastify、Prisma、PostgreSQL
- Nono Cookie Session SSO
- 单镜像 Docker 部署

导入的上游项目继续遵循 MIT 许可证，见 [LICENSE](LICENSE)。
