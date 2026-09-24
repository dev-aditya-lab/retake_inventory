// Centralized brand/company details. Invoice views, footer, PWA manifest and
// metadata should read from here instead of hardcoding company info elsewhere.
// TODO: replace placeholder fields with Retake's real registered details.
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
  email: "info@retake.devaditya.dev",
  gstin: "20DQZPG0668A1Z0",
  website: "https://retake.devaditya.dev",
  logoUrl: "/brand/logo.png",
  // Authorised signatory's signature, printed on every invoice and bill (same image the PDFs use).
  signatureUrl: "/brand/authorized-signatory.png",
  // Number prefix of non-GST bills (RTKNG-260923-0001) — must match the backend's
  // config/company.ts. Public bill links use it to tell the two kinds apart.
  nonGstBillPrefix: "RTKNG",
} as const;
