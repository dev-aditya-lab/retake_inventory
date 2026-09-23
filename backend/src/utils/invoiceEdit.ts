export interface QuantityLine {
  productId: string;
  quantity: number;
}

function sumByProduct(lines: QuantityLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
  }
  return totals;
}

/**
 * How much more of each product an edited invoice sells compared with the
 * original: positive = extra units leave stock, negative = units go back to
 * stock. Products whose total quantity didn't change are omitted, so an edit
 * that only touches prices or customer details moves no stock at all.
 */
export function computeStockDeltas(oldLines: QuantityLine[], newLines: QuantityLine[]): Map<string, number> {
  const before = sumByProduct(oldLines);
  const after = sumByProduct(newLines);
  const deltas = new Map<string, number>();

  for (const productId of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(productId) ?? 0) - (before.get(productId) ?? 0);
    if (delta !== 0) deltas.set(productId, delta);
  }

  return deltas;
}
