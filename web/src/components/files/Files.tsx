import { useEffect, useState, useRef } from "preact/hooks";
import { api } from "../../api/client";
import { addToast } from "../../state";

interface VideoFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  ext: string;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function extIcon(ext: string) {
  switch (ext) {
    case ".mp4": return "MP4";
    case ".mkv": return "MKV";
    case ".webm": return "WEBM";
    case ".avi": return "AVI";
    case ".mov": return "MOV";
    case ".ts": return "TS";
    default: return ext.replace(".", "").toUpperCase();
  }
}

export function Files() {
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<VideoFile | null>(null);
  const [search, setSearch] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  async function loadFiles() {
    setLoading(true);
    try {
      const res = await api.listFiles();
      setFiles(res.files);
    } catch (e: any) {
      addToast("error", `Failed to load files: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadFiles(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPlaying(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-surface-100">Video Files</h2>
          <p class="text-sm text-surface-500 mt-0.5">{files.length} video{files.length !== 1 ? "s" : ""} in storage</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              placeholder="Search files..."
              class="w-64 bg-surface-800/80 border border-surface-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
            />
          </div>
          <button
            onClick={loadFiles}
            class="p-2 bg-surface-800/80 hover:bg-surface-700 border border-surface-700/50 rounded-lg text-surface-400 hover:text-surface-200 transition-all"
            title="Refresh"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div class="flex items-center justify-center py-20">
          <div class="w-8 h-8 border-2 border-surface-600 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div class="bg-surface-900/50 border border-surface-800/50 rounded-2xl py-20 text-center">
          <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-800/50 flex items-center justify-center">
            <svg class="w-8 h-8 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </div>
          <p class="text-surface-400 text-sm">{search ? "No files match your search" : "No video files found"}</p>
          <p class="text-surface-600 text-xs mt-1">Download or upload videos to see them here</p>
        </div>
      ) : (
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((f) => (
            <button
              key={f.path}
              onClick={() => setPlaying(f)}
              class="group bg-surface-900/60 border border-surface-800/50 rounded-xl overflow-hidden text-left hover:border-surface-600/50 hover:bg-surface-800/40 transition-all duration-200"
            >
              <div class="aspect-video bg-surface-800/80 flex items-center justify-center relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-t from-surface-900/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div class="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 group-hover:bg-white/20 transition-all duration-200">
                  <svg class="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <span class="absolute top-2 right-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm text-[10px] font-bold text-white/80 rounded-md tracking-wider">
                  {extIcon(f.ext)}
                </span>
              </div>
              <div class="p-3">
                <p class="text-sm text-surface-200 font-medium truncate group-hover:text-white transition-colors">{f.name}</p>
                <div class="flex items-center gap-3 mt-1.5">
                  <span class="text-xs text-surface-500">{formatBytes(f.size)}</span>
                  <span class="text-surface-700">·</span>
                  <span class="text-xs text-surface-500">{formatDate(f.modified)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {playing && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setPlaying(null); }}
        >
          <div class="w-full max-w-5xl mx-4 space-y-3">
            <div class="flex items-center justify-between">
              <div class="min-w-0 flex-1">
                <p class="text-white font-medium truncate">{playing.name}</p>
                <p class="text-surface-400 text-xs">{formatBytes(playing.size)} · {formatDate(playing.modified)}</p>
              </div>
              <button
                onClick={() => { if (videoRef.current) { videoRef.current.pause(); } setPlaying(null); }}
                class="ml-4 p-2 text-surface-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <video
              ref={videoRef}
              src={api.getFileServeUrl(playing.path)}
              controls
              autoplay
              class="w-full rounded-xl bg-black max-h-[80vh]"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      )}
    </div>
  );
}
