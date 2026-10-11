import type { DueSummary } from "./payment";
import type { PriceList } from "./nonGstBill";

/** One person across all their non-GST bills (cancelled bills left out). */
export interface NonGstCustomer {
  /** Stable id: last 10 digits of the phone, or "name:<lower-cased name>". Used to filter the Bills tab. */
  key: string;
  name: string;
  phone: string;
  company: string;
  billCount: number;
  totalSales: number;
  /** Money received so far. */
  collected: number;
  /** Still owed to us. */
  due: number;
  overdue: number;
  dueBillCount: number;
  firstBillAt: string;
  lastBillAt: string;
}

export type NonGstCustomerSort = "recent" | "spent" | "due" | "bills" | "name";

export interface NonGstCustomerPage {
  items: NonGstCustomer[];
  total: number;
  page: number;
  limit: number;
  /** What all matching customers owe, not just this page. */
  totals: { due: number; overdue: number };
}

export type NonGstTrendPeriod = "daily" | "monthly";

export interface NonGstOverview {
  summary: {
    billCount: number;
    amount: number;
    averageBill: number;
    unitsSold: number;
    /** Money received on the bills in this range. */
    collected: number;
    /** Still owed on the bills in this range. */
    outstanding: number;
    cancelledCount: number;
    cancelledAmount: number;
  };
  priceLists: { priceList: PriceList; billCount: number; amount: number }[];
  /** "YYYY-MM-DD" (daily) or "YYYY-MM" (monthly), quiet days included as zero. */
  trend: { period: string; amount: number; billCount: number }[];
  topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
  topCustomers: NonGstCustomer[];
  paymentMethods: { method: string; amount: number }[];
  /** All-time, regardless of the chosen range. */
  dues: DueSummary;
  /** Customers who owe the most, all-time. */
  topDebtors: NonGstCustomer[];
}
