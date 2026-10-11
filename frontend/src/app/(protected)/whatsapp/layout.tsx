"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatList } from "@/components/whatsapp/ChatList";
import { NotificationPrompt } from "@/components/whatsapp/NotificationSettings";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import { useGetWhatsappSummaryQuery } from "@/lib/redux/features/whatsapp/whatsappApi";

/**
 * The WhatsApp section: customer chats for every staff role, plus an
 * admin-only account-health tab.
 *
 * Phones show one pane at a time (the chat list, or one conversation, with a
 * back arrow). From md up the list stays on the left and the conversation opens
 * beside it.
 */
export default function WhatsappLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user } = useGetMeQuery();
  const { data: summary } = useGetWhatsappSummaryQuery(undefined, { skipPollingIfUnfocused: true, pollingInterval: 30_000 });

  const onHealth = pathname.startsWith("/whatsapp/health");
  const segments = pathname.split("/").filter(Boolean); // ["whatsapp", id?]
  const activeChatId = !onHealth && segments.length > 1 ? segments[1] : undefined;
  const inThread = !!activeChatId;

  const isAdmin = user?.role === "admin";
  const tabs = [
    { href: "/whatsapp", label: "Chats", active: !onHealth, count: summary?.unreadChats ?? 0 },
    ...(isAdmin ? [{ href: "/whatsapp/health", label: "Account health", active: onHealth, count: summary?.openAlerts ?? 0 }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0">
      {/* On a phone the conversation gets the whole screen, so the section header steps aside. */}
      <div className={inThread ? "hidden md:block" : undefined}>
        <h1 className="text-2xl font-semibold text-foreground">WhatsApp</h1>
        <p className="mt-1 text-sm text-muted">Messages from customers to the shop&apos;s WhatsApp number.</p>

        <nav aria-label="WhatsApp sections" className="mt-3 flex gap-1.5 overflow-x-auto">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${
                tab.active
                  ? "border-primary bg-chilli-50 text-primary"
                  : "border-border text-foreground hover:bg-ink-100"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-primary-foreground">
                  {tab.count > 99 ? "99+" : tab.count}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <NotificationPrompt />
      </div>

      {onHealth ? (
        <div className="mt-4">{children}</div>
      ) : (
        <div className="mt-3 md:grid md:grid-cols-[20rem_minmax(0,1fr)] md:gap-4">
          <div className={inThread ? "hidden md:block" : "min-w-0"}>
            <ChatList activeId={activeChatId} />
          </div>
          <div className={inThread ? "min-w-0" : "hidden min-w-0 md:block"}>{children}</div>
        </div>
      )}
    </div>
  );
}
