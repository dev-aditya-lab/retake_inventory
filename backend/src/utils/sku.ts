import { SKU_PREFIX, TYPE_SKU_CODES } from "../config/skuScheme";
import type { ProductType } from "../config/barcodeScheme";
import { ApiError } from "./ApiError";

/**
 * Builds a Retake SKU like RTK-TUR-WH-025 from a catalog SKU code
 * (e.g. "TUR" for Turmeric), the product type and its weight label.
 */
export function buildSku(skuCode: string, type: ProductType, weightLabel: string): string {
  if (!skuCode) {
    throw ApiError.badRequest("A SKU code is required to build a SKU");
  }

  const typeCode = TYPE_SKU_CODES[type];
  if (!typeCode) {
    throw ApiError.badRequest(`Unknown product type "${type}"`);
  }

  const weightMatch = /^(\d+)g$/.exec(weightLabel);
  if (!weightMatch) {
    throw ApiError.badRequest(`Unrecognized weight label "${weightLabel}"`);
  }
  const weightCode = weightMatch[1]!.padStart(3, "0");

  return `${SKU_PREFIX}-${skuCode.toUpperCase()}-${typeCode}-${weightCode}`;
}

/**
 * Swaps the product segment of an auto-built SKU when its catalog SKU code is
 * renamed (RTK-OLD-WH-025 -> RTK-NEW-WH-025). Returns null for a SKU that
 * doesn't follow the RTK-{code}- pattern — e.g. a hand-typed one — so the
 * caller leaves it untouched.
 */
export function replaceSkuCode(sku: string, oldCode: string, newCode: string): string | null {
  const oldPrefix = `${SKU_PREFIX}-${oldCode.toUpperCase()}-`;
  if (!sku.toUpperCase().startsWith(oldPrefix)) return null;
  return `${SKU_PREFIX}-${newCode.toUpperCase()}-${sku.slice(oldPrefix.length)}`;
}
