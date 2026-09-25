import type { Request, Response } from "express";
import * as nonGstBillService from "../services/nonGstBill.service";
import * as whatsappService from "../services/whatsapp.service";
import * as emailService from "../services/email.service";
import * as exportService from "../services/export.service";
import { generateNonGstBillPdf } from "../services/pdf.service";
import { nonGstPayments } from "../services/payment.service";
import { summarizePayment } from "../utils/payments";
import { ApiError } from "../utils/ApiError";
import { normalizeIndianPhone } from "../utils/phone";
import { env } from "../config/env";
import { redis } from "../config/redis";
import type { ExportFormat } from "../services/export.service";
import { cancelNonGstBillSchema, listNonGstBillsQuerySchema, sendNonGstWhatsappSchema } from "../validators/nonGstBill.validators";
import type { z } from "zod";
import type { recordPaymentSchema } from "../validators/payment.validators";

type RecordPaymentBody = z.infer<typeof recordPaymentSchema>;

// Blocks an accidental double-tap from sending the same bill twice.
const WHATSAPP_RESEND_COOLDOWN_SECONDS = 30;

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

/** Customers open their bill from this link — the same public page GST invoices use. */
function billDownloadUrl(billNumber: string): string {
  return `${env.CLIENT_URL}/invoice/${billNumber}`;
}

export async function checkout(req: Request, res: Response): Promise<void> {
  const bill = await nonGstBillService.checkout(requireUserId(req), req.params.id as string);
  res.status(201).json({ success: true, data: bill && { ...bill.toJSON(), payment: summarizePayment(bill) } });
}

export async function listBills(req: Request, res: Response): Promise<void> {
  const { search, status, payment, from, to, page, limit } = listNonGstBillsQuerySchema.parse(req.query);
  const result = await nonGstBillService.listBills({
    search,
    status,
    payment,
    from: from ? new Date(from) : undefined,
    // A bare date ("2026-09-22") means "through the end of that day".
    to: to ? (to.length === 10 ? new Date(`${to}T23:59:59.999`) : new Date(to)) : undefined,
    page,
    limit,
  });
  res.json({ success: true, data: result });
}

/** A bill as the screens see it: payment = paid / balance due / status. */
async function billDetail(billNumber: string) {
  const bill = await nonGstBillService.getBillByNumber(billNumber);
  return { ...bill.toJSON(), payment: summarizePayment(bill) };
}

export async function getBill(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await billDetail(req.params.billNumber as string) });
}

export async function recordPayment(req: Request, res: Response): Promise<void> {
  const number = req.params.billNumber as string;
  const { receivedAt, ...entry } = req.body as RecordPaymentBody;
  await nonGstPayments.record(number, requireUserId(req), { ...entry, receivedAt: receivedAt ? new Date(receivedAt) : undefined });
  res.status(201).json({ success: true, data: await billDetail(number) });
}

export async function deletePayment(req: Request, res: Response): Promise<void> {
  const number = req.params.billNumber as string;
  await nonGstPayments.remove(number, req.params.paymentId as string);
  res.json({ success: true, data: await billDetail(number) });
}

export async function setDueDate(req: Request, res: Response): Promise<void> {
  const number = req.params.billNumber as string;
  await nonGstPayments.setDueDate(number, (req.body as { dueDate: string | null }).dueDate);
  res.json({ success: true, data: await billDetail(number) });
}

export async function getBillPdf(req: Request, res: Response): Promise<void> {
  const bill = await nonGstBillService.getBillByNumber(req.params.billNumber as string);
  const pdf = await generateNonGstBillPdf(bill);
  res.setHeader("Content-Disposition", `inline; filename="${bill.billNumber}.pdf"`);
  res.type("application/pdf").send(pdf);
}

export async function updateBill(req: Request, res: Response): Promise<void> {
  const bill = await nonGstBillService.updateBill(req.params.billNumber as string, requireUserId(req), req.body);
  res.json({ success: true, data: bill });
}

export async function cancelBill(req: Request, res: Response): Promise<void> {
  const { reason } = cancelNonGstBillSchema.parse(req.body ?? {});
  const bill = await nonGstBillService.cancelBill(req.params.billNumber as string, requireUserId(req), reason);
  res.json({ success: true, data: bill });
}

export async function sendEmail(req: Request, res: Response): Promise<void> {
  const bill = await nonGstBillService.getBillByNumber(req.params.billNumber as string);
  if (bill.status === "void") throw ApiError.badRequest("This bill was cancelled — it can't be sent");
  const email = bill.customer?.email;
  if (!email) throw ApiError.badRequest("This bill has no customer email on file");

  const pdf = await generateNonGstBillPdf(bill);
  await emailService.sendInvoiceEmail({
    to: email,
    customerName: bill.customer?.name ?? "",
    invoiceNumber: bill.billNumber,
    totalAmount: bill.grandTotal.toFixed(2),
    downloadUrl: billDownloadUrl(bill.billNumber),
    pdfBuffer: pdf,
    documentLabel: "bill",
  });
  await nonGstBillService.markEmailSent(bill.billNumber);

  res.json({ success: true, data: null });
}

export async function sendWhatsapp(req: Request, res: Response): Promise<void> {
  const bill = await nonGstBillService.getBillByNumber(req.params.billNumber as string);
  if (bill.status === "void") throw ApiError.badRequest("This bill was cancelled — it can't be sent");

  const { phone: overridePhone } = sendNonGstWhatsappSchema.parse(req.body ?? {});
  const phone = overridePhone || bill.customer?.phone;
  if (!phone) {
    throw ApiError.badRequest("This bill has no customer phone number on file — enter one to send to");
  }
  const digits = normalizeIndianPhone(phone);
  if (digits.length < 10 || digits.length > 15) {
    throw ApiError.badRequest(`"${phone}" doesn't look like a valid phone number`);
  }

  const cooldownKey = `whatsapp:cooldown:${bill.billNumber}:${digits}`;
  const acquired = await redis.set(cooldownKey, "1", "EX", WHATSAPP_RESEND_COOLDOWN_SECONDS, "NX");
  if (!acquired) {
    throw new ApiError(429, "This bill was just sent to that number — wait a few seconds before resending");
  }

  try {
    // Same WhatsApp template as GST invoices; its button opens /invoice/{number}.
    await whatsappService.sendInvoiceWhatsApp({
      phone,
      customerName: bill.customer?.name || "Customer",
      totalAmount: bill.grandTotal.toFixed(2),
      invoiceNumber: bill.billNumber,
    });
  } catch (err) {
    await redis.del(cooldownKey); // a failed send shouldn't block an immediate retry
    throw err;
  }
  await nonGstBillService.markWhatsappSent(bill.billNumber);

  res.json({ success: true, data: null });
}

export async function exportBills(req: Request, res: Response): Promise<void> {
  const format: ExportFormat = req.query.format === "xlsx" ? "xlsx" : "csv";
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const buffer = await exportService.exportNonGstBills(format, { from, to });
  res.setHeader("Content-Disposition", `attachment; filename="non-gst-bills.${format}"`);
  res
    .type(format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .send(buffer);
}
