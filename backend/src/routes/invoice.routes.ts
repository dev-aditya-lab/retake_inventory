import { Router } from "express";
import * as invoiceController from "../controllers/invoice.controller";
import { authenticate, requireRole } from "../middleware/auth";

export const invoiceRouter = Router();

// Public — customers look up their own invoice by number, no login required.
invoiceRouter.get("/:invoiceNumber", invoiceController.getInvoice);
invoiceRouter.get("/:invoiceNumber/barcode", invoiceController.getInvoiceBarcode);
invoiceRouter.get("/:invoiceNumber/pdf", invoiceController.getInvoicePdf);

// Staff-only — sending a WhatsApp/email message is a billable/abuse-prone action.
invoiceRouter.post(
  "/:invoiceNumber/send-whatsapp",
  authenticate,
  requireRole("admin", "sales"),
  invoiceController.sendWhatsapp,
);
invoiceRouter.post(
  "/:invoiceNumber/send-email",
  authenticate,
  requireRole("admin", "sales"),
  invoiceController.sendEmail,
);
