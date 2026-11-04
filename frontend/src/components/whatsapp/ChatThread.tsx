"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  Info,
  LayoutTemplate,
  Lock,
  MoreHorizontal,
  MousePointerClick,
  NotebookPen,
  Paperclip,
  Plus,
  Send,
  Trash2,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useGetChatQuery,
  useGetWhatsappSummaryQuery,
  useMarkChatReadMutation,
  useSendChatMessageMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";
import { AddCustomerDialog } from "@/components/customers/AddCustomerDialog";
import { ChatBubble } from "@/components/whatsapp/ChatBubble";
import { ChatCrmBar } from "@/components/whatsapp/ChatCrmBar";
import { AttachDialog, ATTACH_ACCEPT, ButtonsDialog, QuickReplyDialog } from "@/components/whatsapp/ComposerDialogs";
import { DeleteChatsDialog } from "@/components/whatsapp/DeleteChatsDialog";
import { MessageBuilderDialog, MoreMenuDialog, type BuilderKind } from "@/components/whatsapp/MessageBuilders";
import { SendTemplateDialog } from "@/components/whatsapp/SendTemplateDialog";
import { getApiErrorMessage } from "@/lib/apiError";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import { chatTitle, dayKey, formatDayLabel, formatWaId, initialOf } from "@/lib/whatsapp";
import type { ChatMessage } from "@/types/whatsapp";

type AttachChoice = "file" | "saved" | "buttons" | "template" | "more";

const PAGE = 50;
const POLL_MS = 5_000;
const MAX_LENGTH = 4096;

/** One customer's conversation: history, live updates, and a reply box while WhatsApp allows it. */
export function ChatThreadView({ id }: { id: string }) {
  const router = useRouter();
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
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
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
  const cloudinaryConfigured = summary?.media.cloudinaryConfigured ?? false;
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

  /** What the "+" menu opens. */
  function chooseAttach(choice: AttachChoice) {
    setAttachMenuOpen(false);
    if (choice === "file") fileInputRef.current?.click();
    else if (choice === "saved") setQuickOpen(true);
    else if (choice === "buttons") setButtonsOpen(true);
    else if (choice === "template") setTemplateOpen(true);
    else setMoreOpen(true);
  }

  /** Anything sent from a dialog: show the new message and clear any old error. */
  function handleSentElsewhere() {
    stickToBottom.current = true;
    setSendError(null);
  }

  /** A saved text goes into the message box so it can be edited before sending. */
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
  const frame = "flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background";

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
  const windowOpen = conversation.windowOpen && !serviceOff;

  const attachItems: { choice: AttachChoice; icon: LucideIcon; label: string }[] = [
    { choice: "file", icon: Paperclip, label: "Photo, video or file" },
    { choice: "saved", icon: Bookmark, label: "Saved messages" },
    { choice: "buttons", icon: MousePointerClick, label: "Message with buttons" },
    { choice: "template", icon: LayoutTemplate, label: "Template" },
    { choice: "more", icon: MoreHorizontal, label: "Other messages" },
  ];

  return (
    <section aria-label={`Chat with ${title}`} className={frame}>
      {/* ---------- Header ---------- */}
      <header className="flex items-center gap-2 border-b border-border bg-background px-2 py-2">
        <Link
          href="/whatsapp"
          aria-label="Back to all chats"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-ink-100 md:hidden"
        >
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-sm font-semibold text-leaf-700">
          {initialOf(title)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          <p className="truncate text-xs text-muted">
            {formatWaId(conversation.waId)}
            {conversation.company ? ` · ${conversation.company}` : ""}
            {conversation.assignedTo ? ` · ${conversation.assignedTo.name}` : ""}
          </p>
        </div>
        {conversation.status === "resolved" && (
          <span className="hidden shrink-0 rounded bg-leaf-100 px-1.5 py-0.5 text-[11px] font-medium text-leaf-800 sm:inline">Resolved</span>
        )}
        {conversation.needsHuman && (
          <span className="shrink-0 rounded bg-chilli-100 px-1.5 py-0.5 text-[11px] font-medium text-chilli-800">Needs reply</span>
        )}
        {!conversation.isCustomer && canSaveContact && (
          <button
            type="button"
            onClick={() => setSaveContactOpen(true)}
            aria-label="Save contact"
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:bg-ink-100"
          >
            <UserPlus size={18} aria-hidden />
            <span className="hidden lg:inline">Save contact</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setDetailsOpen((o) => !o)}
          aria-label="Chat details"
          aria-pressed={detailsOpen}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-ink-100 ${detailsOpen ? "bg-ink-100 text-foreground" : "text-muted"}`}
        >
          <Info size={20} aria-hidden />
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setDeleteIds([id])}
            aria-label="Delete this chat"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-chilli-50 hover:text-danger"
          >
            <Trash2 size={19} aria-hidden />
          </button>
        )}
      </header>

      {detailsOpen && <ChatCrmBar chat={conversation} />}

      {/* ---------- Messages ---------- */}
      <div ref={scrollRef} onScroll={handleScroll} className="chat-wallpaper min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-6">
        {data.hasMore && (
          <div className="mb-3 text-center">
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE)}
              className="rounded-full bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-ink-100"
            >
              Load earlier messages
            </button>
          </div>
        )}

        {items.length === 0 && <p className="py-8 text-center text-sm text-muted">No messages yet.</p>}

        <ol className="flex flex-col gap-1">
          {items.map((item, index) =>
            item.kind === "day" ? (
              <li key={item.key} className="my-2 flex justify-center">
                <span className="rounded-lg bg-background px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted shadow-sm">
                  {item.label}
                </span>
              </li>
            ) : (
              <li key={item.message.id} className={startsRun(items, index) ? "mt-1.5" : undefined}>
                <ChatBubble
                  message={item.message}
                  showTail={startsRun(items, index)}
                  cloudinaryConfigured={cloudinaryConfigured}
                  canReact={windowOpen}
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

      {/* ---------- Composer ---------- */}
      {serviceOff ? (
        <div className="flex items-start gap-2 border-t border-border bg-surface p-3 text-sm text-muted">
          <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>The WhatsApp service is turned off, so messages can&apos;t be sent right now.</p>
        </div>
      ) : conversation.windowOpen ? (
        <form onSubmit={handleSend} className="relative border-t border-border bg-surface px-2 py-2">
          {replyTo && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-leaf-500 bg-background px-2.5 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-leaf-700">Replying to {replyTo.direction === "in" ? "the customer" : "your message"}</p>
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setAttachMenuOpen((o) => !o)}
                aria-label="Attach or send something else"
                aria-expanded={attachMenuOpen}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-ink-200"
              >
                <Plus size={24} aria-hidden className={`transition-transform ${attachMenuOpen ? "rotate-45" : ""}`} />
              </button>
              {attachMenuOpen && (
                <>
                  <button type="button" aria-label="Close the menu" onClick={() => setAttachMenuOpen(false)} className="fixed inset-0 z-10 cursor-default" />
                  <ul className="absolute bottom-full left-0 z-20 mb-2 w-60 overflow-hidden rounded-xl border border-border bg-background py-1 shadow-lg">
                    {attachItems.map(({ choice, icon: Icon, label }) => (
                      <li key={choice}>
                        <button
                          type="button"
                          onClick={() => chooseAttach(choice)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-foreground hover:bg-ink-100"
                        >
                          <Icon size={18} className="text-muted" aria-hidden />
                          {label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <label className="min-w-0 flex-1">
              <span className="sr-only">Message</span>
              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                maxLength={MAX_LENGTH}
                placeholder="Type a message"
                onChange={(e) => {
                  setDraft(e.target.value);
                  growTextarea(e.target);
                }}
                onKeyDown={handleKeyDown}
                className="block max-h-32 min-h-11 w-full resize-none rounded-3xl border border-transparent bg-background px-4 py-2.5 text-base outline-none focus:border-leaf-500"
              />
            </label>

            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-leaf-600 text-white disabled:opacity-50"
            >
              <Send size={19} aria-hidden />
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2 border-t border-border bg-surface p-3 text-sm text-muted">
          <div className="flex items-start gap-2">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
            <p>
              The 24-hour reply window has closed. WhatsApp only lets the shop send free messages within 24 hours of the customer&apos;s last
              message. You can still send an approved template.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setTemplateOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-leaf-600 px-4 py-2.5 text-sm font-medium text-white"
            >
              <LayoutTemplate size={16} aria-hidden /> Send a template
            </button>
            <button
              type="button"
              onClick={() => setBuilder("note")}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100"
            >
              <NotebookPen size={16} aria-hidden /> Add an internal note
            </button>
          </div>
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
      <QuickReplyDialog
        chatId={id}
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onPick={handleQuickPick}
        onSent={handleSentElsewhere}
        isAdmin={isAdmin}
      />
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
      <AttachDialog chatId={id} file={attachment} cloudinaryConfigured={cloudinaryConfigured} onClose={() => setAttachment(null)} onSent={handleSentElsewhere} />
      <DeleteChatsDialog ids={deleteIds} onClose={() => setDeleteIds([])} onDeleted={() => router.replace("/whatsapp")} />
    </section>
  );
}

type ThreadItem = { kind: "day"; key: string; label: string } | { kind: "message"; message: ChatMessage };

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

/** True for the first message of a run from the same side (the one that gets the tail and a little more space above). */
function startsRun(items: ThreadItem[], index: number): boolean {
  const current = items[index];
  if (current?.kind !== "message") return false;
  const previous = items[index - 1];
  return !(previous?.kind === "message" && previous.message.direction === current.message.direction && previous.message.source !== "note");
}
