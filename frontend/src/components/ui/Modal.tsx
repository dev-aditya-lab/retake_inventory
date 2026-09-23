"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
} as const;

/**
 * Accessible modal built on the native <dialog> element, which gives focus
 * trapping, Escape-to-close and a backdrop for free. Slides up as a bottom
 * sheet on phones (easier to reach with a thumb) and centers on larger screens.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: keyof typeof SIZES;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      // Escape: let the parent decide (it owns `open`) instead of the browser closing it behind React's back.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`m-0 mt-auto w-full max-w-full rounded-t-lg bg-background p-0 text-foreground shadow-xl backdrop:bg-ink-900/40 sm:m-auto sm:rounded-lg ${SIZES[size]}`}
    >
      {open && (
        <div className="flex max-h-[90svh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 rounded-md p-2 text-muted hover:bg-ink-100 hover:text-foreground"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </div>
      )}
    </dialog>
  );
}
