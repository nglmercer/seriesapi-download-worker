import { useEffect, useState } from "preact/hooks";
import { api } from "../../api/client";
import { addToast } from "../../state";
import { subscribeJob, onMessage } from "../../ws/socket";
import { ProgressBar } from "../common/ProgressBar";
import { StatusBadge } from "../common/StatusBadge";
import { Modal } from "../common/Modal";
import { t } from "../../i18n";
import type { QueueTask, ProbeResult, HlsOutput, MediaTrack, TranscodeProgressMsg } from "../../types";

const ALL_QUALITIES = ["2160p", "1440p", "1080p", "720p", "480p", "360p", "240p", "original"];

export function TaskDetail({ taskId, onNavigate }: { taskId: number; onNavigate: (p: string) => void }) {
  const [task, setTask] = useState<QueueTask | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [outputs, setOutputs] = useState<HlsOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [showAddQuality, setShowAddQuality] = useState(false);
  const [trackType, setTrackType] = useState("subtitle");
  const [trackUrl, setTrackUrl] = useState("");
  const [trackLabel, setTrackLabel] = useState("");
  const [trackLang, setTrackLang] = useState("");
  const [selectedQuality, setSelectedQuality] = useState("720p");
  const [thumbnailSeek, setThumbnailSeek] = useState("");
  const [thumbnailResult, setThumbnailResult] = useState<string | null>(null);

  async function loadTask() {
    try {
      const t = await api.getQueueTask(taskId);
      setTask(t);
    } catch (e: any) {
      addToast("error", e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadOutputs() {
    try {
      const o = await api.getTaskOutputs(taskId);
      setOutputs(o);
    } catch {}
  }

  useEffect(() => {
    loadTask();
    loadOutputs();
    subscribeJob(String(taskId));
    const unsub = onMessage((msg) => {
      if (msg.type === "transcode:progress" && (msg as TranscodeProgressMsg).taskId === taskId) {
        const m = msg as TranscodeProgressMsg;
        setTask((prev) => prev ? { ...prev, progress: m.progress, status: m.status } : prev);
      }
    });
    return unsub;
  }, [taskId]);

  async function handleProbe() {
    try {
      const result = await api.probeQueueTask(taskId);
      setProbe(result);
      addToast("success", t("td.probeComplete"));
      loadTask();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  async function handleStart() {
    try { await api.startQueueTask(taskId); addToast("success", t("td.taskStarted")); loadTask(); } catch (e: any) { addToast("error", e.message); }
  }

  async function handleStop() {
    try { await api.stopQueueTask(taskId); addToast("success", t("td.taskStopped")); loadTask(); } catch (e: any) { addToast("error", e.message); }
  }

  async function handleRestart() {
    try { await api.restartQueueTask(taskId); addToast("success", t("td.taskRestarted")); loadTask(); } catch (e: any) { addToast("error", e.message); }
  }

  async function handleDelete() {
    try { await api.deleteQueueTask(taskId); addToast("success", t("td.taskDeleted")); onNavigate("queue"); } catch (e: any) { addToast("error", e.message); }
  }

  async function handleExtractTracks() {
    try { const tracks = await api.extractTracks(taskId); addToast("success", t("td.extractedSubs", { count: tracks.length })); loadTask(); } catch (e: any) { addToast("error", e.message); }
  }

  async function handleExtractAudio() {
    try { const tracks = await api.extractAudio(taskId); addToast("success", t("td.extractedAudio", { count: tracks.length })); loadTask(); } catch (e: any) { addToast("error", e.message); }
  }

  async function handleProcessTracks() {
    try { await api.processTracks(taskId); addToast("success", t("td.tracksProcessed")); loadTask(); } catch (e: any) { addToast("error", e.message); }
  }

  async function handleAddTrack() {
    try {
      await api.addTrack(taskId, { type: trackType, url: trackUrl, label: trackLabel, lang: trackLang, is_external: true, action: "add" });
      addToast("success", t("td.trackAdded"));
      setShowAddTrack(false);
      setTrackUrl(""); setTrackLabel(""); setTrackLang("");
      loadTask();
    } catch (e: any) { addToast("error", e.message); }
  }

  async function handleDeleteTrack(trackId: number) {
    try { await api.deleteTrack(taskId, trackId); addToast("success", t("td.trackRemoved")); loadTask(); } catch (e: any) { addToast("error", e.message); }
  }

  async function handleAddQuality() {
    try { await api.addQuality(taskId, selectedQuality); addToast("success", t("td.qualityAdded", { quality: selectedQuality })); setShowAddQuality(false); loadTask(); } catch (e: any) { addToast("error", e.message); }
  }

  async function handleThumbnail() {
    try { const res = await api.generateThumbnail(taskId, thumbnailSeek || undefined); setThumbnailResult(res.url); addToast("success", t("td.thumbnailGenerated")); } catch (e: any) { addToast("error", e.message); }
  }

  async function handleBackfill() {
    try { const res = await api.backfillTask(taskId); addToast("success", t("td.backfillResult", { updated: res.updated, errors: res.errors })); loadOutputs(); } catch (e: any) { addToast("error", e.message); }
  }

  if (loading) return <div class="text-surface-400 py-12 text-center">{t("common.loading")}</div>;
  if (!task) return <div class="text-red-400 py-12 text-center">Task not found</div>;

  const qualities: string[] = task.qualities ? JSON.parse(task.qualities) : [];
  const tracks: MediaTrack[] = task.tracks || [];
  const probeInfo = task.source_video_info ? JSON.parse(task.source_video_info) : null;

  return (
    <div class="space-y-6 animate-fade-in">
      <div class="flex items-center gap-3">
        <button onClick={() => onNavigate("queue")} class="text-surface-400 hover:text-surface-200 text-sm">{t("td.back")}</button>
        <h2 class="text-xl font-bold text-surface-100 flex-1">{task.title}</h2>
        <StatusBadge status={task.status || "pending"} />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
          <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl p-5 space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-surface-200">{t("td.taskInfo")}</h3>
              <div class="flex gap-2">
                {(task.status === "ready" || task.status === "pending") && <button onClick={handleStart} class="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded-lg">{t("td.start")}</button>}
                {task.status === "processing" && <button onClick={handleStop} class="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg">{t("td.stop")}</button>}
                {(task.status === "failed" || task.status === "stopped" || task.status === "completed") && <button onClick={handleRestart} class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg">{t("td.restart")}</button>}
                <button onClick={handleDelete} class="px-3 py-1.5 bg-red-600/80 hover:bg-red-500 text-white text-xs font-medium rounded-lg">{t("td.delete")}</button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div><span class="text-surface-500">{t("td.id")}</span> <span class="text-surface-200 font-mono">{task.id}</span></div>
              <div><span class="text-surface-500">{t("td.status")}</span> <StatusBadge status={task.status || "pending"} /></div>
              <div class="col-span-2"><span class="text-surface-500">{t("td.source")}</span> <span class="text-surface-200 break-all">{task.source_video_url}</span></div>
              {task.media_id && <div><span class="text-surface-500">{t("td.mediaId")}</span> <span class="text-surface-200">{task.media_id}</span></div>}
              {task.season_id && <div><span class="text-surface-500">{t("td.seasonId")}</span> <span class="text-surface-200">{task.season_id}</span></div>}
              {task.episode_id && <div><span class="text-surface-500">{t("td.episodeId")}</span> <span class="text-surface-200">{task.episode_id}</span></div>}
              <div><span class="text-surface-500">{t("td.videoCodec")}</span> <span class="text-surface-200">{task.video_codec || "libx264"}</span></div>
              <div><span class="text-surface-500">{t("td.preset")}</span> <span class="text-surface-200">{task.preset || "veryfast"}</span></div>
            </div>
            {task.status === "processing" && <div class="pt-2"><ProgressBar value={task.progress} color="bg-purple-500" /></div>}
            {task.error_message && <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-300">{task.error_message}</div>}
          </div>

          <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-surface-200">{t("td.probe")}</h3>
              <button onClick={handleProbe} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg transition-colors">{t("td.runProbe")}</button>
            </div>
            {probeInfo ? (
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div class="bg-surface-800/50 rounded-lg p-3"><p class="text-surface-500 text-xs">{t("td.resolution")}</p><p class="text-surface-200">{probeInfo.width}x{probeInfo.height}</p></div>
                <div class="bg-surface-800/50 rounded-lg p-3"><p class="text-surface-500 text-xs">{t("td.duration")}</p><p class="text-surface-200">{Math.round(probeInfo.duration)}s</p></div>
                <div class="bg-surface-800/50 rounded-lg p-3"><p class="text-surface-500 text-xs">{t("td.bitrate")}</p><p class="text-surface-200">{Math.round(probeInfo.bitrate / 1000)}kbps</p></div>
                <div class="bg-surface-800/50 rounded-lg p-3"><p class="text-surface-500 text-xs">{t("td.codec")}</p><p class="text-surface-200">{probeInfo.codec}</p></div>
              </div>
            ) : (
              <p class="text-sm text-surface-500">{t("td.noProbe")}</p>
            )}
            {probe && probe.streams && (
              <div class="mt-4">
                <h4 class="text-xs text-surface-400 mb-2">{t("td.streams")}</h4>
                <div class="space-y-1">
                  {probe.streams.map((s) => (
                    <div key={s.index} class="flex items-center gap-3 text-xs bg-surface-800/50 rounded px-3 py-2">
                      <span class="text-surface-500">#{s.index}</span>
                      <span class={`px-1.5 py-0.5 rounded ${s.type === "video" ? "bg-blue-500/20 text-blue-400" : s.type === "audio" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>{s.type}</span>
                      <span class="text-surface-200">{s.codec}</span>
                      {s.lang && <span class="text-surface-400">{s.lang}</span>}
                      {s.profile && <span class="text-surface-500">{s.profile}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-surface-200">{t("td.qualities")}</h3>
              <button onClick={() => setShowAddQuality(true)} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">{t("td.addQuality")}</button>
            </div>
            <div class="flex flex-wrap gap-2">
              {qualities.length === 0 && <span class="text-sm text-surface-500">{t("td.noQualities")}</span>}
              {qualities.map((q) => (
                <span key={q} class="px-3 py-1.5 bg-purple-500/15 text-purple-300 border border-purple-500/25 rounded-lg text-xs font-medium">{q}</span>
              ))}
            </div>
          </div>

          <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-surface-200">{t("td.tracks")}</h3>
              <div class="flex gap-2">
                <button onClick={handleExtractTracks} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">{t("td.extractSubs")}</button>
                <button onClick={handleExtractAudio} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">{t("td.extractAudio")}</button>
                <button onClick={handleProcessTracks} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">{t("td.process")}</button>
                <button onClick={() => setShowAddTrack(true)} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">{t("td.addTrack")}</button>
              </div>
            </div>
            {tracks.length === 0 ? (
              <p class="text-sm text-surface-500">{t("td.noTracks")}</p>
            ) : (
              <div class="space-y-2">
                {tracks.map((tr) => (
                  <div key={tr.id} class="flex items-center gap-3 bg-surface-800/50 rounded-lg px-3 py-2 text-sm">
                    <span class={`px-1.5 py-0.5 rounded text-xs ${tr.track_type === "audio" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>{tr.track_type}</span>
                    <span class="text-surface-200 flex-1 truncate">{tr.label || tr.url}</span>
                    {tr.lang && <span class="text-surface-400 text-xs">{tr.lang}</span>}
                    {tr.is_external && <span class="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">ext</span>}
                    <button onClick={() => handleDeleteTrack(tr.id)} class="text-red-400 hover:text-red-300 text-xs">{t("td.remove")}</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-surface-200">{t("td.hlsOutputs")}</h3>
              <button onClick={handleBackfill} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">{t("td.backfill")}</button>
            </div>
            {outputs.length === 0 ? (
              <p class="text-sm text-surface-500">{t("td.noOutputs")}</p>
            ) : (
              <div class="space-y-2">
                {outputs.map((o) => (
                  <div key={o.id} class="bg-surface-800/50 rounded-lg p-3 text-sm space-y-1">
                    <div class="flex items-center gap-2">
                      <span class="text-purple-400 font-medium">{o.quality || "unknown"}</span>
                      {o.resolution && <span class="text-surface-400">{o.resolution}</span>}
                      {o.bandwidth && <span class="text-surface-500 text-xs">{Math.round(o.bandwidth / 1000)}kbps</span>}
                    </div>
                    <p class="text-xs text-surface-500 break-all">{o.m3u8_url}</p>
                    {o.master_url && <p class="text-xs text-surface-500 break-all">{t("td.master")} {o.master_url}</p>}
                    <div class="flex gap-4 text-xs text-surface-400">
                      {o.total_duration && <span>{t("td.duration")}: {Math.round(o.total_duration)}s</span>}
                      {o.segments_count && <span>Segments: {o.segments_count}</span>}
                      {o.file_size && <span>Size: {(o.file_size / 1024 / 1024).toFixed(1)}MB</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div class="space-y-6">
          <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl p-5">
            <h3 class="text-sm font-semibold text-surface-200 mb-3">{t("td.thumbnail")}</h3>
            {task.thumbnail_url && <img src={task.thumbnail_url} alt="thumbnail" class="w-full rounded-lg mb-3 bg-surface-800" />}
            {thumbnailResult && <img src={thumbnailResult} alt="generated thumbnail" class="w-full rounded-lg mb-3 bg-surface-800" />}
            <div class="flex gap-2">
              <input value={thumbnailSeek} onInput={(e) => setThumbnailSeek((e.target as HTMLInputElement).value)} placeholder={t("td.seekPlaceholder")} class="flex-1 bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-surface-100 focus:outline-none focus:border-blue-500" />
              <button onClick={handleThumbnail} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">{t("td.generate")}</button>
            </div>
          </div>

          <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl p-5">
            <h3 class="text-sm font-semibold text-surface-200 mb-3">{t("td.taskJson")}</h3>
            <pre class="text-xs text-surface-400 bg-surface-800/50 rounded-lg p-3 overflow-auto max-h-80">{JSON.stringify(task, null, 2)}</pre>
          </div>
        </div>
      </div>

      <Modal open={showAddTrack} onClose={() => setShowAddTrack(false)} title={t("td.addTrackTitle")}>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-surface-300 mb-1">{t("td.trackType")}</label>
            <select value={trackType} onChange={(e) => setTrackType((e.target as HTMLSelectElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500">
              <option value="subtitle">Subtitle</option>
              <option value="audio">Audio</option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-surface-300 mb-1">{t("td.trackUrl")}</label>
            <input value={trackUrl} onInput={(e) => setTrackUrl((e.target as HTMLInputElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500" placeholder={t("td.trackUrlPlaceholder")} />
          </div>
          <div>
            <label class="block text-sm text-surface-300 mb-1">{t("td.trackLabel")}</label>
            <input value={trackLabel} onInput={(e) => setTrackLabel((e.target as HTMLInputElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500" placeholder={t("td.trackLabelPlaceholder")} />
          </div>
          <div>
            <label class="block text-sm text-surface-300 mb-1">{t("td.trackLang")}</label>
            <input value={trackLang} onInput={(e) => setTrackLang((e.target as HTMLInputElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500" placeholder={t("td.trackLangPlaceholder")} />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowAddTrack(false)} class="px-4 py-2 text-sm text-surface-300">{t("common.cancel")}</button>
            <button onClick={handleAddTrack} disabled={!trackUrl.trim()} class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg">{t("td.addBtn")}</button>
          </div>
        </div>
      </Modal>

      <Modal open={showAddQuality} onClose={() => setShowAddQuality(false)} title={t("td.addQualityTitle")}>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-surface-300 mb-1">{t("td.qualityPreset")}</label>
            <select value={selectedQuality} onChange={(e) => setSelectedQuality((e.target as HTMLSelectElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500">
              {ALL_QUALITIES.map((q) => (
                <option key={q} value={q} disabled={qualities.includes(q)}>{q}</option>
              ))}
            </select>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowAddQuality(false)} class="px-4 py-2 text-sm text-surface-300">{t("common.cancel")}</button>
            <button onClick={handleAddQuality} disabled={qualities.includes(selectedQuality)} class="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg">{t("td.addBtn")}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
