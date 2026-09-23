import { describe, expect, it } from "vitest";
import { computeStockDeltas } from "./invoiceEdit";

describe("computeStockDeltas", () => {
  it("is empty when quantities are unchanged (price/customer-only edit)", () => {
    const lines = [
      { productId: "a", quantity: 2 },
      { productId: "b", quantity: 1 },
    ];
    expect(computeStockDeltas(lines, lines).size).toBe(0);
  });

  it("is positive when more is sold, negative when less is sold", () => {
    const deltas = computeStockDeltas(
      [
        { productId: "a", quantity: 2 },
        { productId: "b", quantity: 5 },
      ],
      [
        { productId: "a", quantity: 3 },
        { productId: "b", quantity: 1 },
      ],
    );
    expect(deltas.get("a")).toBe(1);
    expect(deltas.get("b")).toBe(-4);
  });

  it("returns a removed line's full quantity to stock", () => {
    const deltas = computeStockDeltas([{ productId: "a", quantity: 4 }], []);
    expect(deltas.get("a")).toBe(-4);
  });

  it("takes a newly added line's full quantity from stock", () => {
    const deltas = computeStockDeltas([], [{ productId: "c", quantity: 2 }]);
    expect(deltas.get("c")).toBe(2);
  });

  it("sums duplicate lines for the same product", () => {
    const deltas = computeStockDeltas(
      [
        { productId: "a", quantity: 1 },
        { productId: "a", quantity: 2 },
      ],
      [{ productId: "a", quantity: 3 }],
    );
    expect(deltas.size).toBe(0);
  });
});
