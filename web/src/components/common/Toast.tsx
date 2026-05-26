import { toasts } from "../../state";

const TYPE_STYLES = {
  success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
  error: "bg-red-500/10 border-red-500/20 text-red-300",
  info: "bg-blue-500/10 border-blue-500/20 text-blue-300",
};

const TYPE_ICONS = {
  success: <svg class="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  error: <svg class="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  info: <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
};

export function ToastContainer() {
  const items = toasts.value;
  if (!items.length) return null;

  return (
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {items.map((t) => (
        <div
          key={t.id}
          class={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm animate-slide-in backdrop-blur-sm ${TYPE_STYLES[t.type]}`}
        >
          {TYPE_ICONS[t.type]}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
