// EAN-13 encoding scheme for Retake products, as specified in
// `.claude/project info/project.md`:
//   890 CC PPP WW VV  (12 digits) + 1 check digit = EAN-13
//   890 = India, CC = product type, PPP = product id, WW = weight id,
//   VV = variant (currently always "01", reserved for future use).
export const COUNTRY_CODE = "890";
export const DEFAULT_VARIANT = "01";

export type ProductType = "Whole" | "Powder" | "Blend";

export const TYPE_CODES: Record<ProductType, string> = {
  Whole: "11",
  Powder: "12",
  Blend: "13",
};

export const WEIGHT_CODES: Record<string, string> = {
  "25g": "01",
  "50g": "02",
  "100g": "03",
  "200g": "04",
  "250g": "05",
};

// Product-ID codes, sourced from `.claude/project info/product.csv`.
// Single spices: 1-26. Blends: 101+.
export const PRODUCT_CODES: Record<string, number> = {
  Turmeric: 1,
  "Red Chilli": 2,
  Coriander: 3,
  Cumin: 4,
  Fennel: 5,
  "Black Pepper": 6,
  "Green Cardamom": 7,
  "Black Cardamom": 8,
  Cinnamon: 9,
  Clove: 10,
  "Bay Leaf": 11,
  "Star Anise": 12,
  Nutmeg: 13,
  Mace: 14,
  Mustard: 15,
  Fenugreek: 16,
  Ajwain: 17,
  Nigella: 18,
  Carom: 19,
  "Dry Ginger": 20,
  "Dry Mango": 21,
  Asafoetida: 22,
  Saffron: 23,
  "Kashmiri Chilli": 24,
  "White Pepper": 25,
  "Long Pepper": 26,
  "Garam Masala": 101,
  "Kitchen King": 102,
  "Chaat Masala": 103,
  "Pav Bhaji": 104,
  "Biryani Masala": 105,
  "Sabzi Masala": 106,
  "Meat Masala": 107,
  "Chicken Masala": 108,
  "Fish Masala": 109,
  "Tea Masala": 110,
  "Paneer Masala": 111,
  "Tandoori Masala": 112,
  "Sambar Masala": 113,
  "Rasam Powder": 114,
};
