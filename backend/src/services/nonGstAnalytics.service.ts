import { NonGstBill } from "../models/NonGstBill.model";
import { round2 } from "../utils/gst";
import { istDayKey } from "../utils/istDate";
import {
  fillTrendGaps,
  NON_GST_CUSTOMER_KEY_EXPR,
  type CustomerSort,
  type TrendPeriod,
  type TrendRow,
} from "../utils/nonGstBill";
import { BALANCE_DUE_EXPR, overdueCondition } from "../utils/payments";
import { escapeRegex } from "../utils/regex";
import { dueSummary } from "./payment.service";
import type { DateRange } from "./report.service";

// Numbers for the non-GST section. Everything reads the NonGstBill collection
// only — these figures never mix with GST invoices, and nothing here is part of
// the Dashboard or Reports pages. Cancelled bills never count as sales.

const TOP_PRODUCTS_LIMIT = 10;
const TOP_CUSTOMERS_LIMIT = 5;
const TOP_DEBTORS_LIMIT = 5;
const IST = "Asia/Kolkata";

function rangeMatch(range: DateRange): Record<string, unknown> {
  if (!range.from && !range.to) return {};
  const billingDate: Record<string, Date> = {};
  if (range.from) billingDate.$gte = range.from;
  if (range.to) billingDate.$lte = range.to;
  return { billingDate };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface NonGstCustomerRow {
  /** Stable id for the person: last 10 digits of the phone, or "name:<lower-cased name>". */
  key: string;
  name: string;
  phone: string;
  company: string;
  billCount: number;
  totalSales: number;
  collected: number;
  due: number;
  overdue: number;
  dueBillCount: number;
  firstBillAt: Date;
  lastBillAt: Date;
}

/** One row per customer, worked out from the bills (cancelled ones left out). */
function customerStages(match: Record<string, unknown>, now: Date) {
  return [
    { $match: { ...match, status: { $ne: "void" } } },
    // Newest first, so $first below picks the name/phone as most recently typed.
    { $sort: { billingDate: -1 as const } },
    {
      $addFields: {
        _key: NON_GST_CUSTOMER_KEY_EXPR,
        _due: BALANCE_DUE_EXPR,
        _overdue: { $cond: [overdueCondition(now), BALANCE_DUE_EXPR, 0] },
      },
    },
    {
      $group: {
        _id: "$_key",
        name: { $first: "$customer.name" },
        phone: { $first: "$customer.phone" },
        company: { $first: "$customer.company" },
        billCount: { $sum: 1 },
        totalSales: { $sum: "$grandTotal" },
        collected: { $sum: { $ifNull: ["$amountPaid", 0] } },
        due: { $sum: "$_due" },
        overdue: { $sum: "$_overdue" },
        dueBillCount: { $sum: { $cond: [{ $gt: ["$_due", 0] }, 1, 0] } },
        firstBillAt: { $min: "$billingDate" },
        lastBillAt: { $max: "$billingDate" },
      },
    },
    { $addFields: { key: "$_id", phone: { $ifNull: ["$phone", ""] }, company: { $ifNull: ["$company", ""] } } },
    { $project: { _id: 0 } },
  ];
}

const roundCustomer = (row: NonGstCustomerRow): NonGstCustomerRow => ({
  ...row,
  totalSales: round2(row.totalSales),
  collected: round2(row.collected),
  due: round2(row.due),
  overdue: round2(row.overdue),
});

const SORT_SPECS: Record<CustomerSort, Record<string, 1 | -1>> = {
  recent: { lastBillAt: -1, key: 1 },
  spent: { totalSales: -1, key: 1 },
  due: { due: -1, lastBillAt: -1, key: 1 },
  bills: { billCount: -1, key: 1 },
  name: { name: 1, key: 1 },
};

export interface NonGstCustomerFilters {
  search?: string;
  /** Only customers who still owe money. */
  dueOnly?: boolean;
  sort: CustomerSort;
  page: number;
  limit: number;
}

function customerFilterStage({ search, dueOnly }: Pick<NonGstCustomerFilters, "search" | "dueOnly">) {
  const match: Record<string, unknown> = {};
  if (dueOnly) match.due = { $gt: 0 };
  if (search?.trim()) {
    const pattern = escapeRegex(search.trim());
    const digits = search.replace(/\D/g, "");
    match.$or = [
      { name: { $regex: pattern, $options: "i" } },
      { company: { $regex: pattern, $options: "i" } },
      { phone: { $regex: pattern, $options: "i" } },
      ...(digits.length >= 3 ? [{ key: { $regex: escapeRegex(digits) } }] : []),
    ];
  }
  return Object.keys(match).length > 0 ? [{ $match: match }] : [];
}

export async function listCustomers(filters: NonGstCustomerFilters) {
  const { sort, page, limit } = filters;
  const [result] = await NonGstBill.aggregate<{
    items: NonGstCustomerRow[];
    totals: { customers: number; due: number; overdue: number }[];
  }>([
    ...customerStages({}, new Date()),
    ...customerFilterStage(filters),
    {
      $facet: {
        items: [{ $sort: SORT_SPECS[sort] }, { $skip: (page - 1) * limit }, { $limit: limit }],
        totals: [{ $group: { _id: null, customers: { $sum: 1 }, due: { $sum: "$due" }, overdue: { $sum: "$overdue" } } }],
      },
    },
  ]);

  const totals = result?.totals[0];
  return {
    items: (result?.items ?? []).map(roundCustomer),
    total: totals?.customers ?? 0,
    page,
    limit,
    totals: { due: round2(totals?.due ?? 0), overdue: round2(totals?.overdue ?? 0) },
  };
}

/** Every customer (no paging) — for the export. */
export async function allCustomers(): Promise<NonGstCustomerRow[]> {
  const rows = await NonGstBill.aggregate<NonGstCustomerRow>([
    ...customerStages({}, new Date()),
    { $sort: SORT_SPECS.recent },
  ]);
  return rows.map(roundCustomer);
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getOverview(range: DateRange, period: TrendPeriod, now: Date = new Date()) {
  const match = rangeMatch(range);
  const standing = { ...match, status: "paid" };
  const bucketFormat = period === "daily" ? "%Y-%m-%d" : "%Y-%m";

  const [statusRows, salesRows, priceListRows, trendRows, productRows, methodRows, customers, debtors, dues] = await Promise.all([
    // Cancelled vs standing bills in the range.
    NonGstBill.aggregate<{ _id: string; count: number; amount: number }>([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$grandTotal" } } },
    ]),

    // Headline numbers for the bills that stood.
    NonGstBill.aggregate<{ billCount: number; amount: number; units: number; collected: number; outstanding: number }>([
      { $match: standing },
      {
        $group: {
          _id: null,
          billCount: { $sum: 1 },
          amount: { $sum: "$grandTotal" },
          units: { $sum: { $sum: "$items.quantity" } },
          collected: { $sum: { $ifNull: ["$amountPaid", 0] } },
          outstanding: { $sum: BALANCE_DUE_EXPR },
        },
      },
    ]),

    // B2B price vs retail MRP.
    NonGstBill.aggregate<{ _id: string; billCount: number; amount: number }>([
      { $match: standing },
      { $group: { _id: "$priceList", billCount: { $sum: 1 }, amount: { $sum: "$grandTotal" } } },
    ]),

    NonGstBill.aggregate<{ _id: string; billCount: number; amount: number }>([
      { $match: standing },
      {
        $group: {
          _id: { $dateToString: { format: bucketFormat, date: "$billingDate", timezone: IST } },
          billCount: { $sum: 1 },
          amount: { $sum: "$grandTotal" },
        },
      },
    ]),

    NonGstBill.aggregate<{ _id: unknown; name: string; quantity: number; revenue: number }>([
      { $match: standing },
      { $sort: { billingDate: -1 } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          name: { $first: "$items.name" },
          quantity: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.total" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: TOP_PRODUCTS_LIMIT },
    ]),

    // How the money on these bills came in (refunds taken off).
    NonGstBill.aggregate<{ _id: string; amount: number }>([
      { $match: standing },
      { $unwind: "$payments" },
      {
        $group: {
          _id: "$payments.method",
          amount: { $sum: { $cond: [{ $eq: ["$payments.kind", "refund"] }, { $multiply: ["$payments.amount", -1] }, "$payments.amount"] } },
        },
      },
      { $match: { amount: { $gt: 0 } } },
      { $sort: { amount: -1 } },
    ]),

    // Best customers in the range.
    NonGstBill.aggregate<NonGstCustomerRow>([
      ...customerStages(match, now),
      { $sort: SORT_SPECS.spent },
      { $limit: TOP_CUSTOMERS_LIMIT },
    ]),

    // Who owes money — across all time, not just this range: a debt doesn't expire.
    NonGstBill.aggregate<NonGstCustomerRow>([
      ...customerStages({}, now),
      { $match: { due: { $gt: 0 } } },
      { $sort: SORT_SPECS.due },
      { $limit: TOP_DEBTORS_LIMIT },
    ]),

    dueSummary(NonGstBill, {}, now),
  ]);

  const statusOf = (status: string) => statusRows.find((row) => row._id === status);
  const sales = salesRows[0];
  const billCount = sales?.billCount ?? 0;
  const amount = round2(sales?.amount ?? 0);

  // A range's own ends pad the trend; with no "from" the first bill decides.
  const lastDay = istDayKey(range.to && range.to < now ? range.to : now);
  const firstDay = range.from ? istDayKey(range.from) : undefined;
  const trend: TrendRow[] = fillTrendGaps(
    trendRows.map((row) => ({ period: row._id, amount: round2(row.amount), billCount: row.billCount })),
    period,
    firstDay && (period === "daily" ? firstDay : firstDay.slice(0, 7)),
    period === "daily" ? lastDay : lastDay.slice(0, 7),
  );

  return {
    summary: {
      billCount,
      amount,
      averageBill: billCount > 0 ? round2(amount / billCount) : 0,
      unitsSold: sales?.units ?? 0,
      collected: round2(sales?.collected ?? 0),
      outstanding: round2(sales?.outstanding ?? 0),
      cancelledCount: statusOf("void")?.count ?? 0,
      cancelledAmount: round2(statusOf("void")?.amount ?? 0),
    },
    priceLists: priceListRows.map((row) => ({ priceList: row._id, billCount: row.billCount, amount: round2(row.amount) })),
    trend,
    topProducts: productRows.map((row) => ({
      productId: String(row._id),
      name: row.name,
      quantity: row.quantity,
      revenue: round2(row.revenue),
    })),
    topCustomers: customers.map(roundCustomer),
    paymentMethods: methodRows.map((row) => ({ method: row._id, amount: round2(row.amount) })),
    dues,
    topDebtors: debtors.map(roundCustomer),
  };
}
