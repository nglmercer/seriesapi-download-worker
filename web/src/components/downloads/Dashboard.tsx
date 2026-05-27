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
import { t } from "../../i18n";

export function Dashboard({ onNavigate }: { onNavigate: (p: string, id?: number) => void }) {
  useEffect(() => {
    refreshDownloads();
    refreshQueue();
  }, []);

  const stats = [
    { labelKey: "dash.activeDownloads", value: activeDownloads.value.length, color: "text-blue-400", bg: "bg-blue-500/8 border-blue-500/15", icon: (
      <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
    )},
    { labelKey: "dash.activeTranscodes", value: activeTranscodes.value.length, color: "text-purple-400", bg: "bg-purple-500/8 border-purple-500/15", icon: (
      <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    )},
    { labelKey: "dash.completedDownloads", value: completedDownloads.value.length, color: "text-emerald-400", bg: "bg-emerald-500/8 border-emerald-500/15", icon: (
      <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    )},
    { labelKey: "dash.completedTranscodes", value: completedTranscodes.value.length, color: "text-teal-400", bg: "bg-teal-500/8 border-teal-500/15", icon: (
      <svg class="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
    )},
  ];

  const recentDownloads = downloads.value.slice(0, 5);
  const recentQueue = queueTasks.value.slice(0, 5);

  return (
    <div class="space-y-6 animate-fade-in">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.labelKey} class={`rounded-xl border p-4 ${s.bg} flex items-start gap-3`}>
            <div class="mt-0.5">{s.icon}</div>
            <div>
              <p class="text-xs text-surface-400 font-medium">{t(s.labelKey)}</p>
              <p class={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl overflow-hidden">
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-surface-800/50">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              <h2 class="text-sm font-semibold text-surface-200">{t("dash.recentDownloads")}</h2>
            </div>
            <button onClick={() => onNavigate("downloads")} class="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors">{t("dash.viewAll")}</button>
          </div>
          <div class="divide-y divide-surface-800/50">
            {recentDownloads.length === 0 && (
              <div class="px-5 py-10 text-center">
                <svg class="w-8 h-8 text-surface-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                <p class="text-sm text-surface-500">{t("dash.noDownloads")}</p>
              </div>
            )}
            {recentDownloads.map((d) => (
              <div key={d.id} class="px-5 py-3 flex items-center gap-3 hover:bg-surface-800/20 transition-colors">
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-surface-200 truncate font-medium">{d.filename}</p>
                  <div class="mt-1.5">
                    <ProgressBar value={d.progress} color={d.status === "failed" ? "bg-red-500" : d.status === "completed" ? "bg-emerald-500" : "bg-blue-500"} />
                  </div>
                </div>
                <StatusBadge status={d.status} />
              </div>
            ))}
          </div>
        </div>

        <div class="bg-surface-900/50 border border-surface-800/50 rounded-xl overflow-hidden">
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-surface-800/50">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <h2 class="text-sm font-semibold text-surface-200">{t("dash.recentQueue")}</h2>
            </div>
            <button onClick={() => onNavigate("queue")} class="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors">{t("dash.viewAll")}</button>
          </div>
          <div class="divide-y divide-surface-800/50">
            {recentQueue.length === 0 && (
              <div class="px-5 py-10 text-center">
                <svg class="w-8 h-8 text-surface-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                <p class="text-sm text-surface-500">{t("dash.noQueue")}</p>
              </div>
            )}
            {recentQueue.map((t) => (
              <div key={t.id} class="px-5 py-3 flex items-center gap-3 hover:bg-surface-800/20 transition-colors cursor-pointer" onClick={() => onNavigate("queue-detail", t.id)}>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-surface-200 truncate font-medium">{t.title}</p>
                  <div class="mt-1.5">
                    <ProgressBar value={t.progress} color={t.status === "failed" ? "bg-red-500" : t.status === "completed" ? "bg-emerald-500" : "bg-purple-500"} />
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
