"use client";

import type { ReactNode } from "react";
import { Modal } from "./Modal";

/**
 * Yes/no confirmation for destructive or hard-to-undo actions. `children`
 * slots extra inputs (e.g. a cancellation reason) between the message and
 * the buttons. `canConfirm={false}` turns it into an explanation with just
 * an OK button — for when the action is blocked (e.g. a code still in use).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  pendingLabel = "Working…",
  isLoading = false,
  canConfirm = true,
  error,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  isLoading?: boolean;
  canConfirm?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={isLoading ? () => undefined : onClose} title={title} size="sm">
      <div className="flex flex-col gap-4">
        <div className="text-sm text-foreground">{message}</div>
        {children}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-60"
          >
            {canConfirm ? "Keep it" : "OK"}
          </button>
          {canConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className="rounded-md bg-danger px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {isLoading ? pendingLabel : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
