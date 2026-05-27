import { useEffect, useState } from "preact/hooks";
import { api } from "../../api/client";
import { t } from "../../i18n";

interface VideoFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  ext: string;
}

interface Props {
  open: boolean;
  onSelect: (path: string) => void;
  onClose: () => void;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function MediaPicker({ open, onSelect, onClose }: Props) {
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch("");
    api.listFiles().then((res) => setFiles(res.files)).catch(() => {}).finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const filtered = files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl shadow-black/40 w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b border-surface-800/80 shrink-0">
          <h2 class="text-base font-semibold text-surface-100">{t("picker.title")}</h2>
          <button onClick={onClose} class="p-1 text-surface-500 hover:text-surface-200 rounded-lg hover:bg-surface-800 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="px-6 pt-4 pb-3 shrink-0">
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              placeholder={t("picker.search")}
              class="w-full bg-surface-800/60 border border-surface-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-blue-500/50 transition-all"
              autoFocus
            />
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
          {loading ? (
            <div class="flex items-center justify-center py-12">
              <div class="w-6 h-6 border-2 border-surface-600 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div class="py-12 text-center">
              <svg class="w-10 h-10 text-surface-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              <p class="text-sm text-surface-400">{search ? t("picker.noMatch") : t("picker.noVideos")}</p>
            </div>
          ) : (
            <div class="space-y-1">
              {filtered.map((f) => (
                <button
                  key={f.path}
                  onClick={() => { onSelect(f.path); onClose(); }}
                  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-surface-800/60 transition-colors group"
                >
                  <div class="w-8 h-8 rounded-lg bg-surface-800 flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4 text-surface-400 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-surface-200 truncate group-hover:text-white transition-colors">{f.name}</p>
                    <p class="text-[11px] text-surface-500 truncate">{f.path}</p>
                  </div>
                  <span class="text-[11px] text-surface-500 shrink-0">{formatBytes(f.size)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
