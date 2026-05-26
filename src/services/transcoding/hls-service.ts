import { getDb, drizzle } from "./compat";
import {
  mediaHlsOutputsTable,
  mediaHlsResourcesTable,
  mediaTasksTable,
  type QualityPreset,
} from "../../schema/queue";
import {
  M3U8Parser,
  getQualityFromBandwidth,
  type M3U8Variant,
  type ParsedM3U8,
} from "./m3u8-parser";
import { HlsS3Storage } from "./compat";
import { join, dirname } from "path";
import { existsSync, statSync, readdirSync } from "fs";

export interface HLSResource {
  id: number;
  media_id: number;
  season_id: number | null;
  episode_id: number | null;
  resource_type: string;
  quality: string | null;
  resolution: string | null;
  lang: string | null;
  label: string | null;
  master_url: string;
  playlist_url: string | null;
  source_task_id: number | null;
  output_id: number | null;
  is_available: number;
  is_active: number;
  bandwidth: number | null;
  total_duration: number | null;
  segments_count: number | null;
  file_size: number | null;
  codec_info: string | null;
  audio_tracks: string | null;
  subtitle_tracks: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ResourceQuery {
  media_id?: number;
  season_id?: number;
  episode_id?: number;
  quality?: string;
  lang?: string;
  resource_type?: string;
  include_unavailable?: boolean;
}

export class HLSResourceService {
  async registerResource(
    mediaId: number,
    masterUrl: string,
    options?: {
      seasonId?: number;
      episodeId?: number;
      taskId?: number;
      outputId?: number;
      localPath?: string;
    },
  ): Promise<HLSResource[]> {
    const parsed = await this.parseMasterUrl(masterUrl, options?.localPath);
    if (!parsed) return [];

    const resources: HLSResource[] = [];

    if (parsed.type === "master" && parsed.masterInfo) {
      for (const variant of parsed.masterInfo.variants) {
        const quality = this.getQualityFromVariant(variant);
        const codecInfo = variant.codecs?.join(",") ?? null;

        const result = getDb().run(
          `INSERT INTO media_hls_resources
           (media_id, season_id, episode_id, resource_type, quality, resolution, lang, label,
            master_url, playlist_url, source_task_id, output_id, bandwidth, codec_info, is_available, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
          [
            mediaId,
            options?.seasonId ?? null,
            options?.episodeId ?? null,
            "video",
            quality,
            variant.resolution ?? null,
            null,
            quality,
            masterUrl,
            variant.uri,
            options?.taskId ?? null,
            options?.outputId ?? null,
            variant.bandwidth,
            codecInfo,
          ],
        );

        const resource = drizzle
          .query<HLSResource>("SELECT * FROM media_hls_resources WHERE id = ?")
          .get([result.lastInsertRowid]);

        if (resource) resources.push(resource);
      }

      for (const media of parsed.masterInfo.media) {
        const result = getDb().run(
          `INSERT INTO media_hls_resources
           (media_id, season_id, episode_id, resource_type, quality, resolution, lang, label,
            master_url, playlist_url, source_task_id, output_id, codec_info, is_available, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
          [
            mediaId,
            options?.seasonId ?? null,
            options?.episodeId ?? null,
            media.type.toLowerCase(),
            null,
            null,
            media.lang ?? null,
            media.name,
            masterUrl,
            media.uri ?? null,
            options?.taskId ?? null,
            options?.outputId ?? null,
            null,
          ],
        );

        const resource = drizzle
          .query<HLSResource>("SELECT * FROM media_hls_resources WHERE id = ?")
          .get([result.lastInsertRowid]);

        if (resource) resources.push(resource);
      }
    }

    return resources;
  }

  async queryResources(query: ResourceQuery): Promise<HLSResource[]> {
    let sql = "SELECT * FROM media_hls_resources WHERE 1=1";
    const params: (string | number)[] = [];

    if (query.media_id) {
      sql += " AND media_id = ?";
      params.push(query.media_id);
    }
    if (query.season_id) {
      sql += " AND season_id = ?";
      params.push(query.season_id);
    }
    if (query.episode_id) {
      sql += " AND episode_id = ?";
      params.push(query.episode_id);
    }
    if (query.quality) {
      sql += " AND quality = ?";
      params.push(query.quality);
    }
    if (query.lang) {
      sql += " AND lang = ?";
      params.push(query.lang);
    }
    if (query.resource_type) {
      sql += " AND resource_type = ?";
      params.push(query.resource_type);
    }
    if (!query.include_unavailable) {
      sql += " AND is_available = 1";
    }

    sql += " ORDER BY created_at DESC";

    return drizzle.query<HLSResource>(sql).all(params);
  }

  async getAvailableQualities(
    mediaId: number,
    options?: { seasonId?: number; episodeId?: number },
  ): Promise<string[]> {
    const resources = await this.queryResources({
      media_id: mediaId,
      season_id: options?.seasonId,
      episode_id: options?.episodeId,
      resource_type: "video",
    });

    const qualities = new Set<string>();
    for (const r of resources) {
      if (r.quality) qualities.add(r.quality);
    }
    return Array.from(qualities);
  }

  async getAvailableSubtitles(
    mediaId: number,
    options?: { seasonId?: number; episodeId?: number },
  ): Promise<HLSResource[]> {
    return this.queryResources({
      media_id: mediaId,
      season_id: options?.seasonId,
      episode_id: options?.episodeId,
      resource_type: "subtitles",
    });
  }

  async getAvailableAudio(
    mediaId: number,
    options?: { seasonId?: number; episodeId?: number },
  ): Promise<HLSResource[]> {
    return this.queryResources({
      media_id: mediaId,
      season_id: options?.seasonId,
      episode_id: options?.episodeId,
      resource_type: "audios",
    });
  }

  async findExistingResource(
    mediaId: number,
    quality: string,
    options?: { seasonId?: number; episodeId?: number },
  ): Promise<HLSResource | null> {
    const resources = await this.queryResources({
      media_id: mediaId,
      season_id: options?.seasonId,
      episode_id: options?.episodeId,
      quality,
      resource_type: "video",
    });

    return resources[0] ?? null;
  }

  async markUnavailable(resourceId: number): Promise<boolean> {
    const result = getDb().run(
      "UPDATE media_hls_resources SET is_available = 0, updated_at = ? WHERE id = ?",
      [new Date().toISOString(), resourceId],
    );
    return result.changes > 0;
  }

  async deleteResource(resourceId: number): Promise<boolean> {
    const result = getDb().run("DELETE FROM media_hls_resources WHERE id = ?", [
      resourceId,
    ]);
    return result.changes > 0;
  }

  async cleanupDuplicateResources(mediaId: number): Promise<number> {
    let deleted = 0;

    const resources = drizzle
      .query<HLSResource>(
        "SELECT * FROM media_hls_resources WHERE media_id = ? ORDER BY id ASC",
      )
      .all([mediaId]);

    const seen = new Map<string, number>();

    for (const r of resources) {
      // Include label and playlist_url so regional variants are not dropped
      const key = `${r.resource_type}:${r.quality ?? ""}:${r.lang ?? ""}:${r.label ?? ""}:${r.playlist_url ?? ""}`;

      if (seen.has(key)) {
        const result = getDb().run(
          "DELETE FROM media_hls_resources WHERE id = ?",
          [r.id],
        );
        deleted += result.changes;
      } else {
        seen.set(key, r.id);
      }
    }

    return deleted;
  }

  private async parseMasterUrl(
    url: string,
    localPath?: string,
  ): Promise<ParsedM3U8 | null> {
    if (localPath) {
      const content = await HlsS3Storage.readFile(localPath);
      if (content) {
        return M3U8Parser.parse(content, localPath);
      }
      if (existsSync(localPath)) {
        return M3U8Parser.parseFile(localPath);
      }
    }

    if (url.startsWith("http://") || url.startsWith("https://")) {
      return M3U8Parser.parseUrl(url);
    }

    const filePath = url.startsWith("/") ? url : join(process.cwd(), url);
    const content = await HlsS3Storage.readFile(filePath);
    if (content) {
      return M3U8Parser.parse(content, filePath);
    }
    if (existsSync(filePath)) {
      return M3U8Parser.parseFile(filePath);
    }

    return null;
  }

  private getQualityFromVariant(variant: M3U8Variant): string {
    if (variant.height) {
      return `${variant.height}p`;
    }
    return getQualityFromBandwidth(variant.bandwidth);
  }
}

export class OutputService {
  async createOutput(
    taskId: number,
    mediaId: number,
    m3u8Url: string,
    options?: {
      seasonId?: number;
      episodeId?: number;
      quality?: string;
      resolution?: string;
      bandwidth?: number;
      localPath?: string;
    },
  ): Promise<number | null> {
    let totalDuration = 0;
    let segmentsCount = 0;
    let fileSize = 0;
    let isPrimary = 0;

    if (options?.localPath) {
      const info = await this.extractOutputInfo(options.localPath);
      totalDuration = info.duration;
      segmentsCount = info.segments;
      fileSize = info.fileSize;
    }

    const existing = drizzle
      .query<{
        id: number;
      }>("SELECT id FROM media_hls_outputs WHERE media_id = ? AND quality = ?")
      .get([mediaId, options?.quality ?? null]);

    if (existing) {
      isPrimary = 1;
    }

    const result = getDb().run(
      `INSERT INTO media_hls_outputs
       (task_id, media_id, season_id, episode_id, m3u8_url, master_url, quality, resolution,
        bandwidth, is_active, is_primary, total_duration, segments_count, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        taskId,
        mediaId,
        options?.seasonId ?? null,
        options?.episodeId ?? null,
        m3u8Url,
        m3u8Url,
        options?.quality ?? null,
        options?.resolution ?? null,
        options?.bandwidth ?? null,
        isPrimary,
        totalDuration,
        segmentsCount,
        fileSize,
      ],
    );

    return Number(result.lastInsertRowid);
  }

  async getOutputs(
    mediaId: number,
    options?: { seasonId?: number; episodeId?: number; quality?: string },
  ) {
    let sql = "SELECT * FROM media_hls_outputs WHERE media_id = ?";
    const params: (string | number)[] = [mediaId];

    if (options?.seasonId) {
      sql += " AND season_id = ?";
      params.push(options.seasonId);
    }
    if (options?.episodeId) {
      sql += " AND episode_id = ?";
      params.push(options.episodeId);
    }
    if (options?.quality) {
      sql += " AND quality = ?";
      params.push(options.quality);
    }

    sql += " ORDER BY created_at DESC";

    return drizzle.query(sql).all(params);
  }

  async getPrimaryOutput(
    mediaId: number,
    options?: { seasonId?: number; episodeId?: number },
  ) {
    let sql =
      "SELECT * FROM media_hls_outputs WHERE media_id = ? AND is_primary = 1";
    const params: (string | number)[] = [mediaId];

    if (options?.seasonId) {
      sql += " AND season_id = ?";
      params.push(options.seasonId);
    }
    if (options?.episodeId) {
      sql += " AND episode_id = ?";
      params.push(options.episodeId);
    }

    return drizzle.query(sql).get(params);
  }

  async setPrimaryOutput(outputId: number): Promise<boolean> {
    const output = drizzle
      .query<{
        media_id: number;
        season_id?: number;
        episode_id?: number;
      }>(
        "SELECT media_id, season_id, episode_id FROM media_hls_outputs WHERE id = ?",
      )
      .get([outputId]);

    if (!output) return false;

    getDb().run(
      "UPDATE media_hls_outputs SET is_primary = 0 WHERE media_id = ? AND (season_id IS ? OR (? IS NULL AND season_id IS NULL)) AND (episode_id IS ? OR (? IS NULL AND episode_id IS NULL))",
      [
        output.media_id,
        output.season_id ?? null,
        output.season_id ?? null,
        output.episode_id ?? null,
        output.episode_id ?? null,
      ],
    );

    const result = getDb().run(
      "UPDATE media_hls_outputs SET is_primary = 1 WHERE id = ?",
      [outputId],
    );

    return result.changes > 0;
  }

  async deleteOutput(outputId: number): Promise<boolean> {
    const result = getDb().run("DELETE FROM media_hls_outputs WHERE id = ?", [
      outputId,
    ]);
    return result.changes > 0;
  }

  async addQualityToOutput(
    outputId: number,
    quality: string,
    m3u8Url: string,
    options?: { resolution?: string; bandwidth?: number; localPath?: string },
  ): Promise<boolean> {
    const existing = drizzle
      .query<{
        task_id: number;
        media_id: number;
        season_id?: number;
        episode_id?: number;
      }>(
        "SELECT task_id, media_id, season_id, episode_id FROM media_hls_outputs WHERE id = ?",
      )
      .get([outputId]);

    if (!existing) return false;

    const result = getDb().run(
      `INSERT INTO media_hls_outputs
       (task_id, media_id, season_id, episode_id, m3u8_url, master_url, quality, resolution, bandwidth, is_active, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        existing.task_id,
        existing.media_id,
        existing.season_id ?? null,
        existing.episode_id ?? null,
        m3u8Url,
        m3u8Url,
        quality,
        options?.resolution ?? null,
        options?.bandwidth ?? null,
      ],
    );

    return Number(result.lastInsertRowid) > 0;
  }

  async getOutputById(outputId: number) {
    return drizzle
      .query("SELECT * FROM media_hls_outputs WHERE id = ?")
      .get([outputId]);
  }

  async updateOutput(
    outputId: number,
    data: {
      m3u8_url?: string;
      quality?: string;
      resolution?: string;
      bandwidth?: number;
      is_active?: number;
      is_primary?: number;
    },
  ): Promise<boolean> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    if (data.m3u8_url !== undefined) {
      sets.push("m3u8_url = ?");
      params.push(data.m3u8_url);
    }
    if (data.quality !== undefined) {
      sets.push("quality = ?");
      params.push(data.quality);
    }
    if (data.resolution !== undefined) {
      sets.push("resolution = ?");
      params.push(data.resolution);
    }
    if (data.bandwidth !== undefined) {
      sets.push("bandwidth = ?");
      params.push(data.bandwidth);
    }
    if (data.is_active !== undefined) {
      sets.push("is_active = ?");
      params.push(data.is_active);
    }
    if (data.is_primary !== undefined) {
      sets.push("is_primary = ?");
      params.push(data.is_primary);
    }

    if (sets.length === 0) return false;

    params.push(outputId);
    const result = getDb().run(
      `UPDATE media_hls_outputs SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );

    return result.changes > 0;
  }

  private async extractOutputInfo(
    localPath: string,
  ): Promise<{ duration: number; segments: number; fileSize: number }> {
    const dir = dirname(localPath);
    const masterContent = await HlsS3Storage.readFile(localPath);
    const masterParsed = masterContent
      ? M3U8Parser.parse(masterContent, localPath)
      : null;

    if (masterParsed?.type === "variant" && masterParsed.variantInfo) {
      return {
        duration: masterParsed.variantInfo.totalDuration,
        segments: masterParsed.variantInfo.segments,
        fileSize: this.calculateDirectorySize(dir),
      };
    }

    if (masterParsed?.type === "master" && masterParsed.masterInfo) {
      let totalDuration = 0;
      let totalSegments = 0;

      for (const variant of masterParsed.masterInfo.variants) {
        const variantPath = join(dir, variant.uri);
        const variantContent = await HlsS3Storage.readFile(variantPath);
        const variantParsed = variantContent
          ? M3U8Parser.parse(variantContent, variantPath)
          : null;
        if (variantParsed?.type === "variant" && variantParsed.variantInfo) {
          totalDuration = Math.max(
            totalDuration,
            variantParsed.variantInfo.totalDuration,
          );
          totalSegments += variantParsed.variantInfo.segments;
        }
      }

      return {
        duration: totalDuration,
        segments: totalSegments,
        fileSize: this.calculateDirectorySize(dir),
      };
    }

    return { duration: 0, segments: 0, fileSize: 0 };
  }

  private calculateDirectorySize(dirPath: string): number {
    let size = 0;
    try {
      if (!existsSync(dirPath)) return 0;

      const files = readdirSync(dirPath);
      for (const file of files) {
        const filePath = join(dirPath, file);
        try {
          const stat = statSync(filePath);
          if (stat.isFile()) {
            size += stat.size;
          }
        } catch {
          // Skip inaccessible files
        }
      }
    } catch {
      // Skip inaccessible directories
    }
    return size;
  }
}

export const hlsResourceService = new HLSResourceService();
export const outputService = new OutputService();
