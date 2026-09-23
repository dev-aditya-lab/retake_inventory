import { Router } from "express";
import * as customerController from "../controllers/customer.controller";
import { validateBody } from "../middleware/validate";
import { updateCustomerSchema } from "../validators/customer.validators";
import { authenticate, requireRole } from "../middleware/auth";

export const customerRouter = Router();

customerRouter.use(authenticate);

// Billing counter: autofill a returning customer's details from their phone number.
// Must come before "/:id".
customerRouter.get("/lookup", requireRole("admin", "sales"), customerController.lookupCustomer);

const adminOnly = requireRole("admin");
customerRouter.get("/", adminOnly, customerController.listCustomers);
customerRouter.patch("/:id", adminOnly, validateBody(updateCustomerSchema), customerController.updateCustomer);
customerRouter.delete("/:id", adminOnly, customerController.deleteCustomer);
