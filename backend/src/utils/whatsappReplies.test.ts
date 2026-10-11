import { describe, expect, it } from "vitest";
import {
  billStatusLabel,
  buildContactText,
  buildInvoicesText,
  buildMenuBody,
  buildPaymentText,
  buildPendingText,
  type BillSummary,
} from "./whatsappReplies";

function bill(overrides: Partial<BillSummary> = {}): BillSummary {
  return {
    number: "RTK-261010-0001",
    kind: "gst",
    date: new Date("2026-10-10T08:00:00.000Z"),
    total: 1250,
    status: "paid",
    payment: { balanceDue: 0, refundDue: 0, overdue: false, dueDate: null },
    ...overrides,
  };
}

describe("billStatusLabel", () => {
  it("says Paid when nothing is owed", () => {
    expect(billStatusLabel(bill())).toBe("Paid");
  });

  it("shows what is due, and whether it is overdue", () => {
    expect(billStatusLabel(bill({ payment: { balanceDue: 500, refundDue: 0, overdue: false, dueDate: null } }))).toBe("₹500 due");
    expect(billStatusLabel(bill({ payment: { balanceDue: 500, refundDue: 0, overdue: true, dueDate: null } }))).toBe("₹500 overdue");
  });

  it("covers refunds and credit notes", () => {
    expect(billStatusLabel(bill({ payment: { balanceDue: 0, refundDue: 100, overdue: false, dueDate: null } }))).toBe("Refund due");
    expect(billStatusLabel(bill({ status: "credited" }))).toBe("Credited");
  });
});

describe("buildInvoicesText", () => {
  const options = { links: true, baseUrl: "https://app.example.com", hasMore: false };

  it("lists number, date, amount, status and a document link", () => {
    const text = buildInvoicesText([bill()], options);
    expect(text).toContain("1. *RTK-261010-0001*");
    expect(text).toContain("10 Oct 2026 | ₹1,250 | Paid");
    expect(text).toContain("https://app.example.com/invoice/RTK-261010-0001");
  });

  it("leaves the links out when they are switched off", () => {
    expect(buildInvoicesText([bill()], { ...options, links: false })).not.toContain("http");
  });

  it("says 'latest' when there are older bills not shown", () => {
    expect(buildInvoicesText([bill()], { ...options, hasMore: true })).toContain("*Your latest bills*");
    expect(buildInvoicesText([bill()], options)).toContain("*Your recent bills*");
  });
});

describe("buildPendingText", () => {
  it("totals what is owed across bills and shows due dates", () => {
    const text = buildPendingText([
      bill({ number: "A-1", payment: { balanceDue: 300, refundDue: 0, overdue: true, dueDate: new Date("2026-10-01T00:00:00.000Z") } }),
      bill({ number: "A-2", payment: { balanceDue: 200.5, refundDue: 0, overdue: false, dueDate: null } }),
    ]);
    expect(text).toContain("*Pending payment: ₹500.5*");
    expect(text).toContain("*A-1*");
    expect(text).toContain("overdue, due by 1 Oct 2026");
  });

  it("collapses a long list", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      bill({ number: `A-${i}`, payment: { balanceDue: 10, refundDue: 0, overdue: false, dueDate: null } }),
    );
    expect(buildPendingText(many, 5)).toContain("and 3 more bill(s)");
  });
});

describe("other replies", () => {
  const payment = { accountName: "Acme", accountNumber: "123", ifsc: "IFSC0001", upiId: "acme@upi" };

  it("mentions the amount due only when something is due", () => {
    expect(buildPaymentText(payment, 0)).not.toContain("currently have");
    expect(buildPaymentText(payment, 750)).toContain("You currently have *₹750* due.");
  });

  it("names the staff member and last bill when known, otherwise gives the main number", () => {
    const text = buildContactText("Ravi", "RTK-1");
    expect(text).toContain("*RTK-1*");
    expect(text).toContain("was handled by *Ravi*");
    expect(buildContactText(null)).toContain("our contact number");
  });

  it("greets by name when the customer is known, and never includes a website", () => {
    const base = { companyName: "Retake", tagline: "Spice up your kitchen", unknown: false };
    expect(buildMenuBody({ ...base, customerName: "Ravi" })).toContain("Hello Ravi!");
    expect(buildMenuBody(base)).toContain("Hello!");
    expect(buildMenuBody(base)).not.toMatch(/https?:/);
    expect(buildMenuBody({ ...base, unknown: true })).toContain("team will reply");
  });
});
