import { z } from "zod";
import { QueueService } from "../../services/queue/queue.service";
import { QueueTrackService } from "../../services/queue/queue-track.service";
import type { DrizzleDb } from "../../db/index";
import type { Database } from "bun:sqlite";
import type { FileService } from "../../services/file.service";
import {
  PaginationSchema,
  EntityFiltersSchema,
  CreateQueueTaskSchema,
  UpdateQueueTaskSchema,
  QueueTaskIdSchema,
  AddQualitySchema,
  SetQualitiesSchema,
  AddTrackSchema,
  UpdateTrackSchema,
  OutputFiltersSchema,
  CheckExistingSchema,
  EntityTypeSchema,
} from "../../validations";
import {
  parseJsonBody,
  parseQueryParams,
  jsonResponse,
  validationErrorResponse,
} from "../../validations/helpers";

interface RouteResult {
  status: number;
  data: unknown;
}

export async function handleQueueRoute(
  method: string,
  path: string,
  url: URL,
  req: Request,
  db: DrizzleDb,
  rawDb: Database,
  fileService: FileService,
  userId: number | null,
): Promise<RouteResult | null> {
  if (method === "GET" && path === "/api/v1/queue") {
    const paginationResult = parseQueryParams(url, PaginationSchema);
    if (!paginationResult.success) return { status: 400, data: { error: "Invalid pagination" } };

    const filtersResult = parseQueryParams(url, EntityFiltersSchema);
    if (!filtersResult.success) return { status: 400, data: { error: "Invalid filters" } };

    const { page, limit } = paginationResult.data;
    const result = QueueService.list(db, rawDb, page!, limit!, (page! - 1) * limit!, filtersResult.data);
    return { status: 200, data: result };
  }

  if (method === "POST" && path === "/api/v1/queue") {
    const bodyResult = await parseJsonBody(req, CreateQueueTaskSchema);
    if (!bodyResult.success) return { status: 400, data: { error: "Invalid request body" } };

    const result = QueueService.create(db, bodyResult.data);
    if ("error" in result) return { status: 400, data: result };
    return { status: 201, data: result };
  }

  if (method === "GET" && path === "/api/v1/queue/outputs") {
    const filtersResult = parseQueryParams(url, OutputFiltersSchema);
    if (!filtersResult.success) return { status: 400, data: { error: "Invalid filters" } };

    const result = QueueService.getOutputs(db, filtersResult.data);
    if ("error" in result) return { status: 400, data: result };
    return { status: 200, data: result };
  }

  if (method === "GET" && path === "/api/v1/queue/qualities") {
    return { status: 200, data: QueueService.getAvailableQualities() };
  }

  if (method === "GET" && path === "/api/v1/queue/check-existing") {
    const paramsResult = parseQueryParams(url, CheckExistingSchema);
    if (!paramsResult.success) return { status: 400, data: { error: "Invalid parameters" } };

    const result = await QueueService.checkExistingOutputs(
      paramsResult.data.media_id,
      paramsResult.data.season_id,
      paramsResult.data.episode_id,
    );
    if ("error" in result) return { status: 400, data: result };
    return { status: 200, data: result };
  }

  if (method === "POST" && path === "/api/v1/queue/backfill") {
    const result = await QueueService.backfillAllOutputs(db, rawDb);
    return { status: 200, data: result };
  }

  const thumbEntityMatch = path.match(
    /^\/api\/v1\/queue\/thumbnail\/(media|episode|season)\/(\d+)$/,
  );
  if (thumbEntityMatch && method === "POST") {
    const entityType = thumbEntityMatch[1] as "media" | "episode" | "season";
    const entityId = parseInt(thumbEntityMatch[2]!, 10);
    const seekParam = url.searchParams.get("seek") || undefined;
    const result = await QueueService.getOrGenerateThumbnail(
      db,
      rawDb,
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
      const bodyResult = await parseJsonBody(req, UpdateQueueTaskSchema);
      if (!bodyResult.success) return { status: 400, data: { error: "Invalid request body" } };

      const result = QueueService.update(db, id, bodyResult.data);
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
      const bodyResult = await parseJsonBody(req, AddQualitySchema);
      if (!bodyResult.success) return { status: 400, data: { error: "Invalid request body" } };

      const result = QueueService.addQualityToTask(db, id, bodyResult.data.quality);
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: result };
    }

    if (method === "POST" && subPath === "/quality") {
      const bodyResult = await parseJsonBody(req, SetQualitiesSchema);
      if (!bodyResult.success) return { status: 400, data: { error: "Invalid request body" } };

      const result = QueueService.setQualities(db, id, bodyResult.data.qualities);
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
      const seekParam = url.searchParams.get("seek") || undefined;
      const result = await QueueService.generateThumbnail(db, rawDb, id, seekParam);
      if ("error" in result) return { status: 400, data: result };
      return { status: 201, data: result };
    }

    if (method === "POST" && subPath === "/backfill") {
      const result = await QueueService.backfillTaskOutputs(db, rawDb, id);
      return { status: 200, data: result };
    }

    const trackMatch = subPath.match(/^\/tracks\/(\d+)$/);
    if (method === "PUT" && trackMatch) {
      const trackId = parseInt(trackMatch[1]!, 10);
      const bodyResult = await parseJsonBody(req, UpdateTrackSchema);
      if (!bodyResult.success) return { status: 400, data: { error: "Invalid request body" } };

      const result = QueueTrackService.updateTrack(db, id, trackId, bodyResult.data);
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: result };
    }

    if (method === "DELETE" && trackMatch) {
      const trackId = parseInt(trackMatch[1]!, 10);
      const result = await QueueTrackService.removeTrack(db, id, trackId);
      if ("error" in result) return { status: 400, data: result };
      return { status: 200, data: { success: true } };
    }

    if (method === "POST" && subPath === "/tracks") {
      const bodyResult = await parseJsonBody(req, AddTrackSchema);
      if (!bodyResult.success) return { status: 400, data: { error: "Invalid request body" } };

      const result = QueueTrackService.addTrack(db, id, bodyResult.data);
      if ("error" in result) return { status: 400, data: result };
      return { status: 201, data: result };
    }
  }

  return null;
}
