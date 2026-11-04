"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatList } from "@/components/whatsapp/ChatList";
import { NotificationPrompt } from "@/components/whatsapp/NotificationSettings";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import { useGetWhatsappSummaryQuery } from "@/lib/redux/features/whatsapp/whatsappApi";

/** Pages under /whatsapp that are not a chat (a chat's path is /whatsapp/<chat id>). */
const SECTIONS = ["health", "settings", "templates"];

/**
 * The WhatsApp section: customer chats and message templates for every staff
 * role, plus admin-only connection settings and account health.
 *
 * Phones show one pane at a time (the chat list, or one conversation, with a
 * back arrow). From md up the list stays on the left and the conversation opens
 * beside it.
 */
export default function WhatsappLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user } = useGetMeQuery();
  const { data: summary } = useGetWhatsappSummaryQuery(undefined, { skipPollingIfUnfocused: true, pollingInterval: 30_000 });

  const segments = pathname.split("/").filter(Boolean); // ["whatsapp", id | section?]
  // Everything under /whatsapp that is not a chat id is a full-width page of its own.
  const onSection = segments.length > 1 && SECTIONS.includes(segments[1]!);
  const activeChatId = !onSection && segments.length > 1 ? segments[1] : undefined;
  const inThread = !!activeChatId;

  const isAdmin = user?.role === "admin";
  const tabs = [
    { href: "/whatsapp", label: "Chats", active: !onSection, count: summary?.unreadChats ?? 0 },
    { href: "/whatsapp/templates", label: "Templates", active: segments[1] === "templates", count: 0 },
    ...(isAdmin
      ? [
          { href: "/whatsapp/settings", label: "Settings", active: segments[1] === "settings", count: 0 },
          { href: "/whatsapp/health", label: "Account health", active: segments[1] === "health", count: summary?.openAlerts ?? 0 },
        ]
      : []),
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

        {summary?.serviceEnabled === false && (
          <div role="status" className="mt-3 rounded-lg border border-chilli-200 bg-chilli-50 px-3 py-2 text-sm text-chilli-800">
            The WhatsApp service is turned off. Nothing is sent and incoming messages are ignored.
            {isAdmin ? " Turn it back on under Account health." : " Ask an admin to turn it back on."}
          </div>
        )}

        <NotificationPrompt />
      </div>

      {onSection ? (
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
