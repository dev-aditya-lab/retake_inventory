import { ApiError } from "../utils/ApiError";
import { normalizeIndianPhone } from "../utils/phone";
import { graph } from "./metaGraph.service";
import { getWhatsappConfig } from "./whatsappConfig.service";
import { isWhatsappEnabled } from "./whatsappSettings.service";

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
  if (!(await isWhatsappEnabled())) {
    throw ApiError.badRequest("The WhatsApp service is turned off");
  }
  const config = await getWhatsappConfig();
  if (!config.phoneNumberId || !config.accessToken) {
    throw ApiError.badRequest("WhatsApp is not configured. An admin can add the phone number id and access token under WhatsApp > Settings.");
  }

  const data = await graph<{ messages?: { id?: string }[] }>("POST", `${config.phoneNumberId}/messages`, {
    config,
    data: { messaging_product: "whatsapp", ...payload },
  });
  return data?.messages?.[0]?.id;
}

export interface TemplateComponent {
  type: string;
  sub_type?: string;
  index?: string;
  parameters?: unknown[];
}

/**
 * Sends any approved template. Unlike free text this works outside the 24-hour
 * window, so it is how the shop starts a conversation. `components` is the Cloud
 * API's own shape (header / body / button parameters).
 */
export async function sendWhatsAppTemplate(
  to: string,
  name: string,
  language: string,
  components: readonly TemplateComponent[],
): Promise<string | undefined> {
  return postMessage({
    to,
    type: "template",
    template: { name, language: { code: language }, ...(components.length > 0 ? { components } : {}) },
  });
}

export interface WhatsAppMedia {
  kind: "image" | "document" | "video";
  /** A file already uploaded to WhatsApp (see uploadWhatsAppMedia). */
  id: string;
  caption?: string;
  /** Shown as the file name for documents. */
  filename?: string;
}

/**
 * Uploads a file to WhatsApp's media store and resolves its media id, which
 * sendWhatsAppMedia then sends. Staff attach files straight from their phone,
 * so no public link is needed.
 */
export async function uploadWhatsAppMedia(file: { buffer: Buffer; mimetype: string; originalname: string }): Promise<string> {
  if (!(await isWhatsappEnabled())) throw ApiError.badRequest("The WhatsApp service is turned off");
  const config = await getWhatsappConfig();
  if (!config.phoneNumberId || !config.accessToken) {
    throw ApiError.badRequest("WhatsApp is not configured. An admin can add the phone number id and access token under WhatsApp > Settings.");
  }
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", file.mimetype);
  form.append("file", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);

  const data = await graph<{ id?: string }>("POST", `${config.phoneNumberId}/media`, { config, data: form });
  if (!data?.id) throw ApiError.badRequest("WhatsApp didn't accept that file. Try a different one.");
  return data.id;
}

/** An image / PDF / video that was uploaded first. Same 24-hour-window rule as sendWhatsAppText. */
export async function sendWhatsAppMedia(to: string, media: WhatsAppMedia): Promise<string | undefined> {
  return postMessage({
    to,
    type: media.kind,
    [media.kind]: {
      id: media.id,
      ...(media.caption ? { caption: media.caption } : {}),
      ...(media.kind === "document" && media.filename ? { filename: media.filename } : {}),
    },
  });
}

export interface WhatsAppButtons {
  /** <= 1024 chars. */
  body: string;
  /** <= 60 chars. */
  header?: string;
  /** <= 60 chars. */
  footer?: string;
  /** 1 to 3 quick-reply buttons; title <= 20 chars. */
  buttons: readonly { id: string; title: string }[];
}

/** Up to three tap-to-answer buttons. Same 24-hour-window rule as sendWhatsAppText. */
export async function sendWhatsAppButtons(to: string, message: WhatsAppButtons): Promise<string | undefined> {
  return postMessage({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      ...(message.header ? { header: { type: "text", text: message.header } } : {}),
      body: { text: message.body },
      ...(message.footer ? { footer: { text: message.footer } } : {}),
      action: { buttons: message.buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
    },
  });
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
