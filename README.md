# SeriesAPI Download & Queue Worker

Standalone microservice handling file downloads and FFmpeg transcoding for the SeriesAPI platform.

## Quick Start

```bash
cp .env.example .env
# Edit SHARED_API_KEY and MAIN_API_URL
bun install
bun run dev
```

## Architecture

The worker runs on its own port (default `3001`), with its own SQLite database, and exposes:

- **HTTP REST API** — download management, transcoding queue CRUD, quality/track configuration
- **WebSocket** — real-time progress pushes for downloads, transcodes, and HLS-ready events
- **Scheduled recovery** — resets stale downloads/transcodes on startup

```
Client ──► Main API (3000) ──► Worker API (3001)
              │                      │
              │   WS progress        │
              └──────────────────────┘
```

## Endpoints

### Downloads

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/downloads` | List all download tasks |
| `POST` | `/api/v1/downloads` | Create download (file, magnet, torrent) |
| `GET` | `/api/v1/downloads/:id` | Get task status/progress |
| `DELETE` | `/api/v1/downloads/:id` | Delete task (optional `?deleteFiles=true`) |
| `POST` | `/api/v1/downloads/:id/pause` | Pause torrent download |
| `POST` | `/api/v1/downloads/:id/resume` | Resume torrent download |
| `POST` | `/api/v1/downloads/:id/cancel` | Cancel download |

### Queue

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/queue` | List tasks (paginated, filterable) |
| `POST` | `/api/v1/queue` | Create transcode task |
| `GET` | `/api/v1/queue/outputs` | Get HLS outputs by content filters |
| `GET` | `/api/v1/queue/qualities` | Available quality presets |
| `GET` | `/api/v1/queue/check-existing` | Check deduplication registry |
| `POST` | `/api/v1/queue/backfill` | Backfill metadata for all outputs |
| `GET` | `/api/v1/queue/:id` | Get task detail |
| `PUT` | `/api/v1/queue/:id` | Update task |
| `DELETE` | `/api/v1/queue/:id` | Delete task + tracks + outputs |
| `POST` | `/api/v1/queue/:id/start` | Start encoding |
| `GET/POST` | `/api/v1/queue/:id/probe` | Run ffprobe |
| `POST` | `/api/v1/queue/:id/stop` | Abort encoding |
| `POST` | `/api/v1/queue/:id/restart` | Reset to ready |
| `GET` | `/api/v1/queue/:id/outputs` | Get task's HLS outputs |
| `POST` | `/api/v1/queue/:id/add-quality` | Add single quality |
| `POST` | `/api/v1/queue/:id/quality` | Set all qualities |
| `POST` | `/api/v1/queue/:id/extract-tracks` | Extract subtitle tracks |
| `POST` | `/api/v1/queue/:id/extract-audio` | Extract audio tracks |
| `POST` | `/api/v1/queue/:id/process-tracks` | Process external tracks |
| `POST` | `/api/v1/queue/:id/thumbnail` | Generate thumbnail frame |
| `POST` | `/api/v1/queue/:id/backfill` | Backfill single task metadata |
| `POST` | `/api/v1/queue/:id/tracks` | Add audio/subtitle track |
| `PUT` | `/api/v1/queue/:id/tracks/:trackId` | Update track |
| `DELETE` | `/api/v1/queue/:id/tracks/:trackId` | Remove track |
| `POST` | `/api/v1/queue/thumbnail/:type/:id` | Generate thumbnail for entity |

### Auth

All `/api/` endpoints require `Authorization: Bearer <SHARED_API_KEY>`. User-scoped operations need `X-User-Id: <id>`.

## WebSocket

```
ws://localhost:3001/ws
```

### Client → Server

| Message | Description |
|---------|-------------|
| `{"type":"auth","token":"<jwt>"}` | Authenticate (validates against main API) |
| `{"type":"subscribe:job","jobId":"..."}` | Subscribe to download/transcode progress |
| `{"type":"unsubscribe:job","jobId":"..."}` | Unsubscribe |
| `{"type":"subscribe:entity","entityType":"media","entityId":1}` | Subscribe to entity HLS-ready events |
| `{"type":"unsubscribe:entity","entityType":"media","entityId":1}` | Unsubscribe |
| `{"type":"ping"}` | Keepalive |

### Server → Client

| Type | Payload |
|------|---------|
| `connected` | `{userId, message}` |
| `download:progress` | `{taskId, progress, status, filename, downloaded, total, speed?, file_path?}` |
| `transcode:progress` | `{taskId, progress, status, quality?, step?, totalSteps?}` |
| `hls:ready` | `{taskId, status, media_id?, season_id?, episode_id?}` |
| `pong` | `{}` |

## Environment Variables

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
| `S3_ACCESS_KEY_ID` | — | S3 credentials |
| `S3_SECRET_ACCESS_KEY` | — | S3 credentials |
| `S3_BUCKET` | `seriesapi` | S3 bucket name |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_ENDPOINT` | — | S3-compatible endpoint (MinIO, etc.) |
| `GCS_PROJECT_ID` | — | Google Cloud project |
| `GCS_BUCKET` | — | GCS bucket |
| `AZURE_CONNECTION_STRING` | — | Azure Blob connection string |
| `AZURE_CONTAINER_NAME` | — | Azure container name |

## Storage Backends

The worker uses a **local-first composite** strategy:

1. **Writes** always go to local disk first
2. **Reads** prefer local, fall back to cloud
3. **Post-transcode** bulk uploads local to cloud (if enabled)
4. **Deletes** remove from both local and cloud

Available backends: `local`, `s3`, `gcs`, `azure`.

## Directory Layout

```
seriesAPI_DOWNLOAD_WORKER/
├── index.ts                  # Entry point
├── src/
│   ├── config.ts             # Env var parsing
│   ├── db/                   # Database init + singleton
│   ├── schema/               # SQLite table definitions
│   ├── core/                 # Drizzle-style ORM
│   ├── services/
│   │   ├── download/         # HTTP + BitTorrent downloads
│   │   ├── queue/            # Transcode queue + worker
│   │   ├── transcoding/      # FFmpeg pipeline
│   │   ├── storage/          # Pluggable backend impls
│   │   └── file.service.ts   # Path management
│   └── api/
│       ├── server.ts         # Bun.serve bootstrap
│       ├── router.ts         # Request routing
│       ├── routes/           # Download + queue handlers
│       └── websocket/        # WS server + auth
├── storage/                  # Runtime file storage
├── binaries/                 # FFmpeg binaries (auto-downloaded)
└── data/                     # SQLite DB
```

## Transcode Pipeline

```
pending → probing (ffprobe) → ready → processing → completed/failed
                                    ↑
                              QueueWorker auto-picks
                              up to MAX_CONCURRENT_TRANSCODES
```

Quality presets: `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p`, `240p`, `original`.

Output is HLS (`.m3u8` + `.ts` segments) with H.264 + AAC. Subtitles extracted to VTT. Custom audio/subtitle tracks supported via external track injection.
