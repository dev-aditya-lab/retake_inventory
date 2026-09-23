import { Invoice } from "../models/Invoice.model";
import { Product } from "../models/Product.model";

const TREND_DAYS = 14;

// Revenue counts bills that stood (paid, or later reversed by a credit note)
// net of any credit notes, so returns after GST filing reduce sales.
const SALE_STATUSES = { $in: ["paid", "credited"] };
const NET_REVENUE = { $subtract: ["$grandTotal", { $ifNull: ["$creditedTotal", 0] }] };
const TOP_PRODUCTS_LIMIT = 6;
const RECENT_INVOICES_LIMIT = 8;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getDashboardSummary() {
  const todayStart = startOfDay(new Date());
  const trendStart = new Date(todayStart);
  trendStart.setDate(trendStart.getDate() - (TREND_DAYS - 1));

  const [todayAgg, lowStockCount, trendRows, topProducts, recentInvoices] = await Promise.all([
    Invoice.aggregate([
      { $match: { billingDate: { $gte: todayStart }, status: SALE_STATUSES } },
      { $group: { _id: null, revenue: { $sum: NET_REVENUE }, invoiceCount: { $sum: 1 } } },
    ]),
    Product.countDocuments({ isActive: true, $expr: { $lte: ["$quantityInStock", "$lowStockThreshold"] } }),
    Invoice.aggregate([
      { $match: { billingDate: { $gte: trendStart }, status: SALE_STATUSES } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$billingDate" } },
          revenue: { $sum: NET_REVENUE },
        },
      },
    ]),
    Invoice.aggregate([
      { $match: { billingDate: { $gte: trendStart }, status: "paid" } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          quantity: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.total" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: TOP_PRODUCTS_LIMIT },
    ]),
    Invoice.find({ status: "paid" })
      .sort({ billingDate: -1 })
      .limit(RECENT_INVOICES_LIMIT)
      .select("invoiceNumber customer.name grandTotal billingDate"),
  ]);

  const trendByDate = new Map(trendRows.map((row) => [row._id as string, row.revenue as number]));
  const revenueTrend = Array.from({ length: TREND_DAYS }, (_, i) => {
    const date = new Date(trendStart);
    date.setDate(date.getDate() + i);
    const key = dateKey(date);
    return { date: key, revenue: trendByDate.get(key) ?? 0 };
  });

  return {
    today: {
      revenue: todayAgg[0]?.revenue ?? 0,
      invoiceCount: todayAgg[0]?.invoiceCount ?? 0,
    },
    lowStockCount,
    revenueTrend,
    topProducts: topProducts.map((p) => ({ name: p._id as string, quantity: p.quantity, revenue: p.revenue })),
    recentInvoices: recentInvoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customer?.name ?? "",
      grandTotal: inv.grandTotal,
      billingDate: inv.billingDate,
    })),
  };
}

export type SalesPeriod = "daily" | "monthly" | "yearly";

const PERIOD_FORMATS: Record<SalesPeriod, string> = {
  daily: "%Y-%m-%d",
  monthly: "%Y-%m",
  yearly: "%Y",
};

export interface DateRange {
  from?: Date;
  to?: Date;
}

// Item-level reports only count bills still standing in full ("paid").
function billingDateMatch(range: DateRange, status: unknown = SALE_STATUSES): Record<string, unknown> {
  const match: Record<string, unknown> = { status };
  if (range.from || range.to) {
    const billingDate: Record<string, Date> = {};
    if (range.from) billingDate.$gte = range.from;
    if (range.to) billingDate.$lte = range.to;
    match.billingDate = billingDate;
  }
  return match;
}

export async function getSalesReport(period: SalesPeriod, range: DateRange) {
  return Invoice.aggregate([
    { $match: billingDateMatch(range) },
    {
      $group: {
        _id: { $dateToString: { format: PERIOD_FORMATS[period], date: "$billingDate" } },
        revenue: { $sum: NET_REVENUE },
        invoiceCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, period: "$_id", revenue: 1, invoiceCount: 1 } },
  ]);
}

export async function getProductWiseSales(range: DateRange) {
  return Invoice.aggregate([
    { $match: billingDateMatch(range, "paid") },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.name",
        quantity: { $sum: "$items.quantity" },
        revenue: { $sum: "$items.total" },
      },
    },
    { $sort: { revenue: -1 } },
    { $project: { _id: 0, name: "$_id", quantity: 1, revenue: 1 } },
  ]);
}

export async function getUserWiseSales(range: DateRange) {
  return Invoice.aggregate([
    { $match: billingDateMatch(range) },
    {
      $group: {
        _id: "$createdBy",
        revenue: { $sum: NET_REVENUE },
        invoiceCount: { $sum: 1 },
      },
    },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
    { $unwind: "$user" },
    { $sort: { revenue: -1 } },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        name: "$user.name",
        email: "$user.email",
        revenue: 1,
        invoiceCount: 1,
      },
    },
  ]);
}
