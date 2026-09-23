// EAN-13 encoding scheme for Retake products, as specified in
// `.claude/project info/project.md`:
//   890 CC PPP WW VV  (12 digits) + 1 check digit = EAN-13
//   890 = India, CC = product type, PPP = product id, WW = weight id,
//   VV = variant (currently always "01", reserved for future use).
//
// The PPP product ids live in the database (CatalogCode model, managed from
// the admin "SKU codes" page) — see config/defaultCatalogCodes.ts for the
// starter list.
export const COUNTRY_CODE = "890";
export const DEFAULT_VARIANT = "01";

/** Highest product id the 3-digit PPP segment can hold. */
export const MAX_PRODUCT_ID = 999;

export type ProductType = "Whole" | "Powder" | "Blend";

export const TYPE_CODES: Record<ProductType, string> = {
  Whole: "11",
  Powder: "12",
  Blend: "13",
};

export const WEIGHT_CODES: Record<string, string> = {
  "25g": "01",
  "50g": "02",
  "100g": "03",
  "200g": "04",
  "250g": "05",
};
