"use client";

import { useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { NewTemplateDialog } from "@/components/whatsapp/NewTemplateDialog";
import { KIND_OPTIONS, SavedMessageDialog } from "@/components/whatsapp/SavedMessageDialog";
import { TemplateChips, TemplatePreview } from "@/components/whatsapp/TemplatePreview";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatDateTime } from "@/lib/format";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import {
  useDeleteQuickReplyMutation,
  useDeleteWhatsappTemplateMutation,
  useListQuickRepliesQuery,
  useListWhatsappTemplatesQuery,
  useSyncWhatsappTemplatesMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";
import type { SavedMessage, TemplateDetail } from "@/types/whatsapp";

/** Message templates (what the shop may send any time) and saved quick replies (for the 24-hour chat window). */
export default function WhatsappTemplatesPage() {
  const { data: user } = useGetMeQuery();
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <TemplatesSection isAdmin={isAdmin} />
      <SavedMessagesSection isAdmin={isAdmin} />
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
// Saved messages
// ---------------------------------------------------------------------------

function SavedMessagesSection({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, isError, refetch } = useListQuickRepliesQuery();
  const [editing, setEditing] = useState<SavedMessage | "new" | null>(null);

  return (
    <section aria-labelledby="saved-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <h2 id="saved-heading" className="text-base font-semibold text-foreground">
            Saved messages
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Ready-made messages staff can send with one tap while a chat is open: plain text, buttons, lists, link buttons, locations,
            contact cards, and photos or files kept in the cloud. Automations can use them too.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground"
          >
            <Plus size={16} aria-hidden /> Add a saved message
          </button>
        )}
      </div>

      {isLoading && <p className="mt-3 text-sm text-muted">Loading…</p>}
      {isError && !data && (
        <div className="mt-3 text-sm">
          <p className="text-danger">Couldn&apos;t load the saved messages.</p>
          <button type="button" onClick={() => refetch()} className="mt-2 font-medium text-primary">
            Try again
          </button>
        </div>
      )}
      {data && data.length === 0 && (
        <p className="mt-3 rounded-lg border border-border bg-background p-3 text-sm text-muted">
          Nothing saved yet.{isAdmin ? " Add the messages you send most often." : ""}
        </p>
      )}

      <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data?.map((item) => (
          <SavedCard key={item.id} item={item} isAdmin={isAdmin} onEdit={() => setEditing(item)} />
        ))}
      </ul>

      {isAdmin && <SavedMessageDialog editing={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function SavedCard({ item, isAdmin, onEdit }: { item: SavedMessage; isAdmin: boolean; onEdit: () => void }) {
  const [remove, { isLoading }] = useDeleteQuickReplyMutation();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    try {
      await remove(item.id).unwrap();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't delete it. Try again."));
      setConfirming(false);
    }
  }

  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-background p-3">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground [overflow-wrap:anywhere]">
        {item.title}
        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">
          {KIND_OPTIONS.find((k) => k.value === item.kind)?.label ?? item.kind}
        </span>
      </p>
      <p className="whitespace-pre-wrap text-sm text-muted [overflow-wrap:anywhere]">{item.summary}</p>
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
