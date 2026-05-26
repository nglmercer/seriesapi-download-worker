import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ComponentChildren;
  class?: string;
}

export function Modal({ open, onClose, title, children, class: cls = "" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      class="bg-transparent backdrop:bg-black/60 max-w-lg w-full rounded-xl p-0"
    >
      <div class={`bg-surface-900 border border-surface-700 rounded-xl shadow-2xl ${cls}`}>
        {title && (
          <div class="flex items-center justify-between px-5 py-4 border-b border-surface-700">
            <h2 class="text-lg font-semibold text-surface-100">{title}</h2>
            <button onClick={onClose} class="text-surface-400 hover:text-surface-200 text-xl leading-none">&times;</button>
          </div>
        )}
        <div class="p-5">{children}</div>
      </div>
    </dialog>
  );
}
