import {
  COUNTRY_CODE,
  DEFAULT_VARIANT,
  PRODUCT_CODES,
  TYPE_CODES,
  WEIGHT_CODES,
  type ProductType,
} from "../config/barcodeScheme";
import { ApiError } from "./ApiError";

/**
 * Standard EAN-13 "Modulo 10" check digit: sum digits at odd 1-indexed
 * positions x1, digits at even positions x3, take (10 - total % 10) % 10.
 * `digits12` must be exactly 12 numeric characters.
 */
export function computeEan13CheckDigit(digits12: string): string {
  if (!/^\d{12}$/.test(digits12)) {
    throw new Error(`computeEan13CheckDigit expects exactly 12 digits, got "${digits12}"`);
  }

  let total = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(digits12[i]);
    const isOddPosition = (i + 1) % 2 === 1;
    total += digit * (isOddPosition ? 1 : 3);
  }

  return String((10 - (total % 10)) % 10);
}

export interface BuildBarcodeInput {
  productName: string;
  type: ProductType;
  weightLabel: string;
  variant?: string;
}

/** Builds the 12-digit base code: 890 + CC + PPP + WW + VV. */
export function buildEan12({ productName, type, weightLabel, variant = DEFAULT_VARIANT }: BuildBarcodeInput): string {
  const typeCode = TYPE_CODES[type];
  if (!typeCode) {
    throw ApiError.badRequest(`Unknown product type "${type}"`);
  }

  const productId = PRODUCT_CODES[productName];
  if (productId === undefined) {
    throw ApiError.badRequest(`Unknown product "${productName}" — add it to barcodeScheme.PRODUCT_CODES first`);
  }
  const productCode = String(productId).padStart(3, "0");

  const weightCode = WEIGHT_CODES[weightLabel];
  if (!weightCode) {
    throw ApiError.badRequest(`Unknown weight "${weightLabel}"`);
  }

  if (!/^\d{2}$/.test(variant)) {
    throw ApiError.badRequest(`Variant must be a 2-digit code, got "${variant}"`);
  }

  return `${COUNTRY_CODE}${typeCode}${productCode}${weightCode}${variant}`;
}

/** Builds the full 13-digit EAN-13 barcode (12-digit base + check digit). */
export function buildEan13(input: BuildBarcodeInput): string {
  const ean12 = buildEan12(input);
  return ean12 + computeEan13CheckDigit(ean12);
}

/** Validates that a scanned/typed code is a well-formed EAN-13 with a correct check digit. */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const base = code.slice(0, 12);
  return computeEan13CheckDigit(base) === code[12];
}

export interface DecodedBarcode {
  type: ProductType;
  productName: string;
  productId: number;
  weightLabel: string;
  variant: string;
}

/** Reverses buildEan13: pulls the product/type/weight back out of a scanned Retake barcode. */
export function decodeEan13(code: string): DecodedBarcode {
  if (!isValidEan13(code)) {
    throw ApiError.badRequest(`"${code}" is not a valid EAN-13 barcode (bad length or check digit)`);
  }
  if (!code.startsWith(COUNTRY_CODE)) {
    throw ApiError.badRequest(`"${code}" doesn't use Retake's country prefix (${COUNTRY_CODE})`);
  }

  const typeCode = code.slice(3, 5);
  const productCode = code.slice(5, 8);
  const weightCode = code.slice(8, 10);
  const variant = code.slice(10, 12);

  const type = (Object.entries(TYPE_CODES).find(([, v]) => v === typeCode)?.[0] as ProductType | undefined);
  if (!type) {
    throw ApiError.badRequest(`"${code}" has an unrecognized type code "${typeCode}"`);
  }

  const productId = Number(productCode);
  const productName = Object.entries(PRODUCT_CODES).find(([, v]) => v === productId)?.[0];
  if (!productName) {
    throw ApiError.badRequest(`"${code}" has an unrecognized product code "${productCode}"`);
  }

  const weightLabel = Object.entries(WEIGHT_CODES).find(([, v]) => v === weightCode)?.[0];
  if (!weightLabel) {
    throw ApiError.badRequest(`"${code}" has an unrecognized weight code "${weightCode}"`);
  }

  return { type, productName, productId, weightLabel, variant };
}
