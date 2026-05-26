interface Props {
  value: number;
  max?: number;
  class?: string;
  color?: string;
  showLabel?: boolean;
}

export function ProgressBar({ value, max = 100, class: cls = "", color = "bg-blue-500", showLabel = true }: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div class={`flex items-center gap-2.5 ${cls}`}>
      <div class="flex-1 h-1.5 bg-surface-800/80 rounded-full overflow-hidden">
        <div
          class={`h-full rounded-full transition-all duration-500 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && <span class="text-[11px] text-surface-400 w-9 text-right font-medium tabular-nums">{Math.round(pct)}%</span>}
    </div>
  );
}
