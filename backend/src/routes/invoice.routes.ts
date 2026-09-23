import { Router } from "express";
import * as invoiceController from "../controllers/invoice.controller";
import { validateBody } from "../middleware/validate";
import { updateInvoiceSchema } from "../validators/invoice.validators";
import { authenticate, requireRole } from "../middleware/auth";

export const invoiceRouter = Router();

// Staff-only list for the Sales page. Every role can see it (anyone can
// resend a bill); editing and cancelling are admin-only below.
invoiceRouter.get("/", authenticate, invoiceController.listInvoices);

// Must come before "/:invoiceNumber", which otherwise swallows "export" as
// an invoice number (it's a single-segment catch-all).
invoiceRouter.get("/export", authenticate, requireRole("admin"), invoiceController.exportInvoices);

// Public — customers look up their own invoice by number, no login required.
invoiceRouter.get("/:invoiceNumber", invoiceController.getInvoice);
invoiceRouter.get("/:invoiceNumber/barcode", invoiceController.getInvoiceBarcode);
invoiceRouter.get("/:invoiceNumber/pdf", invoiceController.getInvoicePdf);

// Admin corrections to a completed sale.
invoiceRouter.patch(
  "/:invoiceNumber",
  authenticate,
  requireRole("admin"),
  validateBody(updateInvoiceSchema),
  invoiceController.updateInvoice,
);
// "Delete" = cancel: stock is returned and the bill leaves reports, but the record stays.
invoiceRouter.post("/:invoiceNumber/cancel", authenticate, requireRole("admin"), invoiceController.cancelInvoice);

// Any signed-in staff can (re)send a bill on WhatsApp. Still auth-gated
// because each send is a billable Meta API call; the controller adds a short
// per-bill cooldown against accidental double-sends.
invoiceRouter.post("/:invoiceNumber/send-whatsapp", authenticate, invoiceController.sendWhatsapp);
invoiceRouter.post(
  "/:invoiceNumber/send-email",
  authenticate,
  requireRole("admin", "sales"),
  invoiceController.sendEmail,
);
