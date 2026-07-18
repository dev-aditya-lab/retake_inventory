import { PRODUCT_SKU_CODES, TYPE_SKU_CODES } from "../config/skuScheme";
import type { ProductType } from "../config/barcodeScheme";
import { ApiError } from "./ApiError";

/** Builds a Retake SKU like RTK-TUR-WH-025 from product name/type/weight. */
export function buildSku(productName: string, type: ProductType, weightLabel: string): string {
  const productCode = PRODUCT_SKU_CODES[productName];
  if (!productCode) {
    throw ApiError.badRequest(`"${productName}" has no SKU code — add it to backend/src/config/skuScheme.ts first`);
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

  return `RTK-${productCode}-${typeCode}-${weightCode}`;
}
