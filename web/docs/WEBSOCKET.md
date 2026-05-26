# WebSocket Protocol Reference

## Connection

```
ws://localhost:3001/ws
```

The WebSocket server shares the same port as the HTTP server.

## Authentication

After connecting, the client must authenticate:

```json
{"type": "auth", "token": "<jwt-or-api-key>"}
```

The server validates the token against the main API. On success:

```json
{"type": "connected", "userId": 1, "message": "Authenticated"}
```

On failure, the connection is closed with code `4001`.

## Client → Server Messages

### Subscribe to Job Progress

Track download or transcode progress for a specific task:

```json
{"type": "subscribe:job", "jobId": "dl_1234_abcd"}
```

For transcode tasks, use the numeric task ID as a string:

```json
{"type": "subscribe:job", "jobId": "42"}
```

### Unsubscribe from Job

```json
{"type": "unsubscribe:job", "jobId": "dl_1234_abcd"}
```

### Subscribe to Entity Events

Receive `hls:ready` events when HLS output is generated for a media/season/episode:

```json
{"type": "subscribe:entity", "entityType": "media", "entityId": 123}
```

Entity types: `media`, `season`, `episode`.

### Unsubscribe from Entity

```json
{"type": "unsubscribe:entity", "entityType": "media", "entityId": 123}
```

### Keepalive

```json
{"type": "ping"}
```

Server responds with `{"type": "pong"}`.

## Server → Client Messages

### Download Progress

```json
{
  "type": "download:progress",
  "taskId": "dl_1234_abcd",
  "userId": 1,
  "progress": 45.2,
  "status": "downloading",
  "filename": "movie.mp4",
  "downloaded": 452000000,
  "total": 1000000000,
  "speed": 5242880,
  "file_path": "storage/movie.mp4"
}
```

Status values: `pending`, `starting`, `connecting`, `downloading`, `completed`, `failed`, `paused`, `seeding`.

### Transcode Progress

```json
{
  "type": "transcode:progress",
  "taskId": 42,
  "userId": 1,
  "progress": 67.5,
  "status": "processing",
  "quality": "720p",
  "step": 2,
  "totalSteps": 3,
  "media_id": 123,
  "season_id": 1,
  "episode_id": 5
}
```

Status values: `processing`, `completed`, `failed`, `stopped`.

### HLS Ready

Emitted when a transcode task completes and HLS output is available:

```json
{
  "type": "hls:ready",
  "taskId": 42,
  "status": "completed",
  "media_id": 123,
  "season_id": 1,
  "episode_id": 5
}
```

### Pong

```json
{"type": "pong"}
```

### Error

```json
{"type": "error", "error": "Invalid message format"}
```

## JavaScript Client Example

```javascript
const ws = new WebSocket("ws://localhost:3001/ws");

ws.onopen = () => {
  ws.send(JSON.stringify({ type: "auth", token: "your-api-key" }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case "connected":
      console.log("Authenticated as user", msg.userId);
      // Subscribe to a download
      ws.send(JSON.stringify({ type: "subscribe:job", jobId: "dl_1234_abcd" }));
      // Subscribe to a transcode
      ws.send(JSON.stringify({ type: "subscribe:job", jobId: "42" }));
      break;

    case "download:progress":
      console.log(`Download ${msg.taskId}: ${msg.progress}% (${msg.status})`);
      break;

    case "transcode:progress":
      console.log(`Transcode ${msg.taskId}: ${msg.progress}% - ${msg.quality}`);
      break;

    case "hls:ready":
      console.log(`HLS ready for task ${msg.taskId}, media ${msg.media_id}`);
      break;
  }
};

// Keepalive every 30s
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "ping" }));
  }
}, 30000);
```

## React/Preact Hook Example

```typescript
import { useEffect, useRef } from "preact/hooks";

function useWebSocket(apiKey: string) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3001/ws");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token: apiKey }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      // dispatch to your state management
    };

    return () => ws.close();
  }, [apiKey]);

  return {
    subscribe: (jobId: string) => {
      wsRef.current?.send(JSON.stringify({ type: "subscribe:job", jobId }));
    },
    unsubscribe: (jobId: string) => {
      wsRef.current?.send(JSON.stringify({ type: "unsubscribe:job", jobId }));
    },
  };
}
```
