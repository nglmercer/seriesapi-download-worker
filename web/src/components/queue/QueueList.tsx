import { useEffect, useState } from "preact/hooks";
import { queueTasks, queueTotal, queuePage, queueLimit, refreshQueue, addToast, updateTranscodeProgress } from "../../state";
import { api } from "../../api/client";
import { onMessage, subscribeJob } from "../../ws/socket";
import { ProgressBar } from "../common/ProgressBar";
import { StatusBadge } from "../common/StatusBadge";
import { Modal } from "../common/Modal";
import { MediaPicker } from "../common/MediaPicker";
import { t } from "../../i18n";
import type { TranscodeProgressMsg } from "../../types";

export function QueueList({ onNavigate }: { onNavigate: (page: string, id?: number) => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [mediaId, setMediaId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [creating, setCreating] = useState(false);
  const [filterMedia, setFilterMedia] = useState("");
  const [filterSeason, setFilterSeason] = useState("");
  const [filterEpisode, setFilterEpisode] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    refreshQueue();
    const unsub = onMessage((msg) => {
      if (msg.type === "transcode:progress") {
        const m = msg as TranscodeProgressMsg;
        updateTranscodeProgress(m.taskId, m.progress, m.status);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    for (const t of queueTasks.value) {
      if (t.status === "processing") subscribeJob(String(t.id));
    }
  }, [queueTasks.value.length]);

  const totalPages = Math.ceil(queueTotal.value / queueLimit.value);

  function handleFilter() {
    queuePage.value = 1;
    refreshQueue(1);
  }

  async function handleCreate() {
    if (!title.trim() || !sourceUrl.trim()) return;
    setCreating(true);
    try {
      await api.createQueueTask({
        title: title.trim(),
        source_video_url: sourceUrl.trim(),
        media_id: mediaId ? parseInt(mediaId) : undefined,
        season_id: seasonId ? parseInt(seasonId) : undefined,
        episode_id: episodeId ? parseInt(episodeId) : undefined,
      });
      addToast("success", t("q.taskCreated"));
      setShowCreate(false);
      setTitle("");
      setSourceUrl("");
      setMediaId("");
      setSeasonId("");
      setEpisodeId("");
      await refreshQueue();
    } catch (e: any) {
      addToast("error", e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleAction(id: number, action: "start" | "stop" | "restart" | "delete") {
    try {
      if (action === "start") await api.startQueueTask(id);
      else if (action === "stop") await api.stopQueueTask(id);
      else if (action === "restart") await api.restartQueueTask(id);
      else if (action === "delete") await api.deleteQueueTask(id);
      addToast("success", t(`q.${action === "delete" ? "deleted" : action === "start" ? "started" : action === "stop" ? "stopped" : "restarted"}`));
      await refreshQueue();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  return (
    <div class="space-y-4 animate-fade-in">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-surface-100">{t("q.title")}</h2>
        <button
          onClick={() => setShowCreate(true)}
          class="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {t("q.new")}
        </button>
      </div>

      <div class="flex items-end gap-3 bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
        <div>
          <label class="block text-xs text-surface-400 mb-1">{t("q.filterMedia")}</label>
          <input value={filterMedia} onInput={(e) => setFilterMedia((e.target as HTMLInputElement).value)} class="w-24 bg-surface-800/60 border border-surface-700/50 rounded px-2 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-blue-500" placeholder="any" />
        </div>
        <div>
          <label class="block text-xs text-surface-400 mb-1">{t("q.filterSeason")}</label>
          <input value={filterSeason} onInput={(e) => setFilterSeason((e.target as HTMLInputElement).value)} class="w-24 bg-surface-800/60 border border-surface-700/50 rounded px-2 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-blue-500" placeholder="any" />
        </div>
        <div>
          <label class="block text-xs text-surface-400 mb-1">{t("q.filterEpisode")}</label>
          <input value={filterEpisode} onInput={(e) => setFilterEpisode((e.target as HTMLInputElement).value)} class="w-24 bg-surface-800/60 border border-surface-700/50 rounded px-2 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-blue-500" placeholder="any" />
        </div>
        <button onClick={handleFilter} class="px-4 py-1.5 bg-surface-700 hover:bg-surface-600 text-sm text-surface-200 rounded transition-colors">{t("q.filter")}</button>
      </div>

      <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-surface-800/50 text-surface-400 text-left">
              <th class="px-4 py-3 font-medium">{t("q.id")}</th>
              <th class="px-4 py-3 font-medium">{t("q.titleCol")}</th>
              <th class="px-4 py-3 font-medium">{t("q.status")}</th>
              <th class="px-4 py-3 font-medium w-48">{t("q.progress")}</th>
              <th class="px-4 py-3 font-medium">{t("q.media")}</th>
              <th class="px-4 py-3 font-medium">{t("q.created")}</th>
              <th class="px-4 py-3 font-medium text-right">{t("q.actions")}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-800/50">
            {queueTasks.value.length === 0 && (
              <tr><td colSpan={7} class="px-4 py-12 text-center text-surface-500">{t("q.noTasks")}</td></tr>
            )}
            {queueTasks.value.map((task) => (
              <tr key={task.id} class="hover:bg-surface-800/30 transition-colors cursor-pointer" onClick={() => onNavigate("queue-detail", task.id)}>
                <td class="px-4 py-3 text-surface-400 font-mono text-xs">{task.id}</td>
                <td class="px-4 py-3 text-surface-200 truncate max-w-xs">{task.title}</td>
                <td class="px-4 py-3"><StatusBadge status={task.status || "pending"} /></td>
                <td class="px-4 py-3">
                  <ProgressBar
                    value={task.progress}
                    color={task.status === "failed" ? "bg-red-500" : task.status === "completed" ? "bg-emerald-500" : "bg-purple-500"}
                  />
                </td>
                <td class="px-4 py-3 text-xs text-surface-400">
                  {task.media_id ? `m:${task.media_id}` : ""}
                  {task.season_id ? ` s:${task.season_id}` : ""}
                  {task.episode_id ? ` e:${task.episode_id}` : ""}
                  {!task.media_id && !task.season_id && !task.episode_id && "—"}
                </td>
                <td class="px-4 py-3 text-xs text-surface-400">{new Date(task.created_at).toLocaleDateString()}</td>
                <td class="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div class="flex items-center justify-end gap-1">
                    {(task.status === "ready" || task.status === "pending") && (
                      <button onClick={() => handleAction(task.id, "start")} class="px-2 py-1 text-xs text-green-400 hover:bg-surface-700 rounded">{t("q.start")}</button>
                    )}
                    {task.status === "processing" && (
                      <button onClick={() => handleAction(task.id, "stop")} class="px-2 py-1 text-xs text-orange-400 hover:bg-surface-700 rounded">{t("q.stop")}</button>
                    )}
                    {(task.status === "failed" || task.status === "stopped" || task.status === "completed") && (
                      <button onClick={() => handleAction(task.id, "restart")} class="px-2 py-1 text-xs text-blue-400 hover:bg-surface-700 rounded">{t("q.restart")}</button>
                    )}
                    <button onClick={() => handleAction(task.id, "delete")} class="px-2 py-1 text-xs text-red-400 hover:bg-surface-700 rounded">{t("q.delete")}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div class="flex items-center justify-center gap-2">
          <button
            disabled={queuePage.value <= 1}
            onClick={() => refreshQueue(queuePage.value - 1)}
            class="px-3 py-1.5 text-sm bg-surface-800 hover:bg-surface-700 disabled:opacity-40 text-surface-200 rounded transition-colors"
          >
            {t("q.prev")}
          </button>
          <span class="text-sm text-surface-400">{t("q.page", { current: queuePage.value, total: totalPages })}</span>
          <button
            disabled={queuePage.value >= totalPages}
            onClick={() => refreshQueue(queuePage.value + 1)}
            class="px-3 py-1.5 text-sm bg-surface-800 hover:bg-surface-700 disabled:opacity-40 text-surface-200 rounded transition-colors"
          >
            {t("q.next")}
          </button>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t("q.createTitle")}>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-surface-300 mb-1">{t("q.titleLabel")}</label>
            <input value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500" placeholder={t("q.titlePlaceholder")} />
          </div>
          <div>
            <label class="block text-sm text-surface-300 mb-1">{t("q.sourceUrl")}</label>
            <div class="flex gap-2">
              <input
                value={sourceUrl}
                onInput={(e) => setSourceUrl((e.target as HTMLInputElement).value)}
                class="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500"
                placeholder={t("q.sourceUrlPlaceholder")}
              />
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                class="px-3 py-2 bg-surface-700 hover:bg-surface-600 text-sm text-surface-200 rounded-lg border border-surface-600/50 transition-colors shrink-0"
              >
                {t("q.browseVideos")}
              </button>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block text-xs text-surface-400 mb-1">{t("q.mediaId")}</label>
              <input value={mediaId} onInput={(e) => setMediaId((e.target as HTMLInputElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-blue-500" placeholder={t("q.optional")} />
            </div>
            <div>
              <label class="block text-xs text-surface-400 mb-1">{t("q.seasonId")}</label>
              <input value={seasonId} onInput={(e) => setSeasonId((e.target as HTMLInputElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-blue-500" placeholder={t("q.optional")} />
            </div>
            <div>
              <label class="block text-xs text-surface-400 mb-1">{t("q.episodeId")}</label>
              <input value={episodeId} onInput={(e) => setEpisodeId((e.target as HTMLInputElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-blue-500" placeholder={t("q.optional")} />
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowCreate(false)} class="px-4 py-2 text-sm text-surface-300 hover:text-surface-100">{t("q.cancelBtn")}</button>
            <button onClick={handleCreate} disabled={creating || !title.trim() || !sourceUrl.trim()} class="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {creating ? t("q.creating") : t("q.create")}
            </button>
          </div>
        </div>
      </Modal>

      <MediaPicker
        open={showPicker}
        onSelect={(path) => setSourceUrl(path)}
        onClose={() => setShowPicker(false)}
      />
    </div>
  );
}
