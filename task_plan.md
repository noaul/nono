# Nono 后台管理与书签导入导出计划

## 2026-06-04 后续阶段 3/4/5
状态：complete

本轮目标：在 Phase 1/2 已完成并直接推送 `main` 的基础上，继续把后台从“能管理”推进到“可运营、可治理、前台体验一致”。

计划文件：
- `docs/superpowers/plans/2026-06-04-admin-link-quality-phase3.md`
- `docs/superpowers/plans/2026-06-04-admin-token-governance-phase4.md`
- `docs/superpowers/plans/2026-06-04-public-navigation-polish-phase5.md`

阶段：
- 阶段 3：链接健康巡检。状态：complete
- 阶段 4：Token 安全治理。状态：complete
- 阶段 5：前台树形导航与搜索体验。状态：complete

完成结果：
- 三个阶段的计划文件已写入 `docs/superpowers/plans/`。
- 阶段 3、4、5 的功能、测试契约和进度记录均已提交并推送到 `origin/main`。
- 最终验证：`npm.cmd test` 与 `npm.cmd run build` 均通过。

执行约束：
- 用户已明确要求以后直接推送 `main`，因此本轮不创建功能分支。
- 每个阶段按 TDD 红绿循环推进，阶段完成后提交并推送。
- 不改 Prisma schema，避免当前机器上 `prisma generate` 阻塞风险。

## 目标
把 Nono 从一个只读的静态导航 MVP，升级为可本地自托管的完整导航工作台：有公开导航页、后台管理、持久化数据、账号保护、浏览器书签 HTML 双向导入导出，并默认使用 Google 搜索。

## 产品参考
- 后台整体参考 iLinks 控制台：顶部品牌栏、左侧侧边栏、右侧工作区、浅色高密度表单与表格。
- 页面范围参考截图：总览、导航配置、文件夹、书签管理、进阶功能、账户。
- 移动端参考截图：后台入口、布局开关、导出入口，保持大触控区和简洁设置项。

## 技术原则
- 保留当前项目轻量特性：优先使用 Node.js 原生 HTTP、原生 `node:test`、原生 Web API 和文件持久化。
- 不引入构建链，除非后续功能复杂度超过原生 JS 可维护边界。
- 后端数据落在 `data/nono.json`，Docker 挂载 `./data:/app/data`，避免镜像重建丢数据。
- 认证用 Node `crypto.scrypt` 做密码哈希，HMAC 签名 Cookie 做会话。
- 浏览器书签兼容 Netscape Bookmark HTML 格式，导入和导出都覆盖 Chrome/Edge/Firefox 常见格式。

## 数据模型

### Site
- `name`
- `description`
- `slug`
- `backgroundMode`: `image | color`
- `backgroundImage`
- `mobileBackgroundImage`
- `backgroundColor`
- `fontColor`
- `searchEngine`: 默认 `google`
- `searchUrlTemplate`: 默认 `https://www.google.com/search?q={query}`
- `localSearchFirst`: 默认 `true`

### Folder
- `id`
- `parentId`
- `name`
- `icon`
- `description`
- `passwordHash`
- `passwordHint`
- `sortOrder`
- `createdAt`
- `updatedAt`

### Link
- `id`
- `folderId`
- `name`
- `url`
- `icon`
- `description`
- `sortOrder`
- `createdAt`
- `updatedAt`

### AdminUser
- `username`
- `displayName`
- `passwordHash`
- `passwordSalt`
- `createdAt`
- `updatedAt`

## 阶段 1：持久化与数据服务
状态：complete

任务：
- 创建 `src/store.js`：读取、写入、迁移 `data/nono.json`，使用临时文件加 rename 做原子保存。
- 创建 `src/default-state.js`：把当前 `src/data.js` 的种子数据转成新结构。
- 修改 `src/navigation.js`：从 store 获取公开导航数据，保持 `/api/v1/allsiteandlinks/:username` 响应兼容。
- 增加测试：首次启动会生成默认数据；旧公开 API 仍返回站点、文件夹、链接。

验收：
- `npm test` 通过。
- 删除 `data/nono.json` 后启动服务，会自动生成默认数据。
- 现有首页 `/` 和 `/api/v1/allsiteandlinks/admin` 不破。

## 阶段 2：默认 Google 搜索与公开页优化
状态：complete

任务：
- 修改 `public/app.js`：站内命中仍滚动定位；站内无命中时使用 `site.searchUrlTemplate`。
- 修改默认配置：默认搜索引擎为 Google。
- 修改 `public/index.html` placeholder：改成“搜索站内链接，回车 Google”。
- 给链接渲染加基础转义，避免后台输入内容破坏 HTML。

验收：
- 输入不存在的关键词会跳到 `https://www.google.com/search?q=关键词`。
- API 返回的 `site_info` 包含搜索配置。
- 首页仍可加载当前 4 个文件夹与 12 个链接。

## 阶段 3：认证与后台 API
状态：complete

任务：
- 创建 `src/auth.js`：密码哈希、校验、签名 Cookie、登录状态读取。
- 扩展 `src/server.js` 路由：
  - `GET /admin`
  - `POST /api/admin/login`
  - `POST /api/admin/logout`
  - `GET /api/admin/session`
  - `GET /api/admin/state`
  - `PUT /api/admin/site`
  - `POST /api/admin/folders`
  - `PUT /api/admin/folders/:id`
  - `DELETE /api/admin/folders/:id`
  - `POST /api/admin/links`
  - `PUT /api/admin/links/:id`
  - `DELETE /api/admin/links/:id`
  - `PUT /api/admin/reorder`
- 首次运行没有管理员密码时，允许从后台初始化账号。

验收：
- 未登录访问管理 API 返回 401。
- 初始化账号后可登录、退出、恢复会话。
- 文件夹和书签 CRUD 会持久化到 `data/nono.json`。

## 阶段 4：后台 UI 骨架
状态：complete

任务：
- 新增 `public/admin.html`、`public/admin.js`、`public/admin.css`。
- 建立 iLinks 风格布局：
  - 顶栏：Logo、站点名、公告/状态、查看主页、退出。
  - 侧栏：总览、导航配置、文件夹、书签管理、导入导出、账户。
  - 主区：卡片式但不套卡片，表单和表格高密度布局。
- 移动端：侧栏收为顶部/底部切换导航，按钮触控尺寸不小于 40px。

验收：
- `/admin` 未登录显示登录/初始化界面。
- 登录后显示后台壳、总览统计、导航入口。
- 桌面 1920px 和移动 390px 宽度不重叠、不横向溢出。

## 阶段 5：文件夹与书签管理
状态：complete

任务：
- 文件夹页：
  - 新增文件夹。
  - 编辑图标、名称、密码、提示语。
  - 删除前显示影响的书签数量。
  - 支持上移/下移排序。
- 书签页：
  - 新增书签。
  - 按文件夹筛选。
  - 行内编辑名称、URL、图标、描述、归属文件夹。
  - 删除、预览打开、上移/下移排序。
- 总览页展示文件夹数、书签数、最近更新、导入导出入口。

验收：
- 后台增删改排序后，公开页刷新立即体现。
- URL 必须是 `http://` 或 `https://`。
- 空状态和错误状态都有明确反馈。

## 阶段 6：浏览器书签 HTML 双向导入导出
状态：complete

任务：
- 创建 `src/bookmarks-html.js`：
  - `parseBookmarksHtml(html)`：解析 Netscape Bookmark HTML。
  - `exportBookmarksHtml(state)`：导出 Chrome/Edge/Firefox 可导入的 HTML。
- 导入策略：
  - 顶层 `<H3>` 映射为文件夹。
  - 嵌套文件夹保留 `parentId`。
  - `<A HREF>` 映射为书签。
  - `ICON` 或 `ICON_URI` 保存为图标信息；没有则留空。
  - 重复 URL 默认跳过，并在导入结果里报告。
- 导出策略：
  - 输出 `<!DOCTYPE NETSCAPE-Bookmark-file-1>`。
  - 按文件夹层级输出 `<DL><p>`。
  - 保留 `ADD_DATE`、`LAST_MODIFIED`。
- 后台导入导出页：
  - 上传 `.html`。
  - 导入前预览数量：新增文件夹、新增书签、重复跳过。
  - 导出按钮下载 `nono-bookmarks.html`。

验收：
- Chrome/Edge 导出的书签 HTML 可以导入 Nono。
- Nono 导出的 HTML 可以再导入 Chrome/Edge。
- 测试覆盖嵌套文件夹、重复 URL、空文件夹、特殊字符。

## 阶段 7：账户与配置完善
状态：complete

任务：
- 账户页：改密码、显示当前登录状态、重置初始化令牌提示。
- 导航配置页：站点名、简介、背景图/纯色、文字颜色、搜索引擎、Google 搜索模板。
- 增加发布地址设置：默认当前 host，可手动覆盖。
- README 更新：本地运行、Docker 持久化、导入导出说明。

验收：
- 修改站点配置后公开页无需重启即可生效。
- 修改搜索模板后公开页按新模板跳转。
- README 能让新用户从零启动并完成导入。

## 阶段 8：验证、打磨与交付
状态：complete

任务：
- 扩展 `test/server.test.js`，覆盖公开页、管理 API、认证、书签导入导出。
- 跑 `npm test`。
- 跑 `docker compose up -d --build`。
- 验证：
  - `GET /healthz`
  - `GET /`
  - `GET /admin`
  - `GET /api/v1/allsiteandlinks/admin`
- 使用浏览器检查桌面与移动视觉。

验收：
- 所有测试通过。
- Docker 容器 healthy。
- 后台可完成从导入书签到公开页展示的完整闭环。

## 推荐执行顺序
1. 阶段 1 和 2 先做，稳定数据层和公开页搜索。
2. 阶段 3 和 4 搭出能登录的后台壳。
3. 阶段 5 完成日常管理能力。
4. 阶段 6 专注书签 HTML 兼容，单独测试。
5. 阶段 7 和 8 做配置、文档、视觉和验证。

## 暂不做
- 多用户权限系统。
- Google OAuth 登录。
- 云同步。
- 图标在线抓取服务。
- 拖拽排序；第一版用上移/下移，后续再加拖拽。
