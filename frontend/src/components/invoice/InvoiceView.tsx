import Image from "next/image";
import { company } from "@/config/company";
import { InvoiceBarcode } from "./InvoiceBarcode";
import { TaxDocumentView } from "./TaxDocumentView";
import { AuthorisedSignatory } from "./AuthorisedSignatory";
import type { Invoice } from "@/types/invoice";

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

/**
 * Shared invoice layout — used for the on-screen preview and for printing
 * (print.css hides the surrounding chrome via @media print). Kept as the
 * single source of truth for what an invoice looks like.
 */
export function InvoiceView({ invoice }: { invoice: Invoice }) {
  if (invoice.gstVersion === 2) {
    return (
      <TaxDocumentView
        title="TAX INVOICE"
        doc={{ ...invoice, number: invoice.invoiceNumber, date: invoice.billingDate }}
        paymentMethod={invoice.paymentMethod}
        cancelled={invoice.status === "void"}
      />
    );
  }

  // Bills made before GST billing was set up keep their original layout.
  return (
    <div id="invoice-print-area" className="mx-auto max-w-2xl bg-white p-6 text-ink-900 print:max-w-none print:p-0">
      {invoice.status === "void" && (
        <div className="mb-4 rounded-md border-2 border-chilli-700 p-3 text-center text-chilli-700">
          <p className="text-lg font-bold tracking-wide">CANCELLED</p>
          <p className="text-xs">
            This invoice is no longer valid
            {invoice.cancelledAt ? ` (cancelled ${new Date(invoice.cancelledAt).toLocaleDateString("en-IN")})` : ""}.
          </p>
        </div>
      )}
      <div className="flex items-start justify-between border-b border-ink-200 pb-4">
        <div className="flex items-center gap-3">
          <Image src={company.logoUrl} alt={company.name} width={56} height={56} className="rounded-md" />
          <div>
            <p className="text-lg font-semibold">{company.legalName}</p>
            <p className="text-xs text-ink-600">
              {company.address}, {company.city}, {company.state} {company.pincode}
            </p>
            <p className="text-xs text-ink-600">
              GSTIN: {company.gstin} · {company.contactNumber}
            </p>
            <p className="text-xs text-ink-600">
              {company.email} · {company.website}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-chilli-600">INVOICE</p>
          <p className="text-sm font-medium">{invoice.invoiceNumber}</p>
          <p className="text-xs text-ink-600">{new Date(invoice.billingDate).toLocaleDateString("en-IN")}</p>
        </div>
      </div>

      <div className="mt-4 text-sm">
        <p className="font-medium text-ink-700">Billed to</p>
        <p>{invoice.customer.name}</p>
        {invoice.customer.company && <p>{invoice.customer.company}</p>}
        {invoice.customer.address && <p>{invoice.customer.address}</p>}
        {invoice.customer.phone && <p>{invoice.customer.phone}</p>}
        {invoice.customer.email && <p>{invoice.customer.email}</p>}
        {invoice.customer.gstin && <p>GSTIN: {invoice.customer.gstin}</p>}
      </div>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-300 text-left text-ink-600">
            <th className="py-1.5 pr-2 font-medium">#</th>
            <th className="py-1.5 pr-2 font-medium">Item</th>
            <th className="py-1.5 pr-2 font-medium">HSN</th>
            <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
            <th className="py-1.5 pr-2 text-right font-medium">Rate</th>
            <th className="py-1.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, i) => (
            <tr key={`${item.product}-${i}`} className="border-b border-ink-100">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2">{item.name}</td>
              <td className="py-1.5 pr-2">{item.hsnCode || "—"}</td>
              <td className="py-1.5 pr-2 text-right">{item.quantity}</td>
              <td className="py-1.5 pr-2 text-right">₹{item.unitPrice.toFixed(2)}</td>
              <td className="py-1.5 text-right">₹{item.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <dl className="w-56 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-600">Subtotal</dt>
            <dd>₹{invoice.subtotal.toFixed(2)}</dd>
          </div>
          {invoice.gst.enabled && invoice.gst.type === "CGST_SGST" && (
            <>
              <div className="flex justify-between">
                <dt className="text-ink-600">CGST</dt>
                <dd>₹{(invoice.gst.cgstAmount ?? 0).toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">SGST</dt>
                <dd>₹{(invoice.gst.sgstAmount ?? 0).toFixed(2)}</dd>
              </div>
            </>
          )}
          {invoice.gst.enabled && invoice.gst.type === "IGST" && (
            <div className="flex justify-between">
              <dt className="text-ink-600">IGST</dt>
              <dd>₹{(invoice.gst.igstAmount ?? 0).toFixed(2)}</dd>
            </div>
          )}
          {invoice.otherCharges > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-600">Other charges</dt>
              <dd>₹{invoice.otherCharges.toFixed(2)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-ink-300 pt-1 text-base font-semibold">
            <dt>Grand Total</dt>
            <dd>₹{invoice.grandTotal.toFixed(2)}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-3 text-sm italic text-ink-700">Amount in words: {invoice.amountInWords}</p>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        {PAYMENT_METHODS.map((m) => (
          <label key={m.value} className="flex items-center gap-1.5">
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-sm border ${
                invoice.paymentMethod === m.value ? "border-chilli-600 bg-chilli-600 text-white" : "border-ink-300"
              }`}
            >
              {invoice.paymentMethod === m.value && "✓"}
            </span>
            {m.label}
          </label>
        ))}
      </div>

      <p className="mt-4 text-xs text-ink-500">This is a computer generated invoice.</p>
      <p className="mt-1 text-xs text-ink-500">
        Goods once sold will only be exchanged as per store policy. All disputes are subject to {company.city}{" "}
        jurisdiction.
      </p>

      <div className="mt-4 flex justify-end">
        <AuthorisedSignatory />
      </div>

      <div className="mt-6 flex items-end justify-between border-t border-ink-200 pt-3">
        <div className="text-xs text-ink-500">
          <p>{company.legalName}</p>
          <p>{company.website}</p>
        </div>
        <InvoiceBarcode value={invoice.invoiceNumber} className="h-12" />
      </div>
    </div>
  );
}
