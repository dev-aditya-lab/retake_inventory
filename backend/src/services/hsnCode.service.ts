import mongoose from "mongoose";
import { HsnCode } from "../models/HsnCode.model";
import { Product } from "../models/Product.model";
import { ApiError } from "../utils/ApiError";
import { isDuplicateKeyError } from "../utils/mongoErrors";

export interface HsnCodeInput {
  code: string;
  description?: string;
  gstRate?: number | null;
}

export async function listHsnCodes() {
  const [codes, counts] = await Promise.all([
    HsnCode.find().sort({ code: 1 }).lean(),
    Product.aggregate<{ _id: string; count: number }>([
      { $match: { hsnCode: { $nin: ["", null] } } },
      { $group: { _id: "$hsnCode", count: { $sum: 1 } } },
    ]),
  ]);
  const countByCode = new Map(counts.map((c) => [c._id, c.count]));
  return codes.map((c) => ({ ...c, productCount: countByCode.get(c.code) ?? 0 }));
}

/** `gstRate: null` means "clear the rate", which needs an explicit $unset. */
function buildHsnUpdate(input: Partial<HsnCodeInput>) {
  const set: Record<string, unknown> = {};
  if (input.code !== undefined) set.code = input.code;
  if (input.description !== undefined) set.description = input.description;
  if (typeof input.gstRate === "number") set.gstRate = input.gstRate;

  return {
    ...(Object.keys(set).length > 0 ? { $set: set } : {}),
    ...(input.gstRate === null ? { $unset: { gstRate: 1 as const } } : {}),
  };
}

export async function createHsnCode(input: HsnCodeInput) {
  const existing = await HsnCode.findOne({ code: input.code });
  if (existing) throw ApiError.conflict(`HSN code ${input.code} is already in the list`);

  try {
    return await HsnCode.create({
      code: input.code,
      description: input.description ?? "",
      ...(typeof input.gstRate === "number" ? { gstRate: input.gstRate } : {}),
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw ApiError.conflict(`HSN code ${input.code} is already in the list`);
    throw err;
  }
}

/**
 * Updates an HSN entry. Changing the code itself also updates every product
 * carrying the old code, so the catalog stays consistent. Past invoices keep
 * the code they were billed with.
 */
export async function updateHsnCode(id: string, input: Partial<HsnCodeInput>) {
  const hsn = await HsnCode.findById(id);
  if (!hsn) throw ApiError.notFound("HSN code not found");

  const oldCode = hsn.code;
  const codeChanged = input.code !== undefined && input.code !== oldCode;
  if (codeChanged) {
    const clash = await HsnCode.findOne({ code: input.code, _id: { $ne: id } });
    if (clash) throw ApiError.conflict(`HSN code ${input.code} is already in the list`);
  }

  const session = await mongoose.startSession();
  let productsUpdated = 0;
  try {
    await session.withTransaction(async () => {
      productsUpdated = 0;
      await HsnCode.updateOne({ _id: id }, buildHsnUpdate(input), { session, runValidators: true });

      if (codeChanged) {
        const result = await Product.updateMany({ hsnCode: oldCode }, { hsnCode: input.code }, { session });
        productsUpdated = result.modifiedCount;
      }
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw ApiError.conflict(`HSN code ${input.code} is already in the list`);
    throw err;
  } finally {
    await session.endSession();
  }

  return { code: await HsnCode.findById(id), productsUpdated };
}

export async function deleteHsnCode(id: string) {
  const hsn = await HsnCode.findById(id);
  if (!hsn) throw ApiError.notFound("HSN code not found");

  const inUse = await Product.countDocuments({ hsnCode: hsn.code });
  if (inUse > 0) {
    throw ApiError.badRequest(
      `${inUse} product(s) still use HSN ${hsn.code} — change their HSN code first, then delete it`,
    );
  }

  await hsn.deleteOne();
}

/** One-time seed (see migrations): lists every HSN code already on a product, so nothing in use is missing. */
export async function seedHsnCodesFromProducts(): Promise<number> {
  const codes = (await Product.distinct("hsnCode")) as string[];
  let inserted = 0;
  for (const code of codes.map((c) => c?.trim()).filter((c): c is string => !!c)) {
    const result = await HsnCode.updateOne({ code }, { $setOnInsert: { code, description: "" } }, { upsert: true });
    if (result.upsertedCount) inserted++;
  }
  return inserted;
}
