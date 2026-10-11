import { Customer } from "../models/Customer.model";
import { Invoice } from "../models/Invoice.model";
import { NonGstBill } from "../models/NonGstBill.model";
import { User } from "../models/User.model";
import { paymentFilterQuery, summarizePayment } from "../utils/payments";
import { phoneKey, phoneSearchPattern } from "../utils/phone";
import type { BillSummary } from "../utils/whatsappReplies";

/**
 * Looks up a WhatsApp customer's own bills. The `waId` is the sender number
 * WhatsApp itself reports (Meta authenticates it), so a customer can only ever
 * see bills made out to the number they are messaging from.
 *
 * GST invoices are found through the customer directory (indexed by phone);
 * non-GST bills carry no directory link and store the phone as typed, so they
 * are matched by a digits-only pattern (see phoneSearchPattern).
 */

const SELECT_INVOICE = "invoiceNumber billingDate grandTotal creditedTotal amountPaid dueDate status createdBy";
const SELECT_NON_GST = "billNumber billingDate grandTotal amountPaid dueDate status createdBy";

/** The customer's name from the directory, if they have shopped here with this number. */
export async function findCustomerName(waId: string): Promise<string | undefined> {
  const key = phoneKey(waId);
  if (!key) return undefined;
  const customer = await Customer.findOne({ phoneKey: key }).select("name").lean();
  return customer?.name || undefined;
}

export interface LoadBillsOptions {
  /** Only bills with money still owed. */
  onlyDue?: boolean;
  /** Per bill kind; the merged result is trimmed to the same number. */
  limit: number;
}

/** The customer's bills (newest first), cancelled ones excluded. */
export async function loadBills(waId: string, options: LoadBillsOptions): Promise<BillSummary[]> {
  const key = phoneKey(waId);
  const pattern = phoneSearchPattern(waId);
  if (!key || !pattern) return [];

  const due = options.onlyDue ? paymentFilterQuery("due") : {};
  const customer = await Customer.findOne({ phoneKey: key }).select("_id").lean();

  const invoiceQuery: Record<string, unknown> = { status: { $ne: "void" }, ...due, customerRef: customer?._id };
  const nonGstQuery: Record<string, unknown> = { status: { $ne: "void" }, ...due, "customer.phone": { $regex: pattern } };

  const [invoices, nonGstBills] = await Promise.all([
    customer
      ? Invoice.find(invoiceQuery).sort({ billingDate: -1 }).limit(options.limit).select(SELECT_INVOICE).lean()
      : [],
    NonGstBill.find(nonGstQuery).sort({ billingDate: -1 }).limit(options.limit).select(SELECT_NON_GST).lean(),
  ]);

  const bills: BillSummary[] = [
    ...invoices.map((invoice) => ({
      number: invoice.invoiceNumber,
      kind: "gst" as const,
      date: invoice.billingDate,
      total: invoice.grandTotal,
      status: invoice.status ?? "paid",
      payment: summarizePayment(invoice),
      createdBy: String(invoice.createdBy),
    })),
    ...nonGstBills.map((bill) => ({
      number: bill.billNumber,
      kind: "non_gst" as const,
      date: bill.billingDate,
      total: bill.grandTotal,
      status: bill.status ?? "paid",
      payment: summarizePayment(bill),
      createdBy: String(bill.createdBy),
    })),
  ];

  return bills.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, options.limit);
}

export interface HandlingStaff {
  name: string;
  /** Normalised phone digits (with country code). */
  phone: string;
}

/**
 * The staff member who made the customer's most recent bill, if they are still
 * active and have a usable phone number. `bills` must be newest first.
 */
export async function findLastHandlingStaff(bills: BillSummary[]): Promise<HandlingStaff | null> {
  const latest = bills[0];
  if (!latest?.createdBy) return null;

  const user = await User.findById(latest.createdBy).select("name phone isActive").lean();
  if (!user || !user.isActive) return null;

  const phone = phoneKey(user.phone);
  return phone ? { name: user.name, phone } : null;
}
