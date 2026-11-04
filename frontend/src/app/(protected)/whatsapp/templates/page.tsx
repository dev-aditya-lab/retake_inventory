"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { NewTemplateDialog } from "@/components/whatsapp/NewTemplateDialog";
import { TemplateChips, TemplatePreview } from "@/components/whatsapp/TemplatePreview";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatDateTime } from "@/lib/format";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import {
  useCreateQuickReplyMutation,
  useDeleteQuickReplyMutation,
  useDeleteWhatsappTemplateMutation,
  useListQuickRepliesQuery,
  useListWhatsappTemplatesQuery,
  useSyncWhatsappTemplatesMutation,
  useUpdateQuickReplyMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";
import type { QuickReply, TemplateDetail } from "@/types/whatsapp";

/** Message templates (what the shop may send any time) and saved quick replies (for the 24-hour chat window). */
export default function WhatsappTemplatesPage() {
  const { data: user } = useGetMeQuery();
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <TemplatesSection isAdmin={isAdmin} />
      <QuickRepliesSection isAdmin={isAdmin} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function TemplatesSection({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, isError, refetch } = useListWhatsappTemplatesQuery();
  const [sync, { isLoading: syncing }] = useSyncWhatsappTemplatesMutation();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setError(null);
    setNotice(null);
    try {
      const result = await sync().unwrap();
      setNotice(
        `${result.total} template${result.total === 1 ? "" : "s"} loaded from WhatsApp${result.removed > 0 ? `, ${result.removed} old one${result.removed === 1 ? "" : "s"} removed` : ""}.`,
      );
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't load templates from WhatsApp. Try again."));
    }
  }

  return (
    <section aria-labelledby="templates-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <h2 id="templates-heading" className="text-base font-semibold text-foreground">
            Message templates
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Pre-approved messages. Unlike normal replies, a template can be sent at any time, even to a customer who hasn&apos;t written
            in the last 24 hours.
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-60"
            >
              <RefreshCw size={16} className={syncing ? "animate-spin" : undefined} aria-hidden />
              {syncing ? "Loading…" : "Load from WhatsApp"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground"
            >
              <Plus size={16} aria-hidden /> New template
            </button>
          </div>
        )}
      </div>

      {notice && (
        <p role="status" className="mt-2 text-sm text-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {isLoading && <p className="mt-3 text-sm text-muted">Loading…</p>}
      {isError && !data && (
        <div className="mt-3 text-sm">
          <p className="text-danger">Couldn&apos;t load the templates.</p>
          <button type="button" onClick={() => refetch()} className="mt-2 font-medium text-primary">
            Try again
          </button>
        </div>
      )}

      {data && data.length === 0 && (
        <p className="mt-3 rounded-lg border border-border bg-background p-3 text-sm text-muted">
          No templates yet.{" "}
          {isAdmin
            ? "Use “Load from WhatsApp” to bring in the ones you already have, or create a new one."
            : "Ask an admin to load them from WhatsApp."}
        </p>
      )}

      <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data?.map((template) => (
          <TemplateCard key={template.id} template={template} isAdmin={isAdmin} />
        ))}
      </ul>

      {isAdmin && <NewTemplateDialog open={creating} onClose={() => setCreating(false)} />}
    </section>
  );
}

function TemplateCard({ template, isAdmin }: { template: TemplateDetail; isAdmin: boolean }) {
  const [remove, { isLoading }] = useDeleteWhatsappTemplateMutation();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    try {
      await remove(template.name).unwrap();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't delete the template. Try again."));
      setConfirming(false);
    }
  }

  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="min-w-0 break-all text-sm font-medium text-foreground">{template.name}</p>
        <span className="text-xs text-muted">{template.language}</span>
      </div>
      <TemplateChips template={template} />
      <TemplatePreview template={template} />
      {template.reason && <p className="text-xs text-danger">Reason: {template.reason.toLowerCase().replace(/_/g, " ")}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Updated {formatDateTime(template.updatedAt)}</p>
        {isAdmin &&
          (confirming ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-foreground">Delete on WhatsApp too?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isLoading}
                className="rounded-md bg-danger px-2.5 py-1.5 font-medium text-white disabled:opacity-60"
              >
                {isLoading ? "Deleting…" : "Delete"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-md border border-border px-2.5 py-1.5 font-medium">
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:bg-ink-100 hover:text-danger"
            >
              <Trash2 size={14} aria-hidden /> Delete
            </button>
          ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Quick replies
// ---------------------------------------------------------------------------

function QuickRepliesSection({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, isError, refetch } = useListQuickRepliesQuery();
  const [editing, setEditing] = useState<QuickReply | "new" | null>(null);

  return (
    <section aria-labelledby="quick-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <h2 id="quick-heading" className="text-base font-semibold text-foreground">
            Quick replies
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Saved answers staff can drop into a chat with one tap, like opening hours or payment details.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground"
          >
            <Plus size={16} aria-hidden /> Add quick reply
          </button>
        )}
      </div>

      {isLoading && <p className="mt-3 text-sm text-muted">Loading…</p>}
      {isError && !data && (
        <div className="mt-3 text-sm">
          <p className="text-danger">Couldn&apos;t load the quick replies.</p>
          <button type="button" onClick={() => refetch()} className="mt-2 font-medium text-primary">
            Try again
          </button>
        </div>
      )}
      {data && data.length === 0 && (
        <p className="mt-3 rounded-lg border border-border bg-background p-3 text-sm text-muted">
          No quick replies yet.{isAdmin ? " Add the answers you type most often." : ""}
        </p>
      )}

      <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data?.map((reply) => (
          <QuickReplyCard key={reply.id} reply={reply} isAdmin={isAdmin} onEdit={() => setEditing(reply)} />
        ))}
      </ul>

      {isAdmin && (
        <Modal
          open={editing !== null}
          onClose={() => setEditing(null)}
          title={editing === "new" ? "Add quick reply" : "Edit quick reply"}
          size="md"
        >
          {editing && (
            <QuickReplyForm
              key={editing === "new" ? "new" : editing.id}
              reply={editing === "new" ? null : editing}
              onDone={() => setEditing(null)}
            />
          )}
        </Modal>
      )}
    </section>
  );
}

function QuickReplyCard({ reply, isAdmin, onEdit }: { reply: QuickReply; isAdmin: boolean; onEdit: () => void }) {
  const [remove, { isLoading }] = useDeleteQuickReplyMutation();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    try {
      await remove(reply.id).unwrap();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't delete it. Try again."));
      setConfirming(false);
    }
  }

  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-background p-3">
      <p className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">{reply.title}</p>
      <p className="whitespace-pre-wrap text-sm text-muted [overflow-wrap:anywhere]">{reply.text}</p>
      {isAdmin && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-foreground hover:bg-ink-100"
          >
            <Pencil size={14} aria-hidden /> Edit
          </button>
          {confirming ? (
            <span className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isLoading}
                className="rounded-md bg-danger px-2.5 py-1.5 font-medium text-white disabled:opacity-60"
              >
                {isLoading ? "Deleting…" : "Delete"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-md border border-border px-2.5 py-1.5 font-medium">
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:bg-ink-100 hover:text-danger"
            >
              <Trash2 size={14} aria-hidden /> Delete
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

function QuickReplyForm({ reply, onDone }: { reply: QuickReply | null; onDone: () => void }) {
  const [create, { isLoading: creating }] = useCreateQuickReplyMutation();
  const [update, { isLoading: updating }] = useUpdateQuickReplyMutation();
  const [title, setTitle] = useState(reply?.title ?? "");
  const [text, setText] = useState(reply?.text ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (reply) await update({ id: reply.id, title, text }).unwrap();
      else await create({ title, text }).unwrap();
      onDone();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't save. Check your connection and try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Title
        <input required maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Opening hours" className="input" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Message
        <textarea
          required
          rows={5}
          maxLength={4096}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="We are open Monday to Saturday, 10 am to 8 pm."
          className="input resize-y"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={creating || updating}
        className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {creating || updating ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
