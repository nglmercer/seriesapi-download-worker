# API Reference

Base URL: `http://localhost:3001`

All `/api/*` endpoints require:
- `Authorization: Bearer <SHARED_API_KEY>`
- `X-User-Id: <integer>` (for user-scoped operations)

---

## Health

### `GET /health`

```json
{ "status": "online", "version": "1.0.0", "uptime": 12345.6 }
```

---

## Downloads

### `GET /api/v1/downloads`

List all download tasks.

**Response:**
```json
{
  "tasks": [
    {
      "id": "dl_1234567890_abcd1234",
      "url": "https://example.com/file.mp4",
      "filename": "file.mp4",
      "status": "downloading",
      "type": "file",
      "progress": 45.2,
      "downloaded_bytes": 452000000,
      "total_bytes": 1000000000,
      "error": null,
      "user_id": 1,
      "torrent_id": null,
      "magnet": null,
      "file_path": "storage/file.mp4",
      "file_id": null,
      "created_at": "2025-01-15T10:30:00Z",
      "completed_at": null
    }
  ]
}
```

### `POST /api/v1/downloads`

Create a new download.

**Body:**
```json
{
  "url": "https://example.com/file.mp4",
  "filename": "optional-name.mp4",
  "category": "video",
  "type": "file"
}
```

- `type`: `"file"` (HTTP), `"magnet"` (magnet link), `"torrent"` (torrent file URL)

**Response (201):**
```json
{ "taskId": "dl_1234567890_abcd1234" }
```

### `GET /api/v1/downloads/:id`

Get a single download task by ID.

**Response:** Full download task object (same shape as in the list).

### `DELETE /api/v1/downloads/:id`

Delete a download task.

**Query params:**
- `deleteFiles=true` — also delete downloaded files from disk

**Response:**
```json
{ "success": true }
```

### `POST /api/v1/downloads/:id/pause`

Pause a torrent download.

**Response:**
```json
{ "success": true }
```

### `POST /api/v1/downloads/:id/resume`

Resume a paused download.

**Response:**
```json
{ "success": true }
```

### `POST /api/v1/downloads/:id/cancel`

Cancel an active download.

**Response:**
```json
{ "success": true }
```

---

## Queue

### `GET /api/v1/queue`

List transcode tasks with pagination and filtering.

**Query params:**
- `page` (default: 1)
- `limit` (default: 20)
- `media_id` — filter by media ID
- `season_id` — filter by season ID
- `episode_id` — filter by episode ID

**Response:**
```json
{
  "rows": [
    {
      "id": 42,
      "title": "Episode 1",
      "description": null,
      "status": "ready",
      "progress": 0,
      "source_video_url": "/storage/ep1.mkv",
      "source_video_info": "{...}",
      "thumbnail_url": null,
      "qualities": "[\"720p\",\"1080p\"]",
      "media_id": 1,
      "season_id": 1,
      "episode_id": 1,
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-15T10:30:00Z",
      "tracks": [],
      "outputs": []
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 20
}
```

### `POST /api/v1/queue`

Create a new transcode task.

**Body:**
```json
{
  "title": "Episode 1",
  "description": "optional description",
  "source_video_url": "/storage/ep1.mkv",
  "thumbnail_url": "https://...",
  "media_id": 1,
  "season_id": 1,
  "episode_id": 1
}
```

**Response (201):** Full task object.

### `GET /api/v1/queue/outputs`

Get HLS outputs filtered by entity.

**Query params:** `media_id`, `season_id`, `episode_id`

**Response:** Array of `HlsOutput` objects.

### `GET /api/v1/queue/qualities`

Get available quality presets.

**Response:**
```json
{
  "qualities": ["2160p", "1440p", "1080p", "720p", "480p", "360p", "240p", "original"],
  "configs": {
    "1080p": { "width": 1920, "height": 1080, "bitrate": "5000k", "label": "1080p" },
    "720p": { "width": 1280, "height": 720, "bitrate": "2500k", "label": "720p" }
  }
}
```

### `GET /api/v1/queue/check-existing`

Check deduplication registry for existing outputs.

**Query params:** `media_id` (required), `season_id`, `episode_id`

**Response:**
```json
{
  "qualities": ["720p", "1080p"],
  "subtitles": ["eng", "spa"],
  "audio": ["eng"]
}
```

### `POST /api/v1/queue/backfill`

Backfill metadata for all HLS outputs.

**Response:**
```json
{ "totalOutputs": 25, "updated": 23, "errors": 2 }
```

### `GET /api/v1/queue/:id`

Get full task detail including tracks and outputs.

**Response:** Full task object with `tracks[]` and `outputs[]`.

### `PUT /api/v1/queue/:id`

Update task fields.

**Body:** Any of `title`, `description`, `qualities`, `source_video_url`, `thumbnail_url`, `media_id`, `season_id`, `episode_id`.

### `DELETE /api/v1/queue/:id`

Delete task and all associated tracks/outputs.

### `POST /api/v1/queue/:id/start`

Start encoding. Task must be in `ready` state.

### `POST /api/v1/queue/:id/probe` / `GET /api/v1/queue/:id/probe`

Run ffprobe on the source video.

**Response:**
```json
{
  "width": 1920,
  "height": 1080,
  "duration": 1420.5,
  "bitrate": 8000000,
  "codec": "h264",
  "streams": [
    { "index": 0, "type": "video", "codec": "h264", "lang": "eng", "profile": "High", "bit_rate": 5000000 },
    { "index": 1, "type": "audio", "codec": "aac", "lang": "eng", "profile": "LC", "bit_rate": 192000 },
    { "index": 2, "type": "subtitle", "codec": "srt", "lang": "eng", "profile": null, "bit_rate": null }
  ],
  "source_video_info": "{...}",
  "qualities": ["720p", "1080p"]
}
```

### `POST /api/v1/queue/:id/stop`

Abort an encoding in progress.

### `POST /api/v1/queue/:id/restart`

Reset task to `ready` state for re-encoding.

### `GET /api/v1/queue/:id/outputs`

Get HLS outputs for a specific task.

### `POST /api/v1/queue/:id/add-quality`

Add a single quality tier.

**Body:** `{ "quality": "720p" }`

### `POST /api/v1/queue/:id/quality`

Set all quality tiers (replaces existing).

**Body:** `{ "qualities": ["720p", "1080p", "480p"] }`

### `POST /api/v1/queue/:id/extract-tracks`

Extract embedded subtitle tracks to VTT.

### `POST /api/v1/queue/:id/extract-audio`

Extract embedded audio tracks.

### `POST /api/v1/queue/:id/process-tracks`

Process external audio/subtitle tracks into HLS.

### `POST /api/v1/queue/:id/thumbnail`

Generate a thumbnail frame.

**Query params:** `seek` (seconds, default: auto)

**Response:**
```json
{ "id": 5, "url": "storage/thumbnails/task_42_thumb.jpg", "seek_time": "10", "task_id": 42 }
```

### `POST /api/v1/queue/:id/backfill`

Backfill metadata for a single task's outputs.

### `POST /api/v1/queue/:id/tracks`

Add an audio or subtitle track.

**Body:**
```json
{
  "type": "subtitle",
  "url": "https://example.com/subs.vtt",
  "label": "English",
  "lang": "eng",
  "is_external": true,
  "action": "add",
  "replace_lang": null,
  "metadata": null
}
```

### `PUT /api/v1/queue/:id/tracks/:trackId`

Update a track's metadata.

### `DELETE /api/v1/queue/:id/tracks/:trackId`

Remove a track.

### `POST /api/v1/queue/thumbnail/:type/:id`

Generate a thumbnail for an entity (media, episode, or season).

**Path params:** `type` = `media` | `episode` | `season`, `id` = entity ID

**Query params:** `seek` (optional, seconds)

---

## Error Responses

All error responses follow this format:

```json
{ "error": "Human-readable error message" }
```

Common status codes:
- `400` — Bad request / validation error
- `401` — Missing or invalid auth
- `404` — Resource not found
- `500` — Internal server error
