const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  downloading: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  seeding: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
  paused: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  processing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  probing: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  ready: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  stopped: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

interface Props {
  status: string;
  class?: string;
}

export function StatusBadge({ status, class: cls = "" }: Props) {
  const style = STATUS_STYLES[status] || "bg-surface-700 text-surface-300 border-surface-600";
  return (
    <span class={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${style} ${cls}`}>
      {status}
    </span>
  );
}
