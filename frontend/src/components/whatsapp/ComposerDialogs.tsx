"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { FileText, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  useListQuickRepliesQuery,
  useSendChatButtonsMutation,
  useSendChatMediaMutation,
  useStartWhatsappChatMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";

/** Mirrors the backend: WhatsApp's file types and the size cap. */
export const ATTACH_ACCEPT = "image/jpeg,image/png,video/mp4,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---------------------------------------------------------------------------
// Photo / document
// ---------------------------------------------------------------------------

export function AttachDialog({
  chatId,
  file,
  onClose,
  onSent,
}: {
  chatId: string;
  file: File | null;
  onClose: () => void;
  onSent: () => void;
}) {
  return (
    <Modal open={!!file} onClose={onClose} title="Send a file" size="sm">
      {file && <AttachForm key={`${file.name}-${file.size}-${file.lastModified}`} chatId={chatId} file={file} onClose={onClose} onSent={onSent} />}
    </Modal>
  );
}

function AttachForm({ chatId, file, onClose, onSent }: { chatId: string; file: File; onClose: () => void; onSent: () => void }) {
  const [send, { isLoading }] = useSendChatMediaMutation();
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isImage = file.type.startsWith("image/");
  const tooBig = file.size > MAX_FILE_BYTES || (isImage && file.size > IMAGE_MAX_BYTES);
  const limit = isImage ? "5 MB" : "16 MB";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading || tooBig) return;
    setError(null);
    try {
      await send({ id: chatId, file, caption: caption.trim() }).unwrap();
      onSent();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't send the file. Check your connection and try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-md bg-surface p-3">
        <FileText size={24} className="shrink-0 text-muted" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
          <p className="text-xs text-muted">{formatSize(file.size)}</p>
        </div>
      </div>

      {tooBig && <p role="alert" className="text-sm text-danger">This file is too large. The limit is {limit}.</p>}

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Caption <span className="font-normal text-muted">(optional)</span>
        <textarea rows={2} maxLength={1024} value={caption} onChange={(e) => setCaption(e.target.value)} className="input resize-none" />
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading || tooBig}
        className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {isLoading ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tap-to-answer buttons
// ---------------------------------------------------------------------------

export function ButtonsDialog({ chatId, open, onClose, onSent }: { chatId: string; open: boolean; onClose: () => void; onSent: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Message with buttons" size="md">
      {open && <ButtonsForm chatId={chatId} onClose={onClose} onSent={onSent} />}
    </Modal>
  );
}

function ButtonsForm({ chatId, onClose, onSent }: { chatId: string; onClose: () => void; onSent: () => void }) {
  const [send, { isLoading }] = useSendChatButtonsMutation();
  const [body, setBody] = useState("");
  const [buttons, setButtons] = useState<string[]>(["Yes", "No"]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    try {
      await send({ id: chatId, body: body.trim(), buttons: buttons.map((b) => b.trim()).filter(Boolean) }).unwrap();
      onSent();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't send. Check your connection and try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted">The customer can tap a button to answer. Their choice appears in the chat.</p>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Message
        <textarea
          required
          rows={3}
          maxLength={1024}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Shall we deliver your order today?"
          className="input resize-y"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Buttons (1 to 3)</legend>
        {buttons.map((button, i) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label={`Button ${i + 1}`}
              required
              maxLength={20}
              value={button}
              onChange={(e) => setButtons((l) => l.map((b, idx) => (idx === i ? e.target.value : b)))}
              className="input min-w-0 flex-1"
            />
            {buttons.length > 1 && (
              <button
                type="button"
                onClick={() => setButtons((l) => l.filter((_, idx) => idx !== i))}
                aria-label={`Remove button ${i + 1}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-ink-100 hover:text-danger"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            )}
          </div>
        ))}
        {buttons.length < 3 && (
          <button
            type="button"
            onClick={() => setButtons((l) => [...l, ""])}
            className="flex items-center gap-1.5 self-start rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100"
          >
            <Plus size={16} aria-hidden /> Add a button
          </button>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {isLoading ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Quick replies
// ---------------------------------------------------------------------------

export function QuickReplyDialog({
  open,
  onClose,
  onPick,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  /** Gets the saved text so the caller can put it in the message box for editing before sending. */
  onPick: (text: string) => void;
  isAdmin: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Quick replies" size="md">
      {open && <QuickReplyList onPick={onPick} isAdmin={isAdmin} />}
    </Modal>
  );
}

function QuickReplyList({ onPick, isAdmin }: { onPick: (text: string) => void; isAdmin: boolean }) {
  const { data, isLoading, isError, refetch } = useListQuickRepliesQuery();

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (isError || !data) {
    return (
      <div className="text-sm">
        <p className="text-danger">Couldn&apos;t load the quick replies.</p>
        <button type="button" onClick={() => refetch()} className="mt-2 font-medium text-primary">
          Try again
        </button>
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted">
        No quick replies saved yet.
        {isAdmin && (
          <>
            {" "}
            Add some on the{" "}
            <Link href="/whatsapp/templates" className="font-medium text-primary">
              Templates
            </Link>{" "}
            page.
          </>
        )}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((reply) => (
        <li key={reply.id}>
          <button
            type="button"
            onClick={() => onPick(reply.text)}
            className="flex w-full min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-background p-3 text-left hover:bg-ink-50"
          >
            <span className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">{reply.title}</span>
            <span className="line-clamp-2 text-sm text-muted [overflow-wrap:anywhere]">{reply.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// New chat
// ---------------------------------------------------------------------------

export function NewChatDialog({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: (chatId: string) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="New chat" size="sm">
      {open && <NewChatForm onStarted={onStarted} />}
    </Modal>
  );
}

function NewChatForm({ onStarted }: { onStarted: (chatId: string) => void }) {
  const [start, { isLoading }] = useStartWhatsappChatMutation();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Enter a 10-digit mobile number.");
      return;
    }
    try {
      const { id } = await start({ phone: phone.trim(), ...(name.trim() ? { name: name.trim() } : {}) }).unwrap();
      onStarted(id);
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't start the chat. Check your connection and try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        To message someone who hasn&apos;t written to the shop recently, send them a template. They can reply once they receive it.
      </p>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        WhatsApp number
        <input
          type="tel"
          inputMode="tel"
          autoComplete="off"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="98765 43210"
          className="input"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Name <span className="font-normal text-muted">(optional)</span>
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="input" />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isLoading}
        className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {isLoading ? "Opening…" : "Open chat"}
      </button>
    </form>
  );
}
