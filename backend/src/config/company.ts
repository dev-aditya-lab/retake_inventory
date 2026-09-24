// Centralized brand/company details. Every invoice, PDF, WhatsApp template and
// footer should read from here instead of hardcoding company info elsewhere.
export const company = {
  name: "Retake",
  tagline: "Spice up your kitchen",
  legalName: "Retake Foods",
  address: "Naya bazar, Barharwa, Jharkhand",
  city: "Barharwa",
  state: "Jharkhand",
  pincode: "816101",
  country: "India",
  contactNumber: "+91 8506933428",
  email: "retake@devaditya.dev",
  gstin: "20DQZPG0668A1Z0",
  // GST state code of the registration — must match the GSTIN's first two
  // digits (checked on startup). Decides CGST+SGST vs IGST on every bill.
  stateCode: "20",
  website: "https://retake.devaditya.dev",
  logoPath: "src/assets/logo.png",
  // Bill numbers are {prefix}-YYMMDD-NNNN. GST caps them at 16 characters
  // (CGST Rule 46(b)), so keep prefixes short: RTK-260923-0001 is 15.
  invoicePrefix: "RTK",
  creditNotePrefix: "CN",
  // Non-GST bills are a separate series, kept apart from the GST invoice
  // numbers on purpose: RTKNG-260923-0001. Not part of any GST return, so the
  // 16-character GST limit doesn't apply. Keep the frontend's copy in sync.
  nonGstBillPrefix: "RTKNG",
  countryCode: "890", // EAN-13 country prefix used in the barcode scheme
} as const;
