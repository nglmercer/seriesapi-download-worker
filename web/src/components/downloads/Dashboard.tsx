import { useEffect } from "preact/hooks";
import {
  downloads,
  queueTasks,
  activeDownloads,
  activeTranscodes,
  completedDownloads,
  completedTranscodes,
  refreshDownloads,
  refreshQueue,
} from "../../state";
import { ProgressBar } from "../common/ProgressBar";
import { StatusBadge } from "../common/StatusBadge";

export function Dashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  useEffect(() => {
    refreshDownloads();
    refreshQueue();
  }, []);

  const stats = [
    { label: "Active Downloads", value: activeDownloads.value.length, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    { label: "Active Transcodes", value: activeTranscodes.value.length, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
    { label: "Completed Downloads", value: completedDownloads.value.length, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
    { label: "Completed Transcodes", value: completedTranscodes.value.length, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  ];

  const recentDownloads = downloads.value.slice(0, 5);
  const recentQueue = queueTasks.value.slice(0, 5);

  return (
    <div class="space-y-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} class={`rounded-xl border p-5 ${s.bg}`}>
            <p class="text-sm text-surface-400">{s.label}</p>
            <p class={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-surface-900 border border-surface-800 rounded-xl">
          <div class="flex items-center justify-between px-5 py-4 border-b border-surface-800">
            <h2 class="text-sm font-semibold text-surface-200">Recent Downloads</h2>
            <button onClick={() => onNavigate("downloads")} class="text-xs text-blue-400 hover:text-blue-300">View all</button>
          </div>
          <div class="divide-y divide-surface-800">
            {recentDownloads.length === 0 && (
              <p class="px-5 py-8 text-sm text-surface-500 text-center">No downloads yet</p>
            )}
            {recentDownloads.map((d) => (
              <div key={d.id} class="px-5 py-3 flex items-center gap-3">
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-surface-200 truncate">{d.filename}</p>
                  <div class="mt-1">
                    <ProgressBar value={d.progress} color={d.status === "failed" ? "bg-red-500" : d.status === "completed" ? "bg-green-500" : "bg-blue-500"} />
                  </div>
                </div>
                <StatusBadge status={d.status} />
              </div>
            ))}
          </div>
        </div>

        <div class="bg-surface-900 border border-surface-800 rounded-xl">
          <div class="flex items-center justify-between px-5 py-4 border-b border-surface-800">
            <h2 class="text-sm font-semibold text-surface-200">Recent Queue Tasks</h2>
            <button onClick={() => onNavigate("queue")} class="text-xs text-blue-400 hover:text-blue-300">View all</button>
          </div>
          <div class="divide-y divide-surface-800">
            {recentQueue.length === 0 && (
              <p class="px-5 py-8 text-sm text-surface-500 text-center">No queue tasks yet</p>
            )}
            {recentQueue.map((t) => (
              <div key={t.id} class="px-5 py-3 flex items-center gap-3">
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-surface-200 truncate">{t.title}</p>
                  <div class="mt-1">
                    <ProgressBar value={t.progress} color={t.status === "failed" ? "bg-red-500" : t.status === "completed" ? "bg-green-500" : "bg-purple-500"} />
                  </div>
                </div>
                <StatusBadge status={t.status || "pending"} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
