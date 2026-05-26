import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";

export interface M3U8Variant {
  bandwidth: number;
  resolution?: string;
  width?: number;
  height?: number;
  codecs?: string[];
  frameRate?: number;
  uri: string;
  audio?: string;
  video?: string;
  subtitles?: string;
  closedCaptions?: string;
}

export interface M3U8Media {
  type: "SUBTITLES" | "AUDIO";
  groupId: string;
  name: string;
  lang?: string;
  uri?: string;
  default?: boolean;
  forced?: boolean;
  autoselect?: boolean;
  characteristics?: string;
}

export interface M3U8PlaylistInfo {
  version?: number;
  targetDuration?: number;
  mediaSequence?: number;
  segments: number;
  endList: boolean;
  totalDuration: number;
}

export interface M3U8MasterInfo {
  version?: number;
  variants: M3U8Variant[];
  media: M3U8Media[];
  independentSegments?: boolean;
}

export interface ParsedM3U8 {
  type: "master" | "variant";
  masterInfo?: M3U8MasterInfo;
  variantInfo?: M3U8PlaylistInfo;
  raw: string;
  path: string;
}

interface StreamAttrResult {
  bandwidth?: number;
  width?: number;
  height?: number;
  resolution?: string;
  codecs?: string[];
  frameRate?: number;
  audio?: string;
  video?: string;
  subtitles?: string;
  closedCaptions?: string;
}

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const quotedMatches = line.matchAll(/([A-Z-]+)="([^"]*)"/g);
  for (const match of quotedMatches) {
    if (match[1] && match[2] !== undefined) {
      attrs[match[1]] = match[2];
    }
  }
  const unquotedMatches = line.matchAll(/([A-Z-]+)=([A-Za-z0-9_-]+)/g);
  for (const match of unquotedMatches) {
    if (match[1] && match[2] !== undefined && !attrs[match[1]]) {
      attrs[match[1]] = match[2];
    }
  }
  return attrs;
}

function parseStreamInf(value: string): StreamAttrResult {
  const result: StreamAttrResult = {};
  
  const bandwidthMatch = value.match(/BANDWIDTH=(\d+)/);
  if (bandwidthMatch && bandwidthMatch[1]) result.bandwidth = parseInt(bandwidthMatch[1], 10);
  
  const resMatch = value.match(/RESOLUTION=(\d+x\d+)/);
  if (resMatch && resMatch[1]) {
    const parts = resMatch[1].split("x");
    if (parts.length === 2 && parts[0] && parts[1]) {
      result.width = parseInt(parts[0], 10);
      result.height = parseInt(parts[1], 10);
      result.resolution = resMatch[1];
    }
  }
  
  const codecsMatch = value.match(/CODECS="([^"]+)"/);
  if (codecsMatch && codecsMatch[1]) result.codecs = codecsMatch[1].split(",").map(c => c.trim());
  
  const frameMatch = value.match(/FRAME-RATE=([\d.]+)/);
  if (frameMatch && frameMatch[1]) result.frameRate = parseFloat(frameMatch[1]);
  
  const audioMatch = value.match(/AUDIO="([^"]+)"/);
  if (audioMatch && audioMatch[1]) result.audio = audioMatch[1];
  
  const videoMatch = value.match(/VIDEO="([^"]+)"/);
  if (videoMatch && videoMatch[1]) result.video = videoMatch[1];
  
  const subMatch = value.match(/SUBTITLES="([^"]+)"/);
  if (subMatch && subMatch[1]) result.subtitles = subMatch[1];
  
  const ccMatch = value.match(/CLOSED-CAPTIONS="([^"]+)"/);
  if (ccMatch && ccMatch[1]) result.closedCaptions = ccMatch[1];
  
  return result;
}

function parseMedia(value: string): M3U8Media | null {
  const attrs = parseAttributes(value);
  const type = attrs["TYPE"];
  const groupId = attrs["GROUP-ID"];
  const name = attrs["NAME"];
  
  if (!type || !groupId || !name) return null;
  
  return {
    type: type as "SUBTITLES" | "AUDIO",
    groupId,
    name,
    lang: attrs["LANGUAGE"],
    uri: attrs["URI"],
    default: attrs["DEFAULT"] === "YES",
    forced: attrs["FORCED"] === "YES",
    autoselect: attrs["AUTOSELECT"] === "YES",
    characteristics: attrs["CHARACTERISTICS"],
  };
}

export class M3U8Parser {
  private lines: string[] = [];
  private currentLine = 0;
  private basePath: string;

  constructor(content: string, basePath: string = "") {
    this.lines = content.split(/\r?\n/);
    this.currentLine = 0;
    this.basePath = basePath;
  }

  private peek(): string | undefined {
    return this.lines[this.currentLine];
  }

  private next(): string | undefined {
    return this.lines[this.currentLine++];
  }

  private hasNext(): boolean {
    return this.currentLine < this.lines.length;
  }

  private resolveUri(uri: string): string {
    if (!uri) return uri;
    if (uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("/")) {
      return uri;
    }
    return join(this.basePath, uri);
  }

  parseMaster(): M3U8MasterInfo {
    const variants: M3U8Variant[] = [];
    const media: M3U8Media[] = [];
    let version: number | undefined;
    let independentSegments = false;

    while (this.hasNext()) {
      const line = this.next() ?? "";
      
      if (line.startsWith("#EXT-X-VERSION:")) {
        const match = line.match(/#EXT-X-VERSION:(\d+)/);
        if (match?.[1]) {
          version = parseInt(match[1], 10);
        }
        continue;
      }

      if (line === "#EXT-X-INDEPENDENT-SEGMENTS") {
        independentSegments = true;
        continue;
      }

      if (line.startsWith("#EXT-X-MEDIA:")) {
        const match = line.match(/#EXT-X-MEDIA:(.+)/);
        if (match?.[1]) {
          const mediaInfo = parseMedia(match[1]);
          if (mediaInfo) media.push(mediaInfo);
        }
        continue;
      }

      if (line.startsWith("#EXT-X-STREAM-INF:")) {
        const match = line.match(/#EXT-X-STREAM-INF:(.+)/);
        if (match?.[1]) {
          const streamAttrs = parseStreamInf(match[1]);
          const uri = this.next();
          if (uri && !uri.startsWith("#") && uri.length > 0) {
            variants.push({
              ...streamAttrs,
              bandwidth: streamAttrs.bandwidth ?? 0,
              uri: this.resolveUri(uri),
            } as M3U8Variant);
          }
        }
        continue;
      }
    }

    return { version, variants, media, independentSegments };
  }

  parseVariant(): M3U8PlaylistInfo {
    let version: number | undefined;
    let targetDuration: number | undefined;
    let mediaSequence: number | undefined;
    let segments = 0;
    let endList = false;
    let totalDuration = 0;
    let currentDuration = 0;

    while (this.hasNext()) {
      const line = this.next() ?? "";

      if (line.startsWith("#EXT-X-VERSION:")) {
        const match = line.match(/#EXT-X-VERSION:(\d+)/);
        if (match?.[1]) version = parseInt(match[1], 10);
        continue;
      }

      if (line.startsWith("#EXT-X-TARGETDURATION:")) {
        const match = line.match(/#EXT-X-TARGETDURATION:(\d+)/);
        if (match?.[1]) targetDuration = parseInt(match[1], 10);
        continue;
      }

      if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
        const match = line.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
        if (match?.[1]) mediaSequence = parseInt(match[1], 10);
        continue;
      }

      if (line === "#EXT-X-ENDLIST") {
        endList = true;
        continue;
      }

      const infMatch = line.match(/^#EXTINF:(\d+(?:\.\d+)?)/);
      if (infMatch && infMatch[1]) {
        currentDuration = parseFloat(infMatch[1]);
        const nextLine = this.peek();
        const isSegment = nextLine !== undefined && !nextLine.startsWith("#");
        if (isSegment) {
          segments++;
          totalDuration += currentDuration;
          this.next();
        }
        continue;
      }
    }

    return {
      version,
      targetDuration,
      mediaSequence,
      segments,
      endList,
      totalDuration,
    };
  }

  static parse(content: string, filePath: string = ""): ParsedM3U8 {
    const trimmed = content.trim();
    const isMaster = trimmed.includes("#EXT-X-STREAM-INF");
    const basePath = filePath ? dirname(filePath) : "";

    const parser = new M3U8Parser(content, basePath);
    
    if (isMaster) {
      const masterInfo = parser.parseMaster();
      return {
        type: "master",
        masterInfo,
        raw: content,
        path: filePath,
      };
    } else {
      const variantInfo = parser.parseVariant();
      return {
        type: "variant",
        variantInfo,
        raw: content,
        path: filePath,
      };
    }
  }

  static parseFile(filePath: string): ParsedM3U8 | null {
    if (!existsSync(filePath)) {
      return null;
    }
    const content = readFileSync(filePath, "utf-8");
    return M3U8Parser.parse(content, filePath);
  }

  static async parseUrl(url: string): Promise<ParsedM3U8 | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const content = await response.text();
      return M3U8Parser.parse(content, url);
    } catch {
      return null;
    }
  }
}

export function getQualityFromBandwidth(bandwidth: number): string {
  if (bandwidth >= 8_000_000) return "2160p";
  if (bandwidth >= 5_000_000) return "1080p";
  if (bandwidth >= 2_800_000) return "720p";
  if (bandwidth >= 1_400_000) return "480p";
  if (bandwidth >= 800_000) return "360p";
  if (bandwidth >= 400_000) return "240p";
  return "unknown";
}

export function getResolutionLabel(width?: number, height?: number): string {
  if (height) {
    if (height >= 2160) return "2160p (4K)";
    if (height >= 1440) return "1440p (2K)";
    if (height >= 1080) return "1080p (FHD)";
    if (height >= 720) return "720p (HD)";
    if (height >= 480) return "480p (SD)";
    if (height >= 360) return "360p";
    if (height >= 240) return "240p";
    return `${height}p`;
  }
  if (width) {
    return `${width}p`;
  }
  return "unknown";
}

export interface HLSResourceInfo {
  taskId?: number;
  mediaId?: number;
  seasonId?: number;
  episodeId?: number;
  type: "master" | "variant";
  qualities: string[];
  totalDuration: number;
  segmentsCount: number;
  hasAudio: boolean;
  hasSubtitles: boolean;
  audioTracks: string[];
  subtitleTracks: string[];
  fileSize?: number;
  createdAt?: string;
  isActive: boolean;
}

export function buildMasterPlaylist(
  variants: M3U8Variant[],
  media: M3U8Media[]
): string {
  const lines: string[] = ["#EXTM3U", "#EXT-X-VERSION:3"];

  for (const m of media) {
    const attrs: string[] = [
      `TYPE=${m.type}`,
      `GROUP-ID="${m.groupId}"`,
      `NAME="${m.name}"`,
    ];
    if (m.lang) attrs.push(`LANGUAGE="${m.lang}"`);
    if (m.uri) attrs.push(`URI="${m.uri}"`);
    if (m.default) attrs.push("DEFAULT=YES");
    if (m.forced) attrs.push("FORCED=YES");
    if (m.autoselect) attrs.push("AUTOSELECT=YES");
    if (m.characteristics) attrs.push(`CHARACTERISTICS="${m.characteristics}"`);
    
    lines.push(`#EXT-X-MEDIA:${attrs.join(",")}`);
  }

  for (const v of variants) {
    const attrs: string[] = [`BANDWIDTH=${v.bandwidth}`];
    if (v.width && v.height) {
      attrs.push(`RESOLUTION=${v.width}x${v.height}`);
    }
    if (v.codecs?.length) {
      attrs.push(`CODECS="${v.codecs.join(",")}"`);
    }
    if (v.frameRate) {
      attrs.push(`FRAME-RATE=${v.frameRate}`);
    }
    if (v.audio) attrs.push(`AUDIO="${v.audio}"`);
    if (v.video) attrs.push(`VIDEO="${v.video}"`);
    if (v.subtitles) attrs.push(`SUBTITLES="${v.subtitles}"`);
    if (v.closedCaptions) attrs.push(`CLOSED-CAPTIONS="${v.closedCaptions}"`);
    
    lines.push(`#EXT-X-STREAM-INF:${attrs.join(",")}`);
    lines.push(v.uri);
  }

  return lines.join("\n");
}

export function extractVariantsFromMaster(masterPath: string): M3U8Variant[] | null {
  const parsed = M3U8Parser.parseFile(masterPath);
  if (!parsed || parsed.type !== "master" || !parsed.masterInfo) {
    return null;
  }
  return parsed.masterInfo.variants;
}

export interface M3U8EditOptions {
  addVariants?: M3U8Variant[];
  removeVariantUris?: string[];
  addMedia?: M3U8Media[];
  removeMediaByGroup?: string[];
  removeMediaByName?: string[];
  removeMediaByUri?: string[];
  /** Add SUBTITLES="{value}" to every existing #EXT-X-STREAM-INF that lacks it */
  setVariantSubtitles?: string;
}

export interface M3U8UpdateResult {
  success: boolean;
  content: string;
  addedVariants: number;
  removedVariants: number;
  addedMedia: number;
  removedMedia: number;
}

export function editMasterPlaylist(
  content: string,
  options: M3U8EditOptions
): M3U8UpdateResult {
  const lines = content.split("\n");
  const newLines: string[] = [];
  const seenVariantUris = new Set<string>();
  const seenMediaKeys = new Set<string>();

  let addedVariants = 0;
  let removedVariants = 0;
  let addedMedia = 0;
  let removedMedia = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const uriLine = (lines[i + 1] ?? "").trim();
      const isVariantLine = uriLine && !uriLine.startsWith("#");

      if (isVariantLine && options.removeVariantUris?.includes(uriLine)) {
        removedVariants++;
        i += 2;
        continue;
      }

      if (isVariantLine) {
        seenVariantUris.add(uriLine);
      }

      let infLine = line;
      if (options.setVariantSubtitles && !line.includes("SUBTITLES=")) {
        infLine = `${line},SUBTITLES="${options.setVariantSubtitles}"`;
      }

      newLines.push(infLine);
      if (uriLine) newLines.push(uriLine);
      i += 2;
    } else if (line.startsWith("#EXT-X-MEDIA:")) {
      const attrs = parseAttributes(line.replace("#EXT-X-MEDIA:", ""));
      const key = `${attrs["GROUP-ID"]}-${attrs["NAME"]}-${attrs["LANGUAGE"] || ""}`;

      if ((attrs["GROUP-ID"] && options.removeMediaByGroup?.includes(attrs["GROUP-ID"])) ||
          (attrs["NAME"] && options.removeMediaByName?.includes(attrs["NAME"])) ||
          (attrs["URI"] && options.removeMediaByUri?.some(uri => attrs["URI"]?.includes(uri)))) {
        removedMedia++;
        i++;
        continue;
      }

      seenMediaKeys.add(key);
      newLines.push(line);
      i++;
    } else {
      newLines.push(line);
      i++;
    }
  }

  if (options.addVariants) {
    for (const v of options.addVariants) {
      if (!seenVariantUris.has(v.uri)) {
        const attrs: string[] = [`BANDWIDTH=${v.bandwidth}`];
        if (v.width && v.height) {
          attrs.push(`RESOLUTION=${v.width}x${v.height}`);
        }
        if (v.codecs?.length) {
          attrs.push(`CODECS="${v.codecs.join(",")}"`);
        }
        if (v.subtitles) attrs.push(`SUBTITLES="${v.subtitles}"`);
        if (v.audio) attrs.push(`AUDIO="${v.audio}"`);
        
        newLines.push(`#EXT-X-STREAM-INF:${attrs.join(",")}`);
        newLines.push(v.uri);
        addedVariants++;
      }
    }
  }

  if (options.addMedia) {
    for (const m of options.addMedia) {
      const key = `${m.groupId}-${m.name}-${m.lang || ""}`;
      if (!seenMediaKeys.has(key)) {
        const attrs: string[] = [
          `TYPE=${m.type}`,
          `GROUP-ID="${m.groupId}"`,
          `NAME="${m.name}"`,
        ];
        if (m.lang) attrs.push(`LANGUAGE="${m.lang}"`);
        if (m.uri) attrs.push(`URI="${m.uri}"`);
        if (m.default) attrs.push("DEFAULT=YES");
        if (m.forced) attrs.push("FORCED=YES");
        if (m.autoselect) attrs.push("AUTOSELECT=YES");
        
        newLines.push(`#EXT-X-MEDIA:${attrs.join(",")}`);
        addedMedia++;
      }
    }
  }

  return {
    success: true,
    content: newLines.join("\n"),
    addedVariants,
    removedVariants,
    addedMedia,
    removedMedia,
  };
}

export function readMasterPlaylist(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath, "utf-8");
}

export function writeMasterPlaylist(filePath: string, content: string): boolean {
  try {
    writeFileSync(filePath, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function updateMasterPlaylistFile(
  filePath: string,
  options: M3U8EditOptions
): M3U8UpdateResult | null {
  const content = readMasterPlaylist(filePath);
  if (!content) return null;

  const result = editMasterPlaylist(content, options);
  const success = writeMasterPlaylist(filePath, result.content);

  return success ? result : null;
}

export function getSubtitlesFromMaster(masterContent: string): M3U8Media[] {
  const parsed = M3U8Parser.parse(masterContent);
  if (!parsed.masterInfo) return [];
  
  return parsed.masterInfo.media.filter(m => m.type === "SUBTITLES");
}

export function getAudioFromMaster(masterContent: string): M3U8Media[] {
  const parsed = M3U8Parser.parse(masterContent);
  if (!parsed.masterInfo) return [];
  
  return parsed.masterInfo.media.filter(m => m.type === "AUDIO");
}

export function getVariantsFromMaster(masterContent: string): M3U8Variant[] {
  const parsed = M3U8Parser.parse(masterContent);
  if (!parsed.masterInfo) return [];
  
  return parsed.masterInfo.variants;
}

export function buildSubtitlePlaylist(vttFilename: string, targetDuration: number = 10): string {
  return `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:${targetDuration}
#EXTINF:${targetDuration},
${vttFilename}
#EXT-X-ENDLIST`;
}