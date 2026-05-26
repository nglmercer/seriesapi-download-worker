# SeriesAPI Download & Queue Worker — Architecture

## System Overview

```
┌─────────────┐       HTTP/WS        ┌─────────────────┐
│   Browser   │ ◄─────────────────── │  Worker Server  │
│  Dashboard  │                      │   (Bun.serve)   │
└─────────────┘                      │    port 5001    │
                                     └────────┬────────┘
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        │                     │                     │
                        ▼                     ▼                     ▼
                 ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
                 │  Download   │     │   Transcode  │     │   Storage    │
                 │  Service    │     │   Pipeline   │     │   Backend    │
                 └──────┬──────┘     └──────┬───────┘     └──────────────┘
                        │                    │
                        ▼                    ▼
                 ┌─────────────┐     ┌──────────────┐
                 │  rqbit /    │     │   FFmpeg     │
                 │  HTTP fetch │     │   + ffprobe  │
                 └─────────────┘     └──────────────┘
```

## Components

### HTTP Server (`src/api/server.ts`)
- Built on `Bun.serve()` with combined HTTP + WebSocket on one port
- Routes defined in `src/api/router.ts` with CORS support
- All `/api/*` endpoints require `Authorization: Bearer <SHARED_API_KEY>`

### Download Service (`src/services/download/`)
- **HTTP downloads**: Streaming fetch with progress tracking
- **BitTorrent downloads**: Via `rqbit-napi` (Rust-based torrent client)
- Emits `download:progress` events to the EventBus
- Registers completed files in the `files` table

### Transcode Pipeline (`src/services/transcoding/`)

```
pending ──► probing ──► ready ──► processing ──► completed
                                    │              ▲
                                    │              │
                                    ▼              │
                              QueueWorker     HLS output
                              auto-picks      + metadata
                              next ready
```

1. **Probe**: ffprobe extracts stream info (resolution, codec, duration, bitrate)
2. **Extract**: Embedded subtitles extracted to VTT format
3. **Encode**: FFmpeg encodes each quality tier (H.264 + AAC → HLS `.ts` segments)
4. **Inject**: External audio/subtitle tracks merged into HLS
5. **Build**: Master `.m3u8` playlist with variant streams
6. **Upload**: HLS directory mirrored to cloud storage (if configured)
7. **Emit**: `hls:ready` event broadcast

### Queue Worker (`src/services/queue/queue-worker.ts`)
- Background poller runs every 5 seconds
- Auto-starts the next `ready` task when a concurrency slot is available
- Respects `MAX_CONCURRENT_TRANSCODES` limit (default: 1)

### Storage Layer (`src/services/storage/`)

**Composite strategy (local-first):**
1. Writes always go to local disk first
2. Reads prefer local, fall back to cloud
3. Post-transcode: bulk upload local → cloud
4. Deletes remove from both local and cloud

**Backends:**
- `local` — filesystem (`STORAGE_BASE_DIR`, default `storage/`)
- `s3` — AWS S3 / S3-compatible (MinIO, etc.)
- `gcs` — Google Cloud Storage
- `azure` — Azure Blob Storage

### EventBus (`src/services/queue/queue.events.ts`)
Node.js EventEmitter singleton decoupling producers (download/transcode) from consumers (WebSocket server).

Events:
- `download:progress(taskId, userId, progress, data)`
- `transcode:progress({taskId, userId, progress, status, quality, step, totalSteps, ...})`
- `hls:ready({taskId, status, media_id, season_id, episode_id})`

### WebSocket Server (`src/api/websocket/ws-server.ts`)
- Authenticates clients via main API token validation
- Routes EventBus events to subscribed clients
- Supports job-level and entity-level subscriptions

## Database

SQLite via `sqlite-napi` with a custom Drizzle-style ORM (`src/core/`).

### Tables

| Table | Purpose |
|-------|---------|
| `download_tasks` | HTTP/torrent download state |
| `media_tasks` | Transcode queue entries |
| `media_task_tracks` | Audio/subtitle track metadata |
| `media_hls_outputs` | Per-quality HLS output records |
| `media_hls_resources` | HLS resource registry |
| `media_custom_subtitles` | Injected subtitle content |
| `files` | File registry (uploaded/downloaded) |
| `user_quotas` | Per-user storage limits |
| `media` | Stub for foreign key lookups |
| `images` | Thumbnail/image records |

## Directory Layout

```
seriesAPI_DOWNLOAD_WORKER/
├── index.ts                      # Entry point
├── src/
│   ├── config.ts                 # Environment config parser
│   ├── db/                       # Database init + singleton
│   ├── schema/                   # SQLite table definitions
│   ├── core/                     # Custom ORM layer
│   ├── services/
│   │   ├── download/             # HTTP + BitTorrent downloads
│   │   ├── queue/                # Transcode queue + worker
│   │   ├── transcoding/          # FFmpeg pipeline
│   │   ├── storage/              # Pluggable backend impls
│   │   └── file.service.ts       # Path management
│   └── api/
│       ├── server.ts             # Bun.serve bootstrap
│       ├── router.ts             # Request routing
│       ├── routes/               # Download + queue handlers
│       └── websocket/            # WS server + auth
├── storage/                      # Runtime file storage
├── binaries/                     # FFmpeg binaries (auto-downloaded)
├── data/                         # SQLite DB
└── web/                          # Dashboard frontend
```
