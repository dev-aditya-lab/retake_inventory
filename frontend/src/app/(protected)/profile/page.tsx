"use client";

import { useState, type FormEvent } from "react";
import { useGetMeQuery, useUpdateProfileMutation } from "@/lib/redux/features/auth/authApi";
import { getApiErrorMessage } from "@/lib/apiError";
import { ROLE_LABELS, type AuthUser } from "@/types/auth";

/** A staff member's own details. The phone is what customers are given on WhatsApp. */
export default function ProfilePage() {
  const { data: user, isLoading } = useGetMeQuery();

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-foreground">My profile</h1>
      <p className="mt-1 text-sm text-muted">Your details, as customers and the team see them.</p>

      {isLoading && <p className="mt-6 text-sm text-muted">Loading…</p>}
      {user && <ProfileForm key={user.id} user={user} />}
    </div>
  );
}

function ProfileForm({ user }: { user: AuthUser }) {
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const unchanged = name.trim() === user.name && phone.trim() === (user.phone ?? "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (name.trim().length < 2) return setError("Enter your name.");
    const digits = phone.replace(/\D/g, "");
    if (digits !== "" && digits.length < 10) return setError("Enter a valid 10-digit mobile number.");

    try {
      const updated = await updateProfile({ name: name.trim(), phone: phone.trim() }).unwrap();
      // Show exactly what was stored (the server keeps just the 10 digits).
      setName(updated.name);
      setPhone(updated.phone ?? "");
      setSaved(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save your details — try again."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <Field label="Name *">
        <input
          required
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          className="input"
        />
      </Field>

      <Field label="Mobile number">
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setSaved(false);
          }}
          className="input"
        />
        <span className="text-xs font-normal text-muted">
          Shown to customers on WhatsApp when they ask for a contact person and you made their last bill. Leave empty to
          give customers the shop&apos;s main number instead.
        </span>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Email">
          <input value={user.email} readOnly disabled className="input opacity-70" />
        </Field>
        <Field label="Role">
          <input value={ROLE_LABELS[user.role]} readOnly disabled className="input opacity-70" />
        </Field>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-success">
          Saved.
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={isLoading || unchanged}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isLoading ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
      {label}
      {children}
    </label>
  );
}
