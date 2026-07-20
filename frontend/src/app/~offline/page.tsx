import Image from "next/image";
import { WifiOff } from "lucide-react";
import { company } from "@/config/company";

// Special App Router convention picked up automatically by @ducanh2912/next-pwa
// as the navigation fallback: shown when a page request misses both the
// network and the precache (i.e. genuinely offline on an uncached route).
export default function OfflineFallbackPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-surface px-4 text-center">
      <Image src={company.logoUrl} alt={company.name} width={56} height={56} className="rounded-md" />
      <WifiOff size={32} className="text-muted" aria-hidden />
      <h1 className="text-lg font-semibold text-foreground">You&apos;re offline</h1>
      <p className="max-w-xs text-sm text-muted">
        This page hasn&apos;t been loaded before, so it isn&apos;t available offline. Reconnect and try again.
      </p>
    </div>
  );
}
