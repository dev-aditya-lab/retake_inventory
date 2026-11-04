"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { TemplateChips, TemplatePreview } from "@/components/whatsapp/TemplatePreview";
import { getApiErrorMessage } from "@/lib/apiError";
import { useListWhatsappTemplatesQuery, useSendChatTemplateMutation } from "@/lib/redux/features/whatsapp/whatsappApi";
import { variableLabel, variablesIn } from "@/lib/whatsapp";
import type { TemplateDetail, TemplateValues } from "@/types/whatsapp";

/**
 * Pick an approved template, fill in its variables and send it. Templates are
 * allowed at any time, which makes this the way to message a customer whose
 * 24-hour reply window has closed.
 */
export function SendTemplateDialog({
  chatId,
  customerName,
  open,
  onClose,
  onSent,
}: {
  chatId: string;
  customerName: string;
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Send a template" size="lg">
      {open && <Picker chatId={chatId} customerName={customerName} onClose={onClose} onSent={onSent} />}
    </Modal>
  );
}

function Picker({
  chatId,
  customerName,
  onClose,
  onSent,
}: {
  chatId: string;
  customerName: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const { data, isLoading, isError, refetch } = useListWhatsappTemplatesQuery({ sendableOnly: true });
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<TemplateDetail | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((t) => !q || t.name.toLowerCase().includes(q) || t.bodyText.toLowerCase().includes(q));
  }, [data, query]);

  if (chosen) {
    return (
      <FillForm
        key={chosen.id}
        chatId={chatId}
        template={chosen}
        customerName={customerName}
        onBack={() => setChosen(null)}
        onSent={() => {
          onSent?.();
          onClose();
        }}
      />
    );
  }

  if (isLoading) return <p className="text-sm text-muted">Loading templates…</p>;
  if (isError || !data) {
    return (
      <div className="text-sm">
        <p className="text-danger">Couldn&apos;t load the templates.</p>
        <button type="button" onClick={() => refetch()} className="mt-2 font-medium text-primary">
          Try again
        </button>
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted">
        No approved templates are ready to send. An admin can load or create them on the{" "}
        <Link href="/whatsapp/templates" className="font-medium text-primary">
          Templates
        </Link>{" "}
        page.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">Search templates</span>
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates"
          className="input w-full pl-9 text-base"
        />
      </label>

      {shown.length === 0 && <p className="text-sm text-muted">No template matches.</p>}

      <ul className="flex flex-col gap-2">
        {shown.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => setChosen(template)}
              className="flex w-full min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-background p-3 text-left hover:bg-ink-50"
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 break-all text-sm font-medium text-foreground">{template.name}</span>
                <span className="text-xs text-muted">{template.language}</span>
              </span>
              <TemplateChips template={template} />
              <span className="line-clamp-2 text-sm text-muted [overflow-wrap:anywhere]">{template.bodyText}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FillForm({
  chatId,
  template,
  customerName,
  onBack,
  onSent,
}: {
  chatId: string;
  template: TemplateDetail;
  customerName: string;
  onBack: () => void;
  onSent: () => void;
}) {
  const [send, { isLoading }] = useSendChatTemplateMutation();

  const urlButtons = template.buttons.filter((b) => b.type === "URL" && b.url && variablesIn(b.url).length > 0);
  const needsMedia = ["IMAGE", "VIDEO", "DOCUMENT"].includes(template.headerFormat);

  // A variable that is plainly the customer's name starts filled in.
  const guess = (name: string) => (/name/i.test(name) ? customerName : "");

  const [header, setHeader] = useState<string[]>(() => template.headerVariables.map(guess));
  const [body, setBody] = useState<string[]>(() => template.bodyVariables.map(guess));
  const [mediaUrl, setMediaUrl] = useState("");
  const [buttonValues, setButtonValues] = useState<string[]>(() => urlButtons.map(() => ""));
  const [error, setError] = useState<string | null>(null);

  const values: TemplateValues = {
    header,
    body,
    ...(needsMedia ? { headerMediaUrl: mediaUrl } : {}),
    ...(urlButtons.length > 0 ? { buttonUrlValues: buttonValues } : {}),
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    try {
      await send({ id: chatId, templateId: template.id, values }).unwrap();
      onSent();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't send. Check your connection and try again."));
    }
  }

  const setAt = (list: string[], index: number, value: string) => list.map((v, i) => (i === index ? value : v));

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 self-start text-sm font-medium text-primary">
        <ArrowLeft size={16} aria-hidden /> All templates
      </button>

      <p className="break-all text-sm font-medium text-foreground">{template.name}</p>

      {template.headerVariables.map((name, i) => (
        <label key={`h-${name}`} className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Header: {variableLabel(name)}
          <input required value={header[i] ?? ""} onChange={(e) => setHeader((l) => setAt(l, i, e.target.value))} className="input" />
        </label>
      ))}

      {needsMedia && (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Link to the {template.headerFormat.toLowerCase()} for the header
          <input
            required
            type="url"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="https://..."
            className="input"
          />
          <span className="text-xs font-normal text-muted">A public https link that WhatsApp can open.</span>
        </label>
      )}

      {template.bodyVariables.map((name, i) => (
        <label key={`b-${name}`} className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          {variableLabel(name)}
          <input required value={body[i] ?? ""} onChange={(e) => setBody((l) => setAt(l, i, e.target.value))} className="input" />
        </label>
      ))}

      {urlButtons.map((button, i) => (
        <label key={`u-${button.text}-${i}`} className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          End of the link for “{button.text}”
          <input
            required
            value={buttonValues[i] ?? ""}
            onChange={(e) => setButtonValues((l) => setAt(l, i, e.target.value))}
            className="input"
          />
          <span className="text-xs font-normal text-muted [overflow-wrap:anywhere]">{button.url}</span>
        </label>
      ))}

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">Preview</p>
        <TemplatePreview template={template} values={values} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {isLoading ? "Sending…" : "Send template"}
      </button>
    </form>
  );
}
