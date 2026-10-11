"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CheckCheck, CircleAlert, Lock, Send } from "lucide-react";
import {
  useGetChatQuery,
  useMarkChatReadMutation,
  useSendChatMessageMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";
import { getApiErrorMessage } from "@/lib/apiError";
import { chatTitle, dayKey, formatClock, formatDayLabel, formatWaId, initialOf } from "@/lib/whatsapp";
import type { ChatMessage } from "@/types/whatsapp";

const PAGE = 50;
const POLL_MS = 5_000;
const MAX_LENGTH = 4096;

/** One customer's conversation: history, live updates, and a reply box while WhatsApp allows it. */
export function ChatThreadView({ id }: { id: string }) {
  const [limit, setLimit] = useState(PAGE);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useGetChatQuery(
    { id, limit },
    { pollingInterval: POLL_MS, skipPollingIfUnfocused: true },
  );
  const [markRead] = useMarkChatReadMutation();
  const [sendMessage, { isLoading: sending }] = useSendChatMessageMutation();

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messages = data?.messages;
  const lastMessageId = messages?.[messages.length - 1]?.id;
  const lastIncomingId = useMemo(
    () => [...(messages ?? [])].reverse().find((m) => m.direction === "in")?.id,
    [messages],
  );

  // Opening the chat, or a new customer message arriving while it is open, counts as read.
  useEffect(() => {
    if (lastIncomingId) void markRead(id);
  }, [lastIncomingId, id, markRead]);

  // Follow new messages, unless the person has scrolled up to read older ones.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastMessageId, messages?.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setSendError(null);
    try {
      await sendMessage({ id, text }).unwrap();
      setDraft("");
      stickToBottom.current = true;
      if (textareaRef.current) textareaRef.current.style.height = "";
    } catch (err) {
      setSendError(getApiErrorMessage(err, "Couldn't send. Check your connection and try again."));
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter is a new line (phone keyboards); Ctrl/Cmd+Enter sends on a computer.
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSend();
    }
  }

  function growTextarea(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  const conversation = data?.conversation;
  const title = conversation ? chatTitle(conversation) : "Chat";

  // Same height budget as the page chrome: header + paddings (+ bottom nav on phones).
  const frame =
    "flex h-[calc(100dvh-9.5rem)] min-h-80 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background sm:h-[calc(100dvh-10.5rem)] md:h-[calc(100dvh-12rem)]";

  if (isLoading) {
    return (
      <div className={frame}>
        <p className="p-4 text-sm text-muted">Loading chat…</p>
      </div>
    );
  }

  if (isError || !data || !conversation) {
    const missing = typeof error === "object" && error !== null && "status" in error && error.status === 404;
    return (
      <div className={frame}>
        <div className="p-4 text-sm">
          <Link href="/whatsapp" className="mb-3 inline-flex items-center gap-1 font-medium text-primary md:hidden">
            <ArrowLeft size={16} aria-hidden /> All chats
          </Link>
          <p className="text-danger">{missing ? "This chat doesn't exist any more." : "Couldn't load this chat."}</p>
          {!missing && (
            <button type="button" onClick={() => refetch()} className="mt-2 font-medium text-primary">
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const items = withDayDividers(data.messages);

  return (
    <section aria-label={`Chat with ${title}`} className={frame}>
      <header className="flex items-center gap-2 border-b border-border px-2 py-2">
        <Link
          href="/whatsapp"
          aria-label="Back to all chats"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-ink-100 md:hidden"
        >
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-sm font-semibold text-leaf-700"
        >
          {initialOf(title)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          <p className="truncate text-xs text-muted">
            {formatWaId(conversation.waId)}
            {conversation.company ? ` · ${conversation.company}` : ""}
          </p>
        </div>
        {conversation.needsHuman && (
          <span className="shrink-0 rounded bg-chilli-100 px-1.5 py-0.5 text-[11px] font-medium text-chilli-800">
            Needs reply
          </span>
        )}
      </header>

      <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto bg-surface px-3 py-3">
        {data.hasMore && (
          <div className="mb-3 text-center">
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE)}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-ink-100"
            >
              Load earlier messages
            </button>
          </div>
        )}

        {items.length === 0 && <p className="py-8 text-center text-sm text-muted">No messages yet.</p>}

        <ol className="flex flex-col gap-1.5">
          {items.map((item) =>
            item.kind === "day" ? (
              <li key={item.key} className="my-2 flex justify-center">
                <span className="rounded-full bg-ink-100 px-3 py-1 text-[11px] font-medium text-muted">{item.label}</span>
              </li>
            ) : (
              <li key={item.message.id}>
                <Bubble message={item.message} />
              </li>
            ),
          )}
        </ol>
      </div>

      {conversation.windowOpen ? (
        <form onSubmit={handleSend} className="border-t border-border bg-background p-2">
          {sendError && (
            <p role="alert" className="mb-2 px-1 text-sm text-danger">
              {sendError}
            </p>
          )}
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Message</span>
              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                maxLength={MAX_LENGTH}
                placeholder="Type a reply"
                onChange={(e) => {
                  setDraft(e.target.value);
                  growTextarea(e.target);
                }}
                onKeyDown={handleKeyDown}
                className="input block max-h-32 min-h-11 w-full resize-none text-base"
              />
            </label>
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              <Send size={18} aria-hidden />
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-muted">
            Customer sees this from the shop&apos;s WhatsApp number, not your name.
          </p>
        </form>
      ) : (
        <div className="flex items-start gap-2 border-t border-border bg-background p-3 text-sm text-muted">
          <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            The 24-hour reply window has closed. WhatsApp only lets the shop reply within 24 hours of the
            customer&apos;s last message, so you can reply again once they write to us.
          </p>
        </div>
      )}
    </section>
  );
}

type ThreadItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; message: ChatMessage };

function withDayDividers(messages: ChatMessage[]): ThreadItem[] {
  const items: ThreadItem[] = [];
  let currentDay = "";
  for (const message of messages) {
    const day = dayKey(message.timestamp);
    if (day !== currentDay) {
      currentDay = day;
      items.push({ kind: "day", key: `day-${day}`, label: formatDayLabel(message.timestamp) });
    }
    items.push({ kind: "message", message });
  }
  return items;
}

function senderLabel(message: ChatMessage): string | null {
  if (message.direction === "in") return null;
  if (message.source === "bot") return "Auto-reply";
  if (message.source === "business_app") return "Sent from the WhatsApp Business app";
  return message.sentByName ?? "Staff";
}

function Bubble({ message }: { message: ChatMessage }) {
  const outgoing = message.direction === "out";
  const label = senderLabel(message);
  const tone = !outgoing
    ? "border border-border bg-background"
    : message.source === "bot"
      ? "bg-ink-100"
      : "bg-leaf-100";

  return (
    <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] min-w-0 rounded-2xl px-3 py-2 text-sm text-foreground sm:max-w-[75%] ${tone}`}>
        {label && <p className="mb-0.5 text-[11px] font-medium text-muted">{label}</p>}
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text || "Message sent"}</p>
        <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted">
          <time dateTime={message.timestamp}>{formatClock(message.timestamp)}</time>
          {outgoing && <Ticks status={message.status} />}
        </p>
        {message.status === "failed" && (
          <p className="mt-1 text-xs text-danger [overflow-wrap:anywhere]">
            Not delivered{message.error ? `: ${message.error}` : "."}
          </p>
        )}
      </div>
    </div>
  );
}

function Ticks({ status }: { status: ChatMessage["status"] }) {
  switch (status) {
    case "read":
      return <CheckCheck size={14} className="text-success" aria-label="Read" />;
    case "delivered":
      return <CheckCheck size={14} aria-label="Delivered" />;
    case "failed":
      return <CircleAlert size={14} className="text-danger" aria-label="Failed" />;
    default:
      return <Check size={14} aria-label="Sent" />;
  }
}
