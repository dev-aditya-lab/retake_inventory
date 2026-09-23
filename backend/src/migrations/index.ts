import { Migration } from "../models/Migration.model";
import { logger } from "../config/logger";
import { isDuplicateKeyError } from "../utils/mongoErrors";
import { seedDefaultCatalogCodes } from "../services/catalogCode.service";
import { seedHsnCodesFromProducts } from "../services/hsnCode.service";
import { backfillCustomersFromInvoices } from "../services/customer.service";
import { backfillBarcodeSource } from "../services/product.service";

interface DataMigration {
  /** Never rename a key once shipped — it's how a finished migration is recognised. */
  key: string;
  run: () => Promise<unknown>;
}

// Append-only, run in order, each at most once per database.
const MIGRATIONS: DataMigration[] = [
  // SKU/barcode codes moved from hard-coded config into the database.
  { key: "2026-09-seed-catalog-codes", run: seedDefaultCatalogCodes },
  // HSN list starts with every code already on a product.
  { key: "2026-09-seed-hsn-codes", run: seedHsnCodesFromProducts },
  // Customer directory built from past invoices.
  { key: "2026-09-backfill-customers", run: backfillCustomersFromInvoices },
  // Older products were saved before `barcodeSource` existed — store it explicitly.
  { key: "2026-09-backfill-barcode-source", run: backfillBarcodeSource },
];

/**
 * Runs any one-time data migrations this database hasn't had yet. Called on
 * boot. A failure is logged, not thrown: the app still starts, and the
 * failed migration is retried on the next boot.
 */
export async function runMigrations(): Promise<void> {
  for (const migration of MIGRATIONS) {
    try {
      await Migration.create({ key: migration.key });
    } catch (err) {
      if (isDuplicateKeyError(err)) continue; // done already, or another instance is running it
      throw err;
    }

    try {
      logger.info(`Running data migration ${migration.key}`);
      await migration.run();
      await Migration.updateOne({ key: migration.key }, { status: "done", finishedAt: new Date() });
      logger.info(`Data migration ${migration.key} finished`);
    } catch (err) {
      await Migration.deleteOne({ key: migration.key });
      logger.error({ err }, `Data migration ${migration.key} failed — it will be retried on next boot`);
    }
  }
}
