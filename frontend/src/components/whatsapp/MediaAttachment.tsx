"use client";

import { useEffect, useState } from "react";
import { CloudUpload, Download, FileText, MapPin, Play } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getApiErrorMessage } from "@/lib/apiError";
import { useSaveChatMediaMutation } from "@/lib/redux/features/whatsapp/whatsappApi";
import { downloadMedia, loadMediaUrl, MediaError } from "@/lib/whatsappMedia";
import type { ChatMessage } from "@/types/whatsapp";

type LoadState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; url: string } | { kind: "error"; message: string; expired: boolean };

/** Loads a message's file. `auto` starts straight away (photos); otherwise it waits for a tap (video, audio, big files). */
function useMedia(messageId: string, auto: boolean) {
  // Photos start loading on mount, so they begin in the loading state.
  const [state, setState] = useState<LoadState>(auto ? { kind: "loading" } : { kind: "idle" });

  async function load() {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", url: await loadMediaUrl(messageId) });
    } catch (err) {
      const expired = err instanceof MediaError && err.expired;
      setState({ kind: "error", message: err instanceof Error ? err.message : "Couldn't load this file.", expired });
    }
  }

  useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    loadMediaUrl(messageId)
      .then((url) => !cancelled && setState({ kind: "ready", url }))
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Couldn't load this file.",
          expired: err instanceof MediaError && err.expired,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [messageId, auto]);

  return { state, load };
}

function Unavailable({ message, expired }: { message: string; expired: boolean }) {
  return (
    <p className="rounded-md bg-ink-100 px-3 py-4 text-center text-xs text-muted [overflow-wrap:anywhere]">
      {expired ? "This file has expired on WhatsApp." : message}
    </p>
  );
}

/** The photo, video, voice note, document or sticker inside a chat bubble, plus its "save to cloud" control. */
export function MediaAttachment({ message, cloudinaryConfigured }: { message: ChatMessage; cloudinaryConfigured: boolean }) {
  const media = message.media;
  if (!media) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {!media.available ? (
        <Unavailable message="" expired />
      ) : media.kind === "image" || media.kind === "sticker" ? (
        <ImageView messageId={message.id} alt={media.caption || "Photo"} sticker={media.kind === "sticker"} />
      ) : media.kind === "video" ? (
        <VideoView messageId={message.id} />
      ) : media.kind === "audio" ? (
        <AudioView messageId={message.id} voice={media.voice} />
      ) : (
        <DocumentView messageId={message.id} filename={media.filename || "Document"} />
      )}
      {media.available && <SaveControl messageId={message.id} saved={media.saved} cloudinaryConfigured={cloudinaryConfigured} />}
    </div>
  );
}

function ImageView({ messageId, alt, sticker }: { messageId: string; alt: string; sticker: boolean }) {
  const { state } = useMedia(messageId, true);
  const [open, setOpen] = useState(false);

  if (state.kind === "error") return <Unavailable message={state.message} expired={state.expired} />;
  if (state.kind !== "ready") return <div className="h-40 w-52 max-w-full animate-pulse rounded-md bg-ink-100" aria-label="Loading photo" />;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- an object URL for a private file: next/image can't optimise it */}
      <img
        src={state.url}
        alt={alt}
        onClick={() => !sticker && setOpen(true)}
        className={`max-h-72 w-auto max-w-full rounded-md object-contain ${sticker ? "h-32" : "cursor-zoom-in"}`}
      />
      {!sticker && (
        <Modal open={open} onClose={() => setOpen(false)} title="Photo" size="lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.url} alt={alt} className="mx-auto max-h-[70svh] w-auto max-w-full object-contain" />
        </Modal>
      )}
    </>
  );
}

function VideoView({ messageId }: { messageId: string }) {
  const { state, load } = useMedia(messageId, false);

  if (state.kind === "error") return <Unavailable message={state.message} expired={state.expired} />;
  if (state.kind === "ready") return <video src={state.url} controls playsInline className="max-h-72 max-w-full rounded-md" />;

  return (
    <button
      type="button"
      onClick={load}
      disabled={state.kind === "loading"}
      className="flex h-32 w-52 max-w-full items-center justify-center gap-2 rounded-md bg-ink-800 text-sm font-medium text-white disabled:opacity-70"
    >
      <Play size={18} aria-hidden /> {state.kind === "loading" ? "Loading…" : "Play video"}
    </button>
  );
}

function AudioView({ messageId, voice }: { messageId: string; voice: boolean }) {
  const { state, load } = useMedia(messageId, false);

  if (state.kind === "error") return <Unavailable message={state.message} expired={state.expired} />;
  if (state.kind === "ready") return <audio src={state.url} controls autoPlay className="w-60 max-w-full" />;

  return (
    <button
      type="button"
      onClick={load}
      disabled={state.kind === "loading"}
      className="flex items-center gap-2 rounded-md bg-ink-100 px-3 py-2.5 text-sm font-medium text-foreground disabled:opacity-70"
    >
      <Play size={16} aria-hidden /> {state.kind === "loading" ? "Loading…" : voice ? "Play voice note" : "Play audio"}
    </button>
  );
}

function DocumentView({ messageId, filename }: { messageId: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setBusy(true);
    setError(null);
    try {
      await downloadMedia(messageId, filename);
    } catch (err) {
      setError(err instanceof MediaError && err.expired ? "This file has expired on WhatsApp." : err instanceof Error ? err.message : "Couldn't download.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={busy}
        className="flex min-w-0 items-center gap-2.5 rounded-md bg-ink-100 px-3 py-2.5 text-left hover:bg-ink-200 disabled:opacity-70"
      >
        <FileText size={20} className="shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{filename}</span>
        <Download size={16} className="shrink-0 text-muted" aria-label={busy ? "Downloading" : "Download"} />
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** "Saved to cloud" once a Cloudinary copy exists; otherwise a button to make one (when the server can). */
function SaveControl({ messageId, saved, cloudinaryConfigured }: { messageId: string; saved: boolean; cloudinaryConfigured: boolean }) {
  const [save, { isLoading }] = useSaveChatMediaMutation();
  const [error, setError] = useState<string | null>(null);

  if (saved) {
    return (
      <p className="flex items-center gap-1 text-[11px] font-medium text-leaf-700">
        <CloudUpload size={12} aria-hidden /> Saved to cloud
      </p>
    );
  }
  if (!cloudinaryConfigured) return null;

  async function handleSave() {
    setError(null);
    try {
      await save(messageId).unwrap();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't save the file."));
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSave}
        disabled={isLoading}
        className="flex items-center gap-1 text-[11px] font-medium text-primary disabled:opacity-60"
      >
        <CloudUpload size={12} aria-hidden /> {isLoading ? "Saving…" : "Save to cloud"}
      </button>
      {error && (
        <p role="alert" className="mt-0.5 text-[11px] text-danger [overflow-wrap:anywhere]">
          {error}
        </p>
      )}
    </div>
  );
}

/** A shared location: the place name and a link that opens it in maps. */
export function LocationCard({ location }: { location: NonNullable<ChatMessage["location"]> }) {
  const href = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2 rounded-md bg-ink-100 px-3 py-2.5 hover:bg-ink-200"
    >
      <MapPin size={18} className="mt-0.5 shrink-0 text-chilli-600" aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground [overflow-wrap:anywhere]">{location.name || "Shared location"}</span>
        {location.address && <span className="block text-xs text-muted [overflow-wrap:anywhere]">{location.address}</span>}
        <span className="block text-xs font-medium text-primary">Open in maps</span>
      </span>
    </a>
  );
}
