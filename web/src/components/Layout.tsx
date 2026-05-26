import type { ComponentChildren } from "preact";
import { Sidebar } from "./Sidebar";
import { ToastContainer } from "./common/Toast";
import { wsConnected } from "../ws/socket";

interface Props {
  current: string;
  onNavigate: (page: string) => void;
  children: ComponentChildren;
}

const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  downloads: "Downloads",
  queue: "Transcode Queue",
  "queue-detail": "Task Detail",
  files: "Videos",
  settings: "Settings",
};

export function Layout({ current, onNavigate, children }: Props) {
  return (
    <div class="flex min-h-screen bg-surface-950">
      <Sidebar current={current} onNavigate={onNavigate} />
      <div class="flex-1 flex flex-col min-w-0">
        <header class="h-14 border-b border-surface-800/60 flex items-center justify-between px-6 bg-surface-950/80 backdrop-blur-sm sticky top-0 z-10">
          <h2 class="text-[15px] font-semibold text-surface-200">{PAGE_TITLES[current] || "Dashboard"}</h2>
          <div class="flex items-center gap-3">
            <div class={`flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium ${
              wsConnected.value
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}>
              <span class={`w-1.5 h-1.5 rounded-full ${wsConnected.value ? "bg-emerald-400" : "bg-red-400 animate-pulse"}`} />
              {wsConnected.value ? "Live" : "Offline"}
            </div>
          </div>
        </header>
        <main class="flex-1 p-6 overflow-auto">{children}</main>
      </div>
      <ToastContainer />
    </div>
  );
}
