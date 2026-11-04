"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getApiErrorMessage } from "@/lib/apiError";
import { useDeleteChatsMutation, useGetWhatsappSummaryQuery } from "@/lib/redux/features/whatsapp/whatsappApi";

/**
 * Deleting chats (one, or many selected in the list). It removes them from this
 * app only: the customer keeps their copy on WhatsApp, and a new message from
 * them starts a fresh chat.
 */
export function DeleteChatsDialog({
  ids,
  onClose,
  onDeleted,
}: {
  /** The chats to delete; the dialog is open while this is non-empty. */
  ids: string[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  return (
    <Modal open={ids.length > 0} onClose={onClose} title={ids.length === 1 ? "Delete this chat?" : `Delete ${ids.length} chats?`} size="sm">
      {ids.length > 0 && <DeleteForm ids={ids} onClose={onClose} onDeleted={onDeleted} />}
    </Modal>
  );
}

function DeleteForm({ ids, onClose, onDeleted }: { ids: string[]; onClose: () => void; onDeleted: () => void }) {
  const [deleteChats, { isLoading }] = useDeleteChatsMutation();
  const { data: summary } = useGetWhatsappSummaryQuery();
  const [deleteFiles, setDeleteFiles] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ chats: number; messages: number; files: number } | null>(null);

  async function handleDelete() {
    setError(null);
    try {
      const done = await deleteChats({ ids, deleteSavedFiles: deleteFiles && !!summary?.media.cloudinaryConfigured }).unwrap();
      setResult(done);
      onDeleted();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't delete. Check your connection and try again."));
    }
  }

  if (result) {
    return (
      <div className="flex flex-col gap-3 text-center">
        <p className="text-sm text-foreground">
          Deleted {result.chats} chat{result.chats === 1 ? "" : "s"} and {result.messages} message{result.messages === 1 ? "" : "s"}
          {result.files > 0 ? `, and ${result.files} saved file${result.files === 1 ? "" : "s"} from the cloud` : ""}.
        </p>
        <button type="button" onClick={onClose} className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground">
        The {ids.length === 1 ? "chat and its messages are" : "chats and their messages are"} removed from this app for good. It can&apos;t be undone.
      </p>
      <p className="rounded-md bg-surface p-3 text-xs text-muted">
        The customer still has the conversation on their own WhatsApp. If they write again, a new chat starts.
      </p>

      {summary?.media.cloudinaryConfigured && (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" checked={deleteFiles} onChange={(e) => setDeleteFiles(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>
            Also delete the photos and files saved to the cloud
            <span className="block text-xs text-muted">Leave this off to keep those files.</span>
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isLoading}
          className="flex items-center justify-center gap-2 rounded-md bg-danger px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          <Trash2 size={16} aria-hidden />
          {isLoading ? "Deleting…" : ids.length === 1 ? "Delete chat" : `Delete ${ids.length} chats`}
        </button>
      </div>
    </div>
  );
}
