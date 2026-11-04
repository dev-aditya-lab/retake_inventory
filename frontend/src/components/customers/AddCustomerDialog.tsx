"use client";

import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { TagInput } from "@/components/customers/TagInput";
import { getApiErrorMessage } from "@/lib/apiError";
import { useCreateCustomerMutation } from "@/lib/redux/features/customers/customersApi";

export interface CustomerPrefill {
  name?: string;
  phone?: string;
}

/**
 * Saves a contact into the customer directory. Opened from the Customers page
 * (blank) or from a WhatsApp chat (name and number filled in from the chat).
 */
export function AddCustomerDialog({
  open,
  onClose,
  prefill,
  source = "manual",
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: CustomerPrefill;
  source?: "manual" | "whatsapp";
  onSaved?: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Save contact">
      {open && <AddCustomerForm prefill={prefill} source={source} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function AddCustomerForm({
  prefill,
  source,
  onClose,
  onSaved,
}: {
  prefill?: CustomerPrefill;
  source: "manual" | "whatsapp";
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [createCustomer, { isLoading }] = useCreateCustomerMutation();
  const [form, setForm] = useState({
    name: prefill?.name ?? "",
    phone: prefill?.phone ?? "",
    company: "",
    email: "",
    gstin: "",
    address: "",
    notes: "",
  });
  const [tags, setTags] = useState<string[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  const set = (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    if (!form.name.trim()) return setError("Name is required.");
    if (form.phone.replace(/\D/g, "").length < 10) return setError("Enter a valid 10-digit phone number.");

    try {
      await createCustomer({
        name: form.name.trim(),
        phone: form.phone.trim(),
        company: form.company.trim(),
        email: form.email.trim(),
        gstin: form.gstin.trim().toUpperCase(),
        address: form.address.trim(),
        notes: form.notes.trim(),
        tags,
        source,
      }).unwrap();
      setSavedName(form.name.trim());
      onSaved?.();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save the contact — try again."));
    }
  }

  if (savedName) {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <CheckCircle2 size={36} className="text-success" aria-hidden />
        <p className="text-sm text-foreground">
          <span className="font-medium">{savedName}</span> is saved. Their name now shows on their chats and bills.
        </p>
        <button type="button" onClick={onClose} className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name *">
          <input required autoComplete="off" value={form.name} onChange={set("name")} className="input" />
        </Field>
        <Field label="Phone *">
          <input required type="tel" inputMode="tel" autoComplete="off" value={form.phone} onChange={set("phone")} className="input" />
        </Field>
      </div>

      <Field label="Labels">
        <TagInput tags={tags} onChange={setTags} />
      </Field>

      <Field label="Note">
        <textarea
          rows={2}
          maxLength={500}
          value={form.notes}
          onChange={set("notes")}
          placeholder="e.g. Pays on Fridays, prefers delivery"
          className="input resize-none"
        />
      </Field>

      {showMore ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Company">
            <input value={form.company} onChange={set("company")} className="input" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={set("email")} className="input" />
          </Field>
          <Field label="GSTIN">
            <input
              value={form.gstin}
              maxLength={15}
              onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
              className="input uppercase"
            />
          </Field>
          <Field label="Address">
            <input value={form.address} onChange={set("address")} className="input" />
          </Field>
        </div>
      ) : (
        <button type="button" onClick={() => setShowMore(true)} className="self-start text-sm font-medium text-primary">
          Add company, email, GSTIN or address
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-ink-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isLoading ? "Saving…" : "Save contact"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
      {label}
      {children}
    </label>
  );
}
