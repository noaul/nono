# Nono

Nono 是一个可自托管的网址导航主页，设计参考“背景图 + 白字 + 毛玻璃 + 高密度链接卡片”的导航站形态。

## 功能

- 公开导航页：`/` 或 `/:username`
- 聚合接口：`GET /api/v1/allsiteandlinks/:username`
- 内置种子数据：`admin`
- 零运行时依赖：Node.js 原生 HTTP 服务
- Docker / Docker Compose 部署

## 本地运行

```bash
npm test
npm start
```

访问：

```text
http://127.0.0.1:3000/
http://127.0.0.1:3000/api/v1/allsiteandlinks/admin
```

## Docker 部署

```bash
docker compose up -d --build
```

默认端口是 `3000`。如需改宿主机端口：

```bash
PORT=8080 docker compose up -d --build
```

## 修改导航数据

当前 MVP 使用内置数据，编辑：

- `src/data.js`

后续可以把 `users`、`sites`、`folders`、`links` 换成 SQLite/PostgreSQL 存储，接口契约保持不变。
