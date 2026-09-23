// Starter SKU/barcode code list, seeded into the `catalogcodes` collection
// once on first boot (see src/migrations). After that the database is the
// source of truth — admins add/edit/delete codes from the "SKU codes" page,
// so edit there rather than here.
//
// Values match `.claude/project info/product.csv`:
//   productId -> the PPP segment of the EAN-13 (890 CC PPP WW VV)
//   skuCode   -> the product segment of the SKU (RTK-{skuCode}-{type}-{weight})
export interface DefaultCatalogCode {
  name: string;
  skuCode: string;
  productId: number;
  category: string;
}

export const DEFAULT_CATALOG_CODES: DefaultCatalogCode[] = [
  { name: "Turmeric", skuCode: "TUR", productId: 1, category: "Single Spice" },
  { name: "Red Chilli", skuCode: "RCP", productId: 2, category: "Single Spice" },
  { name: "Coriander", skuCode: "COR", productId: 3, category: "Single Spice" },
  { name: "Cumin", skuCode: "CUM", productId: 4, category: "Single Spice" },
  { name: "Fennel", skuCode: "FEN", productId: 5, category: "Single Spice" },
  { name: "Black Pepper", skuCode: "BLP", productId: 6, category: "Single Spice" },
  { name: "Green Cardamom", skuCode: "GCD", productId: 7, category: "Single Spice" },
  { name: "Black Cardamom", skuCode: "BCD", productId: 8, category: "Single Spice" },
  { name: "Cinnamon", skuCode: "CIN", productId: 9, category: "Single Spice" },
  { name: "Clove", skuCode: "CLV", productId: 10, category: "Single Spice" },
  { name: "Bay Leaf", skuCode: "BAY", productId: 11, category: "Single Spice" },
  { name: "Star Anise", skuCode: "STA", productId: 12, category: "Single Spice" },
  { name: "Nutmeg", skuCode: "NUT", productId: 13, category: "Single Spice" },
  { name: "Mace", skuCode: "MAC", productId: 14, category: "Single Spice" },
  { name: "Mustard", skuCode: "MUS", productId: 15, category: "Single Spice" },
  { name: "Fenugreek", skuCode: "FNG", productId: 16, category: "Single Spice" },
  { name: "Ajwain", skuCode: "AJW", productId: 17, category: "Single Spice" },
  { name: "Nigella", skuCode: "NIG", productId: 18, category: "Single Spice" },
  { name: "Carom", skuCode: "CAR", productId: 19, category: "Single Spice" },
  { name: "Dry Ginger", skuCode: "DGN", productId: 20, category: "Single Spice" },
  { name: "Dry Mango", skuCode: "AMP", productId: 21, category: "Single Spice" },
  { name: "Asafoetida", skuCode: "HNG", productId: 22, category: "Single Spice" },
  { name: "Saffron", skuCode: "SAF", productId: 23, category: "Single Spice" },
  { name: "Kashmiri Chilli", skuCode: "KCH", productId: 24, category: "Single Spice" },
  { name: "White Pepper", skuCode: "WPP", productId: 25, category: "Single Spice" },
  { name: "Long Pepper", skuCode: "LPG", productId: 26, category: "Single Spice" },
  { name: "Garam Masala", skuCode: "GRM", productId: 101, category: "Blend" },
  { name: "Kitchen King", skuCode: "KTK", productId: 102, category: "Blend" },
  { name: "Chaat Masala", skuCode: "CHT", productId: 103, category: "Blend" },
  { name: "Pav Bhaji", skuCode: "PVB", productId: 104, category: "Blend" },
  { name: "Biryani Masala", skuCode: "BRY", productId: 105, category: "Blend" },
  { name: "Sabzi Masala", skuCode: "SBZ", productId: 106, category: "Blend" },
  { name: "Meat Masala", skuCode: "MET", productId: 107, category: "Blend" },
  { name: "Chicken Masala", skuCode: "CHK", productId: 108, category: "Blend" },
  { name: "Fish Masala", skuCode: "FSH", productId: 109, category: "Blend" },
  { name: "Tea Masala", skuCode: "TEA", productId: 110, category: "Blend" },
  { name: "Paneer Masala", skuCode: "PAN", productId: 111, category: "Blend" },
  { name: "Tandoori Masala", skuCode: "TAN", productId: 112, category: "Blend" },
  { name: "Sambar Masala", skuCode: "SMB", productId: 113, category: "Blend" },
  { name: "Rasam Powder", skuCode: "RSM", productId: 114, category: "Blend" },
];
