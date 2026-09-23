import mongoose from "mongoose";
import { CatalogCode } from "../models/CatalogCode.model";
import { Product } from "../models/Product.model";
import { DEFAULT_CATALOG_CODES } from "../config/defaultCatalogCodes";
import { ApiError } from "../utils/ApiError";
import { isDuplicateKeyError } from "../utils/mongoErrors";
import { decodeEan13, type DecodedBarcode } from "../utils/barcode";
import { replaceSkuCode } from "../utils/sku";

// Must match the collation on CatalogCode's unique name index so lookups use it.
const NAME_COLLATION = { locale: "en", strength: 2 } as const;

// Products created before `barcodeSource` existed have no value stored (the
// schema default only applies when a document is loaded), so match on
// "not external" rather than "generated" to include them.
const GENERATED_BARCODE = { barcodeSource: { $ne: "external" as const } };

/** Products "belong" to a code through the barcode PPP id they were generated from. */
function linkedProductsFilter(productId: number) {
  return { ...GENERATED_BARCODE, productId };
}

export interface CatalogCodeInput {
  name: string;
  skuCode: string;
  productId: number;
  category?: string;
}

export async function listCatalogCodes() {
  const [codes, counts] = await Promise.all([
    CatalogCode.find().sort({ productId: 1 }).lean(),
    Product.aggregate<{ _id: number; count: number }>([
      { $match: { ...GENERATED_BARCODE, productId: { $exists: true, $ne: null } } },
      { $group: { _id: "$productId", count: { $sum: 1 } } },
    ]),
  ]);
  const countByProductId = new Map(counts.map((c) => [c._id, c.count]));
  return codes.map((code) => ({ ...code, productCount: countByProductId.get(code.productId) ?? 0 }));
}

export async function findCatalogCodeByName(name: string) {
  return CatalogCode.findOne({ name: name.trim() }).collation(NAME_COLLATION);
}

export async function findCatalogCodeByProductId(productId: number) {
  return CatalogCode.findOne({ productId });
}

/** Decodes a Retake barcode and resolves its PPP id to a product name from the code list. */
export async function decodeBarcode(ean13: string): Promise<DecodedBarcode & { productName: string }> {
  const decoded = decodeEan13(ean13);
  const code = await findCatalogCodeByProductId(decoded.productId);
  if (!code) {
    throw ApiError.badRequest(
      `"${ean13}" has product code ${String(decoded.productId).padStart(3, "0")}, which isn't in the SKU code list`,
    );
  }
  return { ...decoded, productName: code.name };
}

async function assertUnique(input: Partial<CatalogCodeInput>, excludeId?: string): Promise<void> {
  const notSelf = excludeId ? { _id: { $ne: excludeId } } : {};

  if (input.name !== undefined) {
    const clash = await CatalogCode.findOne({ name: input.name.trim(), ...notSelf }).collation(NAME_COLLATION);
    if (clash) throw ApiError.conflict(`"${clash.name}" is already in the SKU code list`);
  }
  if (input.skuCode !== undefined) {
    const clash = await CatalogCode.findOne({ skuCode: input.skuCode.toUpperCase(), ...notSelf });
    if (clash) throw ApiError.conflict(`SKU code "${clash.skuCode}" is already used by ${clash.name}`);
  }
  if (input.productId !== undefined) {
    const clash = await CatalogCode.findOne({ productId: input.productId, ...notSelf });
    if (clash) throw ApiError.conflict(`Barcode ID ${input.productId} is already used by ${clash.name}`);
  }
}

export async function createCatalogCode(input: CatalogCodeInput) {
  await assertUnique(input);
  try {
    return await CatalogCode.create(input);
  } catch (err) {
    if (isDuplicateKeyError(err)) throw ApiError.conflict("That name, SKU code or barcode ID was just taken — refresh and try again");
    throw err;
  }
}

/**
 * Updates a code and keeps the products built from it consistent:
 *  - name change    -> renames those products
 *  - SKU code change -> rewrites their auto-built SKUs (RTK-OLD-.. -> RTK-NEW-..)
 *  - barcode ID change -> refused while any product uses it, because their
 *    printed EAN-13 labels encode the old id and would stop scanning.
 */
export async function updateCatalogCode(id: string, input: Partial<CatalogCodeInput>) {
  const code = await CatalogCode.findById(id);
  if (!code) throw ApiError.notFound("SKU code not found");

  const linkedFilter = linkedProductsFilter(code.productId);
  const linkedCount = await Product.countDocuments(linkedFilter);

  const nameChanged = input.name !== undefined && input.name.trim() !== code.name;
  const skuCodeChanged = input.skuCode !== undefined && input.skuCode.toUpperCase() !== code.skuCode;
  const productIdChanged = input.productId !== undefined && input.productId !== code.productId;

  if (productIdChanged && linkedCount > 0) {
    throw ApiError.badRequest(
      `The barcode ID can't change while ${linkedCount} product(s) use it — their printed barcodes would stop scanning. Delete or move those products first.`,
    );
  }

  await assertUnique(
    {
      name: nameChanged ? input.name : undefined,
      skuCode: skuCodeChanged ? input.skuCode : undefined,
      productId: productIdChanged ? input.productId : undefined,
    },
    id,
  );

  // Work out the SKU rewrites up front so a clash is reported before anything is written.
  const skuRewrites: { id: unknown; sku: string }[] = [];
  if (skuCodeChanged && linkedCount > 0) {
    const products = await Product.find(linkedFilter).select("sku");
    for (const product of products) {
      const newSku = replaceSkuCode(product.sku, code.skuCode, input.skuCode!);
      if (newSku) skuRewrites.push({ id: product._id, sku: newSku });
    }
    const clash = await Product.findOne({
      sku: { $in: skuRewrites.map((r) => r.sku) },
      _id: { $nin: skuRewrites.map((r) => r.id) },
    });
    if (clash) throw ApiError.conflict(`SKU "${clash.sku}" is already used by another product`);
  }

  const session = await mongoose.startSession();
  let productsUpdated = 0;
  try {
    await session.withTransaction(async () => {
      productsUpdated = 0;
      const oldProductId = code.productId;

      if (input.name !== undefined) code.name = input.name.trim();
      if (input.skuCode !== undefined) code.skuCode = input.skuCode.toUpperCase();
      if (input.productId !== undefined) code.productId = input.productId;
      if (input.category !== undefined) code.category = input.category.trim();
      await code.save({ session });

      if (nameChanged && linkedCount > 0) {
        const result = await Product.updateMany(linkedProductsFilter(oldProductId), { name: code.name }, { session });
        productsUpdated = Math.max(productsUpdated, result.modifiedCount);
      }
      if (skuRewrites.length > 0) {
        await Product.bulkWrite(
          skuRewrites.map((r) => ({ updateOne: { filter: { _id: r.id }, update: { $set: { sku: r.sku } } } })),
          { session },
        );
        productsUpdated = Math.max(productsUpdated, skuRewrites.length);
      }
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw ApiError.conflict(
        "That change clashes with an existing product (same name, type and weight, or same SKU) — rename or remove it first",
      );
    }
    throw err;
  } finally {
    await session.endSession();
  }

  return { code, productsUpdated };
}

export async function deleteCatalogCode(id: string) {
  const code = await CatalogCode.findById(id);
  if (!code) throw ApiError.notFound("SKU code not found");

  const linkedCount = await Product.countDocuments(linkedProductsFilter(code.productId));
  if (linkedCount > 0) {
    throw ApiError.badRequest(
      `${linkedCount} product(s) still use ${code.name} — delete those products first, then remove the code`,
    );
  }

  await code.deleteOne();
}

/** One-time seed of the starter code list (see migrations). Skips any that already exist. */
export async function seedDefaultCatalogCodes(): Promise<number> {
  let inserted = 0;
  for (const entry of DEFAULT_CATALOG_CODES) {
    const result = await CatalogCode.updateOne(
      { productId: entry.productId },
      { $setOnInsert: entry },
      { upsert: true },
    ).catch((err: unknown) => {
      // Name or SKU code already taken by an admin-added entry — keep theirs.
      if (isDuplicateKeyError(err)) return null;
      throw err;
    });
    if (result?.upsertedCount) inserted++;
  }
  return inserted;
}
