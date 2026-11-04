"use client";

import { useState, type FormEvent } from "react";
import { Bot, Pencil, Plus, Trash2 } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { Modal } from "@/components/ui/Modal";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  useCreateAutomationMutation,
  useDeleteAutomationMutation,
  useGetBusinessHoursQuery,
  useListAutomationsQuery,
  useListQuickRepliesQuery,
  useSaveBusinessHoursMutation,
  useToggleAutomationMutation,
  useUpdateAutomationMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";
import type { Automation, AutomationInput, AutomationType, BusinessHours } from "@/types/whatsapp";

const TYPE_INFO: Record<AutomationType, { label: string; help: string }> = {
  keyword: { label: "Keyword reply", help: "Answers when a customer's message contains one of your keywords." },
  welcome: { label: "Welcome message", help: "Sent once, to a customer's very first message." },
  away: { label: "Away message", help: "Sent when a customer writes outside business hours (once every 12 hours per customer)." },
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Automatic replies and business hours. Admin only. */
export default function AutomationsPage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can set up automatic replies.">
      <div className="flex flex-col gap-6">
        <AutomationList />
        <HoursCard />
      </div>
    </RequireRole>
  );
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

function AutomationList() {
  const { data, isLoading, isError, refetch } = useListAutomationsQuery();
  const [editing, setEditing] = useState<Automation | "new" | null>(null);

  return (
    <section aria-labelledby="auto-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <h2 id="auto-heading" className="text-base font-semibold text-foreground">
            Automatic replies
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            They run before the built-in menu. If a person is already chatting with the customer, they stay quiet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          <Plus size={16} aria-hidden /> New automation
        </button>
      </div>

      {isLoading && <p className="mt-3 text-sm text-muted">Loading…</p>}
      {isError && !data && (
        <div className="mt-3 text-sm">
          <p className="text-danger">Couldn&apos;t load the automations.</p>
          <button type="button" onClick={() => refetch()} className="mt-1 font-medium text-primary">
            Try again
          </button>
        </div>
      )}
      {data && data.length === 0 && (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-background p-8 text-center text-sm text-muted">
          <Bot size={28} aria-hidden />
          <p>No automatic replies yet. Start with a welcome message or an answer to &ldquo;price&rdquo;.</p>
        </div>
      )}

      <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data?.map((a) => (
          <AutomationCard key={a.id} automation={a} onEdit={() => setEditing(a)} />
        ))}
      </ul>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New automation" : "Edit automation"} size="lg">
        {editing && <AutomationForm key={editing === "new" ? "new" : editing.id} automation={editing === "new" ? null : editing} existing={data ?? []} onDone={() => setEditing(null)} />}
      </Modal>
    </section>
  );
}

function AutomationCard({ automation: a, onEdit }: { automation: Automation; onEdit: () => void }) {
  const [toggle, { isLoading: toggling }] = useToggleAutomationMutation();
  const [remove, { isLoading: deleting }] = useDeleteAutomationMutation();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't do that. Try again."));
      setConfirming(false);
    }
  }

  return (
    <li className={`flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-background p-4 ${a.enabled ? "" : "opacity-70"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{a.name}</p>
          <p className="text-xs text-muted">{TYPE_INFO[a.type].label}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={a.enabled}
          aria-label={`${a.name} is ${a.enabled ? "on" : "off"}`}
          disabled={toggling}
          onClick={() => void run(() => toggle({ id: a.id, enabled: !a.enabled }).unwrap())}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${a.enabled ? "bg-leaf-600" : "bg-ink-300"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${a.enabled ? "left-[1.375rem]" : "left-0.5"}`} />
        </button>
      </div>

      {a.type === "keyword" && (
        <p className="text-xs text-muted [overflow-wrap:anywhere]">
          {a.match === "exact" ? "Message is exactly" : "Message contains"}: <span className="font-medium text-foreground">{a.keywords.join(", ")}</span>
        </p>
      )}
      <p className="whitespace-pre-wrap rounded-md bg-surface p-2.5 text-sm text-foreground [overflow-wrap:anywhere]">
        {a.reply.kind === "saved" ? `Sends the saved message “${a.reply.savedTitle || "(deleted)"}”` : a.reply.text}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-muted">Used {a.timesUsed} time{a.timesUsed === 1 ? "" : "s"}</p>
        <button type="button" onClick={onEdit} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-foreground hover:bg-ink-100">
          <Pencil size={14} aria-hidden /> Edit
        </button>
        {confirming ? (
          <span className="flex items-center gap-2 text-xs">
            <button type="button" disabled={deleting} onClick={() => void run(() => remove(a.id).unwrap())} className="rounded-md bg-danger px-2.5 py-1.5 font-medium text-white disabled:opacity-60">
              {deleting ? "Deleting…" : "Delete"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-md border border-border px-2.5 py-1.5 font-medium">
              Keep
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:bg-ink-100 hover:text-danger">
            <Trash2 size={14} aria-hidden /> Delete
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

function AutomationForm({ automation, existing, onDone }: { automation: Automation | null; existing: Automation[]; onDone: () => void }) {
  const [create, { isLoading: creating }] = useCreateAutomationMutation();
  const [update, { isLoading: updating }] = useUpdateAutomationMutation();
  const { data: saved } = useListQuickRepliesQuery();

  // Only one welcome and one away message make sense, so a type already in use isn't offered again.
  const taken = new Set(existing.filter((e) => e.type !== "keyword" && e.id !== automation?.id).map((e) => e.type));
  const firstFree = (["keyword", "welcome", "away"] as AutomationType[]).find((t) => !taken.has(t)) ?? "keyword";

  const [type, setType] = useState<AutomationType>(automation?.type ?? firstFree);
  const [name, setName] = useState(automation?.name ?? "");
  const [keywords, setKeywords] = useState((automation?.keywords ?? []).join("\n"));
  const [match, setMatch] = useState<"contains" | "exact">(automation?.match ?? "contains");
  const [replyKind, setReplyKind] = useState<"text" | "saved">(automation?.reply.kind ?? "text");
  const [text, setText] = useState(automation?.reply.text ?? "");
  const [savedId, setSavedId] = useState(automation?.reply.savedId ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const keywordList = keywords.split(/[\n,]+/).map((k) => k.trim()).filter(Boolean);
    if (type === "keyword" && keywordList.length === 0) return setError("Add at least one keyword.");
    if (replyKind === "saved" && !savedId) return setError("Choose a saved message to send.");

    const input: AutomationInput = {
      name: name.trim(),
      type,
      enabled: automation?.enabled ?? true,
      keywords: type === "keyword" ? keywordList : [],
      match,
      reply: replyKind === "saved" ? { kind: "saved", savedId } : { kind: "text", text: text.trim() },
    };
    try {
      if (automation) await update({ id: automation.id, ...input }).unwrap();
      else await create(input).unwrap();
      onDone();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't save. Check your connection and try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Type
        <select value={type} onChange={(e) => setType(e.target.value as AutomationType)} disabled={!!automation} className="input">
          {(Object.keys(TYPE_INFO) as AutomationType[]).map((t) => (
            <option key={t} value={t} disabled={taken.has(t)}>
              {TYPE_INFO[t].label}
              {taken.has(t) ? " (already set up)" : ""}
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-muted">{TYPE_INFO[type].help}</span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Name
        <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "keyword" ? "Price enquiry" : TYPE_INFO[type].label} className="input" />
      </label>

      {type === "keyword" && (
        <>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            Keywords
            <textarea rows={3} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={"price\nrate\nकीमत"} className="input resize-y" />
            <span className="text-xs font-normal text-muted">One per line. Capital letters and punctuation don&apos;t matter, and any language works.</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            Match
            <select value={match} onChange={(e) => setMatch(e.target.value as "contains" | "exact")} className="input">
              <option value="contains">The message contains the keyword</option>
              <option value="exact">The whole message is the keyword</option>
            </select>
          </label>
        </>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Reply</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="reply-kind" checked={replyKind === "text"} onChange={() => setReplyKind("text")} /> Write a message
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="reply-kind" checked={replyKind === "saved"} onChange={() => setReplyKind("saved")} /> Use a saved message
          </label>
        </div>
        {replyKind === "text" ? (
          <textarea required rows={4} maxLength={4096} value={text} onChange={(e) => setText(e.target.value)} placeholder="Thanks for writing to us! Our price list is..." aria-label="Reply text" className="input resize-y" />
        ) : (
          <select value={savedId} onChange={(e) => setSavedId(e.target.value)} aria-label="Saved message" className="input">
            <option value="">Choose a saved message</option>
            {saved?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
        <span className="text-xs text-muted">Saved messages can be buttons, lists, links, locations, contacts or files. Make them on the Templates page.</span>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={creating || updating} className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
        {creating || updating ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Business hours
// ---------------------------------------------------------------------------

function HoursCard() {
  const { data, isLoading } = useGetBusinessHoursQuery();
  if (isLoading || !data) return null;
  // Keyed by the saved value so a save (or a change from elsewhere) resets the form.
  return <HoursForm key={JSON.stringify(data)} initial={data} />;
}

function HoursForm({ initial }: { initial: BusinessHours }) {
  const [save, { isLoading }] = useSaveBusinessHoursMutation();
  const [hours, setHours] = useState<BusinessHours>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const setDay = (i: number, patch: Partial<BusinessHours["days"][number]>) => {
    setSaved(false);
    setHours((h) => ({ ...h, days: h.days.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) }));
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await save(hours).unwrap();
      setSaved(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't save the hours. Try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-labelledby="hours-heading" className="rounded-xl border border-border bg-background p-4">
      <h2 id="hours-heading" className="text-base font-semibold text-foreground">
        Business hours
      </h2>
      <p className="mt-0.5 text-sm text-muted">Used by the away message. Times are India time.</p>

      <label className="mt-3 flex items-center gap-2 text-sm font-medium text-foreground">
        <input type="checkbox" checked={hours.enabled} onChange={(e) => { setSaved(false); setHours({ ...hours, enabled: e.target.checked }); }} className="h-4 w-4" />
        Treat times outside these hours as &ldquo;away&rdquo;
      </label>

      <ul className={`mt-3 flex flex-col gap-2 ${hours.enabled ? "" : "opacity-50"}`}>
        {hours.days.map((day, i) => (
          <li key={DAYS[i]} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <span className="w-24 shrink-0 font-medium text-foreground">{DAYS[i]}</span>
            <label className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" checked={day.closed} disabled={!hours.enabled} onChange={(e) => setDay(i, { closed: e.target.checked })} className="h-4 w-4" /> Closed
            </label>
            {!day.closed && (
              <span className="flex items-center gap-2">
                <input type="time" aria-label={`${DAYS[i]} opens`} value={day.open} disabled={!hours.enabled} onChange={(e) => setDay(i, { open: e.target.value })} className="input min-h-9 py-1" />
                <span className="text-muted">to</span>
                <input type="time" aria-label={`${DAYS[i]} closes`} value={day.close} disabled={!hours.enabled} onChange={(e) => setDay(i, { close: e.target.value })} className="input min-h-9 py-1" />
              </span>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="mt-3 text-sm text-success">
          Saved.
        </p>
      )}
      <button type="submit" disabled={isLoading} className="mt-4 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
        {isLoading ? "Saving…" : "Save hours"}
      </button>
    </form>
  );
}
