import { Router } from "express";
import * as nonGstBillController from "../controllers/nonGstBill.controller";
import { validateBody } from "../middleware/validate";
import { updateNonGstBillSchema } from "../validators/nonGstBill.validators";
import { dueDateSchema, recordPaymentSchema } from "../validators/payment.validators";
import { authenticate, requireRole } from "../middleware/auth";

export const nonGstBillRouter = Router();

// The non-GST section of the admin panel. Checkout itself lives with the other
// billing-counter routes (POST /api/carts/:id/checkout-non-gst).
nonGstBillRouter.get("/", authenticate, requireRole("admin"), nonGstBillController.listBills);

// Must come before "/:billNumber", which otherwise swallows "export" as a bill number.
nonGstBillRouter.get("/export", authenticate, requireRole("admin"), nonGstBillController.exportBills);

// Public — customers open their own bill by number from the link they were sent, no login.
nonGstBillRouter.get("/:billNumber", nonGstBillController.getBill);
nonGstBillRouter.get("/:billNumber/pdf", nonGstBillController.getBillPdf);

// Admin corrections. No GST filing to lock a bill, so these work until it's cancelled.
nonGstBillRouter.patch(
  "/:billNumber",
  authenticate,
  requireRole("admin"),
  validateBody(updateNonGstBillSchema),
  nonGstBillController.updateBill,
);
nonGstBillRouter.post("/:billNumber/cancel", authenticate, requireRole("admin"), nonGstBillController.cancelBill);

// Money received against a bill (advance, part-payments, the rest, or a refund) — same rules as invoices.
nonGstBillRouter.post(
  "/:billNumber/payments",
  authenticate,
  requireRole("admin", "sales"),
  validateBody(recordPaymentSchema),
  nonGstBillController.recordPayment,
);
nonGstBillRouter.delete("/:billNumber/payments/:paymentId", authenticate, requireRole("admin"), nonGstBillController.deletePayment);
nonGstBillRouter.patch(
  "/:billNumber/due-date",
  authenticate,
  requireRole("admin", "sales"),
  validateBody(dueDateSchema),
  nonGstBillController.setDueDate,
);

// Sending is a billable Meta API call, so it's auth-gated; the controller adds a short per-bill cooldown.
nonGstBillRouter.post("/:billNumber/send-whatsapp", authenticate, requireRole("admin", "sales"), nonGstBillController.sendWhatsapp);
nonGstBillRouter.post("/:billNumber/send-email", authenticate, requireRole("admin", "sales"), nonGstBillController.sendEmail);
