// GST reference data for forms and labels. Mirrors backend/src/config/gst.ts —
// the backend re-validates everything, so this is only for pickers and display.

/** GST state codes as used on the GST portal. */
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

/** States sorted by name, for <select>s. */
export const GST_STATE_OPTIONS = Object.entries(GST_STATES)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Your shop's GST state (Jharkhand). Must match backend company.stateCode. */
export const SUPPLIER_STATE_CODE = "20";

/** Rates the GST portal accepts (%). Spices and masalas are 5%. */
export const VALID_GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
export const COMMON_GST_RATES = [5, 18, 40, 0];

export const UQC_OPTIONS: { code: string; label: string }[] = [
  { code: "PAC", label: "PAC — Packs" },
  { code: "NOS", label: "NOS — Numbers" },
  { code: "PCS", label: "PCS — Pieces" },
  { code: "BOX", label: "BOX — Box" },
  { code: "BAG", label: "BAG — Bags" },
  { code: "JAR", label: "JAR — Jars" },
  { code: "BTL", label: "BTL — Bottles" },
  { code: "KGS", label: "KGS — Kilograms" },
  { code: "GMS", label: "GMS — Grammes" },
  { code: "OTH", label: "OTH — Others" },
];

/** A buyer at or above this taxable value, without a GSTIN, must have name + address on the bill. */
export const B2C_FULL_DETAILS_THRESHOLD = 50_000;
