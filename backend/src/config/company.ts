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
  // How customers pay. Printed on bills with money still owing (invoice PDFs), next to the
  // payment QR at src/assets/payment-qr.jpeg. Keep the frontend's copy in sync.
  payment: {
    accountName: "Aditya Ventures",
    accountNumber: "033311501090716",
    ifsc: "NESF0000333",
    upiId: "gupta0854@slc",
    // "when_due" = only on bills with a balance to pay; "always" = on every bill.
    showOnBills: "when_due" as "when_due" | "always",
  },
} as const;
