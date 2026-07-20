import { openDB, type IDBPDatabase } from "idb";
import type { Product, ProductType } from "@/types/product";

const DB_NAME = "retake-offline";
const DB_VERSION = 1;
const PRODUCTS_STORE = "products";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PRODUCTS_STORE)) {
          db.createObjectStore(PRODUCTS_STORE, { keyPath: "_id" });
        }
      },
    });
  }
  return dbPromise;
}

/** Replaces the entire offline product cache — called whenever the full, unfiltered catalog is freshly fetched online. */
export async function saveProductsOffline(products: Product[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(PRODUCTS_STORE, "readwrite");
  await tx.store.clear();
  await Promise.all(products.map((p) => tx.store.put(p)));
  await tx.done;
}

export async function getOfflineProducts(): Promise<Product[]> {
  const db = await getDb();
  return db.getAll(PRODUCTS_STORE);
}

export async function getOfflineProduct(id: string): Promise<Product | undefined> {
  const db = await getDb();
  return db.get(PRODUCTS_STORE, id);
}

export interface ProductFilters {
  search?: string;
  type?: ProductType;
  lowStockOnly?: boolean;
}

/** Mirrors the backend's listProducts filtering logic, for client-side use against the offline cache. */
export function matchesProductFilters(p: Product, filters: ProductFilters): boolean {
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const matches = p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.ean13 === filters.search;
    if (!matches) return false;
  }
  if (filters.type && p.type !== filters.type) return false;
  if (filters.lowStockOnly && p.quantityInStock > p.lowStockThreshold) return false;
  return true;
}
