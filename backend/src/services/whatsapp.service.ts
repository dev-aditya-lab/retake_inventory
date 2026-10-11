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
 * POSTs one message payload to the Cloud API from our configured business
 * number. Resolves the WhatsApp message id (wamid...) so delivery receipts can
 * be matched to it later.
 */
async function postMessage(payload: Record<string, unknown>): Promise<string | undefined> {
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
    throw ApiError.badRequest("WhatsApp is not configured on this server");
  }

  const url = `${env.WHATSAPP_API_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const response = await axios.post<{ messages?: { id?: string }[] }>(
      url,
      { messaging_product: "whatsapp", ...payload },
      { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" } },
    );
    return response.data?.messages?.[0]?.id;
  } catch (err) {
    const message = axios.isAxiosError(err) ? JSON.stringify(err.response?.data ?? err.message) : String(err);
    throw ApiError.badRequest(`WhatsApp send failed: ${message}`);
  }
}

/**
 * Sends the "cus_digital_invoice_01" WhatsApp template (Meta Cloud API):
 *   {{1}} customer name, {{2}} total amount, {{3}} invoice number,
 *   plus a dynamic-URL button suffixed with the invoice number so it opens
 *   this exact invoice's public download page.
 */
export async function sendInvoiceWhatsApp(params: SendInvoiceWhatsAppParams): Promise<void> {
  await postMessage({
    to: normalizeIndianPhone(params.phone),
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
  });
}

/**
 * Free-form text. Only deliverable inside the 24-hour window that opens when
 * the customer messages us, so use it for replies, never for cold outreach.
 * `to` is a WhatsApp id (digits with country code), used as-is.
 */
export async function sendWhatsAppText(to: string, body: string): Promise<string | undefined> {
  return postMessage({ to, type: "text", text: { preview_url: false, body } });
}

export interface WhatsAppMenu {
  /** <= 60 chars. */
  header?: string;
  /** <= 1024 chars. */
  body: string;
  /** Label of the button that opens the list, <= 20 chars. */
  button: string;
  sectionTitle: string;
  /** At most 10 rows; title <= 24 chars, description <= 72. */
  rows: readonly { id: string; title: string; description?: string }[];
}

/**
 * A tap-to-choose list. When the customer picks a row, the webhook receives an
 * interactive message carrying that row's id. Same 24-hour-window rule as
 * sendWhatsAppText.
 */
export async function sendWhatsAppMenu(to: string, menu: WhatsAppMenu): Promise<string | undefined> {
  return postMessage({
    to,
    type: "interactive",
    interactive: {
      type: "list",
      ...(menu.header ? { header: { type: "text", text: menu.header } } : {}),
      body: { text: menu.body },
      action: {
        button: menu.button,
        sections: [{ title: menu.sectionTitle, rows: menu.rows.map((row) => ({ ...row })) }],
      },
    },
  });
}

export interface WhatsAppContact {
  name: string;
  /** Job title / what this contact is for, shown on the card. */
  role?: string;
  /** Any common Indian format; normalised for the card. */
  phone: string;
  email?: string;
}

/**
 * Sends native contact cards (the "save contact" bubbles). Same 24-hour-window
 * rule as sendWhatsAppText. `organization` is shown as the card's company.
 */
export async function sendWhatsAppContacts(
  to: string,
  contacts: readonly WhatsAppContact[],
  organization: string,
): Promise<string | undefined> {
  return postMessage({
    to,
    type: "contacts",
    contacts: contacts.map((c) => {
      const waId = normalizeIndianPhone(c.phone);
      return {
        name: { formatted_name: c.name, first_name: c.name },
        org: { company: organization, ...(c.role ? { title: c.role } : {}) },
        phones: [{ phone: `+${waId}`, type: "WORK", wa_id: waId }],
        ...(c.email ? { emails: [{ email: c.email, type: "WORK" }] } : {}),
      };
    }),
  });
}
