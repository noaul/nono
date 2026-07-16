# Nono 项目发现

## 2026-07-15 后台缩放宽度发现
- `.workbench-stage > *` 固定 `max-width: 1520px` 且左对齐，主工作区继续随视口变宽。
- 在 2048px CSS 视口下，工作区宽约 1764px，内容宽 1520px，右侧稳定空出约 216px。
- 浏览器缩小页面时 CSS 视口进一步增大，因此空白会被放大，看起来像表单和表格没有对齐。

## 2026-07-15 文件夹图标选择器发现
- 当前新增文件夹直接渲染 12 个 Emoji 按钮和一个手输框，占用接近两排高度。
- 行内编辑又重复了一套 Emoji 网格，存在重复逻辑和样式。
- `FolderGlyph` 已支持语义字符串映射 Lucide 图标，适合扩展为统一注册表并供选择器复用。
- 后台已有 Teleport 确认弹窗和浅色磨砂变量，可沿用同一视觉体系。

## 2026-07-15 后台菜单切换黑屏发现
- 黑屏不是 API 请求慢，而是全局 Vue 路由转场主动把整个 `.app-workbench` 淡到透明。
- `mode="out-in"` 会串行执行约 240ms 离场和 240ms 入场，后台菜单切换因此显得迟缓。
- 透明期间露出的 `body` 使用全局暗色变量 `--bg: #090a0f`，形成明显黑屏。
- 修复前采样可见工作台透明度从 1 降到接近 0；修复后后台路由无转场类且透明度持续为 1。

## 2026-07-15 Notab 独立管理发现
- Notab 沿用现有 `Folder` 数据模型，以 `parentId === null` 表示顶级 Notab，不需要数据库迁移。
- 现有 `PUT /api/admin/folders/:id` 可更名，`PUT /api/admin/folders/reorder` 可对顶级 ID 子集排序，`DELETE /api/admin/folders/:id` 会递归删除子文件夹和书签。
- 新页面需要同时读取文件夹和书签，才能在删除确认中准确展示受影响范围。
- 现有 `SortableList`、`useConfirm`、后台表格和磨砂样式均可复用。

## 2026-07-15 首页音乐与日程摘要布局发现
- `MusicCard` 在 `apps/blog/src/components/music-card.tsx` 中渲染，默认位置当前位于中心卡片右下方，使用 `musicCard.offset` 计算纵向位置。
- `cardStyles` 当前没有独立的日程摘要卡配置；新增 `scheduleCard` 可以让摘要卡和音乐卡独立拖拽、调整尺寸。
- 日程数据已经存在于 `siteContent.calendarEvents`，可按日期筛选今天起未来三天，并取最早的一条作为“最近日程”。
- 首页底部原音乐位置的布局计算可复用为日程摘要默认位置；播放器左下位置可复用导航卡左边缘和中心卡底部坐标。

## 2026-07-15 Nodesk 管理边界与首页调整发现
- 用户要求撤销 Nono 后台内嵌 Nodesk，但保留 `/nodesk` 独立站点。
- Nono 后台入口由 `AdminLayout.vue`、路由表和 `NodeskView.vue` 三部分组成，可完整拆除，不影响网关和内容 API。
- 线上 Avatar 保存请求 `POST /api/admin/nodesk/files/batch` 返回 200，持久化卷中的 `public/images/avatar.png` 也已更新；页面仍固定引用同一路径，存在强缓存后显示旧图的问题。
- Avatar 上传接受任意 `image/*`，但无论源格式都保存为 `avatar.png`，存在扩展名与实际 MIME 不一致风险。
- 首页导航项在 `apps/blog/src/components/nav-card.tsx` 静态定义，后三项可直接从契约中移除。
- 当前日历只根据当前月份静态渲染，没有日程数据模型、详情交互或管理入口。
- Avatar 根因确认：本地写入成功，但固定 `/images/avatar.png` 会复用缓存，且任意 `image/*` 原始字节都被冠以 PNG 扩展名。现改为 SHA-256 版本化 URL 并保留受支持的原始图片格式。
- 日程数据放入 `site-content.json` 的 `calendarEvents`，复用现有本地内容 API 和 Docker volume，无需增加数据库表。

## 2026-07-15 Nodesk 一体化发现
- 当前 Blog 是独立 Next.js 应用，由 `docker/gateway.mjs` 挂载到 `/blog`。
- Blog 的站点配置、文章、项目、分享、博主、图集、片段和关于页保存逻辑均直接调用 `apps/blog/src/lib/github-client.ts`。
- 因此即使部署在 VPS，浏览器管理端仍需要 GitHub Token；需要改为同源服务端本地写入 API。
- Nono 后台 `packages/web/src/views/admin/NodeskView.vue` 目前只是链接到 Blog 各管理路由，不是真正的后台管理页面。
- Docker 当前只持久化 PostgreSQL/Nono 数据，Blog 内容随镜像构建，缺少独立内容 volume。
- 迁移必须同时处理 `/blog` 到 `/nodesk` 的网关前缀、Next 资源路径和旧链接兼容。
- 用户新增要求：后台“新增书签”和“导入导出”合并为一个“新增书签”菜单；旧导入导出路由只做兼容，不再单列。

## 2026-06-04 Phase 3/4/5 规划发现
- 当前项目已迁移为 workspace：`packages/server`、`packages/web`、`packages/extension`。
- Phase 1/2 已在 `main` 上完成并推送，当前分支仅保留 `main` / `origin/main`。
- Prisma schema 已有 `Folder.parentId` 与 `ApiToken.expiresAt`，阶段 3/4/5 可先不改数据库结构。
- `prisma generate` 在本机有阻塞风险，后续阶段优先使用现有 Repository 接口和瞬时计算。
- 后台 Links 页已有 Phase 2 的 selection/bulk/duplicate 状态，适合承接链接健康检查工作流。
- Tokens 页当前能创建/撤销 token，但没有过期校验摘要，也没有本地撤销后的轻量反馈。
- 后台已支持文件夹 parentId，但公开页目前主要按扁平文件夹展示，Phase 5 应补前台树形上下文与搜索反馈。

## 当前实现
- 仓库路径：`C:\Users\aodo\Documents\New project\nono`
- 当前分支：`main`
- 当前服务：Docker 容器 `nono` 已运行在宿主机 `3001`，容器内端口 `3000`。
- 技术栈：Node.js 原生 HTTP 服务，零运行时依赖，无构建链。
- 数据来源：`src/data.js` 内置数组。
- 公开 API：`GET /api/v1/allsiteandlinks/:username`。
- 公开页：`public/index.html` + `public/app.js` + `public/styles.css`。
- 当前搜索：站内命中时滚动；站内无命中时跳百度。

## 截图参考提炼
- 桌面后台需要浅色工作台风格：顶部栏、左侧导航、右侧内容区。
- 主要页面：总览、导航配置、文件夹、书签管理、进阶功能、账户。
- 文件夹管理支持图标、名称、密码、引导语、排序。
- 书签管理支持新增、导入、按文件夹筛选、行内编辑、迁移、排序、删除。
- 进阶功能应包含浏览器书签导入、书签备份/导出。
- 移动端后台入口应简洁：账号、布局、关于三类设置。
- 移动端布局页偏大触控开关，适合做公开页显示偏好。

## 关键决策
- 不先引入 React/Vite，避免把小项目变重；后台用原生 HTML/CSS/JS 也能完成。
- 持久化先用 JSON 文件，Docker 挂载数据目录；SQLite 可作为后续升级。
- 书签兼容使用 Netscape Bookmark HTML，这是 Chrome、Edge、Firefox 的通用导入导出格式。
- 搜索默认改为 Google，并将搜索 URL 模板放进站点配置，方便后续切换。

## 风险
- 浏览器书签 HTML 并不是严格现代 HTML，解析器要用测试夹住 Chrome/Edge/Firefox 常见输出。
- 当前公开接口字段是 iLinks 风格，后台内部模型要兼容旧字段，避免公开页大改。
- 密码文件持久化需要避免明文保存，必须用哈希和签名 Cookie。

## 实现结果
- 后台 API 使用 HMAC 签名 Cookie，密码使用 `crypto.scrypt` 哈希。
- 数据持久化到 `data/nono.json`，写入时通过临时文件 rename 做原子保存。
- 公开页默认搜索已切换为 Google，搜索模板由站点配置提供。
- 书签 HTML 导入导出已实现 Netscape Bookmark HTML 基本兼容：
  - 导入 `<H3>` 为文件夹。
  - 导入 `<A HREF>` 为书签。
  - 保留嵌套文件夹 parentId。
  - 重复 URL 跳过。
  - 导出 `nono-bookmarks.html`。
- 后台使用原生 HTML/CSS/JS，保持零构建链。
