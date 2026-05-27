import { useEffect, useState, useRef } from "preact/hooks";
import { api } from "../../api/client";
import { addToast } from "../../state";
import { t } from "../../i18n";

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
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadFiles() {
    setLoading(true);
    try {
      const res = await api.listFiles();
      setFiles(res.files);
    } catch (e: any) {
      addToast("error", `${t("common.error")}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      await api.uploadFile(file);
      addToast("success", t("files.uploadSuccess"));
      await loadFiles();
    } catch (e: any) {
      addToast("error", `${t("files.uploadError")}: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
      handleUpload(input.files[0]);
      input.value = "";
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("video/")) {
      handleUpload(file);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  useEffect(() => { loadFiles(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setPlaying(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));
  const countText = t("files.count", { count: files.length, plural: files.length !== 1 ? "s" : "" });

  return (
    <div class="space-y-4 animate-fade-in">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-surface-100">{t("files.title")}</h2>
          <p class="text-sm text-surface-500 mt-0.5">{countText}</p>
        </div>
        <div class="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            class="hidden"
            onChange={handleFileInput}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {uploading ? (
              <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            )}
            {uploading ? t("files.uploading") : t("files.upload")}
          </button>
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              placeholder={t("files.search")}
              class="w-64 bg-surface-800/80 border border-surface-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
            />
          </div>
          <button
            onClick={loadFiles}
            class="p-2 bg-surface-800/80 hover:bg-surface-700 border border-surface-700/50 rounded-lg text-surface-400 hover:text-surface-200 transition-all"
            title={t("files.refresh")}
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
        <div
          class={`bg-surface-900/50 border-2 border-dashed rounded-2xl py-20 text-center transition-colors ${
            dragOver ? "border-blue-500/50 bg-blue-500/5" : "border-surface-800/50"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-800/50 flex items-center justify-center">
            <svg class="w-8 h-8 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </div>
          <p class="text-surface-400 text-sm">{search ? t("files.noMatch") : t("files.noFiles")}</p>
          {!search && (
            <>
              <p class="text-surface-500 text-xs mt-1">{t("files.dropHint")}</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                class="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                {t("files.dropOrClick")}
              </button>
            </>
          )}
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
              {t("common.error")}
            </video>
          </div>
        </div>
      )}
    </div>
  );
}
