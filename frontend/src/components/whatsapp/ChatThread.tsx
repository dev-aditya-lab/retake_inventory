"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CheckCheck, CircleAlert, CornerUpLeft, LayoutTemplate, Lock, MoreHorizontal, MousePointerClick, NotebookPen, Paperclip, Send, SmilePlus, UserPlus, X, Zap } from "lucide-react";
import {
  useGetChatQuery,
  useGetWhatsappSummaryQuery,
  useMarkChatReadMutation,
  useReactToMessageMutation,
  useSendChatMessageMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";
import { AddCustomerDialog } from "@/components/customers/AddCustomerDialog";
import { AttachDialog, ATTACH_ACCEPT, ButtonsDialog, QuickReplyDialog } from "@/components/whatsapp/ComposerDialogs";
import { ChatCrmBar } from "@/components/whatsapp/ChatCrmBar";
import { LocationCard, MediaAttachment } from "@/components/whatsapp/MediaAttachment";
import { MessageBuilderDialog, MoreMenuDialog, type BuilderKind } from "@/components/whatsapp/MessageBuilders";
import { SendTemplateDialog } from "@/components/whatsapp/SendTemplateDialog";
import { getApiErrorMessage } from "@/lib/apiError";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
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
  const [templateOpen, setTemplateOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [buttonsOpen, setButtonsOpen] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [saveContactOpen, setSaveContactOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [builder, setBuilder] = useState<BuilderKind | null>(null);
  /** The message being quoted by the reply that is being typed. */
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: user } = useGetMeQuery();
  const isAdmin = user?.role === "admin";
  // The same staff who may add customers elsewhere (the server enforces this too).
  const canSaveContact = user?.role === "admin" || user?.role === "sales";

  const { data, isLoading, isError, error, refetch } = useGetChatQuery(
    { id, limit },
    { pollingInterval: POLL_MS, skipPollingIfUnfocused: true },
  );
  const { data: summary } = useGetWhatsappSummaryQuery();
  const serviceOff = summary?.serviceEnabled === false;
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
      await sendMessage({ id, text, ...(replyTo ? { replyTo: replyTo.id } : {}) }).unwrap();
      setDraft("");
      setReplyTo(null);
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

  /** Anything sent from a dialog: show the new message and clear any old error. */
  function handleSentElsewhere() {
    stickToBottom.current = true;
    setSendError(null);
  }

  /** A quick reply goes into the message box so it can be edited before sending. */
  function handleQuickPick(text: string) {
    setDraft((current) => (current.trim() ? `${current.trimEnd()}\n${text}` : text).slice(0, MAX_LENGTH));
    setQuickOpen(false);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        growTextarea(el);
      }
    });
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
        {conversation.status === "resolved" && (
          <span className="shrink-0 rounded bg-leaf-100 px-1.5 py-0.5 text-[11px] font-medium text-leaf-800">Resolved</span>
        )}
        {conversation.needsHuman && (
          <span className="shrink-0 rounded bg-chilli-100 px-1.5 py-0.5 text-[11px] font-medium text-chilli-800">
            Needs reply
          </span>
        )}
        {!conversation.isCustomer && canSaveContact && (
          <button
            type="button"
            onClick={() => setSaveContactOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium text-foreground hover:bg-ink-100"
          >
            <UserPlus size={14} aria-hidden />
            <span className="hidden sm:inline">Save contact</span>
            <span className="sm:hidden">Save</span>
          </button>
        )}
      </header>

      <ChatCrmBar chat={conversation} />

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
                <Bubble
                  message={item.message}
                  cloudinaryConfigured={summary?.media.cloudinaryConfigured ?? false}
                  canReact={conversation.windowOpen && !serviceOff}
                  onReply={() => {
                    setReplyTo(item.message);
                    textareaRef.current?.focus();
                  }}
                />
              </li>
            ),
          )}
        </ol>
      </div>

      {serviceOff ? (
        <div className="flex items-start gap-2 border-t border-border bg-background p-3 text-sm text-muted">
          <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>The WhatsApp service is turned off, so messages can&apos;t be sent right now.</p>
        </div>
      ) : conversation.windowOpen ? (
        <form onSubmit={handleSend} className="border-t border-border bg-background p-2">
          <div className="mb-2 flex gap-1.5 overflow-x-auto" role="toolbar" aria-label="More ways to reply">
            <ToolButton icon={Zap} label="Quick reply" onClick={() => setQuickOpen(true)} />
            <ToolButton icon={Paperclip} label="Photo / file" onClick={() => fileInputRef.current?.click()} />
            <ToolButton icon={MousePointerClick} label="Buttons" onClick={() => setButtonsOpen(true)} />
            <ToolButton icon={LayoutTemplate} label="Template" onClick={() => setTemplateOpen(true)} />
            <ToolButton icon={MoreHorizontal} label="More" onClick={() => setMoreOpen(true)} />
          </div>
          {replyTo && (
            <div className="mb-2 flex items-start gap-2 rounded-md border-l-4 border-leaf-500 bg-surface px-2.5 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-muted">
                  Replying to {replyTo.direction === "in" ? "the customer" : "your message"}
                </p>
                <p className="line-clamp-2 text-xs text-foreground [overflow-wrap:anywhere]">{replyTo.text}</p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="Stop replying to this message"
                className="rounded-md p-1 text-muted hover:bg-ink-100"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          )}
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
        <div className="flex flex-col gap-2 border-t border-border bg-background p-3 text-sm text-muted">
          <div className="flex items-start gap-2">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
            <p>
              The 24-hour reply window has closed. WhatsApp only lets the shop send free messages within 24 hours of the
              customer&apos;s last message. You can still send an approved template.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTemplateOpen(true)}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            <LayoutTemplate size={16} aria-hidden /> Send a template
          </button>
          <button
            type="button"
            onClick={() => setBuilder("note")}
            className="flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100"
          >
            <NotebookPen size={16} aria-hidden /> Add an internal note
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ATTACH_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setAttachment(file);
          e.target.value = ""; // picking the same file again should still fire
        }}
      />
      <SendTemplateDialog
        chatId={id}
        customerName={conversation.name}
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSent={handleSentElsewhere}
      />
      <QuickReplyDialog open={quickOpen} onClose={() => setQuickOpen(false)} onPick={handleQuickPick} isAdmin={isAdmin} />
      <ButtonsDialog chatId={id} open={buttonsOpen} onClose={() => setButtonsOpen(false)} onSent={handleSentElsewhere} />
      <AddCustomerDialog
        open={saveContactOpen}
        onClose={() => setSaveContactOpen(false)}
        prefill={{ name: conversation.name, phone: `+${conversation.waId}` }}
        source="whatsapp"
      />
      <MoreMenuDialog
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        windowOpen={conversation.windowOpen}
        onChoose={(kind) => {
          setMoreOpen(false);
          setBuilder(kind);
        }}
      />
      <MessageBuilderDialog kind={builder} chatId={id} onClose={() => setBuilder(null)} onSent={handleSentElsewhere} />
      <AttachDialog chatId={id} file={attachment} cloudinaryConfigured={summary?.media.cloudinaryConfigured ?? false} onClose={() => setAttachment(null)} onSent={handleSentElsewhere} />
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
  if (message.source === "note") return `Internal note${message.sentByName ? ` · ${message.sentByName}` : ""}`;
  if (message.direction === "in") return null;
  if (message.source === "bot") return "Auto-reply";
  if (message.source === "business_app") return "Sent from the WhatsApp Business app";
  return message.sentByName ?? "Staff";
}

/** What to print as the message's words: media and locations are drawn by their own card, so only a caption remains. */
function bodyText(message: ChatMessage): string {
  if (message.media) return message.media.caption;
  if (message.location) return "";
  return message.text || "Message sent";
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "✅"];

function Bubble({
  message,
  cloudinaryConfigured,
  canReact,
  onReply,
}: {
  message: ChatMessage;
  cloudinaryConfigured: boolean;
  canReact: boolean;
  onReply: () => void;
}) {
  const [react, { isLoading: reacting }] = useReactToMessageMutation();
  const [picking, setPicking] = useState(false);
  const [reactError, setReactError] = useState<string | null>(null);

  const isNote = message.source === "note";
  const outgoing = message.direction === "out";
  const label = senderLabel(message);
  const tone = isNote
    ? "border border-amber-300 bg-amber-50"
    : !outgoing
      ? "border border-border bg-background"
      : message.source === "bot"
        ? "bg-ink-100"
        : "bg-leaf-100";
  const text = bodyText(message);

  async function handleReact(emoji: string) {
    setReactError(null);
    setPicking(false);
    try {
      // Tapping the emoji already chosen takes the reaction back.
      await react({ messageId: message.id, emoji: message.staffReaction === emoji ? "" : emoji }).unwrap();
    } catch (err) {
      setReactError(getApiErrorMessage(err, "Couldn't react."));
    }
  }

  const reactions = [message.customerReaction, message.staffReaction].filter(Boolean);

  return (
    <div className={`flex ${isNote ? "justify-center" : outgoing ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] min-w-0 rounded-2xl px-3 py-2 text-sm text-foreground sm:max-w-[75%] ${tone}`}>
        {label && <p className={`mb-0.5 text-[11px] font-medium ${isNote ? "text-amber-800" : "text-muted"}`}>{label}</p>}

        {message.replyTo && (
          <div className="mb-1.5 rounded-md border-l-4 border-leaf-500 bg-black/5 px-2 py-1">
            <p className="text-[11px] font-medium text-muted">
              {message.replyTo.direction === "in" ? "Customer" : message.replyTo.direction === "out" ? "Shop" : "Message"}
            </p>
            <p className="line-clamp-2 text-xs text-foreground [overflow-wrap:anywhere]">{message.replyTo.text}</p>
          </div>
        )}

        {message.media && (
          <div className={text ? "mb-1.5" : undefined}>
            <MediaAttachment message={message} cloudinaryConfigured={cloudinaryConfigured} />
          </div>
        )}
        {message.location && (
          <div className="mb-1">
            <LocationCard location={message.location} />
          </div>
        )}
        {text && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</p>}

        <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted">
          <time dateTime={message.timestamp}>{formatClock(message.timestamp)}</time>
          {outgoing && !isNote && <Ticks status={message.status} />}
        </p>
        {message.status === "failed" && (
          <p className="mt-1 text-xs text-danger [overflow-wrap:anywhere]">
            Not delivered{message.error ? `: ${message.error}` : "."}
          </p>
        )}

        {reactions.length > 0 && (
          <p className="mt-1 flex gap-1 text-base" aria-label="Reactions">
            {reactions.map((emoji, i) => (
              <span key={`${emoji}-${i}`} className="rounded-full bg-black/5 px-1.5 leading-6">
                {emoji}
              </span>
            ))}
          </p>
        )}

        {!isNote && (
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted">
            <button type="button" onClick={onReply} className="flex items-center gap-1 font-medium hover:text-foreground">
              <CornerUpLeft size={12} aria-hidden /> Reply
            </button>
            {!outgoing && canReact && (
              <button
                type="button"
                onClick={() => setPicking((p) => !p)}
                disabled={reacting}
                className="flex items-center gap-1 font-medium hover:text-foreground disabled:opacity-60"
              >
                <SmilePlus size={12} aria-hidden /> React
              </button>
            )}
          </div>
        )}
        {picking && (
          <div className="mt-1 flex gap-1" role="group" aria-label="Choose a reaction">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => void handleReact(emoji)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-lg hover:bg-black/10"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        {reactError && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {reactError}
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

function ToolButton({ icon: Icon, label, onClick }: { icon: typeof Send; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-ink-100"
    >
      <Icon size={14} aria-hidden />
      {label}
    </button>
  );
}
