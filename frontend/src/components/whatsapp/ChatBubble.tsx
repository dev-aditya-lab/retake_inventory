"use client";

import { useState } from "react";
import { Check, CheckCheck, ChevronDown, CircleAlert, Copy, CornerUpLeft, SmilePlus } from "lucide-react";
import { LocationCard, MediaAttachment } from "@/components/whatsapp/MediaAttachment";
import { getApiErrorMessage } from "@/lib/apiError";
import { useReactToMessageMutation } from "@/lib/redux/features/whatsapp/whatsappApi";
import { formatClock } from "@/lib/whatsapp";
import type { ChatMessage } from "@/types/whatsapp";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "✅"];

function senderLabel(message: ChatMessage): string | null {
  if (message.source === "note") return `Internal note${message.sentByName ? ` · ${message.sentByName}` : ""}`;
  if (message.direction === "in") return null;
  if (message.source === "bot") return "Auto-reply";
  if (message.source === "broadcast") return "Broadcast";
  if (message.source === "business_app") return "Sent from the WhatsApp Business app";
  return message.sentByName ?? "Staff";
}

/** What to print as the message's words: media and locations are drawn by their own card, so only a caption remains. */
function bodyText(message: ChatMessage): string {
  if (message.media) return message.media.caption;
  if (message.location) return "";
  return message.text || "Message sent";
}

/** One message in the thread, drawn like a messaging app: tail on the first of a run, time and ticks tucked in the corner. */
export function ChatBubble({
  message,
  showTail,
  cloudinaryConfigured,
  canReact,
  onReply,
}: {
  message: ChatMessage;
  /** First message of a run from the same side: gets the little tail. */
  showTail: boolean;
  cloudinaryConfigured: boolean;
  canReact: boolean;
  onReply: () => void;
}) {
  const [react, { isLoading: reacting }] = useReactToMessageMutation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isNote = message.source === "note";
  const outgoing = message.direction === "out";
  const label = senderLabel(message);
  const text = bodyText(message);
  const reactions = [message.customerReaction, message.staffReaction].filter(Boolean);

  async function handleReact(emoji: string) {
    setNotice(null);
    setPicking(false);
    setMenuOpen(false);
    try {
      // Tapping the emoji already chosen takes the reaction back.
      await react({ messageId: message.id, emoji: message.staffReaction === emoji ? "" : emoji }).unwrap();
    } catch (err) {
      setNotice(getApiErrorMessage(err, "Couldn't react."));
    }
  }

  async function handleCopy() {
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(message.text);
    } catch {
      setNotice("Couldn't copy.");
    }
  }

  if (isNote) {
    return (
      <div className="flex justify-center px-2">
        <div className="max-w-[90%] min-w-0 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-foreground shadow-sm sm:max-w-[70%]">
          <p className="mb-0.5 text-[11px] font-medium text-amber-800">{label}</p>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p>
          <p className="mt-1 text-right text-[11px] text-muted">
            <time dateTime={message.timestamp}>{formatClock(message.timestamp)}</time>
          </p>
        </div>
      </div>
    );
  }

  const shape = showTail ? (outgoing ? "bubble-tail-out rounded-tr-none" : "bubble-tail-in rounded-tl-none") : "";

  return (
    <div className={`group flex ${outgoing ? "justify-end" : "justify-start"} ${reactions.length > 0 ? "mb-3" : ""}`}>
      <div
        className={`bubble ${outgoing ? "bubble-out" : "bubble-in"} ${shape} max-w-[85%] min-w-0 rounded-lg px-2.5 pb-1.5 pt-1.5 text-sm text-foreground sm:max-w-[70%]`}
      >
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Message options"
          aria-expanded={menuOpen}
          className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/5 text-muted opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60"
        >
          <ChevronDown size={14} aria-hidden />
        </button>

        {label && <p className="mb-0.5 pr-6 text-[11px] font-semibold text-leaf-700">{label}</p>}

        {message.replyTo && (
          <div className="mb-1.5 rounded-md border-l-4 border-leaf-500 bg-black/5 px-2 py-1">
            <p className="text-[11px] font-semibold text-leaf-700">
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

        <p className="after:clear-both after:block after:content-['']">
          {text && <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</span>}
          <span className="float-right ml-3 mt-1.5 flex items-center gap-1 text-[11px] leading-none text-muted">
            <time dateTime={message.timestamp}>{formatClock(message.timestamp)}</time>
            {outgoing && <Ticks status={message.status} />}
          </span>
        </p>

        {message.status === "failed" && (
          <p className="mt-1 text-xs text-danger [overflow-wrap:anywhere]">Not delivered{message.error ? `: ${message.error}` : "."}</p>
        )}

        {menuOpen && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-black/10 pt-1.5 text-[11px] font-medium text-muted">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onReply();
              }}
              className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-black/5 hover:text-foreground"
            >
              <CornerUpLeft size={12} aria-hidden /> Reply
            </button>
            {!outgoing && canReact && (
              <button
                type="button"
                onClick={() => setPicking((p) => !p)}
                disabled={reacting}
                className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-black/5 hover:text-foreground disabled:opacity-60"
              >
                <SmilePlus size={12} aria-hidden /> React
              </button>
            )}
            {message.text && !message.media && (
              <button type="button" onClick={handleCopy} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-black/5 hover:text-foreground">
                <Copy size={12} aria-hidden /> Copy
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
        {notice && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {notice}
          </p>
        )}

        {reactions.length > 0 && (
          <span
            className={`absolute -bottom-3 ${outgoing ? "right-2" : "left-2"} flex gap-0.5 rounded-full bg-background px-1.5 py-0.5 text-sm leading-5 shadow`}
            aria-label="Reactions"
          >
            {reactions.map((emoji, i) => (
              <span key={`${emoji}-${i}`}>{emoji}</span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

export function Ticks({ status }: { status: ChatMessage["status"] }) {
  switch (status) {
    case "read":
      return <CheckCheck size={15} style={{ color: "var(--chat-tick-read)" }} aria-label="Read" />;
    case "delivered":
      return <CheckCheck size={15} aria-label="Delivered" />;
    case "failed":
      return <CircleAlert size={14} className="text-danger" aria-label="Failed" />;
    default:
      return <Check size={15} aria-label="Sent" />;
  }
}
