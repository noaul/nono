# NoDesk

NoDesk 是 NoNo 的自托管个人桌面，包含日程、任务、桌宠、备份中心和实用工具。项目、图片、朋友、分享、片段及关于页面保留独立管理入口，使用 NoNo 管理员会话与服务器本地内容存储。

## 开发

在仓库根目录运行：

```sh
pnpm install:nodesk
pnpm dev:nodesk
```

独立开发服务默认位于 `http://localhost:2025`。运行 `pnpm --dir apps/nodesk check` 执行测试、类型检查和生产构建。

## 部署

推荐在仓库根目录运行 `docker compose up -d --build`，通过 `http://localhost:3000/nodesk` 访问。NoDesk 与 NoNo 共用业务容器及管理员会话；PostgreSQL 独立运行，NoDesk 内容保存在持久化卷中。

`NEXT_PUBLIC_BASE_PATH=/nodesk` 设置集成路径，`NEXT_PUBLIC_SITE_URL` 设置站点规范地址，`NEXT_PUBLIC_NONO_URL` 设置返回网址导航的默认地址。环境变量示例见 `.env.example`。

现有服务器内容随持久化卷保留。朋友、图片、项目、分享、片段和关于页面的仓库 JSON 与图片仅作为初始内容。

## Android

NoNo Android 应用中，桌面面板支持系统返回操作。本地备份通过协商后的原生下载能力交给系统文件选择器保存；浏览器和不支持下载能力的客户端继续使用网页下载。
