import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOG_CODES } from "./defaultCatalogCodes";
import { MAX_PRODUCT_ID } from "./barcodeScheme";
import { SKU_CODE_PATTERN } from "./skuScheme";

interface CsvRow {
  Category: string;
  Product: string;
  "Product ID": string;
  SKU: string;
}

const rows: CsvRow[] = parse(readFileSync(path.resolve(__dirname, "../assets/product.csv"), "utf-8"), {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

describe("DEFAULT_CATALOG_CODES", () => {
  it("has unique names, SKU codes and barcode ids", () => {
    const unique = (values: unknown[]) => new Set(values).size === values.length;
    expect(unique(DEFAULT_CATALOG_CODES.map((c) => c.name.toLowerCase()))).toBe(true);
    expect(unique(DEFAULT_CATALOG_CODES.map((c) => c.skuCode))).toBe(true);
    expect(unique(DEFAULT_CATALOG_CODES.map((c) => c.productId))).toBe(true);
  });

  it("only uses valid SKU codes and barcode ids", () => {
    for (const code of DEFAULT_CATALOG_CODES) {
      expect(code.skuCode).toMatch(SKU_CODE_PATTERN);
      expect(code.productId).toBeGreaterThanOrEqual(1);
      expect(code.productId).toBeLessThanOrEqual(MAX_PRODUCT_ID);
    }
  });

  it("matches every product in the seed product.csv (id, SKU prefix and category)", () => {
    const byName = new Map(DEFAULT_CATALOG_CODES.map((c) => [c.name, c]));
    for (const row of rows) {
      const code = byName.get(row.Product);
      expect(code, `missing default code for ${row.Product}`).toBeDefined();
      expect(String(code!.productId)).toBe(row["Product ID"]);
      expect(row.SKU.startsWith(`RTK-${code!.skuCode}-`)).toBe(true);
      expect(code!.category).toBe(row.Category);
    }
  });
});
