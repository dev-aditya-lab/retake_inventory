// GST reference data and thresholds, in one place so a rule change is a
// one-line edit. Sources (researched Sept 2026):
//  - CGST Rule 46: invoice particulars, 16-char serial, B2C ≥ ₹50,000 details
//  - Notification 12/2024-CT: B2CL (inter-state B2C, invoice-wise) above ₹1 lakh from 1 Aug 2024
//  - Notification 78/2020-CT: 4-digit HSN for aggregate turnover up to ₹5 crore
//  - GSTN advisory (Jan 2025): Table 12 HSN summary split into B2B / B2C from May 2025
//  - IGST Act s.10(1)(ca): place of supply for unregistered buyers = address on the invoice,
//    else the supplier's location
//  - State codes as used by the GST portal (cross-checked with the open-source
//    India Compliance app used in production by ERPNext users)

/** All GST dates (invoice numbers, return periods) are Indian dates, whatever the server's time zone. */
export const GST_TIME_ZONE = "Asia/Kolkata";

export const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep Islands",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

export function isGstStateCode(code: string | undefined | null): code is string {
  return !!code && code in GST_STATES;
}

export function gstStateName(code: string): string {
  return GST_STATES[code] ?? code;
}

/** Rates the GST portal accepts for goods (%). Spices and masalas are 5% after GST 2.0 (22 Sept 2025). */
export const VALID_GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40] as const;

export function isValidGstRate(rate: number | undefined | null): rate is number {
  return typeof rate === "number" && (VALID_GST_RATES as readonly number[]).includes(rate);
}

/** Unit Quantity Codes (UQC) relevant to packaged spices, as the portal spells them. */
export const UQC_CODES: Record<string, string> = {
  PAC: "Packs",
  NOS: "Numbers",
  PCS: "Pieces",
  BOX: "Box",
  BAG: "Bags",
  JAR: "Jars",
  BTL: "Bottles",
  KGS: "Kilograms",
  GMS: "Grammes",
  OTH: "Others",
};
export const DEFAULT_UQC = "PAC";

/** Inter-state sales to unregistered buyers above this invoice value are reported invoice-wise (B2CL). */
export const B2CL_THRESHOLD = 100_000;

/** Unregistered buyer bills at or above this taxable value must carry name, address and state (Rule 46 proviso). */
export const B2C_FULL_DETAILS_THRESHOLD = 50_000;

/** Minimum HSN digits for aggregate turnover up to ₹5 crore. */
export const MIN_HSN_DIGITS = 4;

/** Rule 46(b): invoice / credit note numbers can't exceed 16 characters. */
export const MAX_DOCUMENT_NUMBER_LENGTH = 16;

/** GSTR-1 HSN summary descriptions are cut to this length by the portal. */
export const HSN_DESCRIPTION_MAX = 30;
