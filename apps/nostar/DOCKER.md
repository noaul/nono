# Docker Deployment

This application uses a single-container architecture: the Express backend serves both the API and the frontend static files. No Nginx or separate frontend container is needed.

## Prerequisites

- Docker installed on your system
- Docker Compose (included with Docker Desktop)

## Building and Running

### Using Docker Compose (Recommended)

```bash
# Build and start the container
docker compose up -d --build

# The application will be available at http://localhost:8080
```

### Using Docker directly

```bash
# Build the image
docker build -t github-stars-manager .

# Run the container
docker run -d -p 8080:3000 \
  -v gsm-data:/app/data \
  --name github-stars-manager \
  github-stars-manager

# The application will be available at http://localhost:8080
```

## Architecture

The Docker image is built in three stages:

1. **Frontend build**: Installs npm dependencies and runs `vite build` to produce static files.
2. **Backend build**: Installs server dependencies and compiles TypeScript to JavaScript.
3. **Production**: Copies backend code + frontend static files into a slim `node:22-alpine` image. Express serves everything on port 3000.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `API_SECRET` | No | Bearer token for API authentication. If unset, auth is disabled. |
| `ENCRYPTION_KEY` | No | AES-256 key for encrypting stored secrets. Auto-generated if unset. |

Example with environment variables:

```bash
docker compose up -d --build

# Or with Docker directly
docker run -d -p 8080:3000 \
  -e API_SECRET=my-secret-token \
  -e ENCRYPTION_KEY=my-encryption-key \
  -v gsm-data:/app/data \
  --name github-stars-manager \
  github-stars-manager
```

## Data Persistence

SQLite database and encryption keys are stored in `/app/data` inside the container. The `docker-compose.yml` mounts a named volume (`app-data`) to persist this data across container restarts.

## Reverse Proxy (1Panel / Nginx)

If you are using 1Panel or another reverse proxy to bind a domain, simply point it to `http://127.0.0.1:8080`. No special headers or CORS configuration is needed — the application handles everything internally.

## Stopping the Container

```bash
# With Docker Compose
docker compose down

# With Docker directly
docker stop github-stars-manager
docker rm github-stars-manager
```

## Updating

```bash
# Pull latest code, rebuild and restart
git pull
docker compose up -d --build
```