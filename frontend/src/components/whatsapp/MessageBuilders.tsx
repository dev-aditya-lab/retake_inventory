"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Contact, ExternalLink, ListChecks, LocateFixed, MapPin, NotebookPen, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  useAddChatNoteMutation,
  useSendChatContactMutation,
  useSendChatCtaMutation,
  useSendChatListMutation,
  useSendChatLocationMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";

/** Which builder is open. */
export type BuilderKind = "list" | "cta" | "location" | "contact" | "note";

interface BuilderProps {
  chatId: string;
  onClose: () => void;
  onSent: () => void;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-danger">
      {error}
    </p>
  ) : null;
}

function SubmitButton({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
    >
      {busy ? busyLabel : label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The "more" menu
// ---------------------------------------------------------------------------

const CHOICES: { kind: BuilderKind; label: string; help: string; icon: typeof Contact; needsWindow: boolean }[] = [
  { kind: "list", label: "List of options", help: "The customer taps one of up to 10 choices", icon: ListChecks, needsWindow: true },
  { kind: "cta", label: "Link button", help: "A message with a button that opens a website", icon: ExternalLink, needsWindow: true },
  { kind: "location", label: "Location", help: "A map pin, like the shop's address", icon: MapPin, needsWindow: true },
  { kind: "contact", label: "Contact card", help: "A number the customer can save", icon: Contact, needsWindow: true },
  { kind: "note", label: "Internal note", help: "Only your team sees it. Never sent to the customer", icon: NotebookPen, needsWindow: false },
];

export function MoreMenuDialog({
  open,
  onClose,
  onChoose,
  windowOpen,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (kind: BuilderKind) => void;
  windowOpen: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Other messages" size="sm">
      <ul className="flex flex-col gap-2">
        {CHOICES.map(({ kind, label, help, icon: Icon, needsWindow }) => {
          const blocked = needsWindow && !windowOpen;
          return (
            <li key={kind}>
              <button
                type="button"
                disabled={blocked}
                onClick={() => onChoose(kind)}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left hover:bg-ink-50 disabled:opacity-50"
              >
                <Icon size={20} className="shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{label}</span>
                  <span className="block text-xs text-muted">{blocked ? "Needs the 24-hour window to be open" : help}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/** Opens the right builder for `kind`. */
export function MessageBuilderDialog({ kind, chatId, onClose, onSent }: { kind: BuilderKind | null } & BuilderProps) {
  const titles: Record<BuilderKind, string> = {
    list: "List of options",
    cta: "Link button",
    location: "Location",
    contact: "Contact card",
    note: "Internal note",
  };
  return (
    <Modal open={kind !== null} onClose={onClose} title={kind ? titles[kind] : ""} size="md">
      {kind === "list" && <ListForm chatId={chatId} onClose={onClose} onSent={onSent} />}
      {kind === "cta" && <CtaForm chatId={chatId} onClose={onClose} onSent={onSent} />}
      {kind === "location" && <LocationForm chatId={chatId} onClose={onClose} onSent={onSent} />}
      {kind === "contact" && <ContactForm chatId={chatId} onClose={onClose} onSent={onSent} />}
      {kind === "note" && <NoteForm chatId={chatId} onClose={onClose} onSent={onSent} />}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function ListForm({ chatId, onClose, onSent }: BuilderProps) {
  const [send, { isLoading }] = useSendChatListMutation();
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [button, setButton] = useState("Choose");
  const [rows, setRows] = useState<{ title: string; description: string }[]>([
    { title: "", description: "" },
    { title: "", description: "" },
  ]);
  const [error, setError] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((l) => l.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    try {
      await send({
        id: chatId,
        ...(header.trim() ? { header: header.trim() } : {}),
        body: body.trim(),
        button: button.trim(),
        sectionTitle: "Options",
        rows: rows
          .filter((r) => r.title.trim())
          .map((r) => ({ title: r.title.trim(), ...(r.description.trim() ? { description: r.description.trim() } : {}) })),
      }).unwrap();
      onSent();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't send. Check your connection and try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Header (optional)">
        <input maxLength={60} value={header} onChange={(e) => setHeader(e.target.value)} className="input" />
      </Field>
      <Field label="Message">
        <textarea required rows={3} maxLength={1024} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Which product are you interested in?" className="input resize-y" />
      </Field>
      <Field label="Button that opens the list" hint="Up to 20 characters.">
        <input required maxLength={20} value={button} onChange={(e) => setButton(e.target.value)} className="input" />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Options (up to 10)</legend>
        {rows.map((row, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-2">
            <div className="flex gap-2">
              <input
                aria-label={`Option ${i + 1} title`}
                maxLength={24}
                value={row.title}
                onChange={(e) => setRow(i, { title: e.target.value })}
                placeholder="Title"
                className="input min-w-0 flex-1"
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((l) => l.filter((_, idx) => idx !== i))}
                  aria-label={`Remove option ${i + 1}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-ink-100 hover:text-danger"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              )}
            </div>
            <input
              aria-label={`Option ${i + 1} description`}
              maxLength={72}
              value={row.description}
              onChange={(e) => setRow(i, { description: e.target.value })}
              placeholder="Short description (optional)"
              className="input"
            />
          </div>
        ))}
        {rows.length < 10 && (
          <button
            type="button"
            onClick={() => setRows((l) => [...l, { title: "", description: "" }])}
            className="flex items-center gap-1.5 self-start rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100"
          >
            <Plus size={16} aria-hidden /> Add an option
          </button>
        )}
      </fieldset>

      <ErrorLine error={error} />
      <SubmitButton busy={isLoading} label="Send list" busyLabel="Sending…" />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Link button
// ---------------------------------------------------------------------------

function CtaForm({ chatId, onClose, onSent }: BuilderProps) {
  const [send, { isLoading }] = useSendChatCtaMutation();
  const [form, setForm] = useState({ header: "", body: "", footer: "", buttonText: "", url: "https://" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    try {
      await send({
        id: chatId,
        ...(form.header.trim() ? { header: form.header.trim() } : {}),
        body: form.body.trim(),
        ...(form.footer.trim() ? { footer: form.footer.trim() } : {}),
        buttonText: form.buttonText.trim(),
        url: form.url.trim(),
      }).unwrap();
      onSent();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't send. Check your connection and try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Header (optional)">
        <input maxLength={60} value={form.header} onChange={set("header")} className="input" />
      </Field>
      <Field label="Message">
        <textarea required rows={3} maxLength={1024} value={form.body} onChange={set("body")} placeholder="Pay your bill securely using the link below." className="input resize-y" />
      </Field>
      <Field label="Footer (optional)">
        <input maxLength={60} value={form.footer} onChange={set("footer")} className="input" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Button text" hint="Up to 20 characters.">
          <input required maxLength={20} value={form.buttonText} onChange={set("buttonText")} placeholder="Pay now" className="input" />
        </Field>
        <Field label="Link" hint="Must start with https://">
          <input required type="url" value={form.url} onChange={set("url")} className="input" />
        </Field>
      </div>
      <ErrorLine error={error} />
      <SubmitButton busy={isLoading} label="Send" busyLabel="Sending…" />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

function LocationForm({ chatId, onClose, onSent }: BuilderProps) {
  const [send, { isLoading }] = useSendChatLocationMutation();
  const [form, setForm] = useState({ latitude: "", longitude: "", name: "", address: "" });
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  function useMyLocation() {
    if (!("geolocation" in navigator)) return setError("This device can't share its location.");
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setLocating(false);
      },
      () => {
        setError("Couldn't get your location. Allow location access, or type the coordinates.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!form.latitude.trim() || !form.longitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return setError("Enter the latitude and longitude, or use your current location.");
    }
    try {
      await send({
        id: chatId,
        latitude,
        longitude,
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
      }).unwrap();
      onSent();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't send. Check your connection and try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-60"
      >
        <LocateFixed size={16} aria-hidden /> {locating ? "Finding you…" : "Use my current location"}
      </button>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Latitude">
          <input required inputMode="decimal" value={form.latitude} onChange={set("latitude")} placeholder="28.6139" className="input" />
        </Field>
        <Field label="Longitude">
          <input required inputMode="decimal" value={form.longitude} onChange={set("longitude")} placeholder="77.2090" className="input" />
        </Field>
      </div>
      <Field label="Place name (optional)">
        <input maxLength={100} value={form.name} onChange={set("name")} placeholder="Retake Spices" className="input" />
      </Field>
      <Field label="Address (optional)">
        <input maxLength={200} value={form.address} onChange={set("address")} className="input" />
      </Field>
      <ErrorLine error={error} />
      <SubmitButton busy={isLoading} label="Send location" busyLabel="Sending…" />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Contact card
// ---------------------------------------------------------------------------

function ContactForm({ chatId, onClose, onSent }: BuilderProps) {
  const [send, { isLoading }] = useSendChatContactMutation();
  const [form, setForm] = useState({ name: "", phone: "", role: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    try {
      await send({
        id: chatId,
        name: form.name.trim(),
        phone: form.phone.trim(),
        ...(form.role.trim() ? { role: form.role.trim() } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
      }).unwrap();
      onSent();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't send. Check your connection and try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input required maxLength={100} value={form.name} onChange={set("name")} className="input" />
        </Field>
        <Field label="Phone">
          <input required type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="98765 43210" className="input" />
        </Field>
        <Field label="Role (optional)">
          <input maxLength={60} value={form.role} onChange={set("role")} placeholder="Accounts" className="input" />
        </Field>
        <Field label="Email (optional)">
          <input type="email" value={form.email} onChange={set("email")} className="input" />
        </Field>
      </div>
      <ErrorLine error={error} />
      <SubmitButton busy={isLoading} label="Send contact" busyLabel="Sending…" />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Internal note
// ---------------------------------------------------------------------------

function NoteForm({ chatId, onClose, onSent }: BuilderProps) {
  const [add, { isLoading }] = useAddChatNoteMutation();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    try {
      await add({ id: chatId, text: text.trim() }).unwrap();
      onSent();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't save the note. Try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted">Only your team can see this note. It is never sent to the customer.</p>
      <textarea
        required
        autoFocus
        rows={4}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Asked for a 5% discount on 20 kg. Call back Friday."
        aria-label="Note"
        className="input resize-y"
      />
      <ErrorLine error={error} />
      <SubmitButton busy={isLoading} label="Save note" busyLabel="Saving…" />
    </form>
  );
}
