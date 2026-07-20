"use client";

import { useEffect } from "react";
import { useListProductsQuery } from "@/lib/redux/features/products/productsApi";
import { saveProductsOffline } from "@/lib/offlineDb";

/** Mirrors the full, unfiltered product catalog into IndexedDB whenever it's fetched, so it stays browsable offline. */
export function useProductOfflineSync(): void {
  const { data: products } = useListProductsQuery();

  useEffect(() => {
    if (products) {
      void saveProductsOffline(products);
    }
  }, [products]);
}
