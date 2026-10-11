"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Search } from "lucide-react";
import { useListChatsQuery } from "@/lib/redux/features/whatsapp/whatsappApi";
import { chatTitle, formatChatTime, initialOf } from "@/lib/whatsapp";
import type { ChatFilter, ChatListItem } from "@/types/whatsapp";

const FILTERS: { value: ChatFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "needs_reply", label: "Needs reply" },
];

const PAGE = 30;
const MAX = 100; // the API's page cap; beyond this, search finds the rest
const POLL_MS = 10_000;

/** The customer chats, newest first. Refreshes by itself while the app is open. */
export function ChatList({ activeId }: { activeId?: string }) {
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isError, refetch } = useListChatsQuery(
    { filter, search: debounced || undefined, limit },
    { pollingInterval: POLL_MS, skipPollingIfUnfocused: true },
  );

  const items = data?.items ?? [];
  const canShowMore = !!data && data.total > items.length && limit < MAX;

  return (
    <section aria-label="Chats" className="flex min-w-0 flex-col rounded-lg border border-border bg-background md:h-[calc(100dvh-12rem)]">
      <div className="flex flex-col gap-2 border-b border-border p-2">
        <label className="relative block">
          <span className="sr-only">Search chats</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search name or number"
            className="input w-full pl-9 text-base"
          />
        </label>

        <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filter chats">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => {
                setFilter(f.value);
                setLimit(PAGE);
              }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                filter === f.value
                  ? "border-primary bg-chilli-50 text-primary"
                  : "border-border text-foreground hover:bg-ink-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-muted">Loading chats…</p>}

        {isError && !data && (
          <div className="p-4 text-sm">
            <p className="text-danger">Couldn&apos;t load chats.</p>
            <button type="button" onClick={() => refetch()} className="mt-2 font-medium text-primary">
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted">
            <MessageCircle size={28} aria-hidden />
            {debounced || filter !== "all"
              ? "No chats match."
              : "No chats yet. When a customer messages the shop's WhatsApp number, it shows up here."}
          </div>
        )}

        <ul>
          {items.map((chat) => (
            <ChatRow key={chat.id} chat={chat} active={chat.id === activeId} />
          ))}
        </ul>

        {canShowMore && (
          <button
            type="button"
            onClick={() => setLimit((l) => Math.min(l + PAGE, MAX))}
            className="w-full border-t border-border p-3 text-sm font-medium text-primary hover:bg-ink-50"
          >
            Show more
          </button>
        )}
        {!canShowMore && !!data && data.total > items.length && (
          <p className="border-t border-border p-3 text-center text-xs text-muted">
            Showing the latest {items.length} of {data.total}. Search to find an older chat.
          </p>
        )}
      </div>
    </section>
  );
}

function ChatRow({ chat, active }: { chat: ChatListItem; active: boolean }) {
  const title = chatTitle(chat);
  const unread = chat.unreadCount > 0;

  return (
    <li>
      <Link
        href={`/whatsapp/${chat.id}`}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 border-b border-border px-3 py-3 hover:bg-ink-50 ${active ? "bg-chilli-50" : ""}`}
      >
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-sm font-semibold text-leaf-700"
        >
          {initialOf(title)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-sm text-foreground ${unread ? "font-semibold" : "font-medium"}`}>{title}</span>
            <time dateTime={chat.lastMessageAt} className="shrink-0 text-xs text-muted">
              {formatChatTime(chat.lastMessageAt)}
            </time>
          </span>

          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className={`truncate text-sm ${unread ? "text-foreground" : "text-muted"}`}>
              {chat.lastDirection === "out" ? "You: " : ""}
              {chat.lastMessagePreview || "No messages"}
            </span>
            {unread && (
              <span
                className="min-w-5 shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-primary-foreground"
                aria-label={`${chat.unreadCount} unread`}
              >
                {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
              </span>
            )}
          </span>

          {chat.needsHuman && (
            <span className="mt-1 inline-block rounded bg-chilli-100 px-1.5 py-0.5 text-[11px] font-medium text-chilli-800">
              Needs reply
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
