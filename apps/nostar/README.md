<div align="center">

<img src="upload/logo.png" width="120" alt="GithubStars logo" />

# GithubStars

**An AI-assisted workspace for organizing, searching, and tracking your GitHub Stars.**

![Storage](https://img.shields.io/badge/storage-local--first-success?style=flat&logo=sqlite&logoColor=white)
![AI](https://img.shields.io/badge/AI-OpenAI%20%7C%20Claude%20%7C%20Gemini-blue?style=flat&logo=openai&logoColor=white)
![Docker](https://img.shields.io/badge/deploy-Docker-2496ED?style=flat&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-yellow?style=flat)

English | [中文](README_zh.md)

</div>

---

GithubStars turns a long, hard-to-search Star list into a structured knowledge base. It syncs your starred repositories, uses AI to generate summaries, tags, platforms, and categories, then gives you semantic search, release tracking, discovery feeds, WebDAV backup, and optional cross-device sync.

All core data is stored locally first. In Docker/server mode, repositories, AI analysis results, custom categories, release state, and service configs are persisted in SQLite under `/app/data`.

## Highlights

- **Star sync**: import your GitHub Stars with a personal access token.
- **AI analysis**: generate concise summaries, tags, supported platforms, and categories for repositories.
- **Persistent categories**: AI analysis and custom category edits survive refreshes, GitHub re-syncs, and Docker restarts.
- **Semantic search**: search by intent and concepts instead of exact repository names.
- **Release tracking**: subscribe to selected repositories and review new releases in a timeline.
- **Asset filters**: filter release assets by OS, architecture, source package, and custom rules.
- **Repository discovery**: browse trending, popular, topic-based, and search-based discovery feeds.
- **Fork tracking**: keep an eye on forked repositories and upstream activity.
- **Backup and restore**: export data locally or sync backups through WebDAV services such as Nextcloud or Jianguoyun.
- **Optional backend**: use the bundled Express + SQLite server for API proxying, encrypted config storage, and cross-device sync.

## Screenshots

| Repository Workspace | Release Timeline | Discovery |
| --- | --- | --- |
| ![Repository workspace](upload/repo.png) | ![Release timeline](upload/release.png) | ![Discovery](upload/discovery.png) |

| Search | Settings | AI Config |
| --- | --- | --- |
| ![Search](upload/search.png) | ![Settings](upload/settings.png) | ![AI configuration](upload/ai.png) |

## Quick Start

### New in This Version

- **Offline keyword search**: when AI search is unavailable, falls back to local keyword matching on repo name, description, summary, and tags.
- **Export star list**: export your starred repos as Markdown or CSV for sharing or backup.
- **Rule-based auto-categorization**: automatically categorize repos by language, topics, and star count rules.
- **Unstar detection**: detects when repos are removed from your star list and emits events for tracking.
- **GraphQL batch queries**: backend supports batching release queries via GitHub's GraphQL API.
- **API_SECRET auto-generation**: the server auto-generates a secure API secret on first start.

### Docker

Docker is the recommended way to run the full app with the backend and persistent SQLite storage.

```bash
git clone https://github.com/uovme/GithubStars.git
cd GithubStars
docker compose up -d --build
```

Open:

```text
http://localhost:8087
```

The compose file maps `127.0.0.1:8087` to the app's internal port `3000` and stores persistent data in the `app-data` Docker volume.

### From Source

Run the frontend only:

```bash
npm install
npm run dev
```

Run frontend and backend together:

```bash
npm install
cd server && npm install && cd ..
npm run dev:all
```

Common commands:

```bash
npm run test:run
npm run build
cd server && npm test
cd server && npm run build
```

## Configuration

### GitHub Token

Create a GitHub personal access token and use it to sync your starred repositories. The app only needs access required for reading your Star list and repository metadata.

### AI Providers

Configure AI services in Settings. Supported API modes include:

- OpenAI Chat Completions
- OpenAI Responses
- Claude
- Gemini
- OpenAI-compatible endpoints

AI analysis can be run on all repositories, only unanalyzed repositories, or failed analyses. Results are saved with the repository data and can also be included in backups.

### Backend Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `API_SECRET` | No | Bearer token used to protect backend APIs. If empty, auth is disabled. |
| `ENCRYPTION_KEY` | No | AES-256 key used to encrypt stored AI/WebDAV secrets. If empty, one is generated under `/app/data`. |

## Data Storage

GithubStars is local-first:

- Browser-only mode uses IndexedDB with a localStorage fallback for app state.
- Docker/server mode stores synced data in SQLite at `/app/data/data.db`.
- AI summaries, tags, platforms, categories, release subscriptions, read state, and settings are persisted.
- WebDAV backup can export and restore repositories, AI configs, WebDAV configs, categories, release data, discovery cache, and UI settings.

## Deployment Notes

### Docker Compose

```bash
docker compose up -d --build
```

To update an existing deployment:

```bash
git pull
docker compose up -d --build
```

### Reverse Proxy

Point your reverse proxy to:

```text
http://127.0.0.1:8087
```

If you change the compose port mapping, point the proxy to the new host port.

### Static Hosting

You can build the frontend as a static app:

```bash
npm run build
```

Static hosting runs in browser-only mode. Backend features such as cross-device sync, encrypted server-side config storage, and API proxying require the Express server.

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- Express
- SQLite
- Docker
- Electron build support

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Keep changes focused and add tests for behavior changes.
4. Open a pull request with a clear description and screenshots when UI changes are involved.

## License

[MIT](LICENSE)

## Star History

[![Star History](https://api.star-history.com/svg?repos=uovme/GithubStars&type=Date)](https://www.star-history.com/#uovme/GithubStars&Date)
