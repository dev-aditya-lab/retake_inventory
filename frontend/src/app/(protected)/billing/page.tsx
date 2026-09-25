"use client";

import { useEffect, useState } from "react";
import { Plus, WifiOff, X } from "lucide-react";
import { useListCartsQuery, useCreateCartMutation, useDiscardCartMutation } from "@/lib/redux/features/carts/cartsApi";
import { CartPanel } from "@/components/billing/CartPanel";
import { InvoiceSuccess } from "@/components/billing/InvoiceSuccess";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { CompletedSale } from "@/types/cart";

export default function BillingPage() {
  const isOnline = useOnlineStatus();
  // Cart mutations need a live connection (stock checks, invoice numbering) —
  // skip fetching/auto-creating carts entirely while offline rather than let
  // them fail silently against a Redis-backed API with no offline queue.
  const { data: carts, isLoading } = useListCartsQuery(undefined, { skip: !isOnline });
  const [createCart] = useCreateCartMutation();
  const [discardCart] = useDiscardCartMutation();

  const [activeCartId, setActiveCartId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Record<string, CompletedSale>>({});

  // Auto-open a first cart so the billing screen is never empty. Deferred by
  // a macrotask so React Strict Mode's dev-only double-invoke (mount ->
  // cleanup -> mount, synchronously) doesn't fire createCart() twice — the
  // throwaway invocation's cleanup sets `cancelled` before its timer ever
  // runs, so only the surviving invocation actually creates a cart.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      if (isOnline && !isLoading && carts && carts.length === 0 && Object.keys(completed).length === 0) {
        createCart()
          .unwrap()
          .then((cart) => {
            if (!cancelled) setActiveCartId(cart.id);
          });
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOnline, isLoading, carts, completed, createCart]);

  // Default to the first open cart until the cashier explicitly picks a tab —
  // derived at render time rather than synced via an effect.
  const effectiveActiveCartId = activeCartId ?? carts?.[0]?.id ?? null;

  async function handleNewTab() {
    const cart = await createCart().unwrap();
    setActiveCartId(cart.id);
  }

  async function handleCloseTab(id: string) {
    if (completed[id]) {
      setCompleted((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      await discardCart(id).unwrap();
    }
    if (effectiveActiveCartId === id) setActiveCartId(null);
  }

  function handleCheckedOut(cartId: string, sale: CompletedSale) {
    setCompleted((prev) => ({ ...prev, [cartId]: sale }));
  }

  const tabIds = [...(carts ?? []).map((c) => c.id), ...Object.keys(completed).filter((id) => !carts?.some((c) => c.id === id))];

  if (!isOnline) {
    return (
      <div className="mx-auto mt-12 flex max-w-sm flex-col items-center gap-3 text-center">
        <WifiOff size={40} className="text-muted" aria-hidden />
        <h1 className="text-lg font-semibold text-foreground">Billing needs a connection</h1>
        <p className="text-sm text-muted">
          You&apos;re offline. Stock levels and invoice numbers can only be confirmed with the server, so billing is
          paused until you&apos;re back online.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-b border-border pb-2">
        {tabIds.map((id, i) => {
          const cart = carts?.find((c) => c.id === id);
          const sale = completed[id];
          const label = sale ? "Sale complete" : cart?.customer.name || `Customer ${i + 1}`;
          return (
            <div key={id} className="flex items-center">
              <button
                type="button"
                onClick={() => setActiveCartId(id)}
                className={`flex items-center gap-2 rounded-t-md px-3 py-2 text-sm font-medium ${
                  effectiveActiveCartId === id ? "bg-primary text-primary-foreground" : "bg-surface text-foreground hover:bg-ink-100"
                }`}
              >
                {label}
              </button>
              <button
                type="button"
                onClick={() => handleCloseTab(id)}
                className="ml-1 text-muted hover:text-danger"
                aria-label="Close tab"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={handleNewTab}
          className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-sm font-medium text-muted hover:bg-ink-100"
        >
          <Plus size={14} aria-hidden />
          New customer
        </button>
      </div>

      <div className="mx-auto mt-4 max-w-lg">
        {isLoading && <p className="text-sm text-muted">Loading…</p>}

        {effectiveActiveCartId && completed[effectiveActiveCartId] && (
          <InvoiceSuccess
            sale={completed[effectiveActiveCartId]!}
            onNewSale={() => handleCloseTab(effectiveActiveCartId)}
          />
        )}

        {effectiveActiveCartId &&
          !completed[effectiveActiveCartId] &&
          (() => {
            const cart = carts?.find((c) => c.id === effectiveActiveCartId);
            if (!cart) return null;
            return <CartPanel key={cart.id} cart={cart} onCheckedOut={(sale) => handleCheckedOut(effectiveActiveCartId, sale)} />;
          })()}

        {!effectiveActiveCartId && !isLoading && tabIds.length === 0 && (
          <p className="text-sm text-muted">Starting a new sale…</p>
        )}
      </div>
    </div>
  );
}
