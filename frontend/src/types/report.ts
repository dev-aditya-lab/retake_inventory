export interface DashboardSummary {
  today: { revenue: number; invoiceCount: number };
  lowStockCount: number;
  revenueTrend: { date: string; revenue: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  recentInvoices: { invoiceNumber: string; customerName: string; grandTotal: number; billingDate: string }[];
}

export type SalesPeriod = "daily" | "monthly" | "yearly";

export interface SalesReportRow {
  period: string;
  revenue: number;
  invoiceCount: number;
}

export interface ProductWiseRow {
  name: string;
  quantity: number;
  revenue: number;
}

export interface UserWiseRow {
  userId: string;
  name: string;
  email: string;
  revenue: number;
  invoiceCount: number;
}

export interface DateRangeInput {
  from?: string;
  to?: string;
}
