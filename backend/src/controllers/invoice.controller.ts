import type { Request, Response } from "express";
import * as invoiceService from "../services/invoice.service";
import * as whatsappService from "../services/whatsapp.service";
import * as emailService from "../services/email.service";
import * as exportService from "../services/export.service";
import { generateInvoiceBarcodePng } from "../services/barcode.service";
import { generateInvoicePdf } from "../services/pdf.service";
import { ApiError } from "../utils/ApiError";
import { normalizeIndianPhone } from "../utils/phone";
import { env } from "../config/env";
import { redis } from "../config/redis";
import type { ExportFormat } from "../services/export.service";
import { cancelInvoiceSchema, listInvoicesQuerySchema, sendWhatsappSchema } from "../validators/invoice.validators";

// Blocks an accidental double-tap from sending the same bill twice.
const WHATSAPP_RESEND_COOLDOWN_SECONDS = 30;

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export async function listInvoices(req: Request, res: Response): Promise<void> {
  const { search, status, customer, from, to, page, limit } = listInvoicesQuerySchema.parse(req.query);
  const result = await invoiceService.listInvoices({
    search,
    status,
    customerId: customer,
    from: from ? new Date(from) : undefined,
    // A bare date ("2026-09-22") means "through the end of that day".
    to: to ? (to.length === 10 ? new Date(`${to}T23:59:59.999`) : new Date(to)) : undefined,
    page,
    limit,
  });
  res.json({ success: true, data: result });
}

export async function updateInvoice(req: Request, res: Response): Promise<void> {
  const invoice = await invoiceService.updateInvoice(req.params.invoiceNumber as string, requireUserId(req), req.body);
  res.json({ success: true, data: invoice });
}

export async function cancelInvoice(req: Request, res: Response): Promise<void> {
  const { reason } = cancelInvoiceSchema.parse(req.body ?? {});
  const invoice = await invoiceService.cancelInvoice(req.params.invoiceNumber as string, requireUserId(req), reason);
  res.json({ success: true, data: invoice });
}

export async function getInvoice(req: Request, res: Response): Promise<void> {
  const invoice = await invoiceService.getInvoiceByNumber(req.params.invoiceNumber as string);
  res.json({ success: true, data: invoice });
}

export async function getInvoiceBarcode(req: Request, res: Response): Promise<void> {
  const invoice = await invoiceService.getInvoiceByNumber(req.params.invoiceNumber as string);
  const png = generateInvoiceBarcodePng(invoice.invoiceNumber);
  res.type("image/png").send(png);
}

export async function getInvoicePdf(req: Request, res: Response): Promise<void> {
  const invoice = await invoiceService.getInvoiceByNumber(req.params.invoiceNumber as string);
  const pdf = await generateInvoicePdf(invoice);
  res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNumber}.pdf"`);
  res.type("application/pdf").send(pdf);
}

export async function sendEmail(req: Request, res: Response): Promise<void> {
  const invoice = await invoiceService.getInvoiceByNumber(req.params.invoiceNumber as string);
  const email = invoice.customer?.email;
  const customerName = invoice.customer?.name;
  if (!email) {
    throw ApiError.badRequest("This invoice has no customer email on file");
  }

  const pdf = await generateInvoicePdf(invoice);
  await emailService.sendInvoiceEmail({
    to: email,
    customerName: customerName ?? "",
    invoiceNumber: invoice.invoiceNumber,
    totalAmount: invoice.grandTotal.toFixed(2),
    downloadUrl: invoiceDownloadUrl(invoice.invoiceNumber),
    pdfBuffer: pdf,
  });
  await invoiceService.markEmailSent(invoice.invoiceNumber);

  res.json({ success: true, data: null });
}

export async function sendWhatsapp(req: Request, res: Response): Promise<void> {
  const invoice = await invoiceService.getInvoiceByNumber(req.params.invoiceNumber as string);
  if (invoice.status === "void") {
    throw ApiError.badRequest("This invoice was cancelled — it can't be sent");
  }

  const { phone: overridePhone } = sendWhatsappSchema.parse(req.body ?? {});
  const phone = overridePhone || invoice.customer?.phone;
  if (!phone) {
    throw ApiError.badRequest("This invoice has no customer phone number on file — enter one to send to");
  }
  const digits = normalizeIndianPhone(phone);
  if (digits.length < 10 || digits.length > 15) {
    throw ApiError.badRequest(`"${phone}" doesn't look like a valid phone number`);
  }

  const cooldownKey = `whatsapp:cooldown:${invoice.invoiceNumber}:${digits}`;
  const acquired = await redis.set(cooldownKey, "1", "EX", WHATSAPP_RESEND_COOLDOWN_SECONDS, "NX");
  if (!acquired) {
    throw new ApiError(429, "This bill was just sent to that number — wait a few seconds before resending");
  }

  try {
    await whatsappService.sendInvoiceWhatsApp({
      phone,
      customerName: invoice.customer?.name || "Customer",
      totalAmount: invoice.grandTotal.toFixed(2),
      invoiceNumber: invoice.invoiceNumber,
    });
  } catch (err) {
    await redis.del(cooldownKey); // a failed send shouldn't block an immediate retry
    throw err;
  }
  await invoiceService.markWhatsappSent(invoice.invoiceNumber);

  res.json({ success: true, data: null });
}

export function invoiceDownloadUrl(invoiceNumber: string): string {
  return `${env.CLIENT_URL}/invoice/${invoiceNumber}`;
}

export async function exportInvoices(req: Request, res: Response): Promise<void> {
  const format: ExportFormat = req.query.format === "xlsx" ? "xlsx" : "csv";
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const buffer = await exportService.exportInvoices(format, { from, to });
  const filename = `invoices.${format}`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res
    .type(format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .send(buffer);
}
