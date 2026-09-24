"use client";

import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { productBarcodePath } from "@/lib/redux/features/products/productsApi";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { downloadBlob } from "@/lib/downloadFile";

export function BarcodePanel({ productId, sku, ean13 }: { productId: string; sku: string; ean13: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    authenticatedFetch(productBarcodePath(productId, "png"))
      .then((res) => {
        if (!res.ok) throw new Error("Barcode request failed");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [productId]);

  async function handleDownload(format: "png" | "svg", size: "preview" | "print" = "preview") {
    setDownloadError(null);
    try {
      const res = await authenticatedFetch(productBarcodePath(productId, format, size));
      if (!res.ok) throw new Error("Download failed");
      downloadBlob(await res.blob(), size === "print" ? `${sku}-barcode-print-300dpi.png` : `${sku}-barcode.${format}`);
    } catch {
      setDownloadError("Could not download the barcode. Please try again.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Barcode</h2>
        <span className="text-xs text-muted">{ean13}</span>
      </div>
      <div className="mt-3 flex min-h-24 items-center justify-center rounded-md bg-white p-3">
        {!previewUrl && !previewError && <p className="text-sm text-muted">Loading…</p>}
        {previewError && <p className="text-sm text-danger">Could not load barcode preview.</p>}
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- object URL from an authenticated fetch, not a next/image candidate
          <img src={previewUrl} alt={`Barcode ${ean13}`} className="h-auto max-w-full" />
        )}
      </div>
      {downloadError && <p className="mt-2 text-sm text-danger">{downloadError}</p>}
      <button
        type="button"
        onClick={() => handleDownload("png", "print")}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
      >
        <Printer size={16} aria-hidden />
        Print-ready label (300 dpi)
      </button>
      <p className="mt-2 text-xs text-muted">
        Print it at 100% size — about 40 × 30 mm — in pure black on matte white, not shrunk to fit. Phone cameras read a
        barcode by counting pixels per bar, so a small print is the most common reason a pack won&apos;t scan. Below about
        30 mm wide it gets unreliable.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => handleDownload("png")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100"
        >
          <Download size={16} aria-hidden />
          PNG
        </button>
        <button
          type="button"
          onClick={() => handleDownload("svg")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100"
        >
          <Download size={16} aria-hidden />
          SVG
        </button>
      </div>
    </div>
  );
}
