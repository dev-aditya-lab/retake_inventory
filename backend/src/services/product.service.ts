import { Product } from "../models/Product.model";
import { StockMovement } from "../models/StockMovement.model";
import { buildEan12, computeEan13CheckDigit, isValidEan13 } from "../utils/barcode";
import { buildSku } from "../utils/sku";
import { ApiError } from "../utils/ApiError";
import type { ProductType } from "../config/barcodeScheme";
import { PRODUCT_CODES } from "../config/barcodeScheme";

export interface CreateProductInput {
  category: string;
  name: string;
  type: ProductType;
  weightLabel: string;
  variant?: string;
  /** A pre-existing barcode (e.g. scanned from a third-party product) — skips Retake's own EAN-13 generation. */
  barcode?: string;
  /** Required for external products (no reliable code mapping); auto-generated for Retake's own products if omitted. */
  sku?: string;
  hsnCode?: string;
  image?: string;
  costPrice?: number;
  sellingPrice?: number;
  quantityInStock?: number;
  lowStockThreshold?: number;
  note?: string;
}

export async function createProduct(input: CreateProductInput) {
  let productId: number | undefined;
  let ean12: string | undefined;
  let ean13: string;
  let barcodeSource: "generated" | "external";
  let sku = input.sku?.trim();

  if (input.barcode) {
    if (!isValidEan13(input.barcode)) {
      throw ApiError.badRequest(`"${input.barcode}" is not a valid EAN-13 barcode`);
    }
    if (!sku) {
      throw ApiError.badRequest("SKU is required for external (non-Retake-scheme) products");
    }
    ean13 = input.barcode;
    barcodeSource = "external";
  } else {
    productId = PRODUCT_CODES[input.name];
    if (productId === undefined) {
      throw ApiError.badRequest(
        `"${input.name}" is not in the barcode scheme yet — add it to backend/src/config/barcodeScheme.ts (PRODUCT_CODES), or scan/provide an explicit barcode for a non-Retake product`,
      );
    }
    ean12 = buildEan12({
      productName: input.name,
      type: input.type,
      weightLabel: input.weightLabel,
      variant: input.variant,
    });
    ean13 = ean12 + computeEan13CheckDigit(ean12);
    barcodeSource = "generated";
    if (!sku) {
      sku = buildSku(input.name, input.type, input.weightLabel);
    }
  }

  const existingSku = await Product.findOne({ sku: sku.toUpperCase() });
  if (existingSku) {
    throw ApiError.conflict(`SKU "${sku}" is already in use`);
  }
  const existingBarcode = await Product.findOne({ ean13 });
  if (existingBarcode) {
    throw ApiError.conflict(`A product with barcode ${ean13} already exists`);
  }

  return Product.create({ ...input, sku, productId, ean12, ean13, barcodeSource });
}

export interface ProductListFilters {
  search?: string;
  category?: string;
  type?: ProductType;
  lowStockOnly?: boolean;
}

export async function listProducts(filters: ProductListFilters) {
  const query: Record<string, unknown> = { isActive: true };

  if (filters.search) {
    query.$or = [
      { name: { $regex: filters.search, $options: "i" } },
      { sku: { $regex: filters.search, $options: "i" } },
      { ean13: filters.search },
    ];
  }
  if (filters.category) query.category = filters.category;
  if (filters.type) query.type = filters.type;
  if (filters.lowStockOnly) {
    query.$expr = { $lte: ["$quantityInStock", "$lowStockThreshold"] };
  }

  return Product.find(query).sort({ name: 1, weightLabel: 1 });
}

export async function getProductById(id: string) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound("Product not found");
  return product;
}

export async function getProductByBarcode(ean13: string) {
  const product = await Product.findOne({ ean13 });
  if (!product) throw ApiError.notFound(`No product found for barcode ${ean13}`);
  return product;
}

export async function updateProduct(id: string, updates: Record<string, unknown>) {
  const product = await Product.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  if (!product) throw ApiError.notFound("Product not found");
  return product;
}

export async function adjustStock(
  productId: string,
  userId: string,
  input: { quantityChange: number; type: "restock" | "adjustment" | "correction"; note?: string },
) {
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound("Product not found");

  const resultingQuantity = product.quantityInStock + input.quantityChange;
  if (resultingQuantity < 0) {
    throw ApiError.badRequest(
      `Cannot reduce stock by ${Math.abs(input.quantityChange)} — only ${product.quantityInStock} in stock`,
    );
  }

  product.quantityInStock = resultingQuantity;
  await product.save();

  await StockMovement.create({
    product: product.id,
    type: input.type,
    quantityChange: input.quantityChange,
    resultingQuantity,
    user: userId,
    note: input.note ?? "",
  });

  return product;
}
