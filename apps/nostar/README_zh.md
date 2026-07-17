<div align="center">

<img src="upload/logo.png" width="120" alt="GithubStars logo" />

# GithubStars

**用 AI 整理、搜索和追踪你的 GitHub Stars。**

![存储](https://img.shields.io/badge/存储-local--first-success?style=flat&logo=sqlite&logoColor=white)
![AI](https://img.shields.io/badge/AI-OpenAI%20%7C%20Claude%20%7C%20Gemini-blue?style=flat&logo=openai&logoColor=white)
![Docker](https://img.shields.io/badge/部署-Docker-2496ED?style=flat&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-yellow?style=flat)

中文 | [English](README.md)

</div>

---

GithubStars 会把越来越难找的 Star 列表整理成一个可搜索、可分类、可追踪更新的知识库。它可以同步你的 GitHub Stars，用 AI 生成摘要、标签、平台和分类，并提供语义搜索、Release 追踪、项目发现、WebDAV 备份和可选的跨设备同步。

项目采用本地优先存储。Docker / 后端模式下，仓库数据、AI 分析结果、自定义分类、Release 状态和服务配置都会持久化到 `/app/data` 下的 SQLite 数据库中。

## 主要功能

- **Star 同步**：通过 GitHub Token 导入你的 Star 仓库。
- **AI 分析**：自动生成仓库摘要、标签、支持平台和分类。
- **分类持久化**：AI 分析结果和自定义分类在刷新页面、重新同步 GitHub、重启 Docker 后都会保留。
- **语义搜索**：按意图和概念搜索，不依赖精确仓库名。
- **Release 追踪**：订阅关注的仓库，在时间线里集中查看新版本。
- **资源筛选**：按系统、架构、源码包和自定义规则筛选 Release 资源。
- **项目发现**：浏览趋势项目、热门项目、主题项目和搜索发现结果。
- **Fork 追踪**：查看 fork 仓库和上游活动。
- **备份与恢复**：支持本地导出，也支持通过 Nextcloud、坚果云等 WebDAV 服务备份。
- **可选后端**：内置 Express + SQLite 后端，提供 API 代理、加密配置存储和跨设备同步。

## 截图

| 仓库工作台 | Release 时间线 | 项目发现 |
| --- | --- | --- |
| ![仓库工作台](upload/repo.png) | ![Release 时间线](upload/release.png) | ![项目发现](upload/discovery.png) |

| 搜索 | 设置 | AI 配置 |
| --- | --- | --- |
| ![搜索](upload/search.png) | ![设置](upload/settings.png) | ![AI 配置](upload/ai.png) |

## 快速开始

### Docker

推荐使用 Docker 运行完整版本，包含后端和 SQLite 持久化存储。

```bash
git clone https://github.com/uovme/GithubStars.git
cd GithubStars
docker compose up -d --build
```

访问：

```text
http://localhost:8087
```

默认 `docker-compose.yml` 会把主机的 `127.0.0.1:8087` 映射到容器内部的 `3000` 端口，并使用 `app-data` Docker volume 保存持久化数据。

### 源码运行

只运行前端：

```bash
npm install
npm run dev
```

同时运行前端和后端：

```bash
npm install
cd server && npm install && cd ..
npm run dev:all
```

常用命令：

```bash
npm run test:run
npm run build
cd server && npm test
cd server && npm run build
```

## 配置说明

### GitHub Token

创建一个 GitHub Personal Access Token，用于同步 Star 仓库。应用只需要读取 Star 列表和仓库元数据所需的权限。

### AI 服务

在设置页面配置 AI 服务。当前支持的 API 类型包括：

- OpenAI Chat Completions
- OpenAI Responses
- Claude
- Gemini
- OpenAI 兼容接口

AI 分析可以对全部仓库运行，也可以只分析未分析仓库或重新分析失败项。分析结果会随仓库数据保存，也可以一起备份。

### 后端环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `API_SECRET` | 否 | 后端 API 的 Bearer Token；为空时关闭鉴权。 |
| `ENCRYPTION_KEY` | 否 | 用于加密 AI / WebDAV 密钥的 AES-256 密钥；为空时会自动生成并保存到 `/app/data`。 |

## 数据存储

GithubStars 是本地优先应用：

- 纯前端模式使用 IndexedDB，并以 localStorage 作为备用存储。
- Docker / 后端模式使用 SQLite，数据库路径为 `/app/data/data.db`。
- AI 摘要、标签、平台、分类、Release 订阅、已读状态和设置都会持久化。
- WebDAV 备份可以导出和恢复仓库、AI 配置、WebDAV 配置、分类、Release 数据、发现页缓存和界面设置。

## 部署说明

### Docker Compose

```bash
docker compose up -d --build
```

更新已有部署：

```bash
git pull
docker compose up -d --build
```

### 反向代理

将反向代理指向：

```text
http://127.0.0.1:8087
```

如果你修改了 compose 端口映射，请把代理指向新的主机端口。

### 静态托管

可以构建纯前端静态产物：

```bash
npm run build
```

静态托管会以浏览器本地模式运行。跨设备同步、服务端加密配置存储和 API 代理等能力需要 Express 后端。

## 技术栈

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- Express
- SQLite
- Docker
- Electron 构建支持

## 参与贡献

1. Fork 仓库。
2. 创建功能分支。
3. 保持改动聚焦；行为变化请补测试。
4. 发起 Pull Request，说明改动内容；涉及 UI 时建议附截图。

## 许可证

[MIT](LICENSE)

## Star 趋势

[![Star History](https://api.star-history.com/svg?repos=uovme/GithubStars&type=Date)](https://www.star-history.com/#uovme/GithubStars&Date)
