import { describe, expect, it } from "vitest";
import { ApiError } from "./ApiError";
import { parseIstDay, istDayKey } from "./istDate";
import {
  DAY_MS,
  MAX_PAYMENTS_PER_BILL,
  amountPayable,
  netReceived,
  summarizePayment,
  syncPaymentTotals,
  validateNewPayment,
  type PaymentTracked,
} from "./payments";

const NOW = new Date("2026-09-24T10:00:00.000Z");
const bill = (over: Partial<Parameters<typeof summarizePayment>[0]> = {}) => ({ grandTotal: 1000, amountPaid: 0, status: "paid", ...over });
const failsWith = (fn: () => unknown, message: RegExp) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toMatch(message);
    return;
  }
  throw new Error("expected it to throw");
};

describe("netReceived", () => {
  it("adds payments and takes off refunds", () => {
    expect(netReceived([])).toBe(0);
    expect(netReceived([{ kind: "payment", amount: 500 }, { kind: "payment", amount: 250.5 }, { kind: "refund", amount: 100 }])).toBe(650.5);
  });
  it("doesn't drift on paise", () => {
    expect(netReceived([{ kind: "payment", amount: 0.1 }, { kind: "payment", amount: 0.2 }])).toBe(0.3);
  });
});

describe("amountPayable", () => {
  it("is the bill total less credit notes", () => {
    expect(amountPayable({ grandTotal: 1000 })).toBe(1000);
    expect(amountPayable({ grandTotal: 1000, creditedTotal: 300 })).toBe(700);
  });
  it("is nothing once the bill is cancelled, and never negative", () => {
    expect(amountPayable({ grandTotal: 1000, status: "void" })).toBe(0);
    expect(amountPayable({ grandTotal: 1000, creditedTotal: 1200 })).toBe(0);
  });
});

describe("summarizePayment — the status a bill shows", () => {
  it("unpaid: nothing received", () => {
    expect(summarizePayment(bill(), NOW)).toMatchObject({ paymentStatus: "unpaid", balanceDue: 1000, refundDue: 0, amountPaid: 0 });
  });
  it("partial: an advance or part-payment was received", () => {
    expect(summarizePayment(bill({ amountPaid: 400 }), NOW)).toMatchObject({ paymentStatus: "partial", balanceDue: 600 });
  });
  it("paid: the balance is exactly cleared", () => {
    expect(summarizePayment(bill({ amountPaid: 1000 }), NOW)).toMatchObject({ paymentStatus: "paid", balanceDue: 0, refundDue: 0 });
  });
  it("credit notes cut what is owed: paid 700 against a 1000 bill with 300 returned is settled", () => {
    expect(summarizePayment(bill({ amountPaid: 700, creditedTotal: 300 }), NOW)).toMatchObject({ paymentStatus: "paid", balanceDue: 0 });
  });
  it("refund_due: the customer paid more than is now payable", () => {
    expect(summarizePayment(bill({ amountPaid: 1000, creditedTotal: 300 }), NOW)).toMatchObject({ paymentStatus: "refund_due", refundDue: 300 });
  });
  it("a cancelled bill that had been paid needs a refund; one never paid is simply closed", () => {
    expect(summarizePayment(bill({ status: "void", amountPaid: 250 }), NOW)).toMatchObject({ paymentStatus: "refund_due", refundDue: 250, balanceDue: 0 });
    expect(summarizePayment(bill({ status: "void", amountPaid: 0 }), NOW)).toMatchObject({ paymentStatus: "paid", balanceDue: 0, refundDue: 0 });
  });
  it("ignores sub-paisa rounding noise", () => {
    expect(summarizePayment(bill({ grandTotal: 100.1, amountPaid: 100.1 }), NOW).paymentStatus).toBe("paid");
    expect(summarizePayment(bill({ grandTotal: 0.3, amountPaid: 0.1 + 0.2 }), NOW).paymentStatus).toBe("paid");
  });
});

describe("overdue", () => {
  const due = new Date("2026-09-20T00:00:00+05:30");
  it("is only true once the due DAY has fully passed", () => {
    expect(summarizePayment(bill({ dueDate: due }), new Date(due.getTime() + DAY_MS - 1)).overdue).toBe(false); // still the due day
    expect(summarizePayment(bill({ dueDate: due }), new Date(due.getTime() + DAY_MS)).overdue).toBe(true);
  });
  it("never applies to a bill with nothing owed, or with no due date", () => {
    expect(summarizePayment(bill({ dueDate: due, amountPaid: 1000 }), NOW).overdue).toBe(false);
    expect(summarizePayment(bill(), NOW).overdue).toBe(false);
  });
});

describe("validateNewPayment", () => {
  it("accepts a part-payment and rounds to paise", () => {
    const entry = validateNewPayment(bill(), { amount: 400.004, method: "upi", note: "  advance " }, NOW);
    expect(entry).toMatchObject({ kind: "payment", amount: 400, method: "upi", note: "advance" });
    expect(entry.receivedAt).toEqual(NOW);
  });
  it("accepts exactly the balance, but not a paisa more", () => {
    expect(() => validateNewPayment(bill({ amountPaid: 400 }), { amount: 600, method: "cash" }, NOW)).not.toThrow();
    failsWith(() => validateNewPayment(bill({ amountPaid: 400 }), { amount: 600.01, method: "cash" }, NOW), /Only ₹600 is due/);
  });
  it("refuses a payment on a settled or cancelled bill", () => {
    failsWith(() => validateNewPayment(bill({ amountPaid: 1000 }), { amount: 1, method: "cash" }, NOW), /Nothing is due/);
    failsWith(() => validateNewPayment(bill({ status: "void" }), { amount: 1, method: "cash" }, NOW), /cancelled/);
  });
  it("refuses zero, negative and NaN amounts", () => {
    for (const amount of [0, -5, NaN, 0.001]) failsWith(() => validateNewPayment(bill(), { amount, method: "cash" }, NOW), /greater than zero/);
  });
  it("refuses an unknown method", () => {
    failsWith(() => validateNewPayment(bill(), { amount: 10, method: "barter" as never }, NOW), /how it was paid/);
  });
  it("accepts a past date but not a future one", () => {
    expect(() => validateNewPayment(bill(), { amount: 10, method: "cash", receivedAt: new Date(NOW.getTime() - 3 * DAY_MS) }, NOW)).not.toThrow();
    failsWith(() => validateNewPayment(bill(), { amount: 10, method: "cash", receivedAt: new Date(NOW.getTime() + 2 * DAY_MS) }, NOW), /future/);
    failsWith(() => validateNewPayment(bill(), { amount: 10, method: "cash", receivedAt: new Date("nope") }, NOW), /isn't valid/);
  });
  it("refunds: only what has actually been overpaid", () => {
    const overpaid = bill({ amountPaid: 1000, creditedTotal: 300 }); // owes 700, paid 1000 → 300 back
    expect(() => validateNewPayment(overpaid, { kind: "refund", amount: 300, method: "cash" }, NOW)).not.toThrow();
    failsWith(() => validateNewPayment(overpaid, { kind: "refund", amount: 300.5, method: "cash" }, NOW), /at most ₹300/);
    failsWith(() => validateNewPayment(bill({ amountPaid: 400 }), { kind: "refund", amount: 50, method: "cash" }, NOW), /nothing to refund/);
  });
  it("a cancelled bill takes a refund of what was paid", () => {
    expect(() => validateNewPayment(bill({ status: "void", amountPaid: 250 }), { kind: "refund", amount: 250, method: "upi" }, NOW)).not.toThrow();
  });
  it("caps the number of entries", () => {
    const many = Array.from({ length: MAX_PAYMENTS_PER_BILL }, () => ({}));
    failsWith(() => validateNewPayment({ ...bill(), payments: many }, { amount: 1, method: "cash" }, NOW), /at most/);
  });
});

describe("syncPaymentTotals", () => {
  const doc = (payments: PaymentTracked["payments"]): PaymentTracked => ({ grandTotal: 1000, amountPaid: 0, payments });
  it("stores the net amount and the FIRST payment's method", () => {
    const d = doc([
      { kind: "payment", amount: 300, method: "upi", receivedAt: new Date("2026-09-25") },
      { kind: "payment", amount: 200, method: "cash", receivedAt: new Date("2026-09-24") },
      { kind: "refund", amount: 50, method: "cash", receivedAt: new Date("2026-09-26") },
    ]);
    syncPaymentTotals(d);
    expect(d.amountPaid).toBe(450);
    expect(d.paymentMethod).toBe("cash"); // 24 Sep came first
  });
  it("clears everything when there are no payments", () => {
    const d = doc([]);
    d.paymentMethod = "cash";
    d.amountPaid = 99;
    syncPaymentTotals(d);
    expect(d.amountPaid).toBe(0);
    expect(d.paymentMethod).toBeUndefined();
  });
});

describe("India-day helpers for due dates", () => {
  it("parses a day to midnight India time", () => {
    expect(parseIstDay("2026-10-15")?.toISOString()).toBe("2026-10-14T18:30:00.000Z");
  });
  it("rejects things that aren't real days", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "15-10-2026", "", "2026-10-1"]) expect(parseIstDay(bad)).toBeNull();
  });
  it("round-trips through istDayKey", () => {
    expect(istDayKey(parseIstDay("2026-10-15")!)).toBe("2026-10-15");
    expect(istDayKey(new Date("2026-09-24T20:00:00Z"))).toBe("2026-09-25"); // 1:30 AM IST the next day
  });
});
