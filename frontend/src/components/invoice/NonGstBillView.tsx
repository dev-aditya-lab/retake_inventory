import Image from "next/image";
import { company } from "@/config/company";
import { InvoiceBarcode } from "./InvoiceBarcode";
import { AuthorisedSignatory } from "./AuthorisedSignatory";
import { PaymentSummaryView } from "@/components/payments/PaymentSummaryView";
import type { NonGstBill } from "@/types/nonGstBill";

const money = (n: number) => n.toFixed(2);
const inIndia = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });

/**
 * A bill with no GST, on screen and in print (print.css hides the surrounding
 * chrome via @media print). Deliberately not a tax invoice: no GSTIN, HSN or
 * tax columns, and no "TAX INVOICE" heading.
 */
export function NonGstBillView({ bill }: { bill: NonGstBill }) {
  return (
    <div id="invoice-print-area" className="mx-auto max-w-3xl bg-white p-4 text-[13px] text-ink-900 sm:p-6 print:max-w-none print:p-0 print:text-[11px]">
      {bill.status === "void" && (
        <div className="mb-4 rounded-md border-2 border-chilli-700 p-3 text-center text-chilli-700">
          <p className="text-lg font-bold tracking-wide">CANCELLED</p>
          <p className="text-xs">
            This bill is no longer valid
            {bill.cancelledAt ? ` (cancelled ${inIndia(bill.cancelledAt)})` : ""}.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 border-b border-ink-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Image src={company.logoUrl} alt="" width={52} height={52} className="rounded-md" />
          <div>
            <p className="text-base font-semibold">{company.legalName}</p>
            <p className="text-xs text-ink-600">
              {company.address}, {company.city}, {company.state} {company.pincode}
            </p>
            <p className="text-xs text-ink-600">{company.contactNumber}</p>
            <p className="text-xs text-ink-600">
              {company.email} · {company.website}
            </p>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xl font-bold text-chilli-600">BILL</p>
          <p className="font-semibold">{bill.billNumber}</p>
          <p className="text-xs text-ink-600">Date {inIndia(bill.billingDate)}</p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-ink-200 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Billed to</p>
        <p className="font-semibold">{bill.customer.name}</p>
        {bill.customer.company && <p>{bill.customer.company}</p>}
        {bill.customer.address && <p>{bill.customer.address}</p>}
        {bill.customer.phone && <p>Phone {bill.customer.phone}</p>}
        {bill.customer.email && <p>{bill.customer.email}</p>}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[360px] border-collapse text-xs">
          <thead>
            <tr className="border-y border-ink-300 bg-ink-50 text-left text-ink-600">
              <th className="px-1.5 py-1.5 font-medium">#</th>
              <th className="px-1.5 py-1.5 font-medium">Item</th>
              <th className="px-1.5 py-1.5 text-right font-medium">Qty</th>
              <th className="px-1.5 py-1.5 text-right font-medium">{bill.priceList === "retail" ? "MRP" : "Rate"}</th>
              <th className="px-1.5 py-1.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.items.map((item, i) => (
              <tr key={`${item.product}-${i}`} className="border-b border-ink-100">
                <td className="px-1.5 py-1.5">{i + 1}</td>
                <td className="px-1.5 py-1.5">{item.name}</td>
                <td className="px-1.5 py-1.5 text-right">{item.quantity}</td>
                <td className="px-1.5 py-1.5 text-right">{money(item.unitPrice)}</td>
                <td className="px-1.5 py-1.5 text-right">{money(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-end">
        <dl className="w-full space-y-0.5 sm:w-60">
          <div className="flex justify-between">
            <dt className="text-ink-600">Items total</dt>
            <dd>₹{money(bill.subtotal)}</dd>
          </div>
          {bill.otherCharges > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-600">Other charges</dt>
              <dd>₹{money(bill.otherCharges)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-ink-300 pt-1 text-base font-semibold">
            <dt>Total</dt>
            <dd>₹{money(bill.grandTotal)}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-3 italic text-ink-700">Amount in words: {bill.amountInWords}</p>

      {bill.payment && <PaymentSummaryView payment={bill.payment} entries={bill.payments ?? []} cancelled={bill.status === "void"} />}

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="text-xs text-ink-500">
          <p>This is a computer generated bill. No GST is charged on it.</p>
          <p>
            Goods once sold will only be exchanged as per store policy. All disputes are subject to {company.city} jurisdiction.
          </p>
        </div>
        <AuthorisedSignatory />
      </div>

      <div className="mt-4 flex items-end justify-between border-t border-ink-200 pt-3">
        <div className="text-xs text-ink-500">
          <p>{company.legalName}</p>
          <p>{company.website}</p>
        </div>
        <InvoiceBarcode value={bill.billNumber} className="h-12" />
      </div>
    </div>
  );
}
