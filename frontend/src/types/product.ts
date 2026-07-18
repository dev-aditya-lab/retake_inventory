export type ProductType = "Whole" | "Powder" | "Blend";

export type BarcodeSource = "generated" | "external";

export interface Product {
  _id: string;
  category: string;
  name: string;
  productId?: number;
  type: ProductType;
  weightLabel: string;
  sku: string;
  ean12?: string;
  ean13: string;
  barcodeSource: BarcodeSource;
  hsnCode: string;
  image: string;
  costPrice: number;
  sellingPrice: number;
  quantityInStock: number;
  lowStockThreshold: number;
  note: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const PRODUCT_TYPES: ProductType[] = ["Whole", "Powder", "Blend"];
export const WEIGHT_LABELS = ["25g", "50g", "100g", "200g", "250g"];
