"use client";

import { useState, type FormEvent } from "react";
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
      <p className="mt-1 text-sm text-muted">Manage who can log in and what they can do.</p>

      <AddStaffForm />
      <StaffList />
    </div>
  );
}

function AddStaffForm() {
  const [createUser, { isLoading }] = useCreateUserMutation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("sales");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createUser({ name, email, password, role }).unwrap();
      setName("");
      setEmail("");
      setPassword("");
      setRole("sales");
      setOpen(false);
    } catch {
      setError("Could not create staff account — check the details and try again.");
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
          type="password"
          placeholder="Temporary password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
              <p className="text-xs text-muted">{u.email}</p>
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
