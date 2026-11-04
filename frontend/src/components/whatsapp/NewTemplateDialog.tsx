"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getApiErrorMessage } from "@/lib/apiError";
import { useCreateWhatsappTemplateMutation } from "@/lib/redux/features/whatsapp/whatsappApi";
import { variablesIn } from "@/lib/whatsapp";
import type { NewTemplate, NewTemplateButton } from "@/types/whatsapp";

const LIMITS = { header: 60, body: 1024, footer: 60, button: 25, buttons: 3 } as const;

type ButtonDraft = { type: NewTemplateButton["type"]; text: string; url: string; phone: string; example: string };

const emptyButton = (): ButtonDraft => ({ type: "QUICK_REPLY", text: "", url: "", phone: "", example: "" });

function toButton(b: ButtonDraft): NewTemplateButton {
  if (b.type === "URL") return { type: "URL", text: b.text, url: b.url, ...(b.example.trim() ? { example: b.example } : {}) };
  if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone: b.phone };
  return { type: "QUICK_REPLY", text: b.text };
}

/** Writes a new template and sends it to Meta for review (usually answered within minutes to a day). */
export function NewTemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="New message template" size="lg">
      {open && <TemplateForm onClose={onClose} />}
    </Modal>
  );
}

function TemplateForm({ onClose }: { onClose: () => void }) {
  const [create, { isLoading }] = useCreateWhatsappTemplateMutation();

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [category, setCategory] = useState<NewTemplate["category"]>("UTILITY");
  const [header, setHeader] = useState("");
  const [headerExample, setHeaderExample] = useState("");
  const [body, setBody] = useState("");
  const [examples, setExamples] = useState<Record<string, string>>({});
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<ButtonDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const bodyVars = variablesIn(body);
  const headerHasVar = variablesIn(header).length > 0;

  function updateButton(index: number, patch: Partial<ButtonDraft>) {
    setButtons((list) => list.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setError(null);

    try {
      await create({
        name: name.trim(),
        language: language.trim(),
        category,
        ...(header.trim() ? { header: header.trim() } : {}),
        ...(headerHasVar ? { headerExample: headerExample.trim() } : {}),
        body: body.trim(),
        bodyExamples: bodyVars.map((v) => (examples[v] ?? "").trim()),
        ...(footer.trim() ? { footer: footer.trim() } : {}),
        buttons: buttons.map(toButton),
      }).unwrap();
      setDone(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't create the template. Check your connection and try again."));
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3 text-center">
        <p className="text-sm text-foreground">
          <span className="font-medium">{name}</span> was sent to WhatsApp for review. It shows as pending until Meta approves it,
          then it can be sent to customers.
        </p>
        <button type="button" onClick={onClose} className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
          Template name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            placeholder="order_ready"
            autoComplete="off"
            className="input"
          />
          <span className="text-xs font-normal text-muted">Lowercase letters, digits and underscores. It can&apos;t be changed later.</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Language
          <input required value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" className="input" />
          <span className="text-xs font-normal text-muted">en, hi, en_US ...</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Type
          <select value={category} onChange={(e) => setCategory(e.target.value as NewTemplate["category"])} className="input">
            <option value="UTILITY">Utility (orders, bills, updates)</option>
            <option value="MARKETING">Marketing (offers, promotions)</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Header <span className="font-normal text-muted">(optional)</span>
        <input
          value={header}
          maxLength={LIMITS.header}
          onChange={(e) => setHeader(e.target.value)}
          placeholder="Order update"
          className="input"
        />
      </label>
      {headerHasVar && (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Sample for the header&apos;s {"{{1}}"}
          <input required value={headerExample} onChange={(e) => setHeaderExample(e.target.value)} className="input" />
        </label>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Message
        <textarea
          required
          rows={5}
          value={body}
          maxLength={LIMITS.body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"Hi {{1}}, your order {{2}} is ready for pickup."}
          className="input resize-y"
        />
        <span className="text-xs font-normal text-muted">
          Use {"{{1}}"}, {"{{2}}"} ... for the parts that change. Don&apos;t start or end the message with one.
        </span>
      </label>

      {bodyVars.length > 0 && (
        <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium text-foreground">Sample values</legend>
          <p className="text-xs text-muted">WhatsApp reviews the template using these examples. Use realistic values.</p>
          {bodyVars.map((v) => (
            <label key={v} className="flex flex-col gap-1.5 text-sm text-foreground">
              <span>
                Sample for {"{{"}
                {v}
                {"}}"}
              </span>
              <input
                required
                value={examples[v] ?? ""}
                onChange={(e) => setExamples((s) => ({ ...s, [v]: e.target.value }))}
                className="input"
              />
            </label>
          ))}
        </fieldset>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Footer <span className="font-normal text-muted">(optional)</span>
        <input value={footer} maxLength={LIMITS.footer} onChange={(e) => setFooter(e.target.value)} placeholder="Thank you for shopping with us" className="input" />
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">
          Buttons <span className="font-normal text-muted">(optional, up to {LIMITS.buttons})</span>
        </legend>
        {buttons.map((button, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex gap-2">
              <select
                aria-label={`Button ${i + 1} type`}
                value={button.type}
                onChange={(e) => updateButton(i, { type: e.target.value as ButtonDraft["type"] })}
                className="input w-44 shrink-0"
              >
                <option value="QUICK_REPLY">Quick reply</option>
                <option value="URL">Open a link</option>
                <option value="PHONE_NUMBER">Call a number</option>
              </select>
              <input
                aria-label={`Button ${i + 1} text`}
                required
                maxLength={LIMITS.button}
                value={button.text}
                onChange={(e) => updateButton(i, { text: e.target.value })}
                placeholder="Button text"
                className="input min-w-0 flex-1"
              />
              <button
                type="button"
                onClick={() => setButtons((list) => list.filter((_, idx) => idx !== i))}
                aria-label={`Remove button ${i + 1}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-ink-100 hover:text-danger"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
            {button.type === "URL" && (
              <>
                <input
                  aria-label={`Button ${i + 1} link`}
                  required
                  value={button.url}
                  onChange={(e) => updateButton(i, { url: e.target.value })}
                  placeholder="https://example.com/track/{{1}}"
                  className="input"
                />
                {variablesIn(button.url).length > 0 && (
                  <input
                    aria-label={`Button ${i + 1} sample`}
                    required
                    value={button.example}
                    onChange={(e) => updateButton(i, { example: e.target.value })}
                    placeholder="Sample for {{1}}, e.g. INV-1042"
                    className="input"
                  />
                )}
              </>
            )}
            {button.type === "PHONE_NUMBER" && (
              <input
                aria-label={`Button ${i + 1} phone`}
                required
                type="tel"
                value={button.phone}
                onChange={(e) => updateButton(i, { phone: e.target.value })}
                placeholder="+919876543210"
                className="input"
              />
            )}
          </div>
        ))}
        {buttons.length < LIMITS.buttons && (
          <button
            type="button"
            onClick={() => setButtons((list) => [...list, emptyButton()])}
            className="flex items-center justify-center gap-1.5 self-start rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100"
          >
            <Plus size={16} aria-hidden /> Add a button
          </button>
        )}
      </fieldset>

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
        {isLoading ? "Sending for review…" : "Send for review"}
      </button>
    </form>
  );
}
