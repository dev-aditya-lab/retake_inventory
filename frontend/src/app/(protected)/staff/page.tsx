"use client";

import { useState, type FormEvent } from "react";
import { getApiErrorMessage } from "@/lib/apiError";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import { useCreateUserMutation, useListUsersQuery, useUpdateUserMutation } from "@/lib/redux/features/users/usersApi";
import { ROLE_LABELS, type UserRole } from "@/types/auth";

const ROLES: UserRole[] = ["admin", "sales", "inventory_manager"];

export default function StaffPage() {
  const { data: currentUser } = useGetMeQuery();

  if (currentUser && currentUser.role !== "admin") {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-border bg-surface p-4 text-sm text-muted">
        Only admins can manage staff accounts.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-foreground">Staff</h1>
      <p className="mt-1 text-sm text-muted">
        Manage who can sign in and what they can do. Staff sign in with a code sent to their WhatsApp.
      </p>

      <AddStaffForm />
      <StaffList />
    </div>
  );
}

function AddStaffForm() {
  const [createUser, { isLoading }] = useCreateUserMutation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("sales");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createUser({ name, email, phone, role }).unwrap();
      setName("");
      setEmail("");
      setPhone("");
      setRole("sales");
      setOpen(false);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not create staff account — check the details and try again."));
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100"
      >
        + Add staff
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          required
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          required
          type="tel"
          inputMode="tel"
          placeholder="Mobile number (WhatsApp)"
          aria-label="Mobile number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted">
        There are no passwords. This person signs in with a 6-digit code sent to this mobile number&apos;s WhatsApp, so use their own
        number.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isLoading ? "Creating…" : "Create account"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-ink-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function StaffList() {
  const { data: currentUser } = useGetMeQuery();
  const { data: users, isLoading } = useListUsersQuery();
  const [updateUser] = useUpdateUserMutation();
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  async function savePhone(id: string) {
    setPhoneError(null);
    try {
      await updateUser({ id, phone: phoneDraft.trim() }).unwrap();
      setEditingPhoneId(null);
    } catch (err) {
      setPhoneError(getApiErrorMessage(err, "Couldn't save the number. Check it and try again."));
    }
  }

  if (isLoading) return <p className="mt-6 text-sm text-muted">Loading staff…</p>;
  if (!users?.length) return <p className="mt-6 text-sm text-muted">No staff accounts yet.</p>;

  return (
    <ul className="mt-6 flex flex-col gap-2">
      {users.map((u) => {
        const isSelf = u.id === currentUser?.id;
        return (
          <li
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {u.name} {!u.isActive && <span className="text-xs text-danger">(inactive)</span>}
              </p>
              <p className="text-xs text-muted">
                {u.email}
                {u.phone ? ` · ${u.phone}` : " · no mobile number (codes go to their email)"}
              </p>
              {editingPhoneId === u.id ? (
                <form
                  className="mt-1.5 flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void savePhone(u.id);
                  }}
                >
                  <input
                    autoFocus
                    required
                    type="tel"
                    inputMode="tel"
                    aria-label={`Mobile number for ${u.name}`}
                    placeholder="98765 43210"
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    className="w-40 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                  />
                  <button type="submit" className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingPhoneId(null)} className="rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:bg-ink-100">
                    Cancel
                  </button>
                  {phoneError && (
                    <span role="alert" className="basis-full text-xs text-danger">
                      {phoneError}
                    </span>
                  )}
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPhoneId(u.id);
                    setPhoneDraft(u.phone ?? "");
                    setPhoneError(null);
                  }}
                  className="mt-0.5 text-xs font-medium text-primary"
                >
                  {u.phone ? "Change mobile number" : "Add mobile number"}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={u.role}
                disabled={isSelf}
                onChange={(e) => updateUser({ id: u.id, role: e.target.value as UserRole })}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isSelf}
                onClick={() => updateUser({ id: u.id, isActive: !u.isActive })}
                className="rounded-md border border-border px-2 py-1.5 text-xs font-medium text-foreground hover:bg-ink-100 disabled:opacity-60"
              >
                {u.isActive ? "Deactivate" : "Activate"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
