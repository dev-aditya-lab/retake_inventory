"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { FileText, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getApiErrorMessage } from "@/lib/apiError";
import type { SavedKind } from "@/types/whatsapp";
import {
  useListQuickRepliesQuery,
  useSendChatButtonsMutation,
  useSendChatMediaMutation,
  useSendChatSavedMutation,
  useStartWhatsappChatMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";

/** Mirrors the backend: WhatsApp's file types and the size cap. */
export const ATTACH_ACCEPT =
  "image/jpeg,image/png,video/mp4,audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/amr,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";
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
  cloudinaryConfigured,
  onClose,
  onSent,
}: {
  chatId: string;
  file: File | null;
  /** Whether the server can keep a copy in Cloudinary. */
  cloudinaryConfigured: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  return (
    <Modal open={!!file} onClose={onClose} title="Send a file" size="sm">
      {file && (
        <AttachForm
          key={`${file.name}-${file.size}-${file.lastModified}`}
          chatId={chatId}
          file={file}
          cloudinaryConfigured={cloudinaryConfigured}
          onClose={onClose}
          onSent={onSent}
        />
      )}
    </Modal>
  );
}

function AttachForm({
  chatId,
  file,
  cloudinaryConfigured,
  onClose,
  onSent,
}: {
  chatId: string;
  file: File;
  cloudinaryConfigured: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [send, { isLoading }] = useSendChatMediaMutation();
  const [caption, setCaption] = useState("");
  const [saveCopy, setSaveCopy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAudio = file.type.startsWith("audio/");
  const isImage = file.type.startsWith("image/");
  const tooBig = file.size > MAX_FILE_BYTES || (isImage && file.size > IMAGE_MAX_BYTES);
  const limit = isImage ? "5 MB" : "16 MB";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading || tooBig) return;
    setError(null);
    try {
      await send({ id: chatId, file, caption: isAudio ? "" : caption.trim(), saveCopy }).unwrap();
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

      {!isAudio && (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Caption <span className="font-normal text-muted">(optional)</span>
          <textarea rows={2} maxLength={1024} value={caption} onChange={(e) => setCaption(e.target.value)} className="input resize-none" />
        </label>
      )}

      {cloudinaryConfigured && (
        <label className="flex items-start gap-2 rounded-md bg-surface p-3 text-sm text-foreground">
          <input type="checkbox" checked={saveCopy} onChange={(e) => setSaveCopy(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>
            Also keep a copy in the cloud
            <span className="block text-xs text-muted">WhatsApp only keeps sent files for about 30 days.</span>
          </span>
        </label>
      )}

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
  chatId,
  open,
  onClose,
  onPick,
  onSent,
  isAdmin,
}: {
  chatId: string;
  open: boolean;
  onClose: () => void;
  /** Gets a saved text so the caller can put it in the message box for editing before sending. */
  onPick: (text: string) => void;
  /** A saved message of another kind was sent straight away. */
  onSent: () => void;
  isAdmin: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Saved messages" size="md">
      {open && <SavedList chatId={chatId} onPick={onPick} onSent={() => { onSent(); onClose(); }} isAdmin={isAdmin} />}
    </Modal>
  );
}

const KIND_LABEL: Record<SavedKind, string> = {
  text: "Text",
  buttons: "Buttons",
  list: "List",
  cta: "Link button",
  location: "Location",
  contact: "Contact",
  media: "File",
};

function SavedList({ chatId, onPick, onSent, isAdmin }: { chatId: string; onPick: (text: string) => void; onSent: () => void; isAdmin: boolean }) {
  const { data, isLoading, isError, refetch } = useListQuickRepliesQuery();
  const [send] = useSendChatSavedMutation();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(savedId: string) {
    setError(null);
    setSendingId(savedId);
    try {
      await send({ id: chatId, savedId }).unwrap();
      onSent();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't send it. Check your connection and try again."));
    } finally {
      setSendingId(null);
    }
  }

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (isError || !data) {
    return (
      <div className="text-sm">
        <p className="text-danger">Couldn&apos;t load the saved messages.</p>
        <button type="button" onClick={() => refetch()} className="mt-2 font-medium text-primary">
          Try again
        </button>
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nothing saved yet.
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
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {data.map((item) => (
          <li key={item.id} className="flex items-stretch gap-2 rounded-lg border border-border bg-background">
            <div className="min-w-0 flex-1 p-3">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                {item.title}
                {item.kind !== "text" && (
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">{KIND_LABEL[item.kind]}</span>
                )}
              </p>
              <p className="line-clamp-2 text-sm text-muted [overflow-wrap:anywhere]">{item.summary}</p>
            </div>
            {item.kind === "text" ? (
              <button
                type="button"
                onClick={() => onPick(item.text)}
                className="shrink-0 rounded-r-lg border-l border-border px-3 text-xs font-medium text-primary hover:bg-ink-50"
              >
                Use
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSend(item.id)}
                disabled={sendingId !== null}
                className="shrink-0 rounded-r-lg border-l border-border px-3 text-xs font-medium text-primary hover:bg-ink-50 disabled:opacity-60"
              >
                {sendingId === item.id ? "Sending…" : "Send"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
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
