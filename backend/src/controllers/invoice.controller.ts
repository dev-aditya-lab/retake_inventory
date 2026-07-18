import type { Request, Response } from "express";
import * as invoiceService from "../services/invoice.service";
import * as whatsappService from "../services/whatsapp.service";
import * as emailService from "../services/email.service";
import { generateInvoiceBarcodePng } from "../services/barcode.service";
import { generateInvoicePdf } from "../services/pdf.service";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";

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
  const phone = invoice.customer?.phone;
  const customerName = invoice.customer?.name;
  if (!phone) {
    throw ApiError.badRequest("This invoice has no customer phone number on file");
  }

  await whatsappService.sendInvoiceWhatsApp({
    phone,
    customerName: customerName ?? "",
    totalAmount: invoice.grandTotal.toFixed(2),
    invoiceNumber: invoice.invoiceNumber,
  });
  await invoiceService.markWhatsappSent(invoice.invoiceNumber);

  res.json({ success: true, data: null });
}

export function invoiceDownloadUrl(invoiceNumber: string): string {
  return `${env.CLIENT_URL}/invoice/${invoiceNumber}`;
}
