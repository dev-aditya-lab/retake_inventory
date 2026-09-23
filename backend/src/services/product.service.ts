import { Product, type ProductDoc } from "../models/Product.model";
import { StockMovement } from "../models/StockMovement.model";
import { buildEan12, computeEan13CheckDigit, isValidEan13 } from "../utils/barcode";
import { buildSku } from "../utils/sku";
import { escapeRegex } from "../utils/regex";
import { ApiError } from "../utils/ApiError";
import { isDuplicateKeyError } from "../utils/mongoErrors";
import { DEFAULT_VARIANT, type ProductType } from "../config/barcodeScheme";
import * as catalogCodeService from "./catalogCode.service";

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

/** Looks up a spice in the SKU code list, with the error an admin can act on. */
async function requireCatalogCode(name: string) {
  const code = await catalogCodeService.findCatalogCodeByName(name);
  if (!code) {
    throw ApiError.badRequest(
      `"${name}" isn't in the SKU code list yet — add it on the SKU codes page first, or scan/provide an explicit barcode for a non-Retake product`,
    );
  }
  return code;
}

function duplicateProductError(err: unknown): unknown {
  if (!isDuplicateKeyError(err)) return err;
  return ApiError.conflict("A product with this name, type and weight (or this SKU/barcode) already exists");
}

export async function createProduct(input: CreateProductInput) {
  let name = input.name.trim();
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
    const code = await requireCatalogCode(name);
    name = code.name; // canonical spelling from the code list
    productId = code.productId;
    ean12 = buildEan12({ productId, type: input.type, weightLabel: input.weightLabel, variant: input.variant });
    ean13 = ean12 + computeEan13CheckDigit(ean12);
    barcodeSource = "generated";
    if (!sku) {
      sku = buildSku(code.skuCode, input.type, input.weightLabel);
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

  try {
    return await Product.create({ ...input, name, sku, productId, ean12, ean13, barcodeSource });
  } catch (err) {
    throw duplicateProductError(err);
  }
}

export type ProductStatusFilter = "active" | "inactive" | "all";

export interface ProductListFilters {
  search?: string;
  category?: string;
  type?: ProductType;
  lowStockOnly?: boolean;
  status?: ProductStatusFilter;
}

export async function listProducts(filters: ProductListFilters) {
  const query: Record<string, unknown> = {};
  const status = filters.status ?? "active";
  if (status !== "all") query.isActive = status === "active";

  if (filters.search) {
    const pattern = escapeRegex(filters.search);
    query.$or = [
      { name: { $regex: pattern, $options: "i" } },
      { sku: { $regex: pattern, $options: "i" } },
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

/** Fields that define what a product *is* (and so its barcode/SKU) — admin-only to change. */
export const IDENTITY_FIELDS = ["name", "type", "weightLabel", "sku", "barcode"] as const;

export interface UpdateProductInput {
  name?: string;
  type?: ProductType;
  weightLabel?: string;
  sku?: string;
  /** Only for external products — Retake products' barcodes are derived from name/type/weight. */
  barcode?: string;
  category?: string;
  hsnCode?: string;
  image?: string;
  costPrice?: number;
  sellingPrice?: number;
  lowStockThreshold?: number;
  note?: string;
  isActive?: boolean;
}

/** The SKU the scheme would have produced for the product as it is now, or null if it can't be built. */
async function currentAutoSku(product: ProductDoc): Promise<string | null> {
  if (product.productId === undefined || product.productId === null) return null;
  const code = await catalogCodeService.findCatalogCodeByProductId(product.productId);
  if (!code) return null;
  try {
    return buildSku(code.skuCode, product.type, product.weightLabel);
  } catch {
    return null;
  }
}

/**
 * Updates a product. Changing a Retake product's name, type or weight gives
 * it a new EAN-13 (the barcode encodes them), and its SKU follows along if it
 * was the auto-built one. A hand-set SKU is left as-is unless a new one is sent.
 */
export async function updateProduct(id: string, updates: UpdateProductInput) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound("Product not found");

  const { name, type, weightLabel, sku, barcode, ...plainFields } = updates;
  const nextName = name?.trim() ?? product.name;
  const nextType = type ?? product.type;
  const nextWeight = weightLabel ?? product.weightLabel;
  const identityChanged = nextName !== product.name || nextType !== product.type || nextWeight !== product.weightLabel;

  if (barcode !== undefined && barcode !== product.ean13) {
    if (product.barcodeSource === "generated") {
      throw ApiError.badRequest(
        "Retake products' barcodes come from their name, type and weight — change those instead",
      );
    }
    if (!isValidEan13(barcode)) throw ApiError.badRequest(`"${barcode}" is not a valid EAN-13 barcode`);
    const clash = await Product.findOne({ ean13: barcode, _id: { $ne: id } });
    if (clash) throw ApiError.conflict(`Barcode ${barcode} is already used by ${clash.name}`);
    product.ean13 = barcode;
  }

  let nextSku = sku?.trim().toUpperCase();

  if (identityChanged && product.barcodeSource === "generated") {
    const autoSkuBefore = await currentAutoSku(product);
    const code = await requireCatalogCode(nextName);
    const variant = product.ean12?.slice(10, 12) || DEFAULT_VARIANT;
    const ean12 = buildEan12({ productId: code.productId, type: nextType, weightLabel: nextWeight, variant });
    const ean13 = ean12 + computeEan13CheckDigit(ean12);

    if (ean13 !== product.ean13) {
      const clash = await Product.findOne({ ean13, _id: { $ne: id } });
      if (clash) throw ApiError.conflict(`${clash.name} ${clash.type} ${clash.weightLabel} already has that barcode`);
    }

    product.productId = code.productId;
    product.ean12 = ean12;
    product.ean13 = ean13;
    product.name = code.name;
    if (!nextSku && autoSkuBefore && product.sku === autoSkuBefore) {
      nextSku = buildSku(code.skuCode, nextType, nextWeight);
    }
  } else if (name !== undefined) {
    product.name = nextName;
  }
  product.type = nextType;
  product.weightLabel = nextWeight;

  if (nextSku && nextSku !== product.sku) {
    const clash = await Product.findOne({ sku: nextSku, _id: { $ne: id } });
    if (clash) throw ApiError.conflict(`SKU "${nextSku}" is already used by ${clash.name}`);
    product.sku = nextSku;
  }

  product.set(plainFields);

  try {
    await product.save();
  } catch (err) {
    throw duplicateProductError(err);
  }
  return product;
}

/**
 * Permanently removes a product and its stock history. Past invoices are
 * unaffected — they keep their own copy of the product's name, HSN and price.
 */
export async function deleteProduct(id: string) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound("Product not found");

  await StockMovement.deleteMany({ product: product._id });
  await product.deleteOne();
}

/**
 * One-time data fix (see migrations): products created before `barcodeSource`
 * existed have no value stored. Retake-generated ones always carry an ean12;
 * anything without one can only have been scanned in as an external barcode.
 */
export async function backfillBarcodeSource(): Promise<number> {
  const [generated, external] = await Promise.all([
    Product.updateMany(
      { barcodeSource: { $exists: false }, ean12: { $exists: true, $nin: [null, ""] } },
      { $set: { barcodeSource: "generated" } },
    ),
    Product.updateMany(
      { barcodeSource: { $exists: false }, $or: [{ ean12: { $exists: false } }, { ean12: { $in: [null, ""] } }] },
      { $set: { barcodeSource: "external" } },
    ),
  ]);
  return generated.modifiedCount + external.modifiedCount;
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
