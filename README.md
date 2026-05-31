# Nono

Nono 是一个可自托管的网址导航主页和轻量后台管理工具。它保留“背景图 + 白字 + 毛玻璃 + 高密度链接卡片”的公开导航形态，同时提供本地后台来管理站点配置、文件夹、书签，以及浏览器书签 HTML 的导入导出。

## 功能

- 公开导航页：`/` 或 `/:username`
- 后台管理：`/admin`
- 聚合接口：`GET /api/v1/allsiteandlinks/:username`
- 默认账号数据：`admin`
- 默认搜索：Google，站内无命中时跳转 `https://www.google.com/search?q={query}`
- 数据持久化：`data/nono.json`
- 浏览器书签双向兼容：导入/导出 Netscape Bookmark HTML，适配 Chrome、Edge、Firefox 常见书签文件
- Docker / Docker Compose 部署

## 本地运行

```bash
npm test
npm start
```

访问：

```text
http://127.0.0.1:3000/
http://127.0.0.1:3000/admin
http://127.0.0.1:3000/api/v1/allsiteandlinks/admin
```

首次打开 `/admin` 会要求初始化管理员账号。初始化后即可进入控制台。

## Docker 部署

```bash
docker compose up -d --build
```

默认端口是 `3000`。如需改宿主机端口：

```bash
PORT=8080 docker compose up -d --build
```

Compose 会把本地 `./data` 挂载到容器 `/app/data`，导航数据保存在 `data/nono.json`，重建镜像不会丢失。

## 后台管理

后台页面：

```text
http://127.0.0.1:3000/admin
```

可管理：

- 总览统计：文件夹、书签、加密文件夹数量
- 导航配置：站点名、简介、背景图、背景色、字体颜色、发布地址、搜索模板
- 文件夹：新增、编辑、删除、排序
- 书签：新增、编辑、迁移文件夹、预览、删除、排序
- 导入导出：上传浏览器书签 HTML，或导出 `nono-bookmarks.html`
- 账户：修改管理员密码

## 浏览器书签导入导出

### 从浏览器导入到 Nono

1. 在 Chrome / Edge / Firefox 里导出书签 HTML。
2. 打开 Nono 后台 `/admin`。
3. 进入“导入导出”。
4. 选择 `.html` 文件并导入。

导入规则：

- 顶层 `<H3>` 变成文件夹。
- 嵌套文件夹会保留层级关系。
- `<A HREF>` 变成书签。
- 重复 URL 会跳过，并在结果里提示数量。

### 从 Nono 导出到浏览器

1. 打开后台“导入导出”。
2. 点击“下载 nono-bookmarks.html”。
3. 在浏览器书签管理器中导入该 HTML。

## 配置搜索

默认搜索模板是：

```text
https://www.google.com/search?q={query}
```

公开页会先做站内链接搜索；没有命中时，把关键词替换到 `{query}` 并跳转。你可以在后台“导航配置”中修改模板。
