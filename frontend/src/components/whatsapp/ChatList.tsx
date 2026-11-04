"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, MessageCircle, Plus, Search, Square, Trash2, X } from "lucide-react";
import { NewChatDialog } from "@/components/whatsapp/ComposerDialogs";
import { DeleteChatsDialog } from "@/components/whatsapp/DeleteChatsDialog";
import { useListChatsQuery, useListWhatsappLabelsQuery } from "@/lib/redux/features/whatsapp/whatsappApi";
import { chatTitle, formatChatTime, initialOf } from "@/lib/whatsapp";
import type { ChatFilter, ChatListItem } from "@/types/whatsapp";

const FILTERS: { value: ChatFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "needs_reply", label: "Needs reply" },
  { value: "mine", label: "Mine" },
  { value: "unassigned", label: "Unassigned" },
  { value: "resolved", label: "Resolved" },
];

const PAGE = 30;
const MAX = 100; // the API's page cap; beyond this, search finds the rest
const POLL_MS = 10_000;

/** The customer chats, newest first. Refreshes by itself while the app is open. Admins can select several and delete them. */
export function ChatList({ activeId, canDelete = false }: { activeId?: string; canDelete?: boolean }) {
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const { data: labels } = useListWhatsappLabelsQuery();
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isError, refetch } = useListChatsQuery(
    { filter, label: label || undefined, search: debounced || undefined, limit },
    { pollingInterval: POLL_MS, skipPollingIfUnfocused: true },
  );

  const items = data?.items ?? [];
  const canShowMore = !!data && data.total > items.length && limit < MAX;
  const allShownSelected = items.length > 0 && items.every((c) => selected.includes(c.id));

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected([]);
  }

  return (
    <section aria-label="Chats" className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <div className="flex flex-col gap-2 border-b border-border p-2">
        <div className="flex items-center gap-2">
          <label className="relative block min-w-0 flex-1">
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
              className="block min-h-10 w-full rounded-full border border-transparent bg-surface py-2 pl-9 pr-3 text-base outline-none focus:border-leaf-500"
            />
          </label>
          {canDelete && (
            <button
              type="button"
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              aria-label={selecting ? "Stop selecting chats" : "Select chats to delete"}
              aria-pressed={selecting}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-ink-100 ${selecting ? "bg-ink-100 text-foreground" : "text-muted"}`}
            >
              {selecting ? <X size={19} aria-hidden /> : <CheckSquare size={19} aria-hidden />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setNewChatOpen(true)}
            aria-label="Start a new chat"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-leaf-600 text-white"
          >
            <Plus size={20} aria-hidden />
          </button>
        </div>

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
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                filter === f.value ? "bg-leaf-100 text-leaf-800" : "bg-surface text-muted hover:bg-ink-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {!!labels?.length && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <span className="shrink-0">Label</span>
            <select
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setLimit(PAGE);
              }}
              className="input min-h-9 flex-1 py-1 text-xs"
            >
              <option value="">All labels</option>
              {labels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {selecting && (
        <div className="flex items-center gap-2 border-b border-border bg-leaf-50 px-3 py-2 text-sm">
          <button
            type="button"
            onClick={() => setSelected(allShownSelected ? [] : items.map((c) => c.id))}
            className="flex items-center gap-1.5 font-medium text-leaf-800"
          >
            {allShownSelected ? <CheckSquare size={16} aria-hidden /> : <Square size={16} aria-hidden />}
            {allShownSelected ? "Clear" : "Select all shown"}
          </button>
          <span className="ml-auto text-xs text-muted">{selected.length} selected</span>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => setDeleteIds(selected)}
            className="flex items-center gap-1.5 rounded-full bg-danger px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            <Trash2 size={14} aria-hidden /> Delete
          </button>
        </div>
      )}

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
            {debounced || filter !== "all" || label
              ? "No chats match."
              : "No chats yet. When a customer messages the shop's WhatsApp number, it shows up here."}
          </div>
        )}

        <ul>
          {items.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              active={chat.id === activeId}
              selecting={selecting}
              checked={selected.includes(chat.id)}
              onToggle={() => toggle(chat.id)}
            />
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

      <NewChatDialog
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onStarted={(chatId) => {
          setNewChatOpen(false);
          router.push(`/whatsapp/${chatId}`);
        }}
      />
      <DeleteChatsDialog
        ids={deleteIds}
        onClose={() => setDeleteIds([])}
        onDeleted={() => {
          if (activeId && deleteIds.includes(activeId)) router.replace("/whatsapp");
          stopSelecting();
        }}
      />
    </section>
  );
}

function ChatRow({
  chat,
  active,
  selecting,
  checked,
  onToggle,
}: {
  chat: ChatListItem;
  active: boolean;
  selecting: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const title = chatTitle(chat);
  const unread = chat.unreadCount > 0;
  const rowClass = `flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left hover:bg-ink-50 ${active && !selecting ? "bg-ink-100" : ""} ${checked ? "bg-leaf-50" : ""}`;

  const body = (
    <>
      {selecting && (checked ? <CheckSquare size={20} className="shrink-0 text-leaf-700" aria-hidden /> : <Square size={20} className="shrink-0 text-muted" aria-hidden />)}
      <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-base font-semibold text-leaf-700">
        {initialOf(title)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm text-foreground ${unread ? "font-semibold" : "font-medium"}`}>{title}</span>
          <time dateTime={chat.lastMessageAt} className={`shrink-0 text-xs ${unread ? "font-medium text-leaf-700" : "text-muted"}`}>
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
              className="min-w-5 shrink-0 rounded-full bg-leaf-600 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white"
              aria-label={`${chat.unreadCount} unread`}
            >
              {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
            </span>
          )}
        </span>

        {(chat.needsHuman || chat.status === "resolved" || chat.labels.length > 0 || chat.assignedToName) && (
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {chat.needsHuman && <span className="rounded bg-chilli-100 px-1.5 py-0.5 text-[11px] font-medium text-chilli-800">Needs reply</span>}
            {chat.status === "resolved" && <span className="rounded bg-ink-200 px-1.5 py-0.5 text-[11px] font-medium text-ink-800">Resolved</span>}
            {chat.labels.map((l) => (
              <span key={l} className="rounded-full bg-leaf-100 px-1.5 py-0.5 text-[11px] font-medium text-leaf-800">
                {l}
              </span>
            ))}
            {chat.assignedToName && <span className="text-[11px] text-muted">→ {chat.assignedToName}</span>}
          </span>
        )}
      </span>
    </>
  );

  return (
    <li>
      {selecting ? (
        <button type="button" role="checkbox" aria-checked={checked} onClick={onToggle} className={rowClass}>
          {body}
        </button>
      ) : (
        <Link href={`/whatsapp/${chat.id}`} aria-current={active ? "page" : undefined} className={rowClass}>
          {body}
        </Link>
      )}
    </li>
  );
}
