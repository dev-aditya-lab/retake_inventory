import { company } from "../config/company";
import {
  B2CL_THRESHOLD,
  B2C_FULL_DETAILS_THRESHOLD,
  DEFAULT_UQC,
  MIN_HSN_DIGITS,
  UQC_CODES,
  gstStateName,
  isGstStateCode,
  isValidGstRate,
} from "../config/gst";
import type { BuyerType } from "../models/gstSchemas";
import { ApiError } from "../utils/ApiError";
import { computeInvoiceTax, supplyTypeFor, type PriceMode, type SupplyType, type TaxLineInput } from "../utils/gstCalc";
import { describeGstinProblem, gstinStateCode, normalizeGstin } from "../utils/gstin";
import { numberToWordsINR } from "../utils/numberToWords";

// Turns a bill's customer + lines into a complete GST tax invoice (CGST Rule
// 46): who the buyer is, where the supply is taxed, and every line's tax.
// Used by checkout, admin invoice edits and credit notes, so all three apply
// the same rules.

export interface GstCustomerInput {
  name?: string;
  company?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  /** Place of supply chosen at the counter; defaults from the GSTIN or the shop's own state. */
  stateCode?: string;
}

export interface BuyerContext {
  buyerType: BuyerType;
  gstin: string;
  priceMode: PriceMode;
  placeOfSupply: { code: string; name: string };
  supplyType: SupplyType;
}

/**
 * B2B when the buyer gives a (valid) GSTIN, otherwise retail. Place of supply:
 *  - B2B: the state chosen, else the GSTIN's state;
 *  - retail: the state of the address recorded on the bill, else the shop's
 *    own state (IGST Act s.10(1)(ca)) — so an out-of-state retail sale needs
 *    the buyer's address.
 */
export function resolveBuyer(customer: GstCustomerInput): BuyerContext {
  const gstin = normalizeGstin(customer.gstin);
  if (gstin) {
    const problem = describeGstinProblem(gstin);
    if (problem) throw ApiError.badRequest(`Customer GSTIN: ${problem}`);
  }

  const chosenState = customer.stateCode?.trim();
  if (chosenState && !isGstStateCode(chosenState)) {
    throw ApiError.badRequest(`Unknown place of supply state code "${chosenState}"`);
  }

  const buyerType: BuyerType = gstin ? "B2B" : "B2C";
  const posCode = chosenState || (gstin ? gstinStateCode(gstin) : company.stateCode);

  if (buyerType === "B2C" && posCode !== company.stateCode && !customer.address?.trim()) {
    throw ApiError.badRequest(
      `Selling to a buyer in ${gstStateName(posCode)} without a GSTIN needs their address on the bill — ` +
        "the place of supply comes from it. Add the address, or set the state back to your own.",
    );
  }

  return {
    buyerType,
    gstin,
    priceMode: buyerType === "B2B" ? "exclusive" : "inclusive",
    placeOfSupply: { code: posCode, name: gstStateName(posCode) },
    supplyType: supplyTypeFor(company.stateCode, posCode),
  };
}

export function supplierSnapshot() {
  return {
    legalName: company.legalName,
    address: [company.address, company.pincode].filter(Boolean).join(" - "),
    gstin: company.gstin,
    stateCode: company.stateCode,
    stateName: gstStateName(company.stateCode),
  };
}

interface GstProductFields {
  name: string;
  hsnCode?: string | null;
  gstRate?: number | null;
  uqc?: string | null;
  sellingPrice?: number | null;
  mrp?: number | null;
}

/** The price a product is billed at for this kind of buyer, or null if it isn't set. */
export function priceFor(product: GstProductFields, priceMode: PriceMode): number | null {
  const price = priceMode === "exclusive" ? product.sellingPrice : product.mrp;
  return typeof price === "number" && price > 0 ? price : null;
}

/** What's missing for a product to be sold on a GST invoice — empty when it's ready. */
export function productGstProblems(product: GstProductFields, priceMode?: PriceMode): string[] {
  const problems: string[] = [];
  const hsn = product.hsnCode?.trim() ?? "";
  if (!new RegExp(`^\\d{${MIN_HSN_DIGITS},8}$`).test(hsn)) problems.push("HSN code (at least 4 digits)");
  if (!isValidGstRate(product.gstRate ?? undefined)) problems.push("GST rate");
  if (product.uqc && !(product.uqc in UQC_CODES)) problems.push("unit (UQC)");
  if (priceMode === "inclusive" && priceFor(product, "inclusive") === null) problems.push("MRP");
  if (priceMode === "exclusive" && priceFor(product, "exclusive") === null) problems.push("B2B price");
  return problems;
}

export interface GstBillLine {
  product: string;
  name: string;
  hsnCode: string;
  uqc: string;
  gstRate: number;
  quantity: number;
  unitPrice: number;
}

/** A line from a product's current GST details, priced for the buyer. Throws with an actionable message if incomplete. */
export function lineFromProduct(
  product: GstProductFields & { _id: unknown },
  quantity: number,
  priceMode: PriceMode,
  unitPriceOverride?: number,
): GstBillLine {
  const problems = productGstProblems(product, unitPriceOverride === undefined ? priceMode : undefined);
  if (problems.length > 0) {
    throw ApiError.badRequest(
      `"${product.name}" can't go on a GST bill yet — set its ${problems.join(", ")} on the product first.`,
    );
  }
  return {
    product: String(product._id),
    name: product.name,
    hsnCode: product.hsnCode!.trim(),
    uqc: product.uqc || DEFAULT_UQC,
    gstRate: product.gstRate!,
    quantity,
    unitPrice: unitPriceOverride ?? priceFor(product, priceMode)!,
  };
}

export interface BuildGstDocumentInput {
  customer: GstCustomerInput & { name: string };
  lines: GstBillLine[];
  otherCharges?: number;
}

/**
 * Everything a GST-v2 invoice (or credit note) stores about tax, plus the
 * legacy summary fields older readers use. Validates the Rule 46 proviso:
 * a retail bill of ₹50,000 or more must carry the buyer's name, address and
 * state.
 */
export function buildGstDocument({ customer, lines, otherCharges = 0 }: BuildGstDocumentInput) {
  const buyer = resolveBuyer(customer);

  for (const line of lines) {
    if (!isValidGstRate(line.gstRate)) throw ApiError.badRequest(`"${line.name}" has an invalid GST rate (${line.gstRate}%)`);
    if (!new RegExp(`^\\d{${MIN_HSN_DIGITS},8}$`).test(line.hsnCode)) {
      throw ApiError.badRequest(`"${line.name}" needs an HSN code of at least ${MIN_HSN_DIGITS} digits`);
    }
  }

  const tax = computeInvoiceTax({
    lines: lines as TaxLineInput[],
    priceMode: buyer.priceMode,
    supplyType: buyer.supplyType,
    otherCharges,
  });

  if (buyer.buyerType === "B2C" && tax.taxableValue >= B2C_FULL_DETAILS_THRESHOLD) {
    const missing = [
      !customer.name?.trim() && "name",
      !customer.address?.trim() && "address",
    ].filter(Boolean);
    if (missing.length > 0) {
      throw ApiError.badRequest(
        `Bills of ₹${B2C_FULL_DETAILS_THRESHOLD.toLocaleString("en-IN")} or more to a buyer without a GSTIN must show their ${missing.join(" and ")} (GST rule 46).`,
      );
    }
  }

  const singleRate = tax.rateSummary.length === 1 ? tax.rateSummary[0]!.gstRate : 0;

  return {
    buyer,
    fields: {
      gstVersion: 2,
      supplier: supplierSnapshot(),
      buyerType: buyer.buyerType,
      priceMode: buyer.priceMode,
      placeOfSupply: buyer.placeOfSupply,
      supplyType: buyer.supplyType,
      reverseCharge: false,
      customer: {
        name: customer.name.trim(),
        company: customer.company?.trim() ?? "",
        address: customer.address?.trim() ?? "",
        phone: customer.phone?.trim() ?? "",
        email: customer.email?.trim() ?? "",
        gstin: buyer.gstin,
      },
      items: tax.lines,
      otherChargesLine: tax.otherCharges ?? undefined,
      rateSummary: tax.rateSummary,
      taxableValue: tax.taxableValue,
      cgst: tax.cgst,
      sgst: tax.sgst,
      igst: tax.igst,
      totalTax: tax.totalTax,
      grandTotal: tax.grandTotal,
      amountInWords: numberToWordsINR(tax.grandTotal),
      // Legacy summary, kept in step for older readers.
      subtotal: tax.taxableValue,
      otherCharges: tax.otherCharges?.amount ?? 0,
      gst: {
        enabled: true,
        type: buyer.supplyType === "intra" ? ("CGST_SGST" as const) : ("IGST" as const),
        percentage: singleRate,
        amount: tax.totalTax,
        cgstAmount: buyer.supplyType === "intra" ? tax.cgst : undefined,
        sgstAmount: buyer.supplyType === "intra" ? tax.sgst : undefined,
        igstAmount: buyer.supplyType === "inter" ? tax.igst : undefined,
      },
    },
  };
}

/** GSTR-1 table a sale is reported in. */
export function gstr1CategoryOf(doc: { buyerType?: string | null; supplyType?: string | null; grandTotal: number }) {
  if (doc.buyerType === "B2B") return "B2B" as const;
  if (doc.supplyType === "inter" && doc.grandTotal > B2CL_THRESHOLD) return "B2CL" as const;
  return "B2CS" as const;
}
