import type { Request, Response } from "express";
import * as cartService from "../services/cart.service";
import * as invoiceService from "../services/invoice.service";
import { ApiError } from "../utils/ApiError";
import { summarizePayment } from "../utils/payments";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export async function createCart(req: Request, res: Response): Promise<void> {
  const cart = await cartService.createCart(requireUserId(req));
  res.status(201).json({ success: true, data: await cartService.withPreview(cart) });
}

export async function listCarts(req: Request, res: Response): Promise<void> {
  const carts = await cartService.listCarts(requireUserId(req));
  res.json({ success: true, data: await Promise.all(carts.map(cartService.withPreview)) });
}

export async function getCart(req: Request, res: Response): Promise<void> {
  const cart = await cartService.getCart(requireUserId(req), req.params.id as string);
  res.json({ success: true, data: await cartService.withPreview(cart) });
}

export async function updateCart(req: Request, res: Response): Promise<void> {
  const cart = await cartService.updateCartDetails(requireUserId(req), req.params.id as string, req.body);
  res.json({ success: true, data: await cartService.withPreview(cart) });
}

export async function discardCart(req: Request, res: Response): Promise<void> {
  await cartService.discardCart(requireUserId(req), req.params.id as string);
  res.json({ success: true, data: null });
}

export async function addItem(req: Request, res: Response): Promise<void> {
  const cart = await cartService.addItem(requireUserId(req), req.params.id as string, req.body);
  res.json({ success: true, data: await cartService.withPreview(cart) });
}

export async function updateItem(req: Request, res: Response): Promise<void> {
  const cart = await cartService.updateItemQuantity(
    requireUserId(req),
    req.params.id as string,
    req.params.productId as string,
    req.body.quantity,
  );
  res.json({ success: true, data: await cartService.withPreview(cart) });
}

export async function removeItem(req: Request, res: Response): Promise<void> {
  const cart = await cartService.removeItem(requireUserId(req), req.params.id as string, req.params.productId as string);
  res.json({ success: true, data: await cartService.withPreview(cart) });
}

export async function checkout(req: Request, res: Response): Promise<void> {
  const invoice = await invoiceService.checkout(requireUserId(req), req.params.id as string);
  res.status(201).json({ success: true, data: invoice && { ...invoice.toJSON(), payment: summarizePayment(invoice) } });
}
