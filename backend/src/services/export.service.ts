import ExcelJS from "exceljs";
import { Product } from "../models/Product.model";
import { Invoice } from "../models/Invoice.model";
import { NonGstBill } from "../models/NonGstBill.model";
import { StockMovement } from "../models/StockMovement.model";
import { toCsv } from "../utils/csv";
import { istDayKey } from "../utils/istDate";
import { summarizePayment } from "../utils/payments";
import type { DateRange } from "./report.service";

export type ExportFormat = "csv" | "xlsx";

interface ColumnDef {
  header: string;
  key: string;
  width?: number;
}

async function buildWorkbookBuffer(sheetName: string, columns: ColumnDef[], rows: Record<string, unknown>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;
  sheet.addRows(rows);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/** The paid / owing columns every bill export carries. */
function paymentColumns(bill: Parameters<typeof summarizePayment>[0]) {
  const payment = summarizePayment(bill);
  return {
    amountPaid: payment.amountPaid,
    balanceDue: payment.balanceDue,
    paymentStatus: payment.overdue ? "overdue" : payment.paymentStatus,
    dueDate: payment.dueDate ? istDayKey(payment.dueDate) : "",
  };
}

function dateRangeMatch(range: DateRange): Record<string, unknown> {
  const match: Record<string, unknown> = {};
  if (range.from || range.to) {
    const billingDate: Record<string, Date> = {};
    if (range.from) billingDate.$gte = range.from;
    if (range.to) billingDate.$lte = range.to;
    match.billingDate = billingDate;
  }
  return match;
}

const PRODUCT_COLUMNS: ColumnDef[] = [
  { header: "Category", key: "category", width: 16 },
  { header: "Name", key: "name", width: 20 },
  { header: "Type", key: "type", width: 10 },
  { header: "Weight", key: "weightLabel", width: 10 },
  { header: "SKU", key: "sku", width: 18 },
  { header: "EAN-13", key: "ean13", width: 16 },
  { header: "Barcode Source", key: "barcodeSource", width: 14 },
  { header: "HSN Code", key: "hsnCode", width: 12 },
  { header: "Cost Price", key: "costPrice", width: 12 },
  { header: "B2B Price (excl GST)", key: "sellingPrice", width: 16 },
  { header: "MRP (incl GST)", key: "mrp", width: 14 },
  { header: "GST Rate %", key: "gstRate", width: 10 },
  { header: "UQC", key: "uqc", width: 8 },
  { header: "Quantity In Stock", key: "quantityInStock", width: 16 },
  { header: "Low Stock Threshold", key: "lowStockThreshold", width: 16 },
  { header: "Note", key: "note", width: 24 },
  { header: "Active", key: "isActive", width: 10 },
];

export async function exportProducts(format: ExportFormat): Promise<Buffer> {
  const products = await Product.find().sort({ name: 1, weightLabel: 1 });
  const rows = products.map((p) => ({
    category: p.category,
    name: p.name,
    type: p.type,
    weightLabel: p.weightLabel,
    sku: p.sku,
    ean13: p.ean13,
    barcodeSource: p.barcodeSource,
    hsnCode: p.hsnCode,
    costPrice: p.costPrice,
    sellingPrice: p.sellingPrice,
    mrp: p.mrp ?? "",
    gstRate: p.gstRate ?? "",
    uqc: p.uqc ?? "",
    quantityInStock: p.quantityInStock,
    lowStockThreshold: p.lowStockThreshold,
    note: p.note,
    isActive: p.isActive,
  }));

  if (format === "csv") {
    return Buffer.from(
      toCsv(
        rows,
        PRODUCT_COLUMNS.map((c) => c.key),
      ),
      "utf-8",
    );
  }
  return buildWorkbookBuffer("Products", PRODUCT_COLUMNS, rows);
}

const INVOICE_COLUMNS: ColumnDef[] = [
  { header: "Invoice Number", key: "invoiceNumber", width: 22 },
  { header: "Billing Date", key: "billingDate", width: 14 },
  { header: "Customer Name", key: "customerName", width: 20 },
  { header: "Customer Phone", key: "customerPhone", width: 16 },
  { header: "Customer GSTIN", key: "customerGstin", width: 18 },
  { header: "Type", key: "buyerType", width: 8 },
  { header: "Place of Supply", key: "placeOfSupply", width: 18 },
  { header: "Item Count", key: "itemCount", width: 10 },
  { header: "Taxable Value", key: "subtotal", width: 12 },
  { header: "CGST", key: "cgst", width: 10 },
  { header: "SGST", key: "sgst", width: 10 },
  { header: "IGST", key: "igst", width: 10 },
  { header: "GST Amount", key: "gstAmount", width: 12 },
  { header: "Other Charges", key: "otherCharges", width: 12 },
  { header: "Grand Total", key: "grandTotal", width: 12 },
  { header: "Amount Paid", key: "amountPaid", width: 12 },
  { header: "Balance Due", key: "balanceDue", width: 12 },
  { header: "Payment Status", key: "paymentStatus", width: 14 },
  { header: "Due Date", key: "dueDate", width: 12 },
  { header: "Payment Method", key: "paymentMethod", width: 14 },
  { header: "Status", key: "status", width: 10 },
  { header: "Credited", key: "creditedTotal", width: 12 },
];

export async function exportInvoices(format: ExportFormat, range: DateRange): Promise<Buffer> {
  const invoices = await Invoice.find(dateRangeMatch(range)).sort({ billingDate: -1 });
  const rows = invoices.map((inv) => ({
    invoiceNumber: inv.invoiceNumber,
    billingDate: inv.billingDate.toISOString().slice(0, 10),
    customerName: inv.customer?.name ?? "",
    customerPhone: inv.customer?.phone ?? "",
    customerGstin: inv.customer?.gstin ?? "",
    buyerType: inv.buyerType ?? "",
    placeOfSupply: inv.placeOfSupply ? `${inv.placeOfSupply.code}-${inv.placeOfSupply.name}` : "",
    itemCount: inv.items.length,
    subtotal: inv.subtotal,
    cgst: inv.cgst ?? inv.gst?.cgstAmount ?? 0,
    sgst: inv.sgst ?? inv.gst?.sgstAmount ?? 0,
    igst: inv.igst ?? inv.gst?.igstAmount ?? 0,
    gstAmount: inv.gst?.amount ?? 0,
    otherCharges: inv.otherCharges,
    grandTotal: inv.grandTotal,
    ...paymentColumns(inv),
    paymentMethod: inv.paymentMethod ?? "",
    status: inv.status,
    creditedTotal: inv.creditedTotal ?? 0,
  }));

  if (format === "csv") {
    return Buffer.from(
      toCsv(
        rows,
        INVOICE_COLUMNS.map((c) => c.key),
      ),
      "utf-8",
    );
  }
  return buildWorkbookBuffer("Invoices", INVOICE_COLUMNS, rows);
}

const NON_GST_BILL_COLUMNS: ColumnDef[] = [
  { header: "Bill Number", key: "billNumber", width: 20 },
  { header: "Billing Date", key: "billingDate", width: 14 },
  { header: "Customer Name", key: "customerName", width: 20 },
  { header: "Customer Phone", key: "customerPhone", width: 16 },
  { header: "Price List", key: "priceList", width: 10 },
  { header: "Item Count", key: "itemCount", width: 10 },
  { header: "Items Total", key: "subtotal", width: 12 },
  { header: "Other Charges", key: "otherCharges", width: 12 },
  { header: "Grand Total", key: "grandTotal", width: 12 },
  { header: "Amount Paid", key: "amountPaid", width: 12 },
  { header: "Balance Due", key: "balanceDue", width: 12 },
  { header: "Payment Status", key: "paymentStatus", width: 14 },
  { header: "Due Date", key: "dueDate", width: 12 },
  { header: "Payment Method", key: "paymentMethod", width: 14 },
  { header: "Status", key: "status", width: 10 },
];

/** Non-GST bills only — kept out of the GST invoice export. */
export async function exportNonGstBills(format: ExportFormat, range: DateRange): Promise<Buffer> {
  const bills = await NonGstBill.find(dateRangeMatch(range)).sort({ billingDate: -1 });
  const rows = bills.map((bill) => ({
    billNumber: bill.billNumber,
    billingDate: bill.billingDate.toISOString().slice(0, 10),
    customerName: bill.customer?.name ?? "",
    customerPhone: bill.customer?.phone ?? "",
    priceList: bill.priceList,
    itemCount: bill.items.length,
    subtotal: bill.subtotal,
    otherCharges: bill.otherCharges,
    grandTotal: bill.grandTotal,
    ...paymentColumns(bill),
    paymentMethod: bill.paymentMethod ?? "",
    status: bill.status,
  }));

  if (format === "csv") {
    return Buffer.from(
      toCsv(
        rows,
        NON_GST_BILL_COLUMNS.map((c) => c.key),
      ),
      "utf-8",
    );
  }
  return buildWorkbookBuffer("Non-GST bills", NON_GST_BILL_COLUMNS, rows);
}

const STOCK_MOVEMENT_COLUMNS: ColumnDef[] = [
  { header: "Date", key: "date", width: 20 },
  { header: "Product", key: "productName", width: 20 },
  { header: "SKU", key: "sku", width: 18 },
  { header: "Type", key: "type", width: 12 },
  { header: "Quantity Change", key: "quantityChange", width: 14 },
  { header: "Resulting Quantity", key: "resultingQuantity", width: 16 },
  { header: "Invoice / Bill Number", key: "invoiceNumber", width: 20 },
  { header: "Staff", key: "userName", width: 18 },
  { header: "Note", key: "note", width: 24 },
];

export async function exportStockMovements(format: ExportFormat, range: DateRange): Promise<Buffer> {
  const match: Record<string, unknown> = {};
  if (range.from || range.to) {
    const createdAt: Record<string, Date> = {};
    if (range.from) createdAt.$gte = range.from;
    if (range.to) createdAt.$lte = range.to;
    match.createdAt = createdAt;
  }

  const movements = await StockMovement.find(match)
    .sort({ createdAt: -1 })
    .populate("product", "name sku")
    .populate("user", "name")
    .populate("invoice", "invoiceNumber")
    .populate("nonGstBill", "billNumber");

  const rows = movements.map((m) => {
    const product = m.product as unknown as { name?: string; sku?: string } | null;
    const user = m.user as unknown as { name?: string } | null;
    const invoice = m.invoice as unknown as { invoiceNumber?: string } | null;
    const nonGstBill = m.nonGstBill as unknown as { billNumber?: string } | null;
    return {
      date: m.get("createdAt")?.toISOString() ?? "",
      productName: product?.name ?? "",
      sku: product?.sku ?? "",
      type: m.type,
      quantityChange: m.quantityChange,
      resultingQuantity: m.resultingQuantity,
      invoiceNumber: invoice?.invoiceNumber ?? nonGstBill?.billNumber ?? "",
      userName: user?.name ?? "",
      note: m.note,
    };
  });

  if (format === "csv") {
    return Buffer.from(
      toCsv(
        rows,
        STOCK_MOVEMENT_COLUMNS.map((c) => c.key),
      ),
      "utf-8",
    );
  }
  return buildWorkbookBuffer("Stock Movements", STOCK_MOVEMENT_COLUMNS, rows);
}
