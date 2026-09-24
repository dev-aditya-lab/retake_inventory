import { Router } from "express";
import * as cartController from "../controllers/cart.controller";
import * as nonGstBillController from "../controllers/nonGstBill.controller";
import { validateBody } from "../middleware/validate";
import { addCartItemSchema, updateCartItemSchema, updateCartSchema } from "../validators/cart.validators";
import { authenticate, requireRole } from "../middleware/auth";

export const cartRouter = Router();

// Billing is a sales-floor function — admins and sales staff only.
cartRouter.use(authenticate, requireRole("admin", "sales"));

cartRouter.post("/", cartController.createCart);
cartRouter.get("/", cartController.listCarts);
cartRouter.get("/:id", cartController.getCart);
cartRouter.patch("/:id", validateBody(updateCartSchema), cartController.updateCart);
cartRouter.delete("/:id", cartController.discardCart);

cartRouter.post("/:id/items", validateBody(addCartItemSchema), cartController.addItem);
cartRouter.patch("/:id/items/:productId", validateBody(updateCartItemSchema), cartController.updateItem);
cartRouter.delete("/:id/items/:productId", cartController.removeItem);

cartRouter.post("/:id/checkout", cartController.checkout);
// A cart set to "GST not applicable" checks out here instead — separate bill, number series and records.
cartRouter.post("/:id/checkout-non-gst", nonGstBillController.checkout);
