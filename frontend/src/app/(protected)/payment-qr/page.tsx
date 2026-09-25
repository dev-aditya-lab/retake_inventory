"use client";

import { RequireRole } from "@/components/auth/RequireRole";
import { PaymentQrPanel } from "@/components/payments/PaymentQr";

/** The UPI QR and bank details, big and ready to show a customer who wants to pay. */
export default function PaymentQrPage() {
  return (
    <RequireRole roles={["admin", "sales"]} message="Only staff who take payments can open this page.">
      <div className="mx-auto max-w-sm">
        <h1 className="text-2xl font-semibold text-foreground">Payment QR</h1>
        <p className="mt-1 text-sm text-muted">Show this to a customer to pay by any UPI app, or read out the bank details.</p>
        <div className="mt-4">
          <PaymentQrPanel />
        </div>
      </div>
    </RequireRole>
  );
}
