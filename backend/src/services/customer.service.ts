import type { Types } from "mongoose";
import { Customer } from "../models/Customer.model";
import { Invoice } from "../models/Invoice.model";
import { ApiError } from "../utils/ApiError";
import { escapeRegex } from "../utils/regex";
import { phoneKey } from "../utils/phone";
import { isDuplicateKeyError } from "../utils/mongoErrors";
import { logger } from "../config/logger";
import { BALANCE_DUE_EXPR } from "../utils/payments";

export interface CustomerDetails {
  name?: string;
  company?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
}

const DETAIL_FIELDS = ["name", "company", "address", "phone", "email", "gstin"] as const;

export interface CustomerListFilters {
  search?: string;
  page: number;
  limit: number;
}

export async function listCustomers({ search, page, limit }: CustomerListFilters) {
  const query: Record<string, unknown> = {};
  if (search) {
    const pattern = escapeRegex(search);
    const digits = search.replace(/\D/g, "");
    query.$or = [
      { name: { $regex: pattern, $options: "i" } },
      { company: { $regex: pattern, $options: "i" } },
      { email: { $regex: pattern, $options: "i" } },
      { phone: { $regex: pattern, $options: "i" } },
      ...(digits.length >= 3 ? [{ phoneKey: { $regex: escapeRegex(digits) } }] : []),
    ];
  }

  const [customers, total] = await Promise.all([
    Customer.find(query)
      .sort({ lastPurchaseAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Customer.countDocuments(query),
  ]);

  const stats = await Invoice.aggregate<{
    _id: Types.ObjectId;
    invoiceCount: number;
    totalSpent: number;
    dueAmount: number;
    lastPurchaseAt: Date;
  }>([
    // Bills that stood (incl. ones later returned via credit note), net of returns.
    { $match: { customerRef: { $in: customers.map((c) => c._id) }, status: { $in: ["paid", "credited"] } } },
    {
      $group: {
        _id: "$customerRef",
        invoiceCount: { $sum: 1 },
        totalSpent: { $sum: { $subtract: ["$grandTotal", { $ifNull: ["$creditedTotal", 0] }] } },
        // Still owed on those bills (advances and part-payments already taken off).
        dueAmount: { $sum: BALANCE_DUE_EXPR },
        lastPurchaseAt: { $max: "$billingDate" },
      },
    },
  ]);
  const statsById = new Map(stats.map((s) => [String(s._id), s]));

  return {
    items: customers.map((c) => {
      const s = statsById.get(String(c._id));
      return {
        ...c,
        invoiceCount: s?.invoiceCount ?? 0,
        totalSpent: s?.totalSpent ?? 0,
        dueAmount: Math.round((s?.dueAmount ?? 0) * 100) / 100,
        lastPurchaseAt: s?.lastPurchaseAt ?? c.lastPurchaseAt ?? null,
      };
    }),
    total,
    page,
    limit,
  };
}

/** Billing-counter lookup: a returning customer's details by phone number. */
export async function findCustomerByPhone(phone: string) {
  const key = phoneKey(phone);
  if (!key) return null;
  return Customer.findOne({ phoneKey: key });
}

export async function updateCustomer(id: string, input: CustomerDetails & { applyToInvoices?: boolean }) {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound("Customer not found");

  if (input.phone !== undefined) {
    const key = phoneKey(input.phone);
    if (!key) throw ApiError.badRequest("Enter a valid phone number — customers are matched by phone");
    if (key !== customer.phoneKey) {
      const clash = await Customer.findOne({ phoneKey: key, _id: { $ne: id } });
      if (clash) throw ApiError.conflict(`${clash.name} already has this phone number`);
    }
    customer.phoneKey = key;
  }

  for (const field of DETAIL_FIELDS) {
    if (input[field] !== undefined) customer[field] = input[field]!;
  }

  try {
    await customer.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw ApiError.conflict("Another customer already has this phone number");
    throw err;
  }

  // Invoices are legal documents, so they keep the details they were billed
  // with unless the admin explicitly asks to correct past bills too.
  let invoicesUpdated = 0;
  if (input.applyToInvoices) {
    const result = await Invoice.updateMany(
      { customerRef: customer._id },
      {
        $set: {
          "customer.name": customer.name,
          "customer.company": customer.company,
          "customer.address": customer.address,
          "customer.phone": customer.phone,
          "customer.email": customer.email,
          "customer.gstin": customer.gstin,
        },
      },
    );
    invoicesUpdated = result.modifiedCount;
  }

  return { customer, invoicesUpdated };
}

/** Removes the directory entry only — past invoices keep their own copy of the details. */
export async function deleteCustomer(id: string) {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound("Customer not found");

  await Invoice.updateMany({ customerRef: customer._id }, { $unset: { customerRef: 1 } });
  await customer.deleteOne();
}

/** Non-empty fields only, so a sparse bill doesn't wipe a known address or GSTIN. */
function nonEmptyDetails(details: CustomerDetails): CustomerDetails {
  const out: CustomerDetails = {};
  for (const field of DETAIL_FIELDS) {
    const value = details[field]?.trim();
    if (value) out[field] = field === "gstin" ? value.toUpperCase() : value;
  }
  return out;
}

/**
 * Called after every checkout: creates or refreshes the directory entry for
 * the bill's phone number with its latest details. Returns undefined for a
 * bill without a usable phone number (walk-in, no directory entry).
 */
export async function upsertCustomerFromSale(details: CustomerDetails, purchasedAt: Date) {
  const key = phoneKey(details.phone);
  if (!key || !details.name?.trim()) return undefined;

  const update = {
    $set: { ...nonEmptyDetails(details), phoneKey: key },
    $max: { lastPurchaseAt: purchasedAt },
  };

  try {
    const customer = await Customer.findOneAndUpdate({ phoneKey: key }, update, { upsert: true, returnDocument: "after" });
    return customer?._id;
  } catch (err) {
    // Two checkouts for the same new number raced to insert — the other won, so update theirs.
    if (!isDuplicateKeyError(err)) throw err;
    const customer = await Customer.findOneAndUpdate({ phoneKey: key }, update, { returnDocument: "after" });
    return customer?._id;
  }
}

/**
 * Links an edited invoice to the directory without overwriting the existing
 * entry's details (an old bill's details may be staler than the directory's).
 */
export async function findOrCreateCustomer(details: CustomerDetails, purchasedAt: Date) {
  const key = phoneKey(details.phone);
  if (!key) return undefined;
  const existing = await Customer.findOne({ phoneKey: key });
  if (existing) return existing._id;
  return upsertCustomerFromSale(details, purchasedAt);
}

/**
 * One-time backfill (see migrations): builds the directory from every
 * existing invoice with a phone number. Invoices are walked oldest-first so
 * each customer ends up with their most recent details.
 */
export async function backfillCustomersFromInvoices(): Promise<number> {
  const invoiceIdsByKey = new Map<string, Types.ObjectId[]>();
  let customers = 0;

  const cursor = Invoice.find({ "customer.phone": { $nin: ["", null] } })
    .select("customer billingDate")
    .sort({ billingDate: 1 })
    .lean()
    .cursor();

  for await (const invoice of cursor) {
    const key = phoneKey(invoice.customer?.phone);
    if (!key || !invoice.customer?.name) continue;
    const id = await upsertCustomerFromSale(invoice.customer, invoice.billingDate);
    if (!id) continue;
    if (!invoiceIdsByKey.has(key)) {
      invoiceIdsByKey.set(key, []);
      customers++;
    }
    invoiceIdsByKey.get(key)!.push(invoice._id);
  }

  for (const [key, invoiceIds] of invoiceIdsByKey) {
    const customer = await Customer.findOne({ phoneKey: key }).select("_id");
    if (customer) await Invoice.updateMany({ _id: { $in: invoiceIds } }, { customerRef: customer._id });
  }

  logger.info(`Customer backfill: ${customers} customer(s) linked from past invoices`);
  return customers;
}
