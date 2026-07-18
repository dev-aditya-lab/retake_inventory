// SKU abbreviation scheme for Retake products, as supplied in the
// "EAN-13 barcode - products code.csv" reference. Format: RTK-{PRODUCT}-{TYPE}-{WEIGHT}
// e.g. Turmeric + Whole + 25g -> RTK-TUR-WH-025 (matches the seeded product.csv SKUs).
import type { ProductType } from "./barcodeScheme";

export const PRODUCT_SKU_CODES: Record<string, string> = {
  Turmeric: "TUR",
  "Red Chilli": "RCP",
  Coriander: "COR",
  Cumin: "CUM",
  Fennel: "FEN",
  "Black Pepper": "BLP",
  "Green Cardamom": "GCD",
  "Black Cardamom": "BCD",
  Cinnamon: "CIN",
  Clove: "CLV",
  "Bay Leaf": "BAY",
  "Star Anise": "STA",
  Nutmeg: "NUT",
  Mace: "MAC",
  Mustard: "MUS",
  Fenugreek: "FNG",
  Ajwain: "AJW",
  Nigella: "NIG",
  Carom: "CAR",
  "Dry Ginger": "DGN",
  "Dry Mango": "AMP",
  Asafoetida: "HNG",
  Saffron: "SAF",
  "Kashmiri Chilli": "KCH",
  "White Pepper": "WPP",
  "Long Pepper": "LPG",
  "Garam Masala": "GRM",
  "Kitchen King": "KTK",
  "Chaat Masala": "CHT",
  "Pav Bhaji": "PVB",
  "Biryani Masala": "BRY",
  "Sabzi Masala": "SBZ",
  "Meat Masala": "MET",
  "Chicken Masala": "CHK",
  "Fish Masala": "FSH",
  "Tea Masala": "TEA",
  "Paneer Masala": "PAN",
  "Tandoori Masala": "TAN",
  "Sambar Masala": "SMB",
  "Rasam Powder": "RSM",
};

export const TYPE_SKU_CODES: Record<ProductType, string> = {
  Whole: "WH",
  Powder: "PW",
  Blend: "BL",
};
