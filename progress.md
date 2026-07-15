# Nono 进度记录

## 2026-07-15 Notab 独立管理
- 已确认 Notab 是顶级 Folder，现有 API 足以覆盖更名、排序和递归删除。
- 已按 TDD 增加独立菜单、`/admin/notabs` 路由和浅色磨砂管理页。
- 页面仅显示顶级 Notab，支持行内更名、拖动后显式保存排序、删除前展示递归影响。
- 首次线上窄屏验收发现 Notab 专用列定义压过移动卡片布局；已补回归测试并改为 720px 以下单列卡片。
- 修正后全量验证通过：Server 50 项、Web 98 项、扩展 6 项测试，Nono 生产构建成功。

## 2026-07-15 首页音乐与日程摘要布局
- 已确认音乐播放器与日历使用独立 React 卡片，当前播放器默认在中心卡右下方。
- 已确定拆成独立 `scheduleCard` 配置：播放器左下，日程摘要留在原播放器所在底部区域。
- 已完成失败测试并转绿；日程摘要支持最近一条和未来三天的紧凑主题展示。
- 全量验证通过：Server 50 项、Web 92 项、Nodesk 27 项测试，Nodesk 生产构建成功。
- 日程摘要最终宽度为 420px，并复用原播放器的默认起点；播放器独立对齐左侧导航下方。
- 已推送 `64aed73` 并在 nc48 完成镜像重建与容器启动。

## 2026-07-15 Nodesk 管理边界与首页功能调整
- 已拆分为四个实施面：移除 Nono 后台 Nodesk 嵌入、修复 Avatar、精简首页导航、增加日程日历。
- 已确认 Avatar 的本地写入 API 返回 200，问题重点转向固定 URL 缓存和图片格式处理。
- 已完成失败测试并转绿：后台入口拆除、版本化 Avatar 路径、精简导航和日程契约。
- 首次 Nodesk 构建发现 `calendar-card.tsx` 的 `useMemo` 缺少参数分隔逗号；已按构建定位修正，第二次构建通过。
- 全量测试通过：Server 50 项、Web 92 项、Nodesk 26 项；Nono 与 Nodesk 生产构建均通过。
- 已推送 `5187211` 到 `main` 并部署 nc48，容器健康，现有 3 篇文章完整保留。
- 浏览器验收：Nono 后台无 Nodesk 菜单；Nodesk 导航仅保留近期文章和我的项目；点击日期可打开“管理日程”并显示新增表单。

## 2026-07-15 Nodesk 真正后台一体化
- 用户要求公开地址改为 `/nodesk`。
- 用户明确拒绝仅提供跳转式管理，要求能在 Nono 后台设置的内容直接在后台设置。
- 用户确认部署目标为 VPS，本地持久化后不再需要 GitHub Token。
- 已开始梳理网关、Docker、Blog 管理页面及 GitHub 写入链路。
- 新增范围：合并“新增书签”与“导入导出”菜单和页面。

# 2026-07-15 Nodesk 一体化与新增书签合并

- Nodesk 公共入口迁移至 `/nodesk`，旧 `/blog` 保留 308 重定向。
- Nono 后台直接嵌入 Nodesk 各管理页面，内容写入本地持久化 API，不再要求 GitHub Token 或私钥。
- Docker 新增 `nodesk_content` 命名卷，首次启动自动导入现有内容。
- 后台侧栏移除独立“导入导出”，只保留“新增书签”；新增页面同时包含手动新增、快速添加、浏览器 HTML 导入和导出。
- `/admin/bookmarks` 兼容重定向至 `/admin/add-bookmark`。
- 全量验证通过：服务器 49 项、Web 93 项、Nodesk 24 项测试全部通过，Nono 与 Nodesk 生产构建成功，Docker Compose 配置有效。
- 已推送 `3725b88` 到 `main` 并部署 nc48；容器健康，`/nodesk` 返回 200，旧 `/blog` 返回 308 到 `/nodesk`。
- `nono_nodesk_content` 卷已创建并成功导入 3 个现有文章目录；浏览器验收确认侧栏只保留“新增书签”，同页包含导入导出功能。

## 2026-06-04 Phase 3/4/5
- 用户要求：把阶段 3/4/5 的详细计划写成独立文件，并按计划依次推进阶段 3、4、5 后推送。
- 已读取当前项目结构、Prisma schema、后台 Links/Tokens/Folders/Site/Dashboard/Navigation 相关文件。
- 已创建三个独立方案文件：
  - `docs/superpowers/plans/2026-06-04-admin-link-quality-phase3.md`
  - `docs/superpowers/plans/2026-06-04-admin-token-governance-phase4.md`
  - `docs/superpowers/plans/2026-06-04-public-navigation-polish-phase5.md`
- 阶段 3 已完成并推送：
  - `40bdec6 feat(server): add link health checks`
  - `4441f7e feat(web): add link health workflow`
  - 增加 `POST /api/admin/links/health-check`、Links 页健康检查按钮和结果面板。
  - 验证：`npm.cmd test` 通过；`npm.cmd run build` 通过。
- 阶段 4 已完成并推送：
  - `e195582 feat(server): add token governance summary`
  - `7892244 feat(web): add token governance console`
  - 增加 Token 过期时间校验、`GET /api/admin/tokens/summary`、Token 摘要卡、过期预设和本地撤销。
  - 验证：`npm.cmd test` 通过；`npm.cmd run build` 通过。
- 阶段 5 已完成并推送：
  - `bfb9ca3 feat(web): polish public folder tree search`
  - 增加公开页子文件夹深度变量、父级标签、站内搜索命中数和空状态提示。
  - 验证：`npm.cmd test` 通过；`npm.cmd run build` 通过。
- 阶段 3/4/5 已全部完成，当前 `main` 已推送到 `origin/main`。
- 当前状态：无未完成阶段；阶段 3/4/5 全部完成。

## 2026-06-04 浏览器扩展增强
- 用户要求：扩展增加测试连接、显示 Token 是否过期、选择已有文件夹、保存前提示重复链接，并联动后台链接健康检查。
- 已完成：
  - 后端新增 `GET /api/admin/tokens/current`，用于 Bearer Token 元数据和有效期显示。
  - 扩展设置面板新增“测试连接”，会检查 session、当前 token、文件夹和链接列表。
  - 扩展保存页新增已有文件夹下拉选择和新文件夹输入。
  - 扩展保存前会提示当前 URL 是否已存在。
  - 扩展保存成功后会调用 `/api/admin/links/health-check` 检查新保存链接。
  - 新增 `packages/extension/shared/popup-workflow.js` 和对应测试。
- 验证：`npm.cmd test` 通过；`npm.cmd run build` 通过。

## 2026-05-31
- 已本地部署 `noaul/nono`。
- 因 `3000` 被 `moneypulse-app-1` 占用，Nono Docker 服务映射到 `http://127.0.0.1:3001/`。
- 验证通过：
  - `npm test`：3 个测试通过。
  - `GET /healthz`：返回 `{"ok":true}`。
  - `GET /`：返回 Nono 导航首页。
  - `GET /api/v1/allsiteandlinks/admin`：返回 `code=0`，4 个文件夹。
- 用户要求：参考 iLinks 控制台截图，为项目规划后台管理；要更完善；支持浏览器书签双向导入导出；默认搜索为 Google。
- 已读取当前核心文件：
  - `src/server.js`
  - `src/navigation.js`
  - `src/data.js`
  - `public/index.html`
  - `public/app.js`
  - `public/styles.css`
  - `test/server.test.js`
- 已创建规划文件：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

## 2026-05-31 历史记录：旧版阶段 1-8
- 已创建并切换到分支：`codex/admin-console-bookmarks`。
- 已完成阶段 1-8：
  - 新增 `src/default-state.js`、`src/store.js`、`src/auth.js`、`src/bookmarks-html.js`。
  - 重写 `src/server.js`，支持持久化、认证后台 API、文件夹/书签 CRUD、书签 HTML 导入导出。
  - 重写 `src/navigation.js`，保持公开 API 兼容并返回 Google 搜索配置。
  - 更新公开页 `public/app.js` 和 `public/index.html`，默认 Google 搜索并增加 HTML 转义。
  - 新增 `public/admin.html`、`public/admin.css`、`public/admin.js`。
  - 更新 Docker 持久化：`APP_DATA_DIR=/app/data`，Compose 挂载 `./data:/app/data`。
  - 更新 README，补充后台、Docker、导入导出和搜索配置说明。
- 验证结果：
  - `npm test`：7 个测试全部通过。
  - `node --check`：`src/server.js`、`src/store.js`、`src/bookmarks-html.js`、`public/admin.js`、`public/app.js` 通过。
  - `PORT=3001 docker compose up -d --build`：容器 `nono` 启动并 healthy。
  - `GET /healthz`：返回 `{"ok":true}`。
  - `GET /`：返回首页并包含 Google 搜索文案。
  - `GET /admin`：返回 Nono 控制台。
  - `GET /api/v1/allsiteandlinks/admin`：返回 `code=0; search=google; folders=4`。
  - 浏览器验证：`http://localhost:3001/admin` 可初始化账号、进入总览和书签管理；移动宽度无页面级横向溢出。
- 本地容器中的临时管理员账号：
  - 用户名：`admin`
  - 密码：`nono-admin-2026`
  - 建议在后台“账户”页立即修改。
