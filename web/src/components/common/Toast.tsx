import { toasts } from "../../state";

const TYPE_STYLES = {
  success: "bg-green-500/20 border-green-500/40 text-green-300",
  error: "bg-red-500/20 border-red-500/40 text-red-300",
  info: "bg-blue-500/20 border-blue-500/40 text-blue-300",
};

export function ToastContainer() {
  const items = toasts.value;
  if (!items.length) return null;

  return (
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {items.map((t) => (
        <div
          key={t.id}
          class={`px-4 py-3 rounded-lg border text-sm animate-slide-in ${TYPE_STYLES[t.type]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
