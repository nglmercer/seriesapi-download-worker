import { t } from "../../i18n";

const STATUS_STYLES: Record<string, { bg: string; dot: string; text: string }> = {
  pending:      { bg: "bg-yellow-500/10 border-yellow-500/20", dot: "bg-yellow-400", text: "text-yellow-300" },
  downloading:  { bg: "bg-blue-500/10 border-blue-500/20",    dot: "bg-blue-400",   text: "text-blue-300" },
  seeding:      { bg: "bg-teal-500/10 border-teal-500/20",    dot: "bg-teal-400",   text: "text-teal-300" },
  completed:    { bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400", text: "text-emerald-300" },
  failed:       { bg: "bg-red-500/10 border-red-500/20",      dot: "bg-red-400",    text: "text-red-300" },
  paused:       { bg: "bg-surface-500/10 border-surface-500/20", dot: "bg-surface-400", text: "text-surface-300" },
  processing:   { bg: "bg-blue-500/10 border-blue-500/20",    dot: "bg-blue-400 animate-pulse", text: "text-blue-300" },
  probing:      { bg: "bg-purple-500/10 border-purple-500/20", dot: "bg-purple-400", text: "text-purple-300" },
  ready:        { bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400", text: "text-emerald-300" },
  stopped:      { bg: "bg-orange-500/10 border-orange-500/20", dot: "bg-orange-400", text: "text-orange-300" },
};

interface Props {
  status: string;
  class?: string;
}

export function StatusBadge({ status, class: cls = "" }: Props) {
  const style = STATUS_STYLES[status] || { bg: "bg-surface-700/50 border-surface-600/50", dot: "bg-surface-400", text: "text-surface-300" };
  return (
    <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full border ${style.bg} ${style.text} ${cls}`}>
      <span class={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {t(`status.${status}`, {}, status)}
    </span>
  );
}
