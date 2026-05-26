# SeriesAPI Download & Queue Worker — Setup Guide

## Prerequisites

- [Bun](https://bun.sh/) v1.1+ (backend runtime)
- [Node.js](https://nodejs.org/) 20+ (for Vite dev server)
- FFmpeg/FFprobe (auto-downloaded on first transcode, or set `FFMPEG_PATH`/`FFPROBE_PATH`)

## Backend Setup

```bash
# Clone and install
cd seriesAPI_DOWNLOAD_WORKER
cp .env.example .env
bun install

# Edit .env — at minimum set:
#   SHARED_API_KEY=your-secure-random-key
#   MAIN_API_URL=http://localhost:3000

# Start the worker
bun run dev
```

The worker starts on `http://0.0.0.0:3001` by default.

## Web Dashboard Setup

```bash
cd web
bun install    # or npm install
bun run dev    # or npm run dev
```

The dashboard starts on `http://localhost:5173`. In dev mode, API requests to `/api/*` and `/ws` are proxied to `http://localhost:3001`.

## Environment Variables

### Backend (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP + WS server port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_PATH` | `data/worker.db` | SQLite database file |
| `SHARED_API_KEY` | `change-me` | Service-to-service auth key |
| `MAIN_API_URL` | `http://localhost:3000` | Main API for token validation |
| `STORAGE_BACKEND` | `local` | `local`, `s3`, `gcs`, or `azure` |
| `STORAGE_BASE_DIR` | `storage` | Local storage root |
| `MAX_CONCURRENT_TRANSCODES` | `1` | Parallel FFmpeg encodes |
| `FFMPEG_PATH` | — | Custom FFmpeg binary path |
| `FFPROBE_PATH` | — | Custom FFprobe binary path |
| `S3_ACCESS_KEY_ID` | — | S3 credentials |
| `S3_SECRET_ACCESS_KEY` | — | S3 credentials |
| `S3_BUCKET` | `seriesapi` | S3 bucket name |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_ENDPOINT` | — | S3-compatible endpoint |
| `GCS_PROJECT_ID` | — | Google Cloud project |
| `GCS_BUCKET` | — | GCS bucket |
| `GCS_KEY_FILE` | — | GCS service account key file |
| `AZURE_CONNECTION_STRING` | — | Azure Blob connection string |
| `AZURE_CONTAINER_NAME` | — | Azure container name |

### Dashboard (Settings page)

The dashboard stores its config in `localStorage`:
- **Worker URL**: Leave empty for same-origin/dev-proxy, or set to `http://your-worker:3001`
- **API Key**: Must match `SHARED_API_KEY` in the worker's `.env`
- **User ID**: Sent as `X-User-Id` header for user-scoped operations

## Production Build

```bash
cd web
npm run build
```

Output goes to `web/dist/`. Serve it as static files alongside or behind the worker, or use any static hosting (Nginx, Caddy, Cloudflare Pages, etc.).

## CORS

The worker already sends `Access-Control-Allow-Origin: *` on all API responses. If you serve the dashboard from a different origin, no additional CORS config is needed.

## First Use

1. Open the dashboard at `http://localhost:5173`
2. Go to **Settings** and enter your API key
3. Click **Test Connection** — should show "Worker online"
4. Create a download or queue task from the Downloads/Queue pages
