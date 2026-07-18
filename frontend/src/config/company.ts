// Centralized brand/company details. Invoice views, footer, PWA manifest and
// metadata should read from here instead of hardcoding company info elsewhere.
// TODO: replace placeholder fields with Retake's real registered details.
export const company = {
  name: "Retake",
  tagline: "Spice up your kitchen",
  legalName: "Retake Spices Pvt. Ltd.",
  address: "Address not set — update in frontend/src/config/company.ts",
  city: "City",
  state: "State",
  pincode: "000000",
  country: "India",
  contactNumber: "+91 8506933428",
  email: "info@retake.devaditya.dev",
  gstin: "GSTIN-NOT-SET",
  website: "https://retake.devaditya.dev",
  logoUrl: "/brand/logo.png",
} as const;
