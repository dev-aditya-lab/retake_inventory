import { z } from "zod";
import { PAYMENT_KINDS, PAYMENT_METHODS } from "../models/paymentSchemas";
import { PAYMENT_FILTERS } from "../utils/payments";

/** ?payment=due|unpaid|partial|paid|overdue|refund_due on a bills list. */
export const paymentFilterSchema = z.enum(PAYMENT_FILTERS);

/** Body for recording a payment (advance, part-payment, the rest) or a refund against a bill. */
export const recordPaymentSchema = z.object({
  amount: z.number().positive("Enter an amount greater than zero").max(100_000_000),
  method: z.enum(PAYMENT_METHODS),
  kind: z.enum(PAYMENT_KINDS).optional(),
  // When the money changed hands. Left out = now.
  receivedAt: z.string().datetime({ message: "That payment date isn't valid" }).optional(),
  note: z.string().trim().max(200).optional(),
});

/** Body for setting the day the balance is expected by; null clears it. */
export const dueDateSchema = z.object({
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-15")
    .nullable(),
});
