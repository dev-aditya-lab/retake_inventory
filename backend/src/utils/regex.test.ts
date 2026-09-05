import { describe, expect, it } from "vitest";
import { escapeRegex } from "./regex";

describe("escapeRegex", () => {
  it("leaves plain text unchanged", () => {
    expect(escapeRegex("Ajwain")).toBe("Ajwain");
  });

  it("escapes every regex metacharacter", () => {
    expect(escapeRegex(".*+?^${}()|[]\\")).toBe("\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
  });

  it("neutralizes a catastrophic-backtracking pattern into a literal match", () => {
    const malicious = "(a+)+$";
    const escaped = escapeRegex(malicious);
    expect(new RegExp(escaped).test("(a+)+$")).toBe(true);
    expect(new RegExp(escaped).test("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!")).toBe(false);
  });
});
