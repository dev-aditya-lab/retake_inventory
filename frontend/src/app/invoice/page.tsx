"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { ScannerInput } from "@/components/scanner/ScannerInput";
import { company } from "@/config/company";

export default function InvoiceLookupPage() {
  const router = useRouter();

  function handleScan(code: string) {
    router.push(`/invoice/${code.trim()}`);
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 text-center">
        <Image src={company.logoUrl} alt={company.name} width={48} height={48} className="mx-auto rounded-md" />
        <h1 className="mt-3 text-xl font-semibold text-foreground">Find your invoice</h1>
        <p className="mt-1 text-sm text-muted">Scan the barcode on your receipt, or type the invoice number.</p>

        <div className="mt-4 text-left">
          <ScannerInput onScan={handleScan} placeholder="e.g. RTK-260923-0001" />
        </div>
      </div>
    </div>
  );
}
