"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUpdateCustomerMutation } from "@/lib/redux/features/customers/customersApi";
import { getApiErrorMessage } from "@/lib/apiError";
import type { Customer } from "@/types/customer";

export function EditCustomerDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  return (
    <Modal open={!!customer} onClose={onClose} title="Edit customer">
      {customer && <EditCustomerForm key={customer._id} customer={customer} onClose={onClose} />}
    </Modal>
  );
}

function EditCustomerForm({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [updateCustomer, { isLoading }] = useUpdateCustomerMutation();
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone,
    company: customer.company,
    email: customer.email,
    gstin: customer.gstin,
    address: customer.address,
  });
  const [applyToInvoices, setApplyToInvoices] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError("Name is required.");
    if (form.phone.replace(/\D/g, "").length < 10) return setError("Enter a valid 10-digit phone number.");

    try {
      await updateCustomer({
        id: customer._id,
        name: form.name.trim(),
        phone: form.phone.trim(),
        company: form.company.trim(),
        email: form.email.trim(),
        gstin: form.gstin.trim().toUpperCase(),
        address: form.address.trim(),
        applyToInvoices,
      }).unwrap();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save the customer — try again."));
    }
  }

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name *">
          <input required value={form.name} onChange={set("name")} className="input" />
        </Field>
        <Field label="Phone *">
          <input required type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} className="input" />
        </Field>
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

      {customer.invoiceCount > 0 && (
        <label className="flex items-start gap-2 rounded-md bg-surface p-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={applyToInvoices}
            onChange={(e) => setApplyToInvoices(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            Also correct these details on their past bills
            <span className="block text-xs text-muted">
              Otherwise past bills keep the details they were printed with.
            </span>
          </span>
        </label>
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
          {isLoading ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
      {label}
      {children}
    </label>
  );
}
