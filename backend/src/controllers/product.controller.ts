import type { Request, Response } from "express";
import * as productService from "../services/product.service";
import { ApiError } from "../utils/ApiError";
import type { ProductType } from "../config/barcodeScheme";

export async function createProduct(req: Request, res: Response): Promise<void> {
  const product = await productService.createProduct(req.body);
  res.status(201).json({ success: true, data: product });
}

export async function listProducts(req: Request, res: Response): Promise<void> {
  const { search, category, type, lowStockOnly } = req.query;
  const products = await productService.listProducts({
    search: typeof search === "string" ? search : undefined,
    category: typeof category === "string" ? category : undefined,
    type: typeof type === "string" ? (type as ProductType) : undefined,
    lowStockOnly: lowStockOnly === "true",
  });
  res.json({ success: true, data: products });
}

export async function getProduct(req: Request, res: Response): Promise<void> {
  const product = await productService.getProductById(req.params.id as string);
  res.json({ success: true, data: product });
}

export async function getProductByBarcode(req: Request, res: Response): Promise<void> {
  const product = await productService.getProductByBarcode(req.params.ean13 as string);
  res.json({ success: true, data: product });
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  const product = await productService.updateProduct(req.params.id as string, req.body);
  res.json({ success: true, data: product });
}

export async function adjustStock(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const product = await productService.adjustStock(req.params.id as string, req.user.id, req.body);
  res.json({ success: true, data: product });
}
