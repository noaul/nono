# Nono

Nono 是一个可自托管的个人数字工作台。它把网址导航与智能收藏、Nodesk 内容站、NoMoney 资产管理和 NoStar GitHub Stars 管理放在同一套代码库与部署链路中。

## 项目组成

| 目录 | 技术栈 | 职责 | 数据与认证 |
| --- | --- | --- | --- |
| `packages/server` | Fastify、Prisma、PostgreSQL | Nono API、认证、书签、NoStar API、通知、审计、备份 | Nono Session / API Token；PostgreSQL |
| `packages/web` | Vue 3、Vite、Pinia | 公开导航、登录、管理后台 | Nono Session |
| `packages/extension` | Chrome Manifest V3 | 网页提取、一键收藏、AI 整理 | 专用 Bearer API Token |
| `apps/blog` | Next.js 16、React 19 | Nodesk 文章、图片和日程 | Nono 后台写入内容卷 |
| `apps/nomoney` | Express、React、SQLite | 资产、账单、费用和提醒 | 独立 HttpOnly Cookie 会话 |
| `apps/nostar` | React、Vite | GitHub Stars、Release 和 AI 分析 | Nono Session；PostgreSQL |
| `docker/gateway.mjs` | Node HTTP proxy | 单端口路由和子进程生命周期 | 仅转发受信的代理头 |

生产 Compose 运行两个容器：业务容器包含 Nono、Nodesk、NoMoney 和 NoStar，另一个容器运行 PostgreSQL 16。任一业务子进程退出时，网关会终止业务容器并交由 Compose 重启。

| 路径 | 服务 |
| --- | --- |
| `/`、`/:username`、`/admin/*`、`/api/*` | Nono |
| `/nodesk/*` | Nodesk |
| `/nomoney/*` | NoMoney |
| `/nostar/*`、`/api/nostar/*` | NoStar |
| `/blog/*` | 308 重定向到 `/nodesk/*` |

## 主要能力

- 密码、Passkey、可撤销设备 Session 和可过期 API Token。
- 文件夹、书签、Notab、外观、用户、通知、审计与自动化管理。
- 书签导入导出、重复识别、定时健康检查和重定向地址修复。
- OpenAI / Claude 兼容接口的网页分析和收藏建议。
- Nodesk 文章、图片、站点配置与日程的可视化编辑。
- NoMoney 资产与到期提醒，以及 NoStar GitHub 数据整理。
- PostgreSQL、Nodesk 和 NoMoney 的统一备份、校验、恢复演练与回滚。
- Chrome 扩展弹窗、右键菜单和快捷键收藏。

## 环境要求

- Node.js 22 或更高版本。
- npm 10 或更高版本。
- pnpm 11.8.0，由 `apps/blog/packageManager` 锁定。
- PostgreSQL 16；本地开发可直接使用 Docker Compose。
- Docker Engine 与 Docker Compose v2，仅部署或容器验收需要。

仓库根工作区使用 npm；`apps/blog` 使用独立 pnpm 锁文件；NoMoney 和 NoStar 各自使用 npm 锁文件。不要跨包管理器重写锁文件。

## 本地开发

```bash
npm ci
cp .env.example .env
docker compose up -d postgres
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Nono 前端、Nodesk、NoMoney 和 NoStar 可分别启动：

```bash
npm run dev:web
npm run install:blog && npm run dev:blog
npm run dev:nomoney
npm run dev:nostar
```

默认 API 地址为 `http://127.0.0.1:3000`。首次打开站点时创建管理员；Nono 使用 PostgreSQL 事务锁保证并发部署中只能完成一次初始化，NoMoney 在其单进程 SQLite 部署内串行初始化。`npm run seed` 只用于显式填充演示数据，不属于正常初始化流程。

## 验证与构建

完整验证入口会运行所有单元/契约测试、类型检查、NoStar lint 与 bundle 预算、全部构建、四套依赖审计和插件打包：

```bash
npm run verify:all
```

日常可按修改范围选择：

```bash
npm test                 # Nono server、web、extension
npm run test:gateway     # Docker、网关、部署、备份契约
npm run test:blog
npm run test:nomoney
npm run test:nostar
npm run build:all
npm run audit:all
```

GitHub Actions 对 `main` 推送和 Pull Request 执行同等级门禁，包括 Playwright Chromium smoke 流程。依赖锁文件变更必须同时通过对应的高危漏洞审计。

## 配置

从 `.env.example` 创建本地 `.env`。`.env`、私钥、Token、数据库转储和备份归档不得提交到 Git。

生产必填项：

| 变量 | 说明 |
| --- | --- |
| `POSTGRES_PASSWORD` | PostgreSQL 随机高强度密码 |
| `SESSION_SECRET` | Nono Session 随机长密钥 |
| `ENCRYPTION_KEY` | 64 位十六进制密钥，用于加密集成凭据 |
| `NOMONEY_JWT_SECRET` | NoMoney 独立随机长密钥 |
| `NONO_PUBLIC_URL` | 浏览器实际访问的 HTTPS 根地址 |
| `BLOG_PUBLIC_URL` | Nodesk 的完整 HTTPS 地址，通常为 `<root>/nodesk` |

常用可选项：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CORS_ORIGIN` | 空 | 额外网页 Origin 白名单，逗号分隔 |
| `PRIVATE_OUTBOUND_HOSTS` | 空 | 允许服务端访问的精确私网主机白名单 |
| `GATEWAY_TRUST_FORWARDED_HEADERS` | `false` | 仅在受信反向代理独占容器入口时启用 |
| `APP_BIND_ADDRESS` | `127.0.0.1` | Compose 应用端口监听地址；仅在防火墙和 TLS 边界明确时改为公网地址 |
| `LINK_HEALTH_CHECK_ENABLED` | `true` | 自动链接健康检查 |
| `LINK_HEALTH_CHECK_INTERVAL_HOURS` | `24` | 健康结果过期时间 |
| `TZ` | `Asia/Shanghai` | 备份和日程时区 |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | 由公开 URL 推导 | 特殊反向代理或域名场景下覆盖 |

Compose 会要求数据库密码和应用密钥非空；Nono 还会拒绝默认 Session 密钥及格式错误的加密密钥。示例值不是可用的生产凭据，部署前必须全部替换为独立的随机值。`POSTGRES_PASSWORD` 修改后还需要在已有数据库卷中执行数据库角色密码轮换，不能只改 `.env`。

## 安全边界

当前代码基线包含以下控制：

- 密码使用强度校验和慢哈希；Session 与 API Token 只持久化哈希，Session Cookie 为 `HttpOnly`、`SameSite=Lax`，生产启用 `Secure`。
- 管理写接口执行身份、角色和资源所有权校验；公开导航不会返回密码哈希、LLM Key 或链接健康内部详情。
- Helmet 安全头与 CSP 禁止第三方脚本、对象嵌入和页面框架嵌入；CORS 使用显式网页白名单并支持 Chrome 扩展来源。
- 登录与首次初始化按客户端限流；请求体限制为 2 MiB；认证写操作进入脱敏审计日志。
- LLM、链接检查、WebDAV、代理等服务端出站请求会解析 DNS、阻止私网/回环/metadata 地址，并在每次重定向后重新校验。
- Nodesk 写入执行路径规范化、临时文件落盘和原子替换；备份恢复校验归档路径、校验和与允许的备份 ID。
- 容器启动时仅用 root 初始化持久化卷，数据库迁移和业务进程使用专用 `nono` 用户运行。
- 浏览器插件只允许 HTTPS 服务地址；本地开发例外仅限 `localhost`、`127.0.0.1` 和 `::1`。

运维仍需承担以下边界：

- TLS 必须由 Caddy、Nginx 或同等级反向代理终止；公网不得直接暴露 PostgreSQL 或未加密的应用端口。
- `PRIVATE_OUTBOUND_HOSTS` 会放宽指定主机的 SSRF 边界，只应使用精确、受控的主机名或 IP。
- 备份卷与生产卷在同一主机时不能覆盖整机故障；应将备份加密后同步到异机或对象存储，并定期恢复演练。
- 一体化业务容器是单一故障域；高可用场景需要拆分服务、集中 Session/任务锁并重新设计卷访问。
- NoMoney 使用单进程 SQLite 文件存储，不支持多个进程或多个容器共享同一个数据卷。
- Chrome 扩展需要广泛网页读取权限来提取当前页面；应使用专用、短有效期 Token，并在设备丢失或停用插件时立即撤销。

发现安全问题时请不要在公开 Issue 中粘贴凭据、用户数据或可直接利用的攻击细节。先撤销相关 Token/Session、保存脱敏日志，再通过仓库维护者的私有渠道报告。

## Docker 部署

```bash
cp .env.example .env
# 填写所有生产必填密钥和 HTTPS 公网地址
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/healthz
```

Compose 使用四个命名卷：

| 卷 | 内容 |
| --- | --- |
| `nono_pg_data` | Nono 与 NoStar PostgreSQL 数据 |
| `nodesk_content` | Nodesk 文章、图片、配置和日程 |
| `nomoney_data` | NoMoney SQLite 数据 |
| `nono_backups` | 全站备份归档 |

更新部署应使用提交号镜像并执行自动验收和失败回滚，详见 [Compose 验收与回滚](docs/deployment/compose-verified-deploy.md)。不要在普通升级中删除命名卷。

```bash
cd /opt/nono
npm run deploy:compose -- --dir /opt/nono --base-url http://127.0.0.1:8188
npm run deploy:accept -- --base-url http://127.0.0.1:8188
```

全站备份与恢复：

```bash
npm run backup:create
npm run backup:list
npm run backup:verify -- --id <backup-id>
npm run backup:drill -- --id <backup-id>
npm run backup:restore -- --id <backup-id> --confirm <backup-id>
```

恢复命令会修改生产数据，必须先阅读 [全站备份与恢复手册](docs/deployment/full-backup-restore.md)。NoMoney 旧数据切换见 [NoMoney 生产迁移](docs/deployment/nomoney-production-migration.md)，审计字段与保留策略见 [操作审计日志](docs/deployment/audit-logs.md)。

## Passkey

Passkey 只能在 HTTPS 或 `localhost` 上使用，并与域名/RP ID 绑定。部署后在“后台 → 账户设置 → 通行密钥”注册 Windows Hello、Touch ID、Face ID 或硬件安全密钥。修改 `WEBAUTHN_RP_ID` 会使原通行密钥失效，因此必须保留可恢复的密码登录并重新注册。

## 浏览器插件

插件源码版本、Manifest 版本和发布包名由测试强制保持一致。构建与打包：

```bash
npm ci
npm run package:extension
```

输出：

```text
packages/extension/dist/
packages/extension/artifacts/nono-quick-bookmark-chrome-v0.2.2.zip
```

开发安装时在 `chrome://extensions/` 开启开发者模式并加载 `packages/extension/dist`。正式发布前：

1. 同时更新 `packages/extension/package.json` 和 `manifest.json` 的版本。
2. 运行 `npm test -w packages/extension` 和 `npm run package:extension`。
3. 使用 `store-assets/` 中的图标、截图和宣传图更新 Chrome Web Store 条目。
4. 上传 `artifacts/` 中的 ZIP，检查权限说明、隐私披露和版本号后提交审核。
5. 在 Nono 后台创建插件专用的可过期 API Token；不要复用管理员密码或长期 Token。

插件 Token 保存在 `chrome.storage.local`，请求只发往用户配置的 Nono 地址。公网地址必须使用 HTTPS。完整权限、配置和快捷键说明见 [插件文档](packages/extension/README.md)。

## 数据迁移

旧版 `data/nono.json`：

```bash
npm run migrate:json -w packages/server -- data/nono.json
```

旧版 GitHub Stars SQLite 数据应先演练，再正式迁移：

```bash
npm run migrate:nostar -- --sqlite /path/to/data.db --username admin --dry-run
npm run migrate:nostar -- --sqlite /path/to/data.db --username admin
```

迁移前必须创建并验证备份。不要把迁移生成的临时数据库、密钥或日志提交到仓库。

## 维护约定

- 保持 `main` 可部署；行为变更先写回归测试，跨模块契约放在根 `tests/`。
- 只提交源码、迁移、稳定文档、质量基线和明确的发布产物；不要提交过程计划、调试截图、临时备份或本地状态报告。
- 根 npm、Blog pnpm、NoMoney npm 和 NoStar npm 锁文件各自独立维护，依赖升级后运行 `npm run audit:all`。
- Prisma schema 变更必须包含迁移，且部署前验证向前迁移与备份恢复。
- 大型二进制资源优先放对象存储、Git LFS 或 Release 资产，避免持续放大 Git 历史。
- README 记录稳定接口和流程；瞬时 CI、提交号、服务器健康状态应留在发布记录，不写入长期文档。

更多稳定文档：

- [Compose 验收与回滚](docs/deployment/compose-verified-deploy.md)
- [全站备份与恢复](docs/deployment/full-backup-restore.md)
- [NoMoney 生产迁移](docs/deployment/nomoney-production-migration.md)
- [操作审计日志](docs/deployment/audit-logs.md)
- [UI 性能基线](docs/quality/ui-performance-baseline.md)
- [主题资源说明](docs/design/theme-assets.md)
