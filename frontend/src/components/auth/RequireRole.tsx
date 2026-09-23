"use client";

import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import type { UserRole } from "@/types/auth";

/**
 * Page-level role gate. The backend enforces the same roles on every
 * endpoint — this just shows a clear message instead of a page full of
 * "forbidden" errors.
 */
export function RequireRole({
  roles,
  message = "Only admins can open this page.",
  children,
}: {
  roles: UserRole[];
  message?: string;
  children: ReactNode;
}) {
  const { data: user } = useGetMeQuery();

  if (!user) return <p className="text-sm text-muted">Loading…</p>;

  if (!roles.includes(user.role)) {
    return (
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
        <ShieldAlert size={20} className="shrink-0" aria-hidden />
        {message}
      </div>
    );
  }

  return <>{children}</>;
}
