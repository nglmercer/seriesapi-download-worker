interface Props {
  current: string;
  onNavigate: (page: string) => void;
}

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "downloads", label: "Downloads", icon: "⬇️" },
  { id: "queue", label: "Queue", icon: "🎬" },
] as const;

export function Sidebar({ current, onNavigate }: Props) {
  return (
    <aside class="w-56 bg-surface-950 border-r border-surface-800 flex flex-col min-h-screen">
      <div class="px-5 py-5 border-b border-surface-800">
        <h1 class="text-lg font-bold text-surface-100 tracking-tight">SeriesAPI Worker</h1>
        <p class="text-xs text-surface-500 mt-0.5">Download & Transcode</p>
      </div>
      <nav class="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            class={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              current === item.id
                ? "bg-surface-800 text-surface-100"
                : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/50"
            }`}
          >
            <span class="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div class="px-3 py-4 border-t border-surface-800">
        <button
          onClick={() => onNavigate("settings")}
          class={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            current === "settings"
              ? "bg-surface-800 text-surface-100"
              : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/50"
          }`}
        >
          <span class="text-base">⚙️</span>
          Settings
        </button>
      </div>
    </aside>
  );
}
