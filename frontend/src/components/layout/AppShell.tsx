"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";

/**
 * Shared authenticated-app layout: top header, desktop sidebar, mobile bottom
 * nav. The WhatsApp section is different: it is a messaging app of its own, so
 * it takes the whole screen (like WhatsApp Web) and brings its own navigation,
 * including a way back to the rest of the app.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/whatsapp" || pathname.startsWith("/whatsapp/")) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col bg-background">
        <OfflineBanner />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col">
      <OfflineBanner />
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-x-hidden px-4 py-4 pb-20 sm:px-6 sm:py-6 md:pb-6">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
