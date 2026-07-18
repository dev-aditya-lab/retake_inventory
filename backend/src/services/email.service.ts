import { Resend } from "resend";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { company } from "../config/company";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

interface SendInvoiceEmailParams {
  to: string;
  customerName: string;
  invoiceNumber: string;
  totalAmount: string;
  downloadUrl: string;
  pdfBuffer: Buffer;
}

export async function sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<void> {
  if (!resend || !env.RESEND_FROM_EMAIL) {
    throw ApiError.badRequest("Email is not configured on this server");
  }

  const { error } = await resend.emails.send({
    from: `${company.name} <${env.RESEND_FROM_EMAIL}>`,
    to: params.to,
    subject: `Your ${company.name} invoice ${params.invoiceNumber}`,
    html: `
      <p>Hi ${params.customerName},</p>
      <p>Thanks for shopping with ${company.name}! Your invoice <strong>${params.invoiceNumber}</strong>
      for &#8377;${params.totalAmount} is attached as a PDF, or you can view it online:
      <a href="${params.downloadUrl}">${params.downloadUrl}</a></p>
      <p>This is a computer generated email.</p>
    `,
    attachments: [{ filename: `${params.invoiceNumber}.pdf`, content: params.pdfBuffer }],
  });

  if (error) {
    throw ApiError.badRequest(`Email send failed: ${error.message}`);
  }
}
