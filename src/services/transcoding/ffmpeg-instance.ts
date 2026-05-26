import { FFmpegManager } from "ffmpeg-lib";
import { join } from "path";
import { readdir, rm } from "fs/promises";

const FFMPEG_URLS: Record<string, string[]> = {
  win32: [
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
    "https://github.com/GyanD/codexffmpeg/releases/download/8.1/ffmpeg-8.1-essentials_build.zip",
  ],
  linux: [
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz",
    "https://github.com/Ven0m0/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.0-latest-linux64-gpl-8.0.tar.xz",
  ],
  darwin: [
    "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip",
  ],
};

const BINARIES_DIR = join(process.cwd(), "binaries");

function getCustomUrls() {
  const platform = process.platform as string;
  const urls = FFMPEG_URLS[platform] || FFMPEG_URLS.linux;
  const customUrls: Record<string, string> = {};
  if (urls?.[0]) {
    customUrls[platform] = urls[0];
  }
  return customUrls;
}

const manager = new FFmpegManager(BINARIES_DIR, getCustomUrls());

async function _cleanStaleLocksAndTemps() {
  try {
    const entries = await readdir(BINARIES_DIR);
    for (const entry of entries) {
      if (entry.endsWith(".lock") || entry.startsWith("temp_")) {
        const fullPath = join(BINARIES_DIR, entry);
        await rm(fullPath, { recursive: true, force: true });
        console.log("[ffmpeg-instance] Cleaned stale:", entry);
      }
    }
  } catch {}
}

let _ffmpegPath: string | null = null;
let _ffprobePath: string | null = null;
let _initPromise: Promise<void> | null = null;

async function _init() {
  await _cleanStaleLocksAndTemps();

  if (await manager.isFFmpegAvailable()) {
    const paths = await manager.verifyBinaries();
    _ffmpegPath = paths.ffmpegPath;
    _ffprobePath = paths.ffprobePath;
    const info = await manager.getInstallationInfo();
    console.log("[ffmpeg-instance] Using existing FFmpeg:", info?.version);
    return;
  }

  console.log("[ffmpeg-instance] Downloading FFmpeg v8...");
  await manager.downloadFFmpegBinaries(true);
  const paths = await manager.verifyBinaries();
  _ffmpegPath = paths.ffmpegPath;
  _ffprobePath = paths.ffprobePath;
  console.log("[ffmpeg-instance] Ready:", _ffmpegPath);
}
//_init test only comment
_init();
export async function getFFmpegPaths(): Promise<{
  ffmpegPath: string;
  ffprobePath: string;
}> {
  if (!_initPromise) {
    _initPromise = _init();
  }
  await _initPromise;
  return { ffmpegPath: _ffmpegPath!, ffprobePath: _ffprobePath! };
}

export { manager as ffmpegManager };
