import { useEffect, useState } from "preact/hooks";
import { api } from "../../api/client";
import { addToast } from "../../state";
import { subscribeJob, onMessage } from "../../ws/socket";
import { ProgressBar } from "../common/ProgressBar";
import { StatusBadge } from "../common/StatusBadge";
import { Modal } from "../common/Modal";
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
      addToast("success", "Probe complete");
      loadTask();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  async function handleStart() {
    try {
      await api.startQueueTask(taskId);
      addToast("success", "Task started");
      loadTask();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  async function handleStop() {
    try {
      await api.stopQueueTask(taskId);
      addToast("success", "Task stopped");
      loadTask();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  async function handleRestart() {
    try {
      await api.restartQueueTask(taskId);
      addToast("success", "Task restarted");
      loadTask();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  async function handleDelete() {
    try {
      await api.deleteQueueTask(taskId);
      addToast("success", "Task deleted");
      onNavigate("queue");
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  async function handleExtractTracks() {
    try {
      const tracks = await api.extractTracks(taskId);
      addToast("success", `Extracted ${tracks.length} subtitle tracks`);
      loadTask();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  async function handleExtractAudio() {
    try {
      const tracks = await api.extractAudio(taskId);
      addToast("success", `Extracted ${tracks.length} audio tracks`);
      loadTask();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  async function handleProcessTracks() {
    try {
      await api.processTracks(taskId);
      addToast("success", "Tracks processed");
      loadTask();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  async function handleAddTrack() {
    try {
      await api.addTrack(taskId, { type: trackType, url: trackUrl, label: trackLabel, lang: trackLang, is_external: true, action: "add" });
      addToast("success", "Track added");
      setShowAddTrack(false);
      setTrackUrl("");
      setTrackLabel("");
      setTrackLang("");
      loadTask();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  async function handleDeleteTrack(trackId: number) {
    try {
      await api.deleteTrack(taskId, trackId);
      addToast("success", "Track removed");
      loadTask();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  async function handleAddQuality() {
    try {
      await api.addQuality(taskId, selectedQuality);
      addToast("success", `Quality ${selectedQuality} added`);
      setShowAddQuality(false);
      loadTask();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  async function handleThumbnail() {
    try {
      const res = await api.generateThumbnail(taskId, thumbnailSeek || undefined);
      setThumbnailResult(res.url);
      addToast("success", "Thumbnail generated");
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  async function handleBackfill() {
    try {
      const res = await api.backfillTask(taskId);
      addToast("success", `Backfill: ${res.updated} updated, ${res.errors} errors`);
      loadOutputs();
    } catch (e: any) {
      addToast("error", e.message);
    }
  }

  if (loading) return <div class="text-surface-400 py-12 text-center">Loading...</div>;
  if (!task) return <div class="text-red-400 py-12 text-center">Task not found</div>;

  const qualities: string[] = task.qualities ? JSON.parse(task.qualities) : [];
  const tracks: MediaTrack[] = task.tracks || [];
  const probeInfo = task.source_video_info ? JSON.parse(task.source_video_info) : null;

  return (
    <div class="space-y-6">
      <div class="flex items-center gap-3">
        <button onClick={() => onNavigate("queue")} class="text-surface-400 hover:text-surface-200 text-sm">&larr; Back</button>
        <h2 class="text-xl font-bold text-surface-100 flex-1">{task.title}</h2>
        <StatusBadge status={task.status || "pending"} />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Info + Actions */}
        <div class="lg:col-span-2 space-y-6">
          {/* Task Info */}
          <div class="bg-surface-900 border border-surface-800 rounded-xl p-5 space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-surface-200">Task Info</h3>
              <div class="flex gap-2">
                {(task.status === "ready" || task.status === "pending") && (
                  <button onClick={handleStart} class="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded-lg">Start</button>
                )}
                {task.status === "processing" && (
                  <button onClick={handleStop} class="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg">Stop</button>
                )}
                {(task.status === "failed" || task.status === "stopped" || task.status === "completed") && (
                  <button onClick={handleRestart} class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg">Restart</button>
                )}
                <button onClick={handleDelete} class="px-3 py-1.5 bg-red-600/80 hover:bg-red-500 text-white text-xs font-medium rounded-lg">Delete</button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div><span class="text-surface-500">ID:</span> <span class="text-surface-200 font-mono">{task.id}</span></div>
              <div><span class="text-surface-500">Status:</span> <StatusBadge status={task.status || "pending"} /></div>
              <div class="col-span-2"><span class="text-surface-500">Source:</span> <span class="text-surface-200 break-all">{task.source_video_url}</span></div>
              {task.media_id && <div><span class="text-surface-500">Media ID:</span> <span class="text-surface-200">{task.media_id}</span></div>}
              {task.season_id && <div><span class="text-surface-500">Season ID:</span> <span class="text-surface-200">{task.season_id}</span></div>}
              {task.episode_id && <div><span class="text-surface-500">Episode ID:</span> <span class="text-surface-200">{task.episode_id}</span></div>}
              <div><span class="text-surface-500">Video Codec:</span> <span class="text-surface-200">{task.video_codec || "libx264"}</span></div>
              <div><span class="text-surface-500">Preset:</span> <span class="text-surface-200">{task.preset || "veryfast"}</span></div>
            </div>
            {task.status === "processing" && (
              <div class="pt-2">
                <ProgressBar value={task.progress} color="bg-purple-500" />
              </div>
            )}
            {task.error_message && (
              <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-300">{task.error_message}</div>
            )}
          </div>

          {/* Probe */}
          <div class="bg-surface-900 border border-surface-800 rounded-xl p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-surface-200">Source Probe</h3>
              <button onClick={handleProbe} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg transition-colors">Run Probe</button>
            </div>
            {probeInfo ? (
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div class="bg-surface-800 rounded-lg p-3"><p class="text-surface-500 text-xs">Resolution</p><p class="text-surface-200">{probeInfo.width}x{probeInfo.height}</p></div>
                <div class="bg-surface-800 rounded-lg p-3"><p class="text-surface-500 text-xs">Duration</p><p class="text-surface-200">{Math.round(probeInfo.duration)}s</p></div>
                <div class="bg-surface-800 rounded-lg p-3"><p class="text-surface-500 text-xs">Bitrate</p><p class="text-surface-200">{Math.round(probeInfo.bitrate / 1000)}kbps</p></div>
                <div class="bg-surface-800 rounded-lg p-3"><p class="text-surface-500 text-xs">Codec</p><p class="text-surface-200">{probeInfo.codec}</p></div>
              </div>
            ) : (
              <p class="text-sm text-surface-500">No probe data. Run probe to analyze source video.</p>
            )}
            {probe && probe.streams && (
              <div class="mt-4">
                <h4 class="text-xs text-surface-400 mb-2">Streams</h4>
                <div class="space-y-1">
                  {probe.streams.map((s) => (
                    <div key={s.index} class="flex items-center gap-3 text-xs bg-surface-800 rounded px-3 py-2">
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

          {/* Qualities */}
          <div class="bg-surface-900 border border-surface-800 rounded-xl p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-surface-200">Qualities</h3>
              <button onClick={() => setShowAddQuality(true)} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">+ Add Quality</button>
            </div>
            <div class="flex flex-wrap gap-2">
              {qualities.length === 0 && <span class="text-sm text-surface-500">No qualities set</span>}
              {qualities.map((q) => (
                <span key={q} class="px-3 py-1.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-medium">{q}</span>
              ))}
            </div>
          </div>

          {/* Tracks */}
          <div class="bg-surface-900 border border-surface-800 rounded-xl p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-surface-200">Tracks</h3>
              <div class="flex gap-2">
                <button onClick={handleExtractTracks} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">Extract Subs</button>
                <button onClick={handleExtractAudio} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">Extract Audio</button>
                <button onClick={handleProcessTracks} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">Process</button>
                <button onClick={() => setShowAddTrack(true)} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">+ Add Track</button>
              </div>
            </div>
            {tracks.length === 0 ? (
              <p class="text-sm text-surface-500">No tracks</p>
            ) : (
              <div class="space-y-2">
                {tracks.map((tr) => (
                  <div key={tr.id} class="flex items-center gap-3 bg-surface-800 rounded-lg px-3 py-2 text-sm">
                    <span class={`px-1.5 py-0.5 rounded text-xs ${tr.track_type === "audio" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>{tr.track_type}</span>
                    <span class="text-surface-200 flex-1 truncate">{tr.label || tr.url}</span>
                    {tr.lang && <span class="text-surface-400 text-xs">{tr.lang}</span>}
                    {tr.is_external && <span class="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">ext</span>}
                    <button onClick={() => handleDeleteTrack(tr.id)} class="text-red-400 hover:text-red-300 text-xs">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* HLS Outputs */}
          <div class="bg-surface-900 border border-surface-800 rounded-xl p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-surface-200">HLS Outputs</h3>
              <button onClick={handleBackfill} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">Backfill Metadata</button>
            </div>
            {outputs.length === 0 ? (
              <p class="text-sm text-surface-500">No outputs yet</p>
            ) : (
              <div class="space-y-2">
                {outputs.map((o) => (
                  <div key={o.id} class="bg-surface-800 rounded-lg p-3 text-sm space-y-1">
                    <div class="flex items-center gap-2">
                      <span class="text-purple-400 font-medium">{o.quality || "unknown"}</span>
                      {o.resolution && <span class="text-surface-400">{o.resolution}</span>}
                      {o.bandwidth && <span class="text-surface-500 text-xs">{Math.round(o.bandwidth / 1000)}kbps</span>}
                    </div>
                    <p class="text-xs text-surface-500 break-all">{o.m3u8_url}</p>
                    {o.master_url && <p class="text-xs text-surface-500 break-all">Master: {o.master_url}</p>}
                    <div class="flex gap-4 text-xs text-surface-400">
                      {o.total_duration && <span>Duration: {Math.round(o.total_duration)}s</span>}
                      {o.segments_count && <span>Segments: {o.segments_count}</span>}
                      {o.file_size && <span>Size: {(o.file_size / 1024 / 1024).toFixed(1)}MB</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Thumbnail + Quick Actions */}
        <div class="space-y-6">
          <div class="bg-surface-900 border border-surface-800 rounded-xl p-5">
            <h3 class="text-sm font-semibold text-surface-200 mb-3">Thumbnail</h3>
            {task.thumbnail_url && (
              <img src={task.thumbnail_url} alt="thumbnail" class="w-full rounded-lg mb-3 bg-surface-800" />
            )}
            {thumbnailResult && (
              <img src={thumbnailResult} alt="generated thumbnail" class="w-full rounded-lg mb-3 bg-surface-800" />
            )}
            <div class="flex gap-2">
              <input
                value={thumbnailSeek}
                onInput={(e) => setThumbnailSeek((e.target as HTMLInputElement).value)}
                placeholder="seek time (e.g. 10)"
                class="flex-1 bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-surface-100 focus:outline-none focus:border-blue-500"
              />
              <button onClick={handleThumbnail} class="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-surface-200 rounded-lg">Generate</button>
            </div>
          </div>

          <div class="bg-surface-900 border border-surface-800 rounded-xl p-5">
            <h3 class="text-sm font-semibold text-surface-200 mb-3">Task JSON</h3>
            <pre class="text-xs text-surface-400 bg-surface-800 rounded-lg p-3 overflow-auto max-h-80">{JSON.stringify(task, null, 2)}</pre>
          </div>
        </div>
      </div>

      {/* Add Track Modal */}
      <Modal open={showAddTrack} onClose={() => setShowAddTrack(false)} title="Add Track">
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-surface-300 mb-1">Type</label>
            <select value={trackType} onChange={(e) => setTrackType((e.target as HTMLSelectElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500">
              <option value="subtitle">Subtitle</option>
              <option value="audio">Audio</option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-surface-300 mb-1">URL</label>
            <input value={trackUrl} onInput={(e) => setTrackUrl((e.target as HTMLInputElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500" placeholder="https://... or /path/to/file.vtt" />
          </div>
          <div>
            <label class="block text-sm text-surface-300 mb-1">Label</label>
            <input value={trackLabel} onInput={(e) => setTrackLabel((e.target as HTMLInputElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500" placeholder="English" />
          </div>
          <div>
            <label class="block text-sm text-surface-300 mb-1">Language</label>
            <input value={trackLang} onInput={(e) => setTrackLang((e.target as HTMLInputElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500" placeholder="eng" />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowAddTrack(false)} class="px-4 py-2 text-sm text-surface-300">Cancel</button>
            <button onClick={handleAddTrack} disabled={!trackUrl.trim()} class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg">Add</button>
          </div>
        </div>
      </Modal>

      {/* Add Quality Modal */}
      <Modal open={showAddQuality} onClose={() => setShowAddQuality(false)} title="Add Quality">
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-surface-300 mb-1">Quality Preset</label>
            <select value={selectedQuality} onChange={(e) => setSelectedQuality((e.target as HTMLSelectElement).value)} class="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-blue-500">
              {ALL_QUALITIES.map((q) => (
                <option key={q} value={q} disabled={qualities.includes(q)}>{q}</option>
              ))}
            </select>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowAddQuality(false)} class="px-4 py-2 text-sm text-surface-300">Cancel</button>
            <button onClick={handleAddQuality} disabled={qualities.includes(selectedQuality)} class="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg">Add</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
