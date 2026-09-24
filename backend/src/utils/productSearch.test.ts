import { describe, expect, it } from "vitest";
import { buildProductSearchFilter } from "./productSearch";

type Clause = Record<string, unknown>;
const anyOfOf = (filter: Record<string, unknown>): Clause[] => (filter.$or as Clause[]) ?? [];

describe("buildProductSearchFilter", () => {
  it("returns no filter for an empty search", () => {
    expect(buildProductSearchFilter("")).toEqual({});
    expect(buildProductSearchFilter("   ")).toEqual({});
  });

  it("matches a single word against name, sku, weight and type", () => {
    const fields = anyOfOf(buildProductSearchFilter("turmeric")).map((c) => Object.keys(c)[0]);
    expect(fields).toEqual(["name", "sku", "weightLabel", "type"]);
  });

  it("requires every word to match somewhere, so 'tur 100' can find Turmeric 100g", () => {
    const filter = buildProductSearchFilter("tur 100");
    expect(filter.$and).toHaveLength(2);
  });

  it("treats digits as the END of the barcode too (last 3+ digits)", () => {
    const fields = (digits: string) => anyOfOf(buildProductSearchFilter(digits)).map((c) => Object.keys(c)[0]);
    expect(fields("7890")).toContain("ean13");
    expect(anyOfOf(buildProductSearchFilter("7890")).find((c) => "ean13" in c)).toEqual({ ean13: { $regex: "7890$" } });
    expect(fields("78")).not.toContain("ean13"); // too short to mean a barcode ending
  });

  it("matches a full 13-digit word exactly", () => {
    const clause = anyOfOf(buildProductSearchFilter("8901234567890")).find((c) => "ean13" in c);
    expect(clause).toEqual({ ean13: "8901234567890" });
  });

  it("escapes regex characters so typing can't break the query", () => {
    const clause = anyOfOf(buildProductSearchFilter("a.b(")).find((c) => "name" in c) as { name: { $regex: string } };
    expect(clause.name.$regex).toBe("a\\.b\\(");
  });

  it("caps the number of words", () => {
    const filter = buildProductSearchFilter("a b c d e f g h i j");
    expect(filter.$and).toHaveLength(6);
  });
});
