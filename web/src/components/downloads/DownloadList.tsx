import { useEffect, useState } from "preact/hooks";
import { downloads, refreshDownloads, addToast, updateDownloadProgress } from "../../state";
import { api } from "../../api/client";
import { subscribeJob, unsubscribeJob, onMessage } from "../../ws/socket";
import { ProgressBar } from "../common/ProgressBar";
import { StatusBadge } from "../common/StatusBadge";
import { Modal } from "../common/Modal";
import { t } from "../../i18n";
import type { DownloadProgressMsg } from "../../types";

export function DownloadList({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [url, setUrl] = useState("");
  const [filename, setFilename] = useState("");
  const [type, setType] = useState("file");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    refreshDownloads();
    const unsub = onMessage((msg) => {
      if (msg.type === "download:progress") {
        const m = msg as DownloadProgressMsg;
        updateDownloadProgress(m.taskId, m.progress, m.status, {
          filename: m.filename,
          downloaded_bytes: m.downloaded,
          total_bytes: m.total,
          file_path: m.file_path,
        });
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    for (const d of downloads.value) {
      if (d.status === "downloading" || d.status === "pending") {
        subscribeJob(d.id);
      }
    }
  }, [downloads.value.length]);

  async function handleCreate() {
    if (!url.trim()) return;
    setCreating(true);
    try {
      const res = await api.createDownload({ url: url.trim(), filename: filename.trim() || undefined, type });
      addToast("success", `${t("dl.created")}: ${res.taskId}`);
      setShowCreate(false);
      setUrl("");
      setFilename("");
      await refreshDownloads();
    } catch (e: any) {
      addToast("error", e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleAction(id: string, action: "pause" | "resume" | "cancel" | "delete") {
    try {
      if (action === "pause") await api.pauseDownload(id);
      else if (action === "resume") await api.resumeDownload(id);
      else if (action === "cancel") await api.cancelDownload(id);
      else if (action === "delete") await api.deleteDownload(id, true);
      addToast("success", t(`dl.${action === "delete" ? "deleted" : action === "pause" ? "paused" : action === "resume" ? "resumed" : "canceled"}`));
      await refreshDownloads();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  function formatBytes(bytes?: number) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  return (
    <div class="space-y-4 animate-fade-in">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-surface-100">{t("dl.title")}</h2>
        <button
          onClick={() => setShowCreate(true)}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {t("dl.new")}
        </button>
      </div>

      <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-surface-800/50 text-surface-400 text-left">
              <th class="px-4 py-3 font-medium">{t("dl.filename")}</th>
              <th class="px-4 py-3 font-medium">{t("dl.type")}</th>
              <th class="px-4 py-3 font-medium">{t("dl.status")}</th>
              <th class="px-4 py-3 font-medium w-48">{t("dl.progress")}</th>
              <th class="px-4 py-3 font-medium">{t("dl.size")}</th>
              <th class="px-4 py-3 font-medium text-right">{t("dl.actions")}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-800/50">
            {downloads.value.length === 0 && (
              <tr><td colSpan={6} class="px-4 py-12 text-center text-surface-500">{t("dl.noDownloads")}</td></tr>
            )}
            {downloads.value.map((d) => (
              <tr key={d.id} class="hover:bg-surface-800/30 transition-colors">
                <td class="px-4 py-3">
                  <p class="text-surface-200 truncate max-w-xs" title={d.filename}>{d.filename}</p>
                  <p class="text-xs text-surface-500 truncate max-w-xs" title={d.url}>{d.url}</p>
                </td>
                <td class="px-4 py-3">
                  <span class="text-xs text-surface-400 bg-surface-800 px-2 py-0.5 rounded">{d.type}</span>
                </td>
                <td class="px-4 py-3"><StatusBadge status={d.status} /></td>
                <td class="px-4 py-3">
                  <ProgressBar
                    value={d.progress}
                    color={d.status === "failed" ? "bg-red-500" : d.status === "completed" ? "bg-emerald-500" : "bg-blue-500"}
                  />
                </td>
                <td class="px-4 py-3 text-xs text-surface-400">
                  {formatBytes(d.downloaded_bytes)} / {formatBytes(d.total_bytes)}
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-1">
                    {d.status === "downloading" && (
                      <button onClick={() => handleAction(d.id, "pause")} class="px-2 py-1 text-xs text-yellow-400 hover:bg-surface-700 rounded">{t("dl.pause")}</button>
                    )}
                    {d.status === "paused" && (
                      <button onClick={() => handleAction(d.id, "resume")} class="px-2 py-1 text-xs text-green-400 hover:bg-surface-700 rounded">{t("dl.resume")}</button>
                    )}
                    {(d.status === "downloading" || d.status === "paused" || d.status === "pending") && (
                      <button onClick={() => handleAction(d.id, "cancel")} class="px-2 py-1 text-xs text-orange-400 hover:bg-surface-700 rounded">{t("dl.cancel")}</button>
                    )}
                    <button onClick={() => handleAction(d.id, "delete")} class="px-2 py-1 text-xs text-red-400 hover:bg-surface-700 rounded">{t("dl.delete")}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t("dl.createTitle")}>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-surface-300 mb-1">{t("dl.url")}</label>
            <input
              value={url}
              onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
              placeholder={t("dl.urlPlaceholder")}
              class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm text-surface-300 mb-1">{t("dl.filenameOpt")}</label>
            <input
              value={filename}
              onInput={(e) => setFilename((e.target as HTMLInputElement).value)}
              placeholder={t("dl.filenamePlaceholder")}
              class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm text-surface-300 mb-1">{t("dl.typeLabel")}</label>
            <select
              value={type}
              onChange={(e) => setType((e.target as HTMLSelectElement).value)}
              class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500"
            >
              <option value="file">File</option>
              <option value="magnet">Magnet</option>
              <option value="torrent">Torrent</option>
            </select>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowCreate(false)} class="px-4 py-2 text-sm text-surface-300 hover:text-surface-100">{t("dl.cancelBtn")}</button>
            <button
              onClick={handleCreate}
              disabled={creating || !url.trim()}
              class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {creating ? t("dl.creating") : t("dl.create")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
