"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-xs font-medium text-white">
      <WifiOff size={14} aria-hidden />
      You&apos;re offline — browsing cached inventory. Billing needs a connection.
    </div>
  );
}
