# Nono

Nono 是一个可自托管的网址导航、后台管理和 AI 智能收藏工具。当前版本已经从零依赖单体 Node.js 应用重构为 monorepo：

- `apps/blog`：Next.js 博客、文章与图片管理
- `apps/nomoney`：NoMoney 资产、账单与提醒管理
- `apps/nostar`：NoStar GitHub Stars 整理、AI 分析与 Release 追踪
- `packages/server`：Fastify + Prisma + PostgreSQL API
- `packages/web`：Vue 3 + Vite + Pinia + Vue Router
- `packages/extension`：Chrome Manifest V3 一键收藏插件

## 功能

- 多用户认证：可撤销设备 Cookie、Passkey 通行密钥、密码与 Bearer API Token
- 管理后台：ChatGPT 网页版风格的总览、站点、Notab、文件夹、书签、自动化、通知、账户与系统设置
- Notab 管理：独立更名、拖动排序和带影响统计的删除确认
- 文件夹图标：紧凑触发器 + 浅白磨砂弹窗，支持搜索、推荐、最近和全部图标
- 自适应后台：内容区随工作区流体铺满，浏览器缩放和宽屏下保持左右对齐
- 浏览器书签：在“自动化 → 导入导出”中预览、筛选并处理 Netscape Bookmark HTML
- 链接健康：持久化检测结果、每日自动补检和重定向地址批量修复
- 统一通知：集中展示个人书签异常、NoStar Release，以及仅管理员可见的 Nodesk 日程、NoMoney 到期项和备份过期提醒
- AI 智能收藏：OpenAI / Claude 分析网页并推荐文件夹
- 公开导航：`/:username`，默认搜索为 Google
- 统一 API 响应：`{ code, data, message }`
- 安全加固：Helmet、CORS、限流、2MB 请求体限制、密码策略、LLM Key 加密
- 一体化 Docker：单个业务镜像内包含 Nono、Nodesk、NoMoney 与 NoStar，外加 PostgreSQL
- 全站备份：统一归档 PostgreSQL、Nodesk 与 NoMoney，带校验和、恢复前快照和失败回滚

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

请先修改 `.env` 里的 `POSTGRES_PASSWORD`、`DATABASE_URL`、`SESSION_SECRET`、`ENCRYPTION_KEY` 和 `NOMONEY_JWT_SECRET`。数据库密码建议使用 `openssl rand -hex 32` 生成，并确保 `DATABASE_URL` 中的密码与 `POSTGRES_PASSWORD` 一致。`ENCRYPTION_KEY` 必须是 64 位十六进制字符串，也可用 `openssl rand -hex 32` 生成；生产环境缺失、格式错误或仍为旧公开默认值时，服务会拒绝启动。PostgreSQL 默认只绑定 `127.0.0.1:5433`，Compose 会启动 PostgreSQL 和一个一体化业务容器。业务镜像直接从本仓库构建全部应用，启动前运行 Prisma migration，再由内置网关统一转发：

```text
Nono: http://127.0.0.1:3000
Nodesk: http://127.0.0.1:3000/nodesk
NoMoney: http://127.0.0.1:3000/nomoney
NoStar: http://127.0.0.1:3000/nostar
```

`docker compose ps` 中只会看到 `nono` 与 `nono-postgres` 两个容器，不再单独运行博客容器，也不再依赖相邻目录或外部 Git 构建上下文。

已有 PostgreSQL 数据卷不能只通过修改 `.env` 完成密码轮换。先进入数据库执行交互式密码修改，再更新 `.env` 中的 `POSTGRES_PASSWORD` 和 `DATABASE_URL`，最后重建业务容器：

```bash
docker compose exec postgres psql -U "${POSTGRES_USER:-nono}" -d "${POSTGRES_DB:-nono}"
\password nono
\q
docker compose up -d --force-recreate postgres app
```

若修改了 `POSTGRES_USER`，将 `\password nono` 中的角色名替换为实际用户名。密码输入过程不会写入 shell 历史；轮换后使用 `docker compose ps` 和 `/healthz` 确认数据库与应用均健康。

正式部署时将 `NONO_PUBLIC_URL` 设置为站点根地址，将 `BLOG_PUBLIC_URL` 设置为 Nodesk 的完整公网地址。站内互跳默认使用同域名相对路径 `/` 与 `/nodesk`，无需绑定服务器 IP：

```text
NONO_PUBLIC_URL=https://example.com
BLOG_PUBLIC_URL=https://example.com/nodesk
NONO_NAVIGATION_URL=/
BLOG_NAVIGATION_URL=/nodesk
```

### 通行密钥

部署后进入“后台 → 账户设置 → 通行密钥”，填写设备名称并调用 Windows Hello、Touch ID、Face ID 或硬件安全密钥完成注册。登录页随后可以直接选择“使用通行密钥”。密码登录会继续保留，作为无法使用原设备时的恢复方式；“登录设备”区域可以单独退出设备或一次退出其他设备。

除 `localhost` 外，WebAuthn 必须运行在 HTTPS 下。`NONO_PUBLIC_URL` 应填写浏览器实际访问的规范地址，例如 `https://noaul.com`。通常无需再设置以下参数；只有站点经过特殊域名代理时才需要覆盖：

```text
WEBAUTHN_RP_NAME=Nono
WEBAUTHN_RP_ID=noaul.com
WEBAUTHN_ORIGIN=https://noaul.com
```

通行密钥与域名绑定。更改 `WEBAUTHN_RP_ID` 后，原有通行密钥将不能用于新域名，需要使用密码登录并重新注册。

首次升级到支持设备会话的版本时，旧版无状态 Cookie 会失效，需要重新登录一次。新会话只在数据库保存随机令牌的 SHA-256 哈希，之后可以从账户页面准确撤销。

`NONO_PUBLIC_URL` 与 `BLOG_PUBLIC_URL` 用于公开站点地址和 Nodesk 元数据；`NONO_NAVIGATION_URL` 与 `BLOG_NAVIGATION_URL` 专门控制两端入口。两端公开页面的中心图片和右上角入口也可以在后台覆盖，后台保存的设置优先。旧 `/blog` 地址会以 308 重定向到 `/nodesk`。

若容器端口仅由同机 Nginx/Caddy 反向代理访问，可设置 `GATEWAY_TRUST_FORWARDED_HEADERS=true`，让登录限流按真实客户端 IP 计算；容器端口直接暴露公网时应保持 `false`。默认 CORS 仅允许 Chrome 扩展来源，若还需独立网页跨域调用，可在 `CORS_ORIGIN` 中填写逗号分隔的完整 Origin 白名单。

服务端发起的自定义 LLM、NoStar AI、WebDAV 和 aria2 请求默认禁止访问回环、私网、链路本地及云 metadata 地址，并会在每次重定向后重新校验。管理员确实需要访问自建内网服务时，可在 `PRIVATE_OUTBOUND_HOSTS` 中填写逗号分隔的精确主机名或 IP，例如 `llm.lan,192.168.1.20`；该白名单不会授予普通用户私网访问权限。NoStar 的 HTTP/SOCKS 代理和 aria2 RPC 配置仅管理员可管理。

书签管理会保存最近一次链接健康结果，并识别可批量更新的重定向地址。生产环境默认每 24 小时补检一次从未检测或已过期的链接，启动后延迟 60 秒执行首轮；可通过 `LINK_HEALTH_CHECK_ENABLED`、`LINK_HEALTH_CHECK_INTERVAL_HOURS` 和 `LINK_HEALTH_CHECK_START_DELAY_SECONDS` 调整。检测请求使用同一套 SSRF 防护和 `PRIVATE_OUTBOUND_HOSTS` 精确白名单，并发数固定为 4。

后台“通知中心”按 Nono 用户保存已读和忽略状态。普通用户只会聚合自己名下的书签健康异常与未读 NoStar Release；管理员还会看到未来三天 Nodesk 日程、前后 30 天 NoMoney 域名/VPS/订阅到期项，以及缺失或超过 72 小时的全站备份。NoMoney 数据通过容器内 `sqlite3 -readonly` 读取固定表和固定字段，不共享 NoMoney 登录凭证，也不会写入资产数据库。

Nodesk 的文章、图片和站点配置由 Nono 后台直接写入本机持久化目录，不再需要 GitHub App、Token 或私钥。Docker 部署会使用 `nodesk_content` 命名卷保存内容；首次启动会导入镜像内现有内容，后续重建容器不会覆盖该卷。请勿在升级时删除此卷。

NoMoney 使用独立的 `nomoney_data` 命名卷保存 SQLite 数据。已有 MoneyPulse 数据迁移、生产切换和回滚步骤见 [NoMoney 部署迁移手册](docs/deployment/nomoney-production-migration.md)。

Compose 更新部署可使用提交号镜像、部署后路由/NoStar 分块验收和自动回滚，见 [Compose 验收与回滚部署](docs/deployment/compose-verified-deploy.md)。

管理员可以在“后台 → 备份与恢复”创建、下载和删除全站备份。服务器端创建、校验、恢复与恢复失败回滚命令见 [全站备份与恢复手册](docs/deployment/full-backup-restore.md)。备份保存在独立的 `nono_backups` 命名卷，重建业务容器不会删除。

NoStar 使用 Nono Session 登录，仓库、Release、分类和配置按 Nono 用户隔离并存入 PostgreSQL。GitHub Token、AI Key、WebDAV 密码、代理密码和 aria2 密钥使用 Nono 的 `ENCRYPTION_KEY` 加密；NoStar AI 配置也可在 Nono 后台的 LLM 页面管理。

## 旧数据迁移

旧版 `data/nono.json` 可以迁移到 PostgreSQL：

```bash
npm run migrate:json -w packages/server -- data/nono.json
```

旧版密码哈希不可逆，迁移脚本会为迁移用户设置临时密码，默认是 `Password2026!`。可以通过 `MIGRATED_ADMIN_PASSWORD` 覆盖。

旧 GithubStars SQLite 数据可迁入指定 Nono 用户。先执行演练，确认统计后再去掉 `--dry-run`；正式迁移会自动备份源数据库：

```bash
npm run migrate:nostar -- --sqlite /path/to/data.db --username admin --dry-run
npm run migrate:nostar -- --sqlite /path/to/data.db --username admin
```

迁移脚本会自动读取数据库同目录的 `.encryption-key`。也可使用 `--source-key <64-hex>` 显式传入旧密钥。

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
