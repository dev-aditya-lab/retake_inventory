import type { Request, Response } from "express";
import * as productService from "../services/product.service";
import * as catalogCodeService from "../services/catalogCode.service";
import { generateBarcodePng, generateBarcodeSvg } from "../services/barcode.service";
import * as exportService from "../services/export.service";
import * as importService from "../services/import.service";
import { ApiError } from "../utils/ApiError";
import type { ExportFormat } from "../services/export.service";
import { listProductsQuerySchema } from "../validators/product.validators";

function parseDateRangeQuery(req: Request): { from?: Date; to?: Date } {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  return { from, to };
}

function sendSpreadsheet(res: Response, format: ExportFormat, filenameBase: string, buffer: Buffer): void {
  const filename = `${filenameBase}.${format}`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res
    .type(format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .send(buffer);
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  const product = await productService.createProduct(req.body);
  res.status(201).json({ success: true, data: product });
}

export async function listProducts(req: Request, res: Response): Promise<void> {
  const { search, category, type, lowStockOnly, status } = listProductsQuerySchema.parse(req.query);
  const products = await productService.listProducts({
    search: search || undefined,
    category: category || undefined,
    type,
    lowStockOnly: lowStockOnly === "true",
    status,
  });
  res.json({ success: true, data: products });
}

export async function getProduct(req: Request, res: Response): Promise<void> {
  const product = await productService.getProductById(req.params.id as string);
  res.json({ success: true, data: product });
}

export async function getProductByBarcode(req: Request, res: Response): Promise<void> {
  const product = await productService.getProductByBarcode(req.params.ean13 as string);
  res.json({ success: true, data: product });
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  // Inventory managers can edit prices/stock details; changing what a product
  // *is* (name, type, weight, SKU, barcode) is admin-only.
  const touchesIdentity = productService.IDENTITY_FIELDS.some((field) => req.body[field] !== undefined);
  if (touchesIdentity && req.user?.role !== "admin") {
    throw ApiError.forbidden("Only admins can change a product's name, type, weight, SKU or barcode");
  }
  const product = await productService.updateProduct(req.params.id as string, req.body);
  res.json({ success: true, data: product });
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  await productService.deleteProduct(req.params.id as string);
  res.json({ success: true, data: null });
}

export async function adjustStock(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const product = await productService.adjustStock(req.params.id as string, req.user.id, req.body);
  res.json({ success: true, data: product });
}

export async function getProductBarcodeImage(req: Request, res: Response): Promise<void> {
  const product = await productService.getProductById(req.params.id as string);
  const format = req.query.format === "svg" ? "svg" : "png";

  if (format === "svg") {
    const svg = generateBarcodeSvg(product.ean13);
    res.setHeader("Content-Disposition", `inline; filename="${product.sku}.svg"`);
    res.type("image/svg+xml").send(svg);
    return;
  }

  const png = generateBarcodePng(product.ean13);
  res.setHeader("Content-Disposition", `inline; filename="${product.sku}.png"`);
  res.type("image/png").send(png);
}

export async function decodeBarcode(req: Request, res: Response): Promise<void> {
  const decoded = await catalogCodeService.decodeBarcode(req.params.ean13 as string);
  res.json({ success: true, data: decoded });
}

export async function exportProducts(req: Request, res: Response): Promise<void> {
  const format: ExportFormat = req.query.format === "xlsx" ? "xlsx" : "csv";
  const buffer = await exportService.exportProducts(format);
  sendSpreadsheet(res, format, "products", buffer);
}

export async function exportStockMovements(req: Request, res: Response): Promise<void> {
  const format: ExportFormat = req.query.format === "xlsx" ? "xlsx" : "csv";
  const buffer = await exportService.exportStockMovements(format, parseDateRangeQuery(req));
  sendSpreadsheet(res, format, "stock-movements", buffer);
}

export async function importProducts(req: Request, res: Response): Promise<void> {
  if (!req.file) throw ApiError.badRequest("No file uploaded — attach a CSV or XLSX file");
  if (!req.user) throw ApiError.unauthorized();

  // Defaults to a dry run (preview only) — the caller must explicitly pass
  // ?dryRun=false to actually commit changes.
  const dryRun = req.query.dryRun !== "false";
  const results = await importService.importProducts(
    req.file.buffer,
    req.file.mimetype,
    req.file.originalname,
    req.user.id,
    dryRun,
  );
  res.json({ success: true, data: { dryRun, results } });
}
