import type { ComponentChildren } from "preact";
import { Sidebar } from "./Sidebar";
import { ToastContainer } from "./common/Toast";
import { wsConnected } from "../ws/socket";

interface Props {
  current: string;
  onNavigate: (page: string) => void;
  children: ComponentChildren;
}

export function Layout({ current, onNavigate, children }: Props) {
  return (
    <div class="flex min-h-screen bg-surface-950">
      <Sidebar current={current} onNavigate={onNavigate} />
      <div class="flex-1 flex flex-col min-w-0">
        <header class="h-12 border-b border-surface-800 flex items-center justify-between px-6 bg-surface-950">
          <div class="text-sm text-surface-400">
            {current === "dashboard" && "Dashboard"}
            {current === "downloads" && "Downloads"}
            {current === "queue" && "Transcode Queue"}
            {current === "settings" && "Settings"}
          </div>
          <div class="flex items-center gap-2">
            <span class={`w-2 h-2 rounded-full ${wsConnected.value ? "bg-green-500" : "bg-red-500"}`} />
            <span class="text-xs text-surface-500">{wsConnected.value ? "Connected" : "Disconnected"}</span>
          </div>
        </header>
        <main class="flex-1 p-6 overflow-auto">{children}</main>
      </div>
      <ToastContainer />
    </div>
  );
}
