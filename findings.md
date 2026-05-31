# Nono 项目发现

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
