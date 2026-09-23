import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { Product } from "../models/Product.model";
import * as productService from "./product.service";
import { ApiError } from "../utils/ApiError";
import { UQC_CODES, isValidGstRate } from "../config/gst";

const MAX_ROWS = 1000;
// MRP, GST rate and unit are here so a whole catalogue can be made GST-ready
// in one pass: export → fill the columns in Excel → import.
const UPDATABLE_FIELDS = [
  "costPrice",
  "sellingPrice",
  "mrp",
  "gstRate",
  "uqc",
  "hsnCode",
  "lowStockThreshold",
  "note",
  "isActive",
] as const;

export interface ImportRowResult {
  row: number;
  sku: string;
  status: "updated" | "would-update" | "unchanged" | "error";
  changes: Record<string, { from: unknown; to: unknown }>;
  error?: string;
}

interface ParsedRow {
  sku: string;
  costPrice?: number;
  sellingPrice?: number;
  mrp?: number;
  gstRate?: number;
  uqc?: string;
  hsnCode?: string;
  lowStockThreshold?: number;
  note?: string;
  isActive?: boolean;
  quantityInStock?: number;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value).trim();
}

async function parseFile(buffer: Buffer, mimetype: string, filename: string): Promise<Record<string, unknown>[]> {
  const isXlsx = mimetype.includes("spreadsheet") || filename.toLowerCase().endsWith(".xlsx");

  if (isXlsx) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const headerValues = sheet.getRow(1).values as unknown[];
    const headers = headerValues.slice(1).map((h) => String(h ?? "").trim());

    const rows: Record<string, unknown>[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values as unknown[];
      const record: Record<string, unknown> = {};
      headers.forEach((header, i) => {
        record[header] = values[i + 1];
      });
      rows.push(record);
    });
    return rows;
  }

  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, unknown>[];
}

function normalizeRow(raw: Record<string, unknown>): ParsedRow | { error: string } {
  const sku = parseString(raw["SKU"] ?? raw.sku)?.toUpperCase();
  if (!sku) return { error: "Missing SKU" };

  const gstRate = parseNumber(raw["GST Rate %"] ?? raw["GST Rate"] ?? raw.gstRate);
  if (gstRate !== undefined && !isValidGstRate(gstRate)) return { error: `GST rate ${gstRate}% isn't a rate the GST portal accepts` };
  const uqc = parseString(raw["UQC"] ?? raw.uqc)?.toUpperCase();
  if (uqc && !(uqc in UQC_CODES)) return { error: `Unknown unit "${uqc}" — use a GST UQC like PAC or NOS` };
  const hsn = parseString(raw["HSN Code"] ?? raw.hsnCode);
  if (hsn && !/^\d{4,8}$/.test(hsn)) return { error: `HSN code "${hsn}" must be 4 to 8 digits` };

  return {
    sku,
    costPrice: parseNumber(raw["Cost Price"] ?? raw.costPrice),
    sellingPrice: parseNumber(raw["B2B Price (excl GST)"] ?? raw["Selling Price"] ?? raw.sellingPrice),
    mrp: parseNumber(raw["MRP (incl GST)"] ?? raw["MRP"] ?? raw.mrp),
    gstRate: parseNumber(raw["GST Rate %"] ?? raw["GST Rate"] ?? raw.gstRate),
    uqc: parseString(raw["UQC"] ?? raw.uqc)?.toUpperCase() || undefined,
    hsnCode: parseString(raw["HSN Code"] ?? raw.hsnCode),
    lowStockThreshold: parseNumber(raw["Low Stock Threshold"] ?? raw.lowStockThreshold),
    note: parseString(raw["Note"] ?? raw.note),
    isActive: parseBoolean(raw["Active"] ?? raw.isActive),
    quantityInStock: parseNumber(raw["Quantity In Stock"] ?? raw.quantityInStock),
  };
}

/**
 * Bulk-updates existing products (matched by SKU) from an uploaded CSV/XLSX
 * file. Never creates new products — a spreadsheet typo can't spawn a
 * malformed barcode/product. `dryRun` validates and reports what would
 * change without writing anything.
 */
export async function importProducts(
  buffer: Buffer,
  mimetype: string,
  filename: string,
  userId: string,
  dryRun: boolean,
): Promise<ImportRowResult[]> {
  const rawRows = await parseFile(buffer, mimetype, filename);
  if (rawRows.length === 0) {
    throw ApiError.badRequest("The file has no data rows");
  }
  if (rawRows.length > MAX_ROWS) {
    throw ApiError.badRequest(`Import is limited to ${MAX_ROWS} rows at a time (got ${rawRows.length})`);
  }

  const results: ImportRowResult[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 2; // header is row 1
    const raw = rawRows[i]!;
    const normalized = normalizeRow(raw);

    if ("error" in normalized) {
      results.push({ row: rowNumber, sku: "", status: "error", changes: {}, error: normalized.error });
      continue;
    }

    const product = await Product.findOne({ sku: normalized.sku });
    if (!product) {
      results.push({
        row: rowNumber,
        sku: normalized.sku,
        status: "error",
        changes: {},
        error: `No product with SKU "${normalized.sku}"`,
      });
      continue;
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const fieldUpdates: Record<string, unknown> = {};

    for (const field of UPDATABLE_FIELDS) {
      const newValue = normalized[field];
      const currentValue = product.get(field);
      if (newValue !== undefined && newValue !== currentValue) {
        changes[field] = { from: currentValue, to: newValue };
        fieldUpdates[field] = newValue;
      }
    }

    let stockDelta = 0;
    if (normalized.quantityInStock !== undefined && normalized.quantityInStock !== product.quantityInStock) {
      stockDelta = normalized.quantityInStock - product.quantityInStock;
      changes.quantityInStock = { from: product.quantityInStock, to: normalized.quantityInStock };
    }

    if (Object.keys(changes).length === 0) {
      results.push({ row: rowNumber, sku: normalized.sku, status: "unchanged", changes: {} });
      continue;
    }

    if (dryRun) {
      results.push({ row: rowNumber, sku: normalized.sku, status: "would-update", changes });
      continue;
    }

    try {
      if (Object.keys(fieldUpdates).length > 0) {
        await Product.updateOne({ _id: product._id }, fieldUpdates, { runValidators: true });
      }
      if (stockDelta !== 0) {
        await productService.adjustStock(String(product._id), userId, {
          quantityChange: stockDelta,
          type: "correction",
          note: "Bulk import correction",
        });
      }
      results.push({ row: rowNumber, sku: normalized.sku, status: "updated", changes });
    } catch (err) {
      results.push({
        row: rowNumber,
        sku: normalized.sku,
        status: "error",
        changes: {},
        error: err instanceof Error ? err.message : "Failed to apply update",
      });
    }
  }

  return results;
}
