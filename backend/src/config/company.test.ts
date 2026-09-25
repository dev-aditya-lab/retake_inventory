import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { company } from "./company";

// How customers pay is printed on every bill that still has money owing, so a typo
// in the bank details is costly: it would send real money to the wrong place.
describe("company.payment — how customers pay", () => {
  const { accountName, accountNumber, ifsc, upiId } = company.payment;

  it("has well-formed bank details", () => {
    expect(accountName.trim()).not.toBe("");
    expect(accountNumber).toMatch(/^\d{9,18}$/);
    expect(ifsc).toMatch(/^[A-Z]{4}0[A-Z0-9]{6}$/);
    expect(upiId).toMatch(/^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$/);
  });

  it("ships the QR image the invoice PDFs print", () => {
    expect(existsSync(path.resolve(__dirname, "../assets/payment-qr.jpeg"))).toBe(true);
  });

  // The web view reads the frontend's copy and the PDFs read this one — they must agree.
  const frontendConfig = path.resolve(__dirname, "../../../frontend/src/config/company.ts");
  it.skipIf(!existsSync(frontendConfig))("matches the frontend's copy of the details", () => {
    const source = readFileSync(frontendConfig, "utf-8");
    for (const value of [accountName, accountNumber, ifsc, upiId]) expect(source).toContain(`"${value}"`);
  });
});
