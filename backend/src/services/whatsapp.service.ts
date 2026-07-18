import axios from "axios";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { normalizeIndianPhone } from "../utils/phone";

interface SendInvoiceWhatsAppParams {
  phone: string;
  customerName: string;
  totalAmount: string;
  invoiceNumber: string;
}

/**
 * Sends the "cus_digital_invoice_01" WhatsApp template (Meta Cloud API):
 *   {{1}} customer name, {{2}} total amount, {{3}} invoice number,
 *   plus a dynamic-URL button suffixed with the invoice number so it opens
 *   this exact invoice's public download page.
 */
export async function sendInvoiceWhatsApp(params: SendInvoiceWhatsAppParams): Promise<void> {
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
    throw ApiError.badRequest("WhatsApp is not configured on this server");
  }

  const to = normalizeIndianPhone(params.phone);
  const url = `${env.WHATSAPP_API_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "cus_digital_invoice_01",
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.customerName },
            { type: "text", text: params.totalAmount },
            { type: "text", text: params.invoiceNumber },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: params.invoiceNumber }],
        },
      ],
    },
  };

  try {
    await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = axios.isAxiosError(err) ? JSON.stringify(err.response?.data ?? err.message) : String(err);
    throw ApiError.badRequest(`WhatsApp send failed: ${message}`);
  }
}
