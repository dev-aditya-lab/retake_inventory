import Image from "next/image";
import { company } from "@/config/company";
import { InvoiceBarcode } from "./InvoiceBarcode";
import type { GstDocumentFields, InvoiceCustomer, InvoiceItem, TaxAmounts } from "@/types/invoice";

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

const money = (n: number | undefined | null) => (n ?? 0).toFixed(2);
const taxOf = (a: TaxAmounts) => (a.cgst ?? 0) + (a.sgst ?? 0) + (a.igst ?? 0);
const inIndia = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });

export interface TaxDocument extends GstDocumentFields {
  number: string;
  date: string;
  customer: InvoiceCustomer;
  items: InvoiceItem[];
  grandTotal: number;
  amountInWords: string;
}

/**
 * GST tax invoice / credit note, on screen and in print. Carries the CGST
 * Rule 46 / 53 particulars: supplier + buyer GSTIN, serial number, place of
 * supply with state code, HSN, quantity with unit, taxable value, rate and
 * amount of tax, the reverse-charge statement and a signatory block. Supplier
 * details come from the document itself (frozen when it was issued).
 */
export function TaxDocumentView({
  doc,
  title,
  reference,
  reason,
  paymentMethod,
  cancelled,
}: {
  doc: TaxDocument;
  title: "TAX INVOICE" | "CREDIT NOTE";
  reference?: { number: string; date: string };
  reason?: string;
  paymentMethod?: string;
  cancelled?: boolean;
}) {
  const intra = doc.supplyType !== "inter";
  const inclusive = doc.priceMode === "inclusive";
  const supplier = doc.supplier;

  return (
    <div id="invoice-print-area" className="mx-auto max-w-3xl bg-white p-4 text-[13px] text-ink-900 sm:p-6 print:max-w-none print:p-0 print:text-[11px]">
      {cancelled && (
        <div className="mb-4 rounded-md border-2 border-chilli-700 p-3 text-center text-chilli-700">
          <p className="text-lg font-bold tracking-wide">CANCELLED</p>
          <p className="text-xs">This invoice is no longer valid.</p>
        </div>
      )}

      <div className="flex flex-col gap-3 border-b border-ink-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Image src={company.logoUrl} alt="" width={52} height={52} className="rounded-md" />
          <div>
            <p className="text-base font-semibold">{supplier?.legalName}</p>
            <p className="text-xs text-ink-600">{supplier?.address}</p>
            <p className="text-xs text-ink-600">
              GSTIN <span className="font-semibold text-ink-900">{supplier?.gstin}</span> · State {supplier?.stateName} (
              {supplier?.stateCode})
            </p>
            <p className="text-xs text-ink-600">
              {company.contactNumber} · {company.email}
            </p>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xl font-bold text-chilli-600">{title}</p>
          <p className="font-semibold">{doc.number}</p>
          <p className="text-xs text-ink-600">Date {inIndia(doc.date)}</p>
          {reference && (
            <p className="text-xs text-ink-600">
              Against invoice {reference.number} dated {inIndia(reference.date)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-0 rounded-md border border-ink-200 sm:grid-cols-[3fr_2fr]">
        <div className="p-3 sm:border-r sm:border-ink-200">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Billed to</p>
          <p className="font-semibold">{doc.customer.name}</p>
          {doc.customer.company && <p>{doc.customer.company}</p>}
          {doc.customer.address && <p>{doc.customer.address}</p>}
          {doc.customer.phone && <p>Phone {doc.customer.phone}</p>}
          {doc.customer.gstin ? (
            <p>
              GSTIN <span className="font-semibold">{doc.customer.gstin}</span>
            </p>
          ) : (
            <p className="text-xs text-ink-500">Unregistered buyer</p>
          )}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-ink-200 p-3 text-xs sm:border-t-0">
          <dt className="text-ink-500">Place of supply</dt>
          <dd className="font-semibold">
            {doc.placeOfSupply?.name} ({doc.placeOfSupply?.code})
          </dd>
          <dt className="text-ink-500">Supply type</dt>
          <dd>{intra ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"}</dd>
          <dt className="text-ink-500">Reverse charge</dt>
          <dd>No</dd>
          {reason && (
            <>
              <dt className="text-ink-500">Reason</dt>
              <dd>{reason}</dd>
            </>
          )}
        </dl>
      </div>

      {/* Scrolls sideways on narrow phones instead of squashing the columns. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-xs">
          <thead>
            <tr className="border-y border-ink-300 bg-ink-50 text-left text-ink-600">
              <th className="px-1.5 py-1.5 font-medium">#</th>
              <th className="px-1.5 py-1.5 font-medium">Item</th>
              <th className="px-1.5 py-1.5 font-medium">HSN</th>
              <th className="px-1.5 py-1.5 text-right font-medium">Qty</th>
              <th className="px-1.5 py-1.5 text-right font-medium">{inclusive ? "MRP" : "Rate"}</th>
              <th className="px-1.5 py-1.5 text-right font-medium">Taxable</th>
              <th className="px-1.5 py-1.5 text-right font-medium">GST</th>
              <th className="px-1.5 py-1.5 text-right font-medium">Tax</th>
              <th className="px-1.5 py-1.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item, i) => (
              <tr key={`${item.product}-${i}`} className="border-b border-ink-100">
                <td className="px-1.5 py-1.5">{i + 1}</td>
                <td className="px-1.5 py-1.5">{item.name}</td>
                <td className="px-1.5 py-1.5">{item.hsnCode}</td>
                <td className="px-1.5 py-1.5 text-right">
                  {item.quantity} {item.uqc}
                </td>
                <td className="px-1.5 py-1.5 text-right">{money(item.unitPrice)}</td>
                <td className="px-1.5 py-1.5 text-right">{money(item.taxableValue)}</td>
                <td className="px-1.5 py-1.5 text-right">{item.gstRate}%</td>
                <td className="px-1.5 py-1.5 text-right">{money(taxOf(item as TaxAmounts))}</td>
                <td className="px-1.5 py-1.5 text-right">{money(item.total)}</td>
              </tr>
            ))}
            {doc.otherChargesLine && (
              <tr className="border-b border-ink-100">
                <td className="px-1.5 py-1.5" />
                <td className="px-1.5 py-1.5">{doc.otherChargesLine.description || "Other charges"}</td>
                <td className="px-1.5 py-1.5">{doc.otherChargesLine.hsnCode}</td>
                <td colSpan={2} />
                <td className="px-1.5 py-1.5 text-right">{money(doc.otherChargesLine.taxableValue)}</td>
                <td className="px-1.5 py-1.5 text-right">{doc.otherChargesLine.gstRate}%</td>
                <td className="px-1.5 py-1.5 text-right">{money(taxOf(doc.otherChargesLine))}</td>
                <td className="px-1.5 py-1.5 text-right">{money(doc.otherChargesLine.total)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <table className="w-full border-collapse text-xs sm:w-auto">
          <thead>
            <tr className="border-y border-ink-300 bg-ink-50 text-left text-ink-600">
              <th className="px-1.5 py-1 font-medium">GST rate</th>
              <th className="px-1.5 py-1 text-right font-medium">Taxable</th>
              {intra ? (
                <>
                  <th className="px-1.5 py-1 text-right font-medium">CGST</th>
                  <th className="px-1.5 py-1 text-right font-medium">SGST</th>
                </>
              ) : (
                <th className="px-1.5 py-1 text-right font-medium">IGST</th>
              )}
            </tr>
          </thead>
          <tbody>
            {doc.rateSummary?.map((row) => (
              <tr key={row.gstRate} className="border-b border-ink-100">
                <td className="px-1.5 py-1">
                  {row.gstRate}%{intra && ` (${row.gstRate / 2}% + ${row.gstRate / 2}%)`}
                </td>
                <td className="px-1.5 py-1 text-right">{money(row.taxableValue)}</td>
                {intra ? (
                  <>
                    <td className="px-1.5 py-1 text-right">{money(row.cgst)}</td>
                    <td className="px-1.5 py-1 text-right">{money(row.sgst)}</td>
                  </>
                ) : (
                  <td className="px-1.5 py-1 text-right">{money(row.igst)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="w-full space-y-0.5 sm:w-60">
          <div className="flex justify-between">
            <dt className="text-ink-600">Taxable value</dt>
            <dd>₹{money(doc.taxableValue)}</dd>
          </div>
          {intra ? (
            <>
              <div className="flex justify-between">
                <dt className="text-ink-600">CGST</dt>
                <dd>₹{money(doc.cgst)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">SGST</dt>
                <dd>₹{money(doc.sgst)}</dd>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <dt className="text-ink-600">IGST</dt>
              <dd>₹{money(doc.igst)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-ink-300 pt-1 text-base font-semibold">
            <dt>{title === "CREDIT NOTE" ? "Credit amount" : "Grand total"}</dt>
            <dd>₹{money(doc.grandTotal)}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-3 italic text-ink-700">Amount in words: {doc.amountInWords}</p>
      {inclusive && <p className="mt-1 text-xs text-ink-500">Prices shown are MRP, inclusive of GST.</p>}

      {paymentMethod && (
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          {PAYMENT_METHODS.map((m) => (
            <span key={m.value} className="flex items-center gap-1.5">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-sm border ${
                  paymentMethod === m.value ? "border-chilli-600 bg-chilli-600 text-white" : "border-ink-300"
                }`}
              >
                {paymentMethod === m.value && "✓"}
              </span>
              {m.label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="text-xs text-ink-500">
          <p>This is a computer generated {title.toLowerCase()}.</p>
          <p>Goods once sold will only be exchanged as per store policy.</p>
        </div>
        <div className="w-48 self-end text-center text-xs">
          <p className="text-ink-600">For {supplier?.legalName}</p>
          <p className="mt-8 border-t border-ink-400 pt-1">Authorised Signatory</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end border-t border-ink-200 pt-3">
        <InvoiceBarcode value={doc.number} className="h-12" />
      </div>
    </div>
  );
}
