"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  useCreateSavedMediaMutation,
  useCreateSavedMessageMutation,
  useUpdateSavedMessageMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";
import type { SavedKind, SavedMessage } from "@/types/whatsapp";

export const KIND_OPTIONS: { value: SavedKind; label: string; help: string }[] = [
  { value: "text", label: "Text", help: "A normal message." },
  { value: "buttons", label: "Buttons", help: "A message with up to 3 tap-to-answer buttons." },
  { value: "list", label: "List", help: "A message with a list of up to 10 options." },
  { value: "cta", label: "Link button", help: "A message with a button that opens a website." },
  { value: "location", label: "Location", help: "A map pin." },
  { value: "contact", label: "Contact card", help: "A number the customer can save." },
  { value: "media", label: "Photo or file", help: "A photo, video, audio clip or document, kept in the cloud." },
];

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

/** Make or change a message in the shared library, of any kind. Admins only. */
export function SavedMessageDialog({ editing, onClose }: { editing: SavedMessage | "new" | null; onClose: () => void }) {
  return (
    <Modal open={editing !== null} onClose={onClose} title={editing === "new" ? "Add a saved message" : "Edit saved message"} size="lg">
      {editing && <SavedForm key={editing === "new" ? "new" : editing.id} saved={editing === "new" ? null : editing} onDone={onClose} />}
    </Modal>
  );
}

function SavedForm({ saved, onDone }: { saved: SavedMessage | null; onDone: () => void }) {
  const [create, { isLoading: creating }] = useCreateSavedMessageMutation();
  const [createMedia, { isLoading: uploading }] = useCreateSavedMediaMutation();
  const [update, { isLoading: updating }] = useUpdateSavedMessageMutation();
  const d = saved?.data ?? {};

  const [kind, setKind] = useState<SavedKind>(saved?.kind ?? "text");
  const [title, setTitle] = useState(saved?.title ?? "");
  const [text, setText] = useState(saved?.text ?? "");

  const [body, setBody] = useState(str(d.body));
  const [header, setHeader] = useState(str(d.header));
  const [footer, setFooter] = useState(str(d.footer));
  const [buttons, setButtons] = useState<string[]>(Array.isArray(d.buttons) ? (d.buttons as string[]) : ["Yes", "No"]);
  const [listButton, setListButton] = useState(str(d.button) || "Choose");
  const [rows, setRows] = useState<{ title: string; description: string }[]>(
    Array.isArray(d.rows)
      ? (d.rows as { title?: string; description?: string }[]).map((r) => ({ title: r.title ?? "", description: r.description ?? "" }))
      : [{ title: "", description: "" }, { title: "", description: "" }],
  );
  const [buttonText, setButtonText] = useState(str(d.buttonText));
  const [url, setUrl] = useState(str(d.url) || "https://");
  const [latitude, setLatitude] = useState(d.latitude !== undefined ? String(d.latitude) : "");
  const [longitude, setLongitude] = useState(d.longitude !== undefined ? String(d.longitude) : "");
  const [placeName, setPlaceName] = useState(str(d.name));
  const [address, setAddress] = useState(str(d.address));
  const [contactName, setContactName] = useState(str(d.name));
  const [phone, setPhone] = useState(str(d.phone));
  const [role, setRole] = useState(str(d.role));
  const [email, setEmail] = useState(str(d.email));
  const [caption, setCaption] = useState(str(d.caption));
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editing = !!saved;
  const busy = creating || uploading || updating;

  function buildData(): Record<string, unknown> | string {
    switch (kind) {
      case "buttons":
        return { body: body.trim(), buttons: buttons.map((b) => b.trim()).filter(Boolean) };
      case "list":
        return {
          ...(header.trim() ? { header: header.trim() } : {}),
          body: body.trim(),
          button: listButton.trim(),
          sectionTitle: "Options",
          rows: rows.filter((r) => r.title.trim()).map((r) => ({ title: r.title.trim(), ...(r.description.trim() ? { description: r.description.trim() } : {}) })),
        };
      case "cta":
        return {
          ...(header.trim() ? { header: header.trim() } : {}),
          body: body.trim(),
          ...(footer.trim() ? { footer: footer.trim() } : {}),
          buttonText: buttonText.trim(),
          url: url.trim(),
        };
      case "location": {
        const lat = Number(latitude);
        const lng = Number(longitude);
        if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) return "Enter the latitude and longitude.";
        return { latitude: lat, longitude: lng, ...(placeName.trim() ? { name: placeName.trim() } : {}), ...(address.trim() ? { address: address.trim() } : {}) };
      }
      case "contact":
        return { name: contactName.trim(), phone: phone.trim(), ...(role.trim() ? { role: role.trim() } : {}), ...(email.trim() ? { email: email.trim() } : {}) };
      case "media":
        return { caption: caption.trim() };
      default:
        return {};
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    try {
      if (kind === "media" && !editing) {
        if (!file) return setError("Choose a photo or file.");
        await createMedia({ title: title.trim(), caption: caption.trim(), file }).unwrap();
      } else if (kind === "text") {
        if (editing) await update({ id: saved.id, title: title.trim(), kind, text: text.trim() }).unwrap();
        else await create({ title: title.trim(), kind, text: text.trim() }).unwrap();
      } else {
        const data = buildData();
        if (typeof data === "string") return setError(data);
        if (editing) await update({ id: saved.id, title: title.trim(), kind, data }).unwrap();
        else await create({ title: title.trim(), kind, data }).unwrap();
      }
      onDone();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't save. Check your connection and try again."));
    }
  }

  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((l) => l.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {!editing && (
        <Field label="Kind of message" hint={KIND_OPTIONS.find((k) => k.value === kind)?.help}>
          <select value={kind} onChange={(e) => setKind(e.target.value as SavedKind)} className="input">
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Title" hint="Only your team sees it, to find the message quickly.">
        <input required maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Opening hours" className="input" />
      </Field>

      {kind === "text" && (
        <Field label="Message">
          <textarea required rows={5} maxLength={4096} value={text} onChange={(e) => setText(e.target.value)} className="input resize-y" />
        </Field>
      )}

      {(kind === "buttons" || kind === "list" || kind === "cta") && (
        <>
          {kind !== "buttons" && (
            <Field label="Header (optional)">
              <input maxLength={60} value={header} onChange={(e) => setHeader(e.target.value)} className="input" />
            </Field>
          )}
          <Field label="Message">
            <textarea required rows={3} maxLength={1024} value={body} onChange={(e) => setBody(e.target.value)} className="input resize-y" />
          </Field>
        </>
      )}

      {kind === "buttons" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-foreground">Buttons (1 to 3)</legend>
          {buttons.map((b, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label={`Button ${i + 1}`} required maxLength={20} value={b} onChange={(e) => setButtons((l) => l.map((x, idx) => (idx === i ? e.target.value : x)))} className="input min-w-0 flex-1" />
              {buttons.length > 1 && (
                <button type="button" onClick={() => setButtons((l) => l.filter((_, idx) => idx !== i))} aria-label={`Remove button ${i + 1}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-ink-100 hover:text-danger">
                  <Trash2 size={16} aria-hidden />
                </button>
              )}
            </div>
          ))}
          {buttons.length < 3 && (
            <button type="button" onClick={() => setButtons((l) => [...l, ""])} className="flex items-center gap-1.5 self-start rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-ink-100">
              <Plus size={16} aria-hidden /> Add a button
            </button>
          )}
        </fieldset>
      )}

      {kind === "list" && (
        <>
          <Field label="Button that opens the list" hint="Up to 20 characters.">
            <input required maxLength={20} value={listButton} onChange={(e) => setListButton(e.target.value)} className="input" />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-foreground">Options (up to 10)</legend>
            {rows.map((r, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-2">
                <div className="flex gap-2">
                  <input aria-label={`Option ${i + 1} title`} maxLength={24} value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} placeholder="Title" className="input min-w-0 flex-1" />
                  {rows.length > 1 && (
                    <button type="button" onClick={() => setRows((l) => l.filter((_, idx) => idx !== i))} aria-label={`Remove option ${i + 1}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-ink-100 hover:text-danger">
                      <Trash2 size={16} aria-hidden />
                    </button>
                  )}
                </div>
                <input aria-label={`Option ${i + 1} description`} maxLength={72} value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} placeholder="Short description (optional)" className="input" />
              </div>
            ))}
            {rows.length < 10 && (
              <button type="button" onClick={() => setRows((l) => [...l, { title: "", description: "" }])} className="flex items-center gap-1.5 self-start rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-ink-100">
                <Plus size={16} aria-hidden /> Add an option
              </button>
            )}
          </fieldset>
        </>
      )}

      {kind === "cta" && (
        <>
          <Field label="Footer (optional)">
            <input maxLength={60} value={footer} onChange={(e) => setFooter(e.target.value)} className="input" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Button text" hint="Up to 20 characters.">
              <input required maxLength={20} value={buttonText} onChange={(e) => setButtonText(e.target.value)} className="input" />
            </Field>
            <Field label="Link" hint="Must start with https://">
              <input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} className="input" />
            </Field>
          </div>
        </>
      )}

      {kind === "location" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Latitude">
              <input required inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="28.6139" className="input" />
            </Field>
            <Field label="Longitude">
              <input required inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="77.2090" className="input" />
            </Field>
          </div>
          <Field label="Place name (optional)">
            <input maxLength={100} value={placeName} onChange={(e) => setPlaceName(e.target.value)} className="input" />
          </Field>
          <Field label="Address (optional)">
            <input maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} className="input" />
          </Field>
        </>
      )}

      {kind === "contact" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input required maxLength={100} value={contactName} onChange={(e) => setContactName(e.target.value)} className="input" />
          </Field>
          <Field label="Phone">
            <input required type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
          </Field>
          <Field label="Role (optional)">
            <input maxLength={60} value={role} onChange={(e) => setRole(e.target.value)} className="input" />
          </Field>
          <Field label="Email (optional)">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </Field>
        </div>
      )}

      {kind === "media" && (
        <>
          {editing ? (
            <p className="rounded-md bg-surface p-3 text-sm text-muted [overflow-wrap:anywhere]">
              File: <span className="font-medium text-foreground">{str(d.filename) || "saved file"}</span>. To use a different file, add a new saved message.
            </p>
          ) : (
            <Field label="File" hint="JPEG or PNG photos up to 5 MB; MP4 video, audio and documents up to 16 MB. Stored privately in Cloudinary.">
              <input
                required
                type="file"
                accept="image/jpeg,image/png,video/mp4,audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/amr,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="input"
              />
            </Field>
          )}
          <Field label="Caption (optional)" hint="Not used for audio.">
            <textarea rows={2} maxLength={1024} value={caption} onChange={(e) => setCaption(e.target.value)} className="input resize-none" />
          </Field>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
