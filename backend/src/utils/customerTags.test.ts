import { describe, expect, it } from "vitest";
import { MAX_CUSTOMER_TAGS, MAX_TAG_LENGTH, normalizeTags } from "./customerTags";

describe("normalizeTags", () => {
  it("trims, collapses spaces and drops empties", () => {
    expect(normalizeTags(["  VIP ", "", "  ", "Pays   late"])).toEqual(["VIP", "Pays late"]);
  });
  it("removes case-insensitive duplicates, keeping the first", () => {
    expect(normalizeTags(["VIP", "vip", "Vip", "Wholesale"])).toEqual(["VIP", "Wholesale"]);
  });
  it("caps the count and the length", () => {
    expect(normalizeTags(["a", "b", "c", "d", "e", "f", "g"])).toHaveLength(MAX_CUSTOMER_TAGS);
    expect(normalizeTags(["x".repeat(50)])[0]).toHaveLength(MAX_TAG_LENGTH);
  });
});
