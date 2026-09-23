import type { Request, Response } from "express";
import * as customerService from "../services/customer.service";
import { customerLookupQuerySchema, listCustomersQuerySchema } from "../validators/customer.validators";

// Express 5's req.query is getter-only, so query params are parsed inline
// (see report.controller) rather than through a validateQuery middleware.

export async function listCustomers(req: Request, res: Response): Promise<void> {
  const { search, page, limit } = listCustomersQuerySchema.parse(req.query);
  const result = await customerService.listCustomers({ search, page, limit });
  res.json({ success: true, data: result });
}

export async function lookupCustomer(req: Request, res: Response): Promise<void> {
  const { phone } = customerLookupQuerySchema.parse(req.query);
  const customer = await customerService.findCustomerByPhone(phone);
  res.json({ success: true, data: customer });
}

export async function updateCustomer(req: Request, res: Response): Promise<void> {
  const result = await customerService.updateCustomer(req.params.id as string, req.body);
  res.json({ success: true, data: result });
}

export async function deleteCustomer(req: Request, res: Response): Promise<void> {
  await customerService.deleteCustomer(req.params.id as string);
  res.json({ success: true, data: null });
}
