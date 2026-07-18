import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { connectDatabase, disconnectDatabase } from "../config/database";
import { Product } from "../models/Product.model";
import { computeEan13CheckDigit } from "../utils/barcode";
import { PRODUCT_CODES, type ProductType } from "../config/barcodeScheme";
import { logger } from "../config/logger";

interface ProductCsvRow {
  Category: string;
  Product: string;
  "Product ID": string;
  Type: string;
  Weight: string;
  SKU: string;
  "EAN-12": string;
}

const CSV_PATH = path.resolve(__dirname, "../../../.claude/project info/product.csv");

/**
 * Seeds the product catalog from `.claude/project info/product.csv`.
 * Prices, HSN code and image are left as placeholders — an admin fills them
 * in via the product edit UI, since the source spec doesn't provide them.
 * Safe to re-run: existing products (matched by ean13) are left untouched.
 *   npx tsx src/scripts/seedProducts.ts
 */
async function main() {
  const csvContent = readFileSync(CSV_PATH, "utf-8");
  const rows: ProductCsvRow[] = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });

  await connectDatabase();

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row.Product;
    const expectedProductId = PRODUCT_CODES[name];
    if (expectedProductId === undefined || String(expectedProductId) !== row["Product ID"]) {
      logger.warn(
        `Skipping "${name}" — PRODUCT_CODES[${name}] (${expectedProductId}) doesn't match CSV Product ID (${row["Product ID"]})`,
      );
      skipped++;
      continue;
    }

    const ean12 = row["EAN-12"];
    const ean13 = ean12 + computeEan13CheckDigit(ean12);

    const existing = await Product.findOne({ ean13 });
    if (existing) {
      skipped++;
      continue;
    }

    await Product.create({
      category: row.Category,
      name,
      productId: expectedProductId,
      type: row.Type as ProductType,
      weightLabel: row.Weight,
      sku: row.SKU,
      ean12,
      ean13,
    });
    created++;
  }

  logger.info(`Seed complete: ${created} created, ${skipped} skipped (already existed or mismatched scheme)`);
  await disconnectDatabase();
}

main().catch((err) => {
  logger.error({ err }, "Failed to seed products");
  process.exit(1);
});
