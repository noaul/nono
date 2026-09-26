# NoNo

[简体中文](README.md) · [English](README_EN.md)

<p align="center"><img src="design/icons/nono-duo-512.png" width="96" height="96" alt="NoNo"></p>

NoNo 是一个可自托管的个人数字工作台，将网址导航、内容站、个人资产、服务器与域名、GitHub Stars 放在同一域名下。适合个人及少量可信用户使用。

## 产品与入口

| 产品 | 入口 | 主要功能 | 账号与存储 |
| --- | --- | --- | --- |
| **NoNo** | `/`、`/admin` | 公开导航、树形文件夹、书签搜索与整理、导入导出、回收站、链接检查 | NoNo 账号；PostgreSQL |
| **NoDesk** | `/nodesk` | 文章、图片、项目、友链、片段、日程与首页工作台 | 编辑复用 NoNo 管理员登录；文件卷 |
| **NoMoney** | `/nomoney` | 电话卡、订阅、账号、支出统计、到期与邮件提醒 | 独立账号；SQLite |
| **Yumi** | `/yumi` | VPS、域名、续费记录、费用、状态监控 | 独立账号；SQLite |
| **NoStar** | `/nostar` | GitHub Stars 同步、分类、搜索、README、Release、AI 分析 | 复用 NoNo 登录；PostgreSQL |
| **Chrome 扩展** | 浏览器弹窗、右键菜单 | 提取当前网页、AI 辅助整理、快速保存书签 | NoNo 专用 API Token |

NoNo 支持密码、Passkey、设备会话管理、限权 API Token，以及站点和文件夹访问密码。NoNo 与 NoStar 可配置 OpenAI/Claude 兼容服务；调用第三方 AI 时，待分析内容会发送到所配置的服务。

主要使用入口：

- **书签与文件夹**：后台“书签”统一管理；NoTab 用于导航分组。
- **账户设置**：密码、Passkey、API Token、LLM 配置、登录设备；管理员另有“用户与注册”。
- **备份与自动备份**：NoDesk 设置中心，支持当前账户的模块备份、本地下载与 WebDAV。
- **外观**：中英文、明暗模式及精简后的布局、字体、背景、场景设置；同域应用共享部分浏览器偏好。

旧的独立用户、LLM、Token 和文件夹管理入口已合并；音乐卡片和剪藏功能已退出当前版本。自助注册页面已移除，管理员开启注册后仍可通过 API 创建普通用户。NoMoney、Yumi 的账号彼此独立，也不会随 NoNo 登录自动登录。

## 快速开始

完整体验推荐 Docker Compose。需要 Docker Engine、Compose v2、Git；镜像内使用 Node.js 22 和 PostgreSQL 16。

```bash
git clone https://github.com/noaul/nono.git
cd nono
cp .env.example .env
```

编辑 `.env`，替换全部 `replace-with-*` 示例值。使用独立随机密钥；可用 `openssl rand -hex 32` 每次生成一份。关键配置如下：

| 配置 | 用途 |
| --- | --- |
| `POSTGRES_PASSWORD` | PostgreSQL 密码；建议十六进制，避免连接 URL 转义问题 |
| `SESSION_SECRET` | NoNo 会话密钥，至少 32 个字符 |
| `BOOTSTRAP_TOKEN` | 首次创建管理员所需的独立令牌 |
| `ENCRYPTION_KEY` | NoNo 敏感配置加密密钥，64 位十六进制 |
| `NOMONEY_JWT_SECRET`、`YUMI_JWT_SECRET` | 两个产品各自的独立登录密钥 |
| `NOMONEY_INTERNAL_TOKEN` | 产品间受保护接口的独立令牌 |
| `NOMONEY_ENCRYPTION_KEY`、`YUMI_ENCRYPTION_KEY` | 各自的 64 位十六进制加密密钥；建议分别生成 |
| `NONO_PUBLIC_URL` | 浏览器访问 NoNo 的实际地址 |
| `BLOG_PUBLIC_URL` | 同域 NoDesk 地址，通常为 `https://example.com/nodesk` |
| `PORT` | Compose 端口绑定，默认 `127.0.0.1:3000` |

仅在本机 HTTP 试用时，使用 `NONO_PUBLIC_URL=http://localhost:3000`、`BLOG_PUBLIC_URL=http://localhost:3000/nodesk`，并将 `NOMONEY_COOKIE_SECURE`、`YUMI_COOKIE_SECURE` 设为 `false`。生产环境使用 HTTPS，并保持这两个值为 `true`。

```bash
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/readyz
```

打开 `http://localhost:3000/setup`，填写 `BOOTSTRAP_TOKEN` 并创建第一个管理员。之后可添加书签、配置站点、设置 AI，以及为扩展创建独立 Token。NoMoney 与 Yumi 分别在各自页面初始化账号。

注册默认关闭。运行时注册开关以数据库中的配置为准，在“账户设置 → 用户与注册”修改；修改 `.env` 不会覆盖已保存的配置。`ALLOW_REGISTRATION` 仅参与直接运行服务时的初始配置，当前 Compose 不传入此变量。

停止使用 `docker compose down`。**不要在普通升级中使用 `down -v`，它会删除数据卷。**

## 架构与数据

一个应用容器运行网关、NoNo API、NoDesk、NoMoney 和 Yumi；NoStar 静态资源及 API 由 NoNo 提供。网关按路径转发，同域入口无需分别暴露内部服务端口。PostgreSQL 使用独立容器。

| 数据卷 | 内容 |
| --- | --- |
| `nono_pg_data` | NoNo、NoStar、用户、会话、Passkey、审计与系统配置 |
| `nodesk_content` | NoDesk 内容、图片与站点配置 |
| `nomoney_data` | NoMoney SQLite 数据库 |
| `yumi_data` | Yumi SQLite 数据库 |
| `nono_backups` | 整站备份、清单及部署安全快照 |

NoMoney/Yumi 使用 `sql.js` 持久化 SQLite 文件，同一个数据卷不能运行多个写入实例。本项目的默认部署不提供多节点高可用。

加密密钥必须随数据长期保存：更换密钥会导致已有密文无法读取。更换会话密钥会使既有登录失效；修改 `.env` 中的数据库密码不会修改已有 PostgreSQL 卷内的角色密码。

## 生产部署与升级

将仓库放在 `/opt/nono` 等受控目录，保留服务器本地 `.env`。应用和数据库绑定回环地址，由反向代理提供公网 HTTPS。确保公网 URL 与实际域名一致；Passkey 还依赖正确的 `WEBAUTHN_RP_ID` 和 `WEBAUTHN_ORIGIN`。

首次部署可使用上面的 Compose 命令。后续升级推荐使用带备份和验收的脚本；宿主机需安装 Node.js 22 及 `flock`。以下例子对应 `.env` 中的 `PORT=127.0.0.1:8188`：

```bash
cd /opt/nono
flock -n /var/lock/nono-deploy.lock node scripts/deploy-compose.mjs \
  --dir /opt/nono --base-url http://127.0.0.1:8188
```

脚本默认从 `origin/main` 快进拉取；部署已经核验的本地提交时使用 `--skip-pull`。镜像按 Git 提交标记，部署前应确认源码已提交且工作树干净。

升级依次构建镜像、检查数据库迁移、停止应用写入、创建并验证完整安全快照、在隔离端口验收、在维护状态下切回正式端口，最后开放访问。构建期间旧版本继续服务，切换期间可能短暂连接失败或返回 503。破坏性迁移会被阻止，需先审核 SQL 和恢复方案。

验收当前部署：

```bash
node scripts/accept-deployment.mjs --base-url http://127.0.0.1:8188
docker compose ps
```

`/healthz` 是存活检查；`/readyz` 还检查数据库、NoDesk 内容及 NoMoney/Yumi。仅收到首页 200 不能替代完整验收。

部署脚本在开放访问前失败时会尝试恢复；开放后不能任意回退数据，以免丢失新写入。仅镜像回滚不等于数据库回滚。详细步骤见 [Compose 部署与恢复手册](docs/deployment/compose-verified-deploy.md)。

## 备份与恢复

区分两种备份：

- **账户模块备份**：NoDesk 设置中心操作，可选 NoNo、NoDesk、NoMoney、Yumi、NoStar，支持本地文件、WebDAV 和定时计划。任务在后台执行，网络断开后应先查看原任务状态。
- **整站灾难恢复备份**：服务器侧操作，覆盖 PostgreSQL 和全部应用数据卷，包括账号与会话。

```bash
npm run backup:create
npm run backup:list
npm run backup:verify -- --id BACKUP_ID
npm run backup:drill -- --id BACKUP_ID
```

演练使用临时数据库和目录。真正恢复会覆盖生产数据，需要明确的备份 ID，并与部署共用操作锁：

```bash
flock -n /var/lock/nono-deploy.lock npm run backup:restore -- \
  --dir /opt/nono --base-url http://127.0.0.1:8188 \
  --id BACKUP_ID --confirm BACKUP_ID
```

整站归档本身没有额外加密，不包含 `.env`、证书和反向代理配置。请单独保存密钥，并将备份加密复制到异机。部署安全快照存放在备份卷的 `deployment-safety` 子目录，与常规保留策略分开。

完整说明见 [备份与恢复手册](docs/deployment/full-backup-restore.md)。历史数据迁移见 [NoMoney 迁移](docs/deployment/nomoney-production-migration.md) 和 [Yumi 拆分迁移](docs/deployment/yumi-split-migration.md)。

## 本地开发与测试

需要 Node.js 22+、npm、NoDesk 使用的 pnpm（版本见 `apps/blog/package.json`），以及 PostgreSQL。根目录 npm workspaces 只包含 `packages/*`；三个 `apps/*` 项目分别保留锁文件。

```bash
npm run install:all
npm run prisma:generate
```

仅开发 NoNo 可先运行 `npm ci`。为本地数据库填写 `.env` 的 `DATABASE_URL`，保持它与 `POSTGRES_PASSWORD` 一致，然后：

```bash
docker compose up -d postgres
npx prisma migrate dev --schema packages/server/prisma/schema.prisma
PORT=3000 node --env-file=.env --import tsx packages/server/src/server.ts
```

另开终端运行 `npm run dev:web`，访问 `http://localhost:5173`。Vite 默认代理 API 到 `127.0.0.1:3000`。注意 Compose 的 `PORT` 含绑定地址，直接运行 Node 服务时应覆盖为纯数字。涉及 NoDesk、NoMoney、Yumi 的集成功能推荐用 Compose 验证。

| 命令 | 用途 |
| --- | --- |
| `npm test` | NoNo API、Web、扩展测试 |
| `npm run test:blog` | NoDesk 测试 |
| `npm run test:nomoney` | NoMoney/Yumi 前后端测试 |
| `npm run test:nostar` | NoStar 测试 |
| `npm run test:gateway` | 网关、部署、备份与恢复契约测试 |
| `npm run build:all` | 全部产品构建 |
| `npm run test:e2e` | Playwright 桌面与移动端测试 |
| `npm run audit:all` | 各依赖树漏洞审计 |
| `npm run verify:all` | 测试、类型检查、构建、E2E、审计与扩展打包 |

首次运行浏览器测试前执行 `npm run test:e2e:install`。E2E 中的模拟 API 测试不能替代真实数据库集成测试或部署验收。

## Chrome 扩展

```bash
npm run build -w packages/extension
npm run package:extension
```

在 `chrome://extensions/` 开启开发者模式，加载 `packages/extension/dist`。在 NoNo 账户设置创建专用 Token，再在扩展填写服务地址和 Token；公网地址必须使用 HTTPS。

扩展仅在主动操作时读取当前页，按配置的精确 Origin 申请服务访问权限。建议每台设备使用独立、可过期的 Token，所需权限为 `bookmarks:read`、`bookmarks:write`、`ai:analyze`。

更多信息见 [扩展说明](packages/extension/README.md) 与 [商店发布说明](packages/extension/CHROME_WEB_STORE.md)。

## 安全与运行边界

- 浏览器会话使用 HttpOnly Cookie；服务端检查权限、资源归属与跨站写入来源。Session 和 API Token 仅保存哈希。
- 出站请求默认限制私网地址，并验证重定向目标；跨域跳转不会继续发送请求正文中的敏感数据。使用重定向的 AI/WebDAV 服务时，优先填写最终地址。
- `PRIVATE_OUTBOUND_HOSTS` 会放宽指定主机的访问限制，只添加自己控制且确实需要的主机。
- 代理头默认不受信任。启用 `GATEWAY_TRUST_FORWARDED_HEADERS` 时，同时配置可信代理地址，避免客户端伪造来源。
- 保护 `.env`、Docker socket、备份和日志；不要向公网暴露 PostgreSQL 或未加密的管理入口。
- 应用升级不能替代密钥管理、依赖审计和异机恢复演练。不要把凭据、数据库副本或真实用户数据提交到仓库。

## 常见问题

| 现象 | 检查项 |
| --- | --- |
| Compose 提示变量缺失 | `.env` 是否存在，全部占位值是否替换，首次初始化令牌是否配置 |
| 本机 HTTP 下 NoMoney/Yumi 登录后仍回到登录页 | 本地试用的 Secure Cookie 开关；生产环境必须 HTTPS |
| Passkey 无法使用 | HTTPS、访问域名、RP ID、Origin 是否匹配 |
| AI 分析回退到基础结果 | 配置加载状态、连接测试、密钥和模型、最终服务 URL、私网白名单 |
| 升级后数据库无法连接 | 环境密码与已有数据库角色密码是否一致 |
| `/readyz` 返回 503 | `docker compose ps` 与 `docker compose logs --tail=100 app postgres` |
| 设置入口找不到 | 账户能力已集中到“账户设置”，备份入口位于 NoDesk 设置中心 |

## 仓库与文档

```text
packages/server    NoNo/NoStar API、Prisma、认证、备份、后台任务
packages/web       NoNo Vue 前端
packages/extension Chrome 扩展
apps/blog          NoDesk Next.js 内容站
apps/nomoney       NoMoney/Yumi Express + React
apps/nostar        NoStar React 前端
docker             网关与容器入口
scripts            部署、验收、备份、恢复与迁移
tests              E2E、集成与部署契约测试
docs               部署手册、设计约定与质量基线
```

- [共享 UI 契约](docs/design/ui-contract.md) · [外观设置](docs/design/appearance-settings.md)
- [审计日志](docs/deployment/audit-logs.md) · [质量基线](docs/quality/ui-performance-baseline.md)
- [NoMoney](apps/nomoney/README.md) · [NoStar](apps/nostar/README.md)

## 许可与社区

NoStar 基于 [AmintaCCCP/GithubStarsManager](https://github.com/AmintaCCCP/GithubStarsManager) 集成与演进，保留其 [MIT 许可](apps/nostar/LICENSE)。其他第三方信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。仓库目前没有根级 LICENSE，不能据此推定整个项目已授权自由复制、修改或分发。

[GitHub](https://github.com/noaul/nono) · [问题反馈](https://github.com/noaul/nono/issues) · [隐私政策](https://noaul.com/privacy) · [LINUX DO](https://linux.do/)
