// SKU scheme for Retake products. Format: RTK-{PRODUCT}-{TYPE}-{WEIGHT}
// e.g. Turmeric + Whole + 25g -> RTK-TUR-WH-025 (matches the seeded product.csv SKUs).
//
// The {PRODUCT} segment comes from the product's CatalogCode.skuCode in the
// database (managed from the admin "SKU codes" page).
import type { ProductType } from "./barcodeScheme";

export const SKU_PREFIX = "RTK";

/** Allowed shape for a catalog SKU code, e.g. "TUR". */
export const SKU_CODE_PATTERN = /^[A-Z0-9]{2,6}$/;

export const TYPE_SKU_CODES: Record<ProductType, string> = {
  Whole: "WH",
  Powder: "PW",
  Blend: "BL",
};
