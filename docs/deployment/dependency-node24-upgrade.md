# 依赖升级与 Node 24

生产应用的所有构建阶段和运行阶段使用 `node:24-alpine`。PostgreSQL 使用 18，应用内备份客户端也使用 18；已有 PostgreSQL 16 实例必须按 [升级手册](postgres-18-upgrade.md) 迁移，不能直接运行普通 Compose 部署。旧数据库卷和经过验证的升级前安全快照保留供回退。

## 兼容性调整

- NoNo 使用 Prisma 7 的 PostgreSQL 驱动适配器和生成客户端。`prisma.config.ts` 保存迁移连接配置，Docker 启动命令显式传入该配置。适配器保留 5 秒连接超时，避免数据库不可达时就绪检查无限等待。
- Prisma 7 不再自动加载 `.env`。本地迁移命令需显式加载环境文件，具体命令见 README。生成客户端之后才能测试或构建服务端。
- 服务端、NoDesk、NoMoney 使用 TypeScript 7。NoNo Vue 前端保留 TypeScript 5.9.3，因为 `vue-tsc` 需要 TypeScript JavaScript 编译器 API；NoStar 使用 TypeScript 7.0.2 原生编译器执行类型检查，并通过 `typescript` 别名保留 TypeScript 6.0.3 的 JavaScript API 供 ESLint 使用。NoStar 的类型检查命令显式调用原生编译器，避免两个包的同名 `tsc` 安装顺序影响结果。根锁文件同时保留这些编译器，使用各工作区自身的构建命令，避免通过全局编译器覆盖它们。
- Vue 图标包迁移为 `@lucide/vue`。Lucide 1 移除了品牌图标，应用保留原先使用的 GitHub 图形。
- NoMoney 适配 Express 5、Zod 4、React 19 和 Recharts 3。NoMoney 和 NoStar 迁移至 Tailwind 4，并保留旧版页面使用的间距、颜色和边框行为。
- NoDesk 的 `brace-expansion` 安全覆盖仅作用于 5.x，避免把 `minimatch` 所需的 2.x 强行替换成不兼容的 5.x。

## 验证与运行环境

开发验证使用 Node 24.15 或更高的 24.x 版本，按四套独立锁文件安装后运行 `npm run verify:all`。NoMoney 另运行 `npm --prefix apps/nomoney run lint`；真实数据库集成测试只允许使用显式指定的临时数据库。

部署脚本使用宿主机 Node 的内置模块，不需要在服务器安装应用的开发依赖。服务器如果仍运行旧版 Node，可以把 Node 24 安装在独立工具目录，并在部署时加入 `PATH`，应用运行时则由镜像提供。

NoDesk 的 Cloudflare 构建会产出 `.open-next/worker.js`，但 OpenNext 当前仍报告三个依赖复制警告，Cloudflare Worker 运行时尚未验证。nc48 使用 Docker 中的 Next.js standalone 服务，不使用这份 Worker 包。
