// Centralized brand/company details. Every invoice, PDF, WhatsApp template and
// footer should read from here instead of hardcoding company info elsewhere.
// TODO: replace placeholder fields with Retake's real registered details.
export const company = {
  name: "Retake",
  tagline: "Spice up your kitchen",
  legalName: "Retake Spices Pvt. Ltd.",
  address: "Address not set — update in backend/src/config/company.ts",
  city: "City",
  state: "State",
  pincode: "000000",
  country: "India",
  contactNumber: "+91 8506933428",
  email: "info@devaditya.dev",
  gstin: "GSTIN-NOT-SET",
  website: "https://retake.devaditya.dev",
  logoPath: "src/assets/logo.png",
  invoicePrefix: "RTK-INV",
  countryCode: "890", // EAN-13 country prefix used in the barcode scheme
} as const;
