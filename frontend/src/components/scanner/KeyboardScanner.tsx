"use client";

import { useState, type FormEvent } from "react";
import { ScanBarcode } from "lucide-react";
import { playBeep } from "@/lib/playBeep";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useListProductsQuery } from "@/lib/redux/features/products/productsApi";
import type { Product } from "@/types/product";

const MAX_SUGGESTIONS = 6;
/** Shorter than this is too vague to search on. */
const MIN_SEARCH_LENGTH = 2;

/**
 * Captures input from a USB/Bluetooth HID barcode scanner, which behaves
 * like a keyboard: it types the code's digits then an Enter keystroke. A
 * plain auto-focused text input submitting on Enter handles that natively —
 * no special key-timing detection needed.
 *
 * It is also the manual fallback when a barcode won't scan. Where the caller
 * can add a product directly (`onPickProduct`), typing part of a name or SKU,
 * or just the LAST FEW DIGITS of the barcode, lists the matching products to
 * tap — far quicker than keying in all 13 digits.
 */
export function KeyboardScanner({
  onScan,
  onPickProduct,
  placeholder = "Scan or type a barcode…",
  autoFocus = true,
}: {
  onScan: (code: string) => void;
  /** When given, typed text that isn't a full barcode is searched and offered as products to tap. */
  onPickProduct?: (product: Product) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const query = value.trim();
  const search = useDebouncedValue(query);

  // A complete barcode goes straight to onScan; anything shorter is a search.
  const isFullBarcode = /^\d{13}$/.test(query);
  const searching = !!onPickProduct && search.length >= MIN_SEARCH_LENGTH && !/^\d{13}$/.test(search);
  const { data: results, isFetching } = useListProductsQuery({ search }, { skip: !searching });
  // Only trust results that belong to what's on screen now (the search lags behind typing).
  const suggestions = searching && search === query ? (results ?? []).slice(0, MAX_SUGGESTIONS) : [];

  function scan(code: string) {
    playBeep();
    onScan(code);
    setValue("");
  }

  function pick(product: Product) {
    playBeep();
    onPickProduct?.(product);
    setValue("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query) return;

    if (!onPickProduct || isFullBarcode || /^\d{8,}$/.test(query)) {
      scan(query); // looks like a barcode (or nothing else can take it)
    } else if (suggestions.length === 1) {
      pick(suggestions[0]!); // Enter with exactly one match: take it
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <ScanBarcode size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            // Names as well as digits can be typed now, so don't force the number pad.
            inputMode={onPickProduct ? "search" : "numeric"}
            autoComplete="off"
            className="input w-full pl-9"
          />
        </div>
        <button type="submit" className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
          Go
        </button>
      </form>

      {searching && search === query && (
        <ul className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border bg-background">
          {suggestions.length === 0 && (
            <li className="p-3 text-sm text-muted">{isFetching ? "Searching…" : "No product matches."}</li>
          )}
          {suggestions.map((product) => (
            <li key={product._id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => pick(product)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-ink-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {product.name} · {product.type} · {product.weightLabel}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {product.sku} · barcode …{product.ean13.slice(-4)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">{product.quantityInStock} in stock</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
