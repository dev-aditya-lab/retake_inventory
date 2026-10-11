import type { PaymentSummary } from "./payments";

/**
 * Pure text builders for the WhatsApp auto-replies: data in, message text out.
 * WhatsApp renders *bold* with asterisks. Nothing here links to the website
 * except per-bill document links, which are optional (see company.whatsappBot).
 */

/** A bill (GST invoice or non-GST bill) as the customer sees it. */
export interface BillSummary {
  number: string;
  kind: "gst" | "non_gst";
  date: Date;
  total: number;
  /** paid | credited (voided bills are never loaded). */
  status: string;
  payment: Pick<PaymentSummary, "balanceDue" | "refundDue" | "overdue" | "dueDate">;
  /** User id of the staff member who created the bill. */
  createdBy?: string;
}

export const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date);

const MENU_HINT = "Reply *menu* to see all options.";

export function billStatusLabel(bill: BillSummary): string {
  if (bill.payment.balanceDue > 0) {
    return `${rupees(bill.payment.balanceDue)} ${bill.payment.overdue ? "overdue" : "due"}`;
  }
  if (bill.payment.refundDue > 0) return "Refund due";
  if (bill.status === "credited") return "Credited";
  return "Paid";
}

export function buildInvoicesText(bills: BillSummary[], options: { links: boolean; baseUrl: string; hasMore: boolean }): string {
  const lines = bills.map((bill, index) => {
    const parts = [
      `${index + 1}. *${bill.number}*`,
      `   ${formatDate(bill.date)} | ${rupees(bill.total)} | ${billStatusLabel(bill)}`,
    ];
    if (options.links) parts.push(`   ${options.baseUrl}/invoice/${bill.number}`);
    return parts.join("\n");
  });

  return [
    `*Your ${options.hasMore ? "latest" : "recent"} bills*`,
    "",
    lines.join("\n\n"),
    "",
    "Reply *pending* to see what is due.",
    MENU_HINT,
  ].join("\n");
}

export const NO_BILLS_TEXT =
  "We couldn't find any bills linked to this WhatsApp number. If you shopped with a different number, please contact us using the card below.";

export function buildPendingText(bills: BillSummary[], maxLines = 5): string {
  const total = bills.reduce((sum, bill) => sum + bill.payment.balanceDue, 0);
  const shown = bills.slice(0, maxLines);

  const lines = shown.map((bill) => {
    const due = bill.payment.dueDate ? `, due by ${formatDate(bill.payment.dueDate)}` : "";
    return `- *${bill.number}* (${formatDate(bill.date)}): ${rupees(bill.payment.balanceDue)}${bill.payment.overdue ? " overdue" : ""}${due}`;
  });
  if (bills.length > shown.length) lines.push(`- and ${bills.length - shown.length} more bill(s)`);

  return [
    `*Pending payment: ${rupees(Math.round(total * 100) / 100)}*`,
    "",
    lines.join("\n"),
    "",
    "Reply *pay* for payment details.",
    MENU_HINT,
  ].join("\n");
}

export const NOTHING_PENDING_TEXT = ["*Nothing pending*", "", "All your bills are paid. Thank you!", "", MENU_HINT].join("\n");

export interface PaymentDetails {
  accountName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
}

export function buildPaymentText(payment: PaymentDetails, dueTotal: number): string {
  return [
    "*How to pay*",
    "",
    `UPI ID: ${payment.upiId}`,
    "",
    "Bank transfer:",
    `Account name: ${payment.accountName}`,
    `Account number: ${payment.accountNumber}`,
    `IFSC: ${payment.ifsc}`,
    ...(dueTotal > 0 ? ["", `You currently have *${rupees(dueTotal)}* due.`] : []),
    "",
    MENU_HINT,
  ].join("\n");
}

export function buildAddressText(details: { legalName: string; address: string; pincode: string; contactNumber: string }): string {
  return [
    "*Our address*",
    "",
    details.legalName,
    `${details.address} - ${details.pincode}`,
    "",
    `Call us: ${details.contactNumber}`,
    "",
    MENU_HINT,
  ].join("\n");
}

export function buildContactText(staffName: string | null, lastBillNumber?: string): string {
  if (staffName && lastBillNumber) {
    return [
      `Your last bill (*${lastBillNumber}*) was handled by *${staffName}*.`,
      "Tap the card below to save their number or message them.",
      "",
      MENU_HINT,
    ].join("\n");
  }
  return ["Here is our contact number. Tap the card below to save it or message us.", "", MENU_HINT].join("\n");
}

export const HUMAN_REQUESTED_TEXT = [
  "Thank you! A team member will reply to you here shortly.",
  "",
  "In the meantime, reply *menu* to see what you can check yourself.",
].join("\n");

export function buildMenuBody(options: { customerName?: string; companyName: string; tagline: string; unknown: boolean }): string {
  if (options.unknown) {
    // The message has already been passed to the team (it shows in their inbox).
    return "Thanks for your message. Our team will reply here soon. Meanwhile, you can choose an option below.";
  }
  const hello = options.customerName ? `Hello ${options.customerName}!` : "Hello!";
  return `${hello} Welcome to ${options.companyName}. ${options.tagline}.\n\nHow can we help you today?`;
}
