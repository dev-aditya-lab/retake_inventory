"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Camera, Globe, Mail, MapPin, Store } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  useGetBusinessProfileQuery,
  useRequestBusinessNameMutation,
  useUpdateBusinessPictureMutation,
  useUpdateBusinessProfileMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";
import { BUSINESS_VERTICALS, verticalLabel } from "@/lib/whatsapp";
import type { BusinessProfile } from "@/types/whatsapp";

const LIMITS = { about: 139, description: 512, address: 256, email: 128 } as const;

/** The shop's WhatsApp Business profile: what customers see when they tap the shop's name. Admin only. */
export default function BusinessProfilePage() {
  return (
    <RequireRole roles={["admin"]} message="Only admins can change the business profile.">
      <ProfileEditor />
    </RequireRole>
  );
}

function ProfileEditor() {
  const { data, isLoading, isError, refetch } = useGetBusinessProfileQuery();

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (isError || !data) {
    return (
      <div className="text-sm">
        <p className="text-danger">Couldn&apos;t load the business profile. Check the connection under Settings.</p>
        <button type="button" onClick={() => refetch()} className="mt-2 font-medium text-primary">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <ProfileCard profile={data} />
        <NameCard profile={data} />
      </div>
      <ProfileForm key={JSON.stringify([data.about, data.description, data.vertical, data.address, data.email, data.websites])} profile={data} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview + picture
// ---------------------------------------------------------------------------

function ProfileCard({ profile }: { profile: BusinessProfile }) {
  const [upload, { isLoading }] = useUpdateBusinessPictureMutation();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setDone(false);
    if (!["image/jpeg", "image/png"].includes(file.type)) return setError("Use a JPEG or PNG picture.");
    if (file.size > 5 * 1024 * 1024) return setError("The picture is too large. The limit is 5 MB.");
    try {
      await upload(file).unwrap();
      setDone(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't change the picture. Try again."));
    }
  }

  return (
    <section aria-label="How customers see the shop" className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex flex-col items-center gap-3 bg-leaf-50 px-4 py-6">
        <div className="relative">
          {profile.profilePictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived WhatsApp-hosted link
            <img src={profile.profilePictureUrl} alt="Shop profile picture" className="h-28 w-28 rounded-full border-4 border-background object-cover shadow" />
          ) : (
            <span className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-background bg-leaf-100 text-leaf-700 shadow">
              <Store size={44} aria-hidden />
            </span>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isLoading}
            aria-label="Change the profile picture"
            className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-leaf-600 text-white shadow disabled:opacity-60"
          >
            <Camera size={17} aria-hidden />
          </button>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground [overflow-wrap:anywhere]">{profile.displayName || "Your shop"}</p>
          <p className="text-xs text-muted">{verticalLabel(profile.vertical)}</p>
        </div>
        {isLoading && <p className="text-xs text-muted">Uploading…</p>}
        {done && <p role="status" className="text-xs text-success">Picture updated. WhatsApp can take a minute to show it.</p>}
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>

      <dl className="flex flex-col gap-3 p-4 text-sm">
        {profile.about && <Row label="About" icon={null}>{profile.about}</Row>}
        {profile.description && <Row label="Description" icon={null}>{profile.description}</Row>}
        {profile.address && <Row label="Address" icon={<MapPin size={15} aria-hidden />}>{profile.address}</Row>}
        {profile.email && <Row label="Email" icon={<Mail size={15} aria-hidden />}>{profile.email}</Row>}
        {profile.websites.map((site) => (
          <Row key={site} label="Website" icon={<Globe size={15} aria-hidden />}>
            {site}
          </Row>
        ))}
      </dl>
      <p className="border-t border-border bg-surface px-4 py-2 text-[11px] text-muted">A square JPEG or PNG, at least 192 px wide, up to 5 MB, works best.</p>
    </section>
  );
}

function Row({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      {icon && <span className="mt-0.5 shrink-0 text-muted">{icon}</span>}
      <div className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
        <dd className="text-foreground [overflow-wrap:anywhere]">{children}</dd>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Display name (reviewed by WhatsApp)
// ---------------------------------------------------------------------------

function NameCard({ profile }: { profile: BusinessProfile }) {
  const [request, { isLoading }] = useRequestBusinessNameMutation();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    try {
      await request(name.trim()).unwrap();
      setSent(true);
      setName("");
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't send the request. Try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-background p-4">
      <h2 className="text-base font-semibold text-foreground">Shop name</h2>
      <p className="mt-0.5 text-sm text-muted">
        Customers see <span className="font-medium text-foreground">{profile.displayName || "no name yet"}</span>
        {profile.displayNameStatus && ` (${profile.displayNameStatus.toLowerCase().replace(/_/g, " ")})`}.
      </p>

      {profile.pendingDisplayName && (
        <p role="status" className="mt-2 rounded-md bg-amber-50 p-2.5 text-sm text-amber-900">
          Waiting for WhatsApp to review the name <span className="font-medium">{profile.pendingDisplayName}</span>. This can take a few days.
        </p>
      )}

      <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Ask for a new name
        <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="e.g. Retake Spices" className="input" />
        <span className="text-xs font-normal text-muted">WhatsApp reviews every name change and can refuse it. Use your real business name.</span>
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      {sent && <p role="status" className="mt-2 text-sm text-success">Sent to WhatsApp for review.</p>}
      <button
        type="submit"
        disabled={isLoading || name.trim().length < 3}
        className="mt-3 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-50"
      >
        {isLoading ? "Sending…" : "Request name change"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// The editable details
// ---------------------------------------------------------------------------

function ProfileForm({ profile }: { profile: BusinessProfile }) {
  const [save, { isLoading }] = useUpdateBusinessProfileMutation();
  const [form, setForm] = useState({
    about: profile.about,
    description: profile.description,
    vertical: profile.vertical,
    address: profile.address,
    email: profile.email,
    site1: profile.websites[0] ?? "",
    site2: profile.websites[1] ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setSaved(false);
    setForm({ ...form, [k]: e.target.value });
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!form.about.trim()) return setError("The About line can't be empty.");
    try {
      await save({
        about: form.about.trim(),
        description: form.description.trim(),
        vertical: form.vertical,
        address: form.address.trim(),
        email: form.email.trim(),
        websites: [form.site1, form.site2].map((s) => s.trim()).filter(Boolean),
      }).unwrap();
      setSaved(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't save. Check your connection and try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4">
      <h2 className="text-base font-semibold text-foreground">Business details</h2>

      <Field label="About" count={form.about.length} max={LIMITS.about} hint="A short line under the shop's name.">
        <input required maxLength={LIMITS.about} value={form.about} onChange={set("about")} className="input" />
      </Field>

      <Field label="Description" count={form.description.length} max={LIMITS.description} hint="What the shop sells and who it serves.">
        <textarea rows={4} maxLength={LIMITS.description} value={form.description} onChange={set("description")} className="input resize-y" />
      </Field>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Category
        <select value={form.vertical} onChange={set("vertical")} className="input">
          {BUSINESS_VERTICALS.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </label>

      <Field label="Address" count={form.address.length} max={LIMITS.address}>
        <input maxLength={LIMITS.address} value={form.address} onChange={set("address")} className="input" />
      </Field>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Email
        <input type="email" maxLength={LIMITS.email} value={form.email} onChange={set("email")} className="input" />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Links (up to 2)</legend>
        <input aria-label="First link" type="url" placeholder="https://" value={form.site1} onChange={set("site1")} className="input" />
        <input aria-label="Second link" type="url" placeholder="https://" value={form.site2} onChange={set("site2")} className="input" />
      </fieldset>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {saved && !error && <p role="status" className="text-sm text-success">Saved. WhatsApp shows the change to customers shortly.</p>}

      <button type="submit" disabled={isLoading} className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:self-start">
        {isLoading ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function Field({ label, count, max, hint, children }: { label: string; count: number; max: number; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
      <span className="flex items-baseline justify-between gap-2">
        {label}
        <span className="text-xs font-normal text-muted">
          {count}/{max}
        </span>
      </span>
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}
