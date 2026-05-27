import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
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

  return createPortal(
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      class="bg-transparent backdrop:bg-black/60 backdrop:backdrop-blur-sm max-w-lg w-full rounded-2xl p-0 m-auto"
    >
      <div class={`bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl shadow-black/40 ${cls}`}>
        {title && (
          <div class="flex items-center justify-between px-6 py-4 border-b border-surface-800/80">
            <h2 class="text-base font-semibold text-surface-100">{title}</h2>
            <button onClick={onClose} class="p-1 text-surface-500 hover:text-surface-200 rounded-lg hover:bg-surface-800 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        )}
        <div class="p-6">{children}</div>
      </div>
    </dialog>,
    document.body
  );
}
