"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TagInput } from "@/components/customers/TagInput";
import { Modal } from "@/components/ui/Modal";
import { TemplatePreview } from "@/components/whatsapp/TemplatePreview";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  useCreateBroadcastMutation,
  useListWhatsappLabelsQuery,
  useListWhatsappTemplatesQuery,
  usePreviewBroadcastAudienceMutation,
} from "@/lib/redux/features/whatsapp/whatsappApi";
import { variableLabel, variablesIn } from "@/lib/whatsapp";
import type { AudienceInput, AudiencePreview, TemplateDetail, TemplateValues } from "@/types/whatsapp";

/** Sends one approved template to a group of people, one by one. Admins only. */
export function NewBroadcastDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="New broadcast" size="lg">
      {open && <BroadcastForm onClose={onClose} />}
    </Modal>
  );
}

function parseNumbers(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter(Boolean);
}

function BroadcastForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data: templates, isLoading: loadingTemplates } = useListWhatsappTemplatesQuery({ sendableOnly: true });
  const { data: labelsInUse } = useListWhatsappLabelsQuery();
  const [create, { isLoading: creating }] = useCreateBroadcastMutation();
  const [preview, { isLoading: counting }] = usePreviewBroadcastAudienceMutation();

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [header, setHeader] = useState<string[]>([]);
  const [body, setBody] = useState<string[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [buttonValues, setButtonValues] = useState<string[]>([]);
  const [nameVariable, setNameVariable] = useState<number | "">("");

  const [allCustomers, setAllCustomers] = useState(false);
  const [customerTags, setCustomerTags] = useState<string[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [numbersText, setNumbersText] = useState("");

  const [consent, setConsent] = useState(false);
  const [counted, setCounted] = useState<AudiencePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const template: TemplateDetail | undefined = templates?.find((t) => t.id === templateId);
  const urlButtons = template?.buttons.filter((b) => b.type === "URL" && b.url && variablesIn(b.url).length > 0) ?? [];
  const needsMedia = !!template && ["IMAGE", "VIDEO", "DOCUMENT"].includes(template.headerFormat);

  const audience: AudienceInput = { allCustomers, customerTags, labels, numbers: parseNumbers(numbersText) };
  const hasAudience = allCustomers || customerTags.length > 0 || labels.length > 0 || audience.numbers.length > 0;

  function chooseTemplate(id: string) {
    const next = templates?.find((t) => t.id === id);
    setTemplateId(id);
    setHeader(next ? next.headerVariables.map(() => "") : []);
    setBody(next ? next.bodyVariables.map(() => "") : []);
    setButtonValues(next ? next.buttons.filter((b) => b.type === "URL" && b.url && variablesIn(b.url).length > 0).map(() => "") : []);
    setMediaUrl("");
    setNameVariable("");
  }

  const values: TemplateValues = {
    header,
    body,
    ...(needsMedia ? { headerMediaUrl: mediaUrl } : {}),
    ...(urlButtons.length > 0 ? { buttonUrlValues: buttonValues } : {}),
  };

  async function handleCount() {
    setError(null);
    try {
      setCounted(await preview(audience).unwrap());
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't count the people. Try again."));
    }
  }

  async function submit(start: boolean) {
    setError(null);
    if (!name.trim()) return setError("Give the broadcast a name.");
    if (!template) return setError("Choose a template.");
    if (!hasAudience) return setError("Choose who it goes to.");
    if (start && !consent) return setError("Confirm that these people agreed to receive messages.");

    // The person's own name fills its variable, so that box is not typed in.
    const bodyValues = body.map((v, i) => (nameVariable === i ? "x" : v));
    if (bodyValues.some((v) => !v.trim()) || header.some((v) => !v.trim())) return setError("Fill in every value of the template.");

    try {
      const { id } = await create({
        name: name.trim(),
        templateId: template.id,
        values: { ...values, body: bodyValues },
        ...(nameVariable !== "" ? { nameVariable } : {}),
        audience,
        start,
      }).unwrap();
      onClose();
      router.push(`/whatsapp/broadcasts/${id}`);
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't create the broadcast. Check your connection and try again."));
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(true);
  }

  const setAt = (list: string[], i: number, v: string) => list.map((x, idx) => (idx === i ? v : x));

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Name
        <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali offer, October" className="input" />
        <span className="text-xs font-normal text-muted">Only you see this.</span>
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-foreground">1. Message</legend>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Template
          <select value={templateId} onChange={(e) => chooseTemplate(e.target.value)} className="input" disabled={loadingTemplates}>
            <option value="">{loadingTemplates ? "Loading…" : "Choose an approved template"}</option>
            {templates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>
          {templates && templates.length === 0 && (
            <span className="text-xs font-normal text-muted">No approved templates yet. Create or load them on the Templates page.</span>
          )}
        </label>

        {template && (
          <>
            {template.headerVariables.map((v, i) => (
              <label key={`h${v}`} className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Header: {variableLabel(v)}
                <input value={header[i] ?? ""} onChange={(e) => setHeader((l) => setAt(l, i, e.target.value))} className="input" />
              </label>
            ))}
            {needsMedia && (
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Link to the {template.headerFormat.toLowerCase()} for the header
                <input type="url" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." className="input" />
              </label>
            )}
            {template.bodyVariables.map((v, i) => (
              <label key={`b${v}`} className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                {variableLabel(v)}
                <input
                  value={nameVariable === i ? "" : (body[i] ?? "")}
                  disabled={nameVariable === i}
                  placeholder={nameVariable === i ? "Each person's first name" : ""}
                  onChange={(e) => setBody((l) => setAt(l, i, e.target.value))}
                  className="input disabled:bg-ink-100"
                />
              </label>
            ))}
            {template.bodyVariables.length > 0 && (
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Use each person&apos;s first name for
                <select value={nameVariable} onChange={(e) => setNameVariable(e.target.value === "" ? "" : Number(e.target.value))} className="input">
                  <option value="">Nothing (same text for everyone)</option>
                  {template.bodyVariables.map((v, i) => (
                    <option key={v} value={i}>
                      {variableLabel(v)}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-normal text-muted">If we don&apos;t have a name, it says &ldquo;there&rdquo;.</span>
              </label>
            )}
            {urlButtons.map((b, i) => (
              <label key={`u${i}`} className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                End of the link for “{b.text}”
                <input value={buttonValues[i] ?? ""} onChange={(e) => setButtonValues((l) => setAt(l, i, e.target.value))} className="input" />
              </label>
            ))}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Preview</p>
              <TemplatePreview template={template} values={{ ...values, body: body.map((v, i) => (nameVariable === i ? "Asha" : v)) }} />
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-foreground">2. Who gets it</legend>

        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" checked={allCustomers} onChange={(e) => { setAllCustomers(e.target.checked); setCounted(null); }} className="mt-0.5 h-4 w-4" />
          <span>
            Every saved customer
            <span className="block text-xs text-muted">Everyone in the Customers list who has a phone number.</span>
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Customers with these labels</span>
          <TagInput tags={customerTags} onChange={(t) => { setCustomerTags(t); setCounted(null); }} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Chats with these labels</span>
          <TagInput tags={labels} onChange={(t) => { setLabels(t); setCounted(null); }} suggestions={labelsInUse ?? []} />
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Phone numbers
          <textarea
            rows={3}
            value={numbersText}
            onChange={(e) => { setNumbersText(e.target.value); setCounted(null); }}
            placeholder={"98765 43210\n98765 43211"}
            className="input resize-y"
          />
          <span className="text-xs font-normal text-muted">One per line, or separated by commas.</span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleCount}
            disabled={!hasAudience || counting}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-50"
          >
            {counting ? "Counting…" : "Count the people"}
          </button>
          {counted && (
            <p role="status" className={`text-sm ${counted.tooMany ? "text-danger" : "text-foreground"}`}>
              <span className="font-semibold">{counted.count}</span> {counted.count === 1 ? "person" : "people"}
              {counted.optedOut > 0 && <span className="text-muted"> ({counted.optedOut} left out: asked to stop)</span>}
              {counted.tooMany && ` — too many. The limit is ${counted.limit}.`}
            </p>
          )}
        </div>
      </fieldset>

      <label className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>
          These people agreed to receive WhatsApp messages from the shop.
          <span className="block text-xs">Sending to people who didn&apos;t can get the number blocked. Anyone who replies STOP is skipped from then on.</span>
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => void submit(false)}
          disabled={creating}
          className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-60"
        >
          Save as draft
        </button>
        <button type="submit" disabled={creating} className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {creating ? "Starting…" : "Send now"}
        </button>
      </div>
    </form>
  );
}
