"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bot,
  Home,
  LayoutTemplate,
  Megaphone,
  Menu,
  MessageCircle,
  Settings,
  ShieldAlert,
  Store,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ChatList } from "@/components/whatsapp/ChatList";
import { NotificationPrompt } from "@/components/whatsapp/NotificationSettings";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import { useGetWhatsappSummaryQuery } from "@/lib/redux/features/whatsapp/whatsappApi";

interface NavEntry {
  key: string;
  href: string;
  label: string;
  title: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

/** Everything under /whatsapp. The first entry is the chats; every other one is a page of its own. */
const NAV: NavEntry[] = [
  { key: "chats", href: "/whatsapp", label: "Chats", title: "Chats", icon: MessageCircle },
  { key: "broadcasts", href: "/whatsapp/broadcasts", label: "Broadcasts", title: "Broadcasts", icon: Megaphone, adminOnly: true },
  { key: "automations", href: "/whatsapp/automations", label: "Automations", title: "Automatic replies", icon: Bot, adminOnly: true },
  { key: "templates", href: "/whatsapp/templates", label: "Templates", title: "Templates and saved messages", icon: LayoutTemplate },
  { key: "analytics", href: "/whatsapp/analytics", label: "Analytics", title: "Analytics and Meta bill", icon: BarChart3, adminOnly: true },
  { key: "profile", href: "/whatsapp/profile", label: "Business profile", title: "Business profile", icon: Store, adminOnly: true },
  { key: "status", href: "/whatsapp/status", label: "API status", title: "API status", icon: Activity, adminOnly: true },
  { key: "settings", href: "/whatsapp/settings", label: "Settings", title: "Connection settings", icon: Settings, adminOnly: true },
  { key: "health", href: "/whatsapp/health", label: "Account health", title: "Account health", icon: ShieldAlert, adminOnly: true },
];

/** The path segments that are pages, not chat ids. */
const SECTION_KEYS = NAV.filter((n) => n.key !== "chats").map((n) => n.key);

/**
 * WhatsApp, full screen. A narrow rail of sections on the left (on phones, a menu
 * button instead), then the chat list beside the open conversation, like
 * WhatsApp Web. On a phone one pane shows at a time. The other sections (broadcasts,
 * templates, analytics, ...) fill the area to the right of the rail.
 */
export default function WhatsappLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user } = useGetMeQuery();
  const { data: summary } = useGetWhatsappSummaryQuery(undefined, { skipPollingIfUnfocused: true, pollingInterval: 30_000 });
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = user?.role === "admin";
  const segments = pathname.split("/").filter(Boolean); // ["whatsapp", id | section, ...]
  const section = segments.length > 1 && SECTION_KEYS.includes(segments[1]!) ? segments[1]! : undefined;
  const activeChatId = !section && segments.length > 1 ? segments[1] : undefined;
  const inThread = !!activeChatId;

  const entries = NAV.filter((n) => !n.adminOnly || isAdmin);
  const activeKey = section ?? "chats";
  const badge = (key: string): number => (key === "chats" ? (summary?.unreadChats ?? 0) : key === "health" ? (summary?.openAlerts ?? 0) : 0);

  const banners = (
    <>
      {summary?.serviceEnabled === false && (
        <div role="status" className="border-b border-chilli-200 bg-chilli-50 px-3 py-2 text-xs text-chilli-800">
          The WhatsApp service is turned off. Nothing is sent and incoming messages are ignored.
          {isAdmin ? " Turn it back on under Account health." : " Ask an admin to turn it back on."}
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full min-h-0 w-full bg-surface">
      {/* ---------- Rail (wide screens) ---------- */}
      <nav aria-label="WhatsApp sections" className="hidden w-[4.5rem] shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-3 md:flex">
        <span aria-hidden className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-leaf-600 text-white">
          <MessageCircle size={22} />
        </span>
        {entries.map((entry) => (
          <RailLink key={entry.key} entry={entry} active={entry.key === activeKey} count={badge(entry.key)} />
        ))}
        <Link
          href="/dashboard"
          className="mt-auto flex w-14 flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-medium text-muted hover:bg-ink-100 hover:text-foreground"
        >
          <Home size={20} aria-hidden />
          Back to app
        </Link>
      </nav>

      {section ? (
        // ---------- A section page ----------
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-border bg-background px-3 py-2.5">
            <Link
              href="/whatsapp"
              aria-label="Back to chats"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-ink-100 md:hidden"
            >
              <ArrowLeft size={20} aria-hidden />
            </Link>
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground">{NAV.find((n) => n.key === section)?.title}</h1>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open the WhatsApp menu"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-ink-100 md:hidden"
            >
              <Menu size={20} aria-hidden />
            </button>
          </header>
          {banners}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-5xl min-w-0 px-4 py-4">{children}</div>
          </div>
        </div>
      ) : (
        // ---------- Chats ----------
        <div className="flex min-w-0 flex-1">
          <aside
            className={`${inThread ? "hidden md:flex" : "flex"} w-full min-w-0 shrink-0 flex-col border-r border-border bg-background md:w-[22rem] lg:w-[26rem]`}
          >
            <header className="flex items-center gap-2 px-3 pb-1 pt-3">
              <Link
                href="/dashboard"
                aria-label="Back to the app"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-ink-100 md:hidden"
              >
                <ArrowLeft size={20} aria-hidden />
              </Link>
              <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-foreground">WhatsApp</h1>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Open the WhatsApp menu"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-ink-100 md:hidden"
              >
                <Menu size={20} aria-hidden />
              </button>
            </header>
            {banners}
            <NotificationPrompt />
            <div className="min-h-0 flex-1">
              <ChatList activeId={activeChatId} canDelete={isAdmin} />
            </div>
          </aside>
          <div className={`${inThread ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>{children}</div>
        </div>
      )}

      {/* ---------- Menu (phones) ---------- */}
      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="WhatsApp" size="sm">
        <ul className="flex flex-col gap-1">
          {entries.map((entry) => {
            const Icon = entry.icon;
            const count = badge(entry.key);
            return (
              <li key={entry.key}>
                <Link
                  href={entry.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={entry.key === activeKey ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium ${
                    entry.key === activeKey ? "bg-leaf-50 text-leaf-800" : "text-foreground hover:bg-ink-100"
                  }`}
                >
                  <Icon size={20} aria-hidden />
                  <span className="min-w-0 flex-1">{entry.label}</span>
                  {count > 0 && (
                    <span className="min-w-5 rounded-full bg-leaf-600 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          <li className="mt-1 border-t border-border pt-2">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground hover:bg-ink-100"
            >
              <Home size={20} aria-hidden /> Back to the app
            </Link>
          </li>
        </ul>
      </Modal>
    </div>
  );
}

function RailLink({ entry, active, count }: { entry: NavEntry; active: boolean; count: number }) {
  const Icon = entry.icon;
  return (
    <Link
      href={entry.href}
      aria-current={active ? "page" : undefined}
      title={entry.title}
      className={`relative flex w-14 flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-medium leading-tight ${
        active ? "bg-leaf-50 text-leaf-800" : "text-muted hover:bg-ink-100 hover:text-foreground"
      }`}
    >
      <Icon size={22} aria-hidden />
      <span className="max-w-full text-center">{entry.label}</span>
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-leaf-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
