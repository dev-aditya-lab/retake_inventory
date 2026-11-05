"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user, isLoading, isError, error, refetch } = useGetMeQuery();

  // Only the server saying "you are not signed in" (after a silent refresh was already tried)
  // means go to the login page. A dropped connection or a server hiccup must not sign anyone out.
  const notSignedIn = isError && typeof error === "object" && error !== null && "status" in error && error.status === 401;

  useEffect(() => {
    if (!isLoading && notSignedIn) {
      router.replace("/login");
    }
  }, [isLoading, notSignedIn, router]);

  if (isError && !notSignedIn && !user) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-foreground">Can&apos;t reach the server right now.</p>
        <p className="text-xs text-muted">Check your connection. You are still signed in.</p>
        <button type="button" onClick={() => refetch()} className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
          Try again
        </button>
      </div>
    );
  }

  if (isLoading || !user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
}
