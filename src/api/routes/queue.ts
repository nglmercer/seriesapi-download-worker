import { QueueService } from "../../services/queue/queue.service";
import { QueueTrackService } from "../../services/queue/queue-track.service";
import type { DrizzleDb } from "../../db/index";
import type { FileService } from "../../services/file.service";

interface RouteResult {
  status: number;
  data: Record<string, unknown>;
}

export async function handleQueueRoute(
  method: string,
  path: string,
  url: URL,
  req: Request,
  db: DrizzleDb,
  fileService: FileService,
  userId: number | null,
): Promise<RouteResult | null> {
  if (method === "GET" && path === "/api/v1/queue") {
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);
    const mediaId = url.searchParams.get("media_id");
    const seasonId = url.searchParams.get("season_id");
    const episodeId = url.searchParams.get("episode_id");
    const result = QueueService.list(db, page, limit, (page - 1) * limit, {
      media_id: mediaId ? parseInt(mediaId, 10) : undefined,
      season_id: seasonId ? parseInt(seasonId, 10) : undefined,
      episode_id: episodeId ? parseInt(episodeId, 10) : undefined,
    });
    return { status: 200, data: result };
  }

  if (method === "POST" && path === "/api/v1/queue") {
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const result = QueueService.create(db, {
      title: body.title as string,
      description: body.description as string | undefined,
      media_id: body.media_id as number | undefined,
      season_id: body.season_id as number | undefined,
      episode_id: body.episode_id as number | undefined,
      source_video_url: body.source_video_url as string,
      thumbnail_url: body.thumbnail_url as string | undefined,
    });
    if ("error" in result) return { status: 400, data: result };
    return { status: 201, data: result };
  }

  if (method === "GET" && path === "/api/v1/queue/outputs") {
    const result = QueueService.getOutputs(db, {
      media_id: url.searchParams.get("media_id") || undefined,
      season_id: url.searchParams.get("season_id") || undefined,
      episode_id: url.searchParams.get("episode_id") || undefined,
    });
    if ("error" in result) return { status: 400, data: result };
    return { status: 200, data: result };
  }

  if (method === "GET" && path === "/api/v1/queue/qualities") {
    return { status: 200, data: QueueService.getAvailableQualities() };
  }

  if (method === "GET" && path === "/api/v1/queue/check-existing") {
    const result = await QueueService.checkExistingOutputs(
      url.searchParams.get("media_id") || "",
      url.searchParams.get("season_id") || undefined,
      url.searchParams.get("episode_id") || undefined,
    );
    if ("error" in result) return { status: 400, data: result };
    return { status: 200, data: result };
  }

  if (method === "POST" && path === "/api/v1/queue/backfill") {
    const result = await QueueService.backfillAllOutputs(db, db);
    return { status: 200, data: result };
  }

  // Thumbnail by entity
  const thumbEntityMatch = path.match(
    /^\/api\/v1\/queue\/thumbnail\/(media|episode|season)\/(\d+)$/,
  );
  if (thumbEntityMatch && method === "POST") {
    const entityType = thumbEntityMatch[1] as "media" | "episode" | "season";
    const entityId = parseInt(thumbEntityMatch[2]!, 10);
    const seekParam = url.searchParams.get("seek") || undefined;
    const result = await QueueService.getOrGenerateThumbnail(
      db,
      db,
      entityType,
      entityId,
      seekParam,
    );
    if ("error" in result) return { status: 400, data: result };
    return { status: 200, data: result };
  }

  const queueMatch = path.match(/^\/api\/v1\/queue\/([^/]+)(\/.*)?$/);
  if (queueMatch) {
    const idStr = queueMatch[1]!;
    const id = parseInt(idStr, 10);
    const subPath = queueMatch[2] || "";

    if (isNaN(id)) return null;

    if (method === "GET" && !subPath) {
      const task = QueueService.get(db, id);
      if (!task) return { status: 404, data: { error: "Task not found" } };
      return { status: 200, data: task };
    }

    if (method === "PUT" && !subPath) {
      const body = (await req.json().catch(() => ({}))) as Record<string>;
      const result = QueueService.update(db, id, {
        title: body.title as string | undefined,
        description: body.description as string | undefined,
        qualities: body.qualities as string[] | undefined,
        source_video_url: body.source_video_url as string | undefined,
        thumbnail_url: body.thumbnail_url as string | undefined,
        media_id: body.media_id as number | undefined,
        season_id: body.season_id as number | undefined,
        episode_id: body.episode_id as number | undefined,
      });
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: result };
    }

    if (method === "DELETE" && !subPath) {
      const result = QueueService.delete(db, id);
      if ("error" in result) return { status: 404, data: result };
      return { status: 200, data: result };
    }

    if (method === "POST" && subPath === "/start") {
      const result = QueueService.start(db, id, userId);
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: result };
    }

    if ((method === "POST" || method === "GET") && subPath === "/probe") {
      const result = await QueueService.probe(db, id);
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: result };
    }

    if (method === "POST" && subPath === "/stop") {
      const result = QueueService.stop(db, id);
      return { status: 200, data: result };
    }

    if (method === "POST" && subPath === "/restart") {
      const result = QueueService.restart(db, id);
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: result };
    }

    if (method === "GET" && subPath === "/outputs") {
      const result = QueueService.getTaskOutputs(db, id);
      return { status: 200, data: result };
    }

    if (method === "POST" && subPath === "/add-quality") {
      const body = await req.json().catch(() => ({}));
      const result = QueueService.addQualityToTask(
        db,
        id,
        body.quality as string,
      );
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: result };
    }

    if (method === "POST" && subPath === "/quality") {
      const body = await req.json().catch(() => ({}));
      const result = QueueService.setQualities(
        db,
        id,
        body.qualities as string[],
      );
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: result };
    }

    if (method === "POST" && subPath === "/extract-tracks") {
      const result = await QueueTrackService.extractTracks(db, id);
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: result };
    }

    if (method === "POST" && subPath === "/extract-audio") {
      const result = await QueueTrackService.extractAudioTracks(db, id);
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: result };
    }

    if (method === "POST" && subPath === "/process-tracks") {
      const result = await QueueService.processTracks(db, id);
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: result };
    }

    if (method === "POST" && subPath === "/thumbnail") {
      const seekParam = url.searchParams.get("seek");
      const result = await QueueService.generateThumbnail(
        db,
        db,
        id,
        seekParam,
      );
      if ("error" in result) return { status: 400, data: result };
      return { status: 201, data: result };
    }

    if (method === "POST" && subPath === "/backfill") {
      const result = await QueueService.backfillTaskOutputs(db, db, id);
      return { status: 200, data: result };
    }

    // Track management
    const trackMatch = subPath.match(/^\/tracks\/(\d+)$/);
    if (method === "PUT" && trackMatch) {
      const trackId = parseInt(trackMatch[1]!, 10);
      const body = (await req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const result = QueueTrackService.updateTrack(db, id, trackId, body);
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: result };
    }

    if (method === "DELETE" && trackMatch) {
      const trackId = parseInt(trackMatch[1]!, 10);
      const result = QueueTrackService.removeTrack(db, id, trackId);
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: { success: true } };
    }

    if (method === "POST" && subPath === "/tracks") {
      const body = (await req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const result = QueueTrackService.addTrack(db, id, body);
      if ("error" in result) return { status: 400, data: result };
      return { status: 201, data: result };
    }
  }

  return null;
}
