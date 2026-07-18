"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useGetMeQuery, useLogoutMutation } from "@/lib/redux/features/auth/authApi";

export function HeaderUserMenu() {
  const router = useRouter();
  const { data: user } = useGetMeQuery();
  const [logout, { isLoading }] = useLogoutMutation();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (!user) return null;

  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="hidden text-sm text-muted sm:inline">{user.name}</span>
      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoading}
        aria-label="Log out"
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-60"
      >
        <LogOut size={16} aria-hidden />
        <span className="hidden sm:inline">Log out</span>
      </button>
    </div>
  );
}
